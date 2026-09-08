"""VIDEON reframe worker — Robust OpenCV saliency + smooth crop + FFmpeg H.264."""

from __future__ import annotations

import asyncio
import math
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

PORT = int(os.environ.get("PORT", "8092"))
SAMPLE_EVERY = max(1, int(os.environ.get("REFRAME_SAMPLE_EVERY", "12")))
MAX_MOVEMENT = float(os.environ.get("REFRAME_MAX_MOVEMENT", "15"))

app = FastAPI(title="videon-reframe-worker", version="1.0.0")

_face = None


def _face_cascade():
    global _face
    if _face is not None:
        return _face
    for path in (
        getattr(cv2.data, "haarcascades", "") + "haarcascade_frontalface_default.xml",
        "/usr/share/opencv4/haarcascades/haarcascade_frontalface_default.xml",
    ):
        if path and Path(path).exists():
            _face = cv2.CascadeClassifier(path)
            return _face
    _face = False
    return None


def _normalize(m: np.ndarray) -> np.ndarray:
    m = m.astype(np.float32)
    lo, hi = float(m.min()), float(m.max())
    if hi - lo < 1e-6:
        return np.zeros_like(m, dtype=np.float32)
    return (m - lo) / (hi - lo)


def robust_saliency(frame_bgr: np.ndarray) -> np.ndarray:
    h, w = frame_bgr.shape[:2]
    if float(np.mean(frame_bgr)) < 30:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        cy, cx = (h - 1) / 2.0, (w - 1) / 2.0
        dist = np.sqrt(((yy - cy) / max(h, 1)) ** 2 + ((xx - cx) / max(w, 1)) ** 2)
        return ((1.0 - np.clip(dist, 0, 1)) * 255).astype(np.uint8)

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 150).astype(np.float32)
    lab = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2LAB)
    mean = lab.mean(axis=(0, 1))
    color = np.linalg.norm(lab.astype(np.float32) - mean, axis=2)
    face_map = np.zeros((h, w), dtype=np.float32)
    cascade = _face_cascade()
    if cascade is not None and cascade is not False:
        faces = cascade.detectMultiScale(gray, 1.1, 4, minSize=(40, 40))
        for x, y, fw, fh in faces:
            face_map[y : y + fh, x : x + fw] = 1.0
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cy, cx = (h - 1) / 2.0, (w - 1) / 2.0
    center = 1.0 - np.clip(
        np.sqrt(((yy - cy) / max(h, 1)) ** 2 + ((xx - cx) / max(w, 1)) ** 2), 0, 1
    )
    face_w = 0.35 if face_map.max() > 0 else 0.0
    edge_w, color_w, center_w = 0.3, 0.25, 0.1 + (0.35 - face_w)
    combined = (
        edge_w * _normalize(edges)
        + color_w * _normalize(color)
        + face_w * face_map
        + center_w * center
    )
    return (combined * 255).astype(np.uint8)


def target_size(src_w: int, src_h: int, aspect: str, cw: int | None, ch: int | None) -> tuple[int, int]:
    if aspect == "custom":
        assert cw and ch
        return int(cw), int(ch)
    ratios = {"9:16": 9 / 16, "16:9": 16 / 9, "1:1": 1.0}
    r = ratios[aspect]
    # Fit crop window inside source
    if src_w / src_h > r:
        out_h = src_h
        out_w = max(2, int(round(out_h * r)))
    else:
        out_w = src_w
        out_h = max(2, int(round(out_w / r)))
    # even dims for encoders
    out_w -= out_w % 2
    out_h -= out_h % 2
    return max(2, out_w), max(2, out_h)


def best_roi(saliency: np.ndarray, tw: int, th: int) -> tuple[int, int, int, int]:
    h, w = saliency.shape[:2]
    tw = min(tw, w)
    th = min(th, h)
    integral = cv2.integral(saliency.astype(np.float32))
    best_score = -1.0
    best = (max(0, (w - tw) // 2), max(0, (h - th) // 2), tw, th)
    step = max(1, min(tw, th) // 8)
    for y in range(0, h - th + 1, step):
        for x in range(0, w - tw + 1, step):
            s = (
                integral[y + th, x + tw]
                - integral[y, x + tw]
                - integral[y + th, x]
                + integral[y, x]
            )
            if s > best_score:
                best_score = float(s)
                best = (x, y, tw, th)
    return best


def interpolate_crops(
    samples: list[tuple[int, tuple[int, int, int, int]]], total: int
) -> list[tuple[int, int, int, int]]:
    if not samples:
        return [(0, 0, 2, 2)] * total
    if len(samples) == 1:
        return [samples[0][1]] * total
    out: list[tuple[int, int, int, int]] = []
    for i in range(total):
        prev_i, prev_c = samples[0]
        next_i, next_c = samples[-1]
        for idx, (fi, crop) in enumerate(samples):
            if fi <= i:
                prev_i, prev_c = fi, crop
            if fi >= i:
                next_i, next_c = fi, crop
                break
        if next_i == prev_i:
            out.append(prev_c)
            continue
        t = (i - prev_i) / (next_i - prev_i)
        out.append(
            tuple(int(round(prev_c[k] + (next_c[k] - prev_c[k]) * t)) for k in range(4))  # type: ignore[misc]
        )
    return out  # type: ignore[return-value]


def smooth_crops(
    crops: list[tuple[int, int, int, int]], factor: float, max_move: float
) -> list[tuple[int, int, int, int]]:
    if not crops:
        return crops
    alpha = min(1.0, max(0.0, factor))
    smoothed = [crops[0]]
    prev = list(crops[0])
    for crop in crops[1:]:
        nxt = []
        for k in range(4):
            desired = (1 - alpha) * crop[k] + alpha * prev[k]
            delta = desired - prev[k]
            if abs(delta) > max_move:
                delta = math.copysign(max_move, delta)
            nxt.append(int(round(prev[k] + delta)))
        smoothed.append((nxt[0], nxt[1], nxt[2], nxt[3]))
        prev = nxt
    return smoothed


def clamp_crop(crop: tuple[int, int, int, int], w: int, h: int) -> tuple[int, int, int, int]:
    x, y, cw, ch = crop
    cw = min(cw, w)
    ch = min(ch, h)
    x = max(0, min(x, w - cw))
    y = max(0, min(y, h - ch))
    return x, y, cw, ch


def reencode_h264(src: Path, dst: Path) -> None:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(src),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(dst),
    ]
    subprocess.run(cmd, check=True, timeout=60 * 60)


def run_reframe(
    input_path: Path,
    output_path: Path,
    aspect: str,
    smoothing: float,
    custom_w: int | None,
    custom_h: int | None,
) -> dict[str, Any]:
    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise RuntimeError("Could not open source video")
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    tw, th = target_size(src_w, src_h, aspect, custom_w, custom_h)

    samples: list[tuple[int, tuple[int, int, int, int]]] = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % SAMPLE_EVERY == 0:
            sal = robust_saliency(frame)
            samples.append((idx, best_roi(sal, tw, th)))
        idx += 1
    if total <= 0:
        total = idx
    cap.release()
    if total <= 0:
        raise RuntimeError("Empty video")

    crops = smooth_crops(interpolate_crops(samples, total), smoothing, MAX_MOVEMENT)
    crops = [clamp_crop(c, src_w, src_h) for c in crops]

    with tempfile.TemporaryDirectory(prefix="videon-reframe-") as tmp:
        raw = Path(tmp) / "raw.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(raw), fourcc, fps, (tw, th))
        if not writer.isOpened():
            raise RuntimeError("Could not open video writer")
        cap = cv2.VideoCapture(str(input_path))
        for i in range(total):
            ok, frame = cap.read()
            if not ok:
                break
            x, y, cw, ch = crops[min(i, len(crops) - 1)]
            patch = frame[y : y + ch, x : x + cw]
            if patch.shape[1] != tw or patch.shape[0] != th:
                patch = cv2.resize(patch, (tw, th), interpolation=cv2.INTER_AREA)
            writer.write(patch)
        writer.release()
        cap.release()
        reencode_h264(raw, output_path)

    return {
        "frames": total,
        "fps": fps,
        "sourceWidth": src_w,
        "sourceHeight": src_h,
        "outputWidth": tw,
        "outputHeight": th,
        "aspectRatio": aspect,
        "saliencyModel": "robust_v1",
        "bytes": output_path.stat().st_size,
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "videon-reframe-worker",
        "saliencyModel": "robust_v1",
        "sampleEvery": SAMPLE_EVERY,
    }


@app.post("/v1/reframe")
async def reframe(
    file: UploadFile = File(...),
    aspectRatio: str = Form("9:16"),
    smoothingFactor: float = Form(0.3),
    customWidth: int | None = Form(None),
    customHeight: int | None = Form(None),
    saliencyModel: str = Form("robust_v1"),
):
    if saliencyModel != "robust_v1":
        raise HTTPException(status_code=400, detail="Only saliencyModel=robust_v1 is supported")
    if aspectRatio not in ("9:16", "16:9", "1:1", "custom"):
        raise HTTPException(status_code=400, detail="Invalid aspectRatio")
    if aspectRatio == "custom" and (not customWidth or not customHeight):
        raise HTTPException(status_code=400, detail="customWidth/customHeight required")
    smoothing = min(1.0, max(0.0, float(smoothingFactor)))

    suffix = Path(file.filename or "source.mp4").suffix or ".mp4"
    with tempfile.TemporaryDirectory(prefix="videon-reframe-in-") as tmp:
        src = Path(tmp) / f"source{suffix}"
        out = Path(tmp) / "out.mp4"
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Empty upload")
        src.write_bytes(data)

        try:
            meta = await asyncio.to_thread(
                run_reframe,
                src,
                out,
                aspectRatio,
                smoothing,
                customWidth,
                customHeight,
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(exc)[:500]) from exc

        # Copy to a stable temp for FileResponse after tmp cleanup — use NamedTemporaryFile delete=False
        final = tempfile.NamedTemporaryFile(prefix="videon-reframe-out-", suffix=".mp4", delete=False)
        final_path = Path(final.name)
        final.close()
        final_path.write_bytes(out.read_bytes())

    headers = {
        "X-Videon-Reframe-Meta": str(meta).replace("'", '"'),
        "X-Videon-Output-Width": str(meta["outputWidth"]),
        "X-Videon-Output-Height": str(meta["outputHeight"]),
    }
    return FileResponse(
        path=final_path,
        media_type="video/mp4",
        filename="reframe.mp4",
        headers=headers,
        background=None,
    )


# Cleanup note: FileResponse leaves NamedTemporaryFile; OS tmp cleaner handles.
# Prefer StreamingResponse with background delete in a later hardening pass.
