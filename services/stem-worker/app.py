"""Persistent VIDEON stem worker — loads htdemucs once, serves /v1/separate."""

from __future__ import annotations

import json
import os
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

import torch
from demucs.apply import apply_model
from demucs.audio import convert_audio
from demucs.pretrained import get_model
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

PORT = int(os.environ.get("PORT", "8091"))
DEVICE = os.environ.get("TORCH_DEVICE", "cpu")
BUCKETS = 240
# Time shifts improve isolation; htdemucs_ft already bags 4 fine-tunes — default 1.
SHIFTS = max(0, int(os.environ.get("STEM_SHIFTS", "1")))
OVERLAP = float(os.environ.get("STEM_OVERLAP", "0.5"))
# Softmask re-partitions the MIX into voice/music and often re-bleeds music into A1.
# Default OFF: keep raw Demucs vocals; music = mix − vocals (clean A1, complementary A2).
SOFTMASK = os.environ.get("STEM_SOFTMASK", "0").strip() in ("1", "true", "True")
# Staging default: fine-tuned bag. Override with STEM_MODEL=htdemucs for faster/cheaper.
_MODEL_NAME = os.environ.get("STEM_MODEL", "htdemucs_ft").strip() or "htdemucs_ft"

app = FastAPI(title="VIDEON stem worker", version="1.3.0")

_MODEL = None


def _load_model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    model = get_model(_MODEL_NAME)
    model.to(DEVICE)
    model.eval()
    _MODEL = model
    return model


@app.on_event("startup")
def startup() -> None:
    _load_model()


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "service": "videon-stem-worker",
        "model": _MODEL_NAME,
        "modelLoaded": _MODEL is not None,
        "device": DEVICE,
        "shifts": SHIFTS,
        "overlap": OVERLAP,
        "softmask": SOFTMASK,
    }


def _wav_peaks_from_path(path: Path, buckets: int = BUCKETS) -> list[float]:
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        sample_width = handle.getsampwidth()
        frame_count = handle.getnframes()
        raw = handle.readframes(frame_count)
    if frame_count <= 0 or sample_width != 2:
        return [0.0] * buckets
    count = len(raw) // 2
    samples = struct.unpack(f"<{count}h", raw)
    centered = [abs(sample / 32768.0) for sample in samples]
    mono: list[float] = []
    step = max(channels, 1)
    for i in range(0, len(centered), step):
        chunk = centered[i : i + step]
        if chunk:
            mono.append(sum(chunk) / len(chunk))
    if not mono:
        return [0.0] * buckets
    peaks: list[float] = []
    for bucket in range(buckets):
        start = int((bucket / buckets) * len(mono))
        end = max(start + 1, int(((bucket + 1) / buckets) * len(mono)))
        window = mono[start:end]
        peaks.append(min(1.0, max(window) if window else 0.0))
    return peaks


def _duration_ms(path: Path) -> int:
    with wave.open(str(path), "rb") as handle:
        frames = handle.getnframes()
        rate = handle.getframerate() or 1
        return int(round((frames / rate) * 1000))


def _read_audio(path: Path, samplerate: int, channels: int):
    """Decode via ffmpeg + stdlib wave — avoid torchaudio loaders (need TorchCodec)."""
    decoded = path.with_suffix(".stem-read.wav")
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(path),
            "-ac",
            str(channels),
            "-ar",
            str(samplerate),
            "-sample_fmt",
            "s16",
            str(decoded),
        ],
        check=True,
    )
    try:
        with wave.open(str(decoded), "rb") as handle:
            if handle.getsampwidth() != 2:
                raise RuntimeError(f"unexpected sampwidth {handle.getsampwidth()}")
            nch = handle.getnchannels()
            sr = handle.getframerate()
            frames = handle.getnframes()
            raw = handle.readframes(frames)
        count = len(raw) // 2
        samples = struct.unpack(f"<{count}h", raw)
        if nch <= 0:
            raise RuntimeError("decoded wav has zero channels")
        # shape [channels, time] float32 in [-1, 1]
        cols = [[samples[i] / 32768.0 for i in range(ch, count, nch)] for ch in range(nch)]
        wav = torch.tensor(cols, dtype=torch.float32)
        if wav.shape[0] == 1 and channels > 1:
            wav = wav.repeat(channels, 1)
        elif wav.shape[0] > channels:
            wav = wav[:channels]
        if sr != samplerate or wav.shape[0] != channels:
            wav = convert_audio(wav, sr, samplerate, channels)
        return wav, samplerate
    finally:
        decoded.unlink(missing_ok=True)


def _write_wav(path: Path, wav: torch.Tensor, samplerate: int) -> None:
    """Write float tensor [C, T] as PCM16 WAV without torchaudio/torchcodec."""
    audio = wav.detach().cpu().clamp(-1, 1)
    if audio.dim() == 1:
        audio = audio.unsqueeze(0)
    channels, frames = int(audio.shape[0]), int(audio.shape[1])
    interleaved = (audio.transpose(0, 1).reshape(-1) * 32767.0).short().numpy()
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(samplerate)
        handle.writeframes(struct.pack(f"<{interleaved.size}h", *interleaved.tolist()))

    """Wiener-style mask on the mixture → complementary stems (sum ≈ mix)."""
    eps = 1e-8
    v_pow = vocals.pow(2)
    a_pow = accompaniment.pow(2)
    denom = (v_pow + a_pow).clamp_min(eps)
    v_mask = v_pow / denom
    a_mask = a_pow / denom
    return mix * v_mask, mix * a_mask


def _separate_demucs(source: Path, voice_out: Path, music_out: Path) -> str:
    model = _load_model()
    wav, _sr = _read_audio(source, model.samplerate, model.audio_channels)
    ref = wav.mean(0)
    mean = ref.mean()
    std = ref.std() + 1e-8
    wav_n = (wav - mean) / std
    with torch.no_grad():
        sources = apply_model(
            model,
            wav_n[None],
            device=DEVICE,
            shifts=SHIFTS,
            split=True,
            overlap=OVERLAP,
        )[0]
    # Undo input normalization (matches demucs.separate).
    sources = sources * std + mean
    mix = wav_n * std + mean
    index = {name: i for i, name in enumerate(model.sources)}
    if "vocals" not in index:
        raise RuntimeError(f"model sources missing vocals: {list(model.sources)}")
    vocals = sources[index["vocals"]]

    method_base = f"demucs_{_MODEL_NAME}"
    if SOFTMASK:
        accompaniment = None
        for name, i in index.items():
            if name == "vocals":
                continue
            accompaniment = sources[i] if accompaniment is None else accompaniment + sources[i]
        if accompaniment is None:
            accompaniment = torch.zeros_like(vocals)
        # Optional: partition mix by stem power (can re-bleed music into voice).
        vocals, accompaniment = _softmask_partition(mix, vocals, accompaniment)
        method = f"{method_base}_soft"
    else:
        # Product default: pure Demucs vocals on A1; residual (mix − voice) on A2.
        # Keeps speech clean; anything Demucs did not assign to vocals lands in music.
        accompaniment = mix - vocals
        method = f"{method_base}_residual"

    _write_wav(voice_out, vocals, model.samplerate)
    _write_wav(music_out, accompaniment, model.samplerate)
    return method


def _separate_ffmpeg(source: Path, voice_out: Path, music_out: Path) -> str:
    script = Path(__file__).resolve().parent / "separate-audio-stems.py"
    result = subprocess.run(
        [
            "python3",
            str(script),
            str(source),
            str(voice_out),
            str(music_out),
            "--buckets",
            str(BUCKETS),
            "--method",
            "ffmpeg_mid_side",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=10 * 60,
    )
    payload = json.loads(result.stdout)
    return str(payload.get("method") or "ffmpeg_center_band")


def _multipart_response(meta: dict, voice: Path, music: Path) -> Response:
    boundary = "videonstemboundary"
    meta_bytes = json.dumps(meta).encode("utf-8")
    voice_bytes = voice.read_bytes()
    music_bytes = music.read_bytes()
    body = b"".join(
        [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"meta\"\r\nContent-Type: application/json\r\n\r\n".encode(),
            meta_bytes,
            b"\r\n",
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"voice\"; filename=\"voice.wav\"\r\nContent-Type: audio/wav\r\n\r\n".encode(),
            voice_bytes,
            b"\r\n",
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"music\"; filename=\"music.wav\"\r\nContent-Type: audio/wav\r\n\r\n".encode(),
            music_bytes,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return Response(content=body, media_type=f"multipart/form-data; boundary={boundary}")


@app.post("/v1/separate")
async def separate(
    file: UploadFile = File(...),
    method: str = Form("demucs"),
):
    if method not in ("demucs", "ffmpeg_mid_side"):
        raise HTTPException(400, "method must be demucs or ffmpeg_mid_side")

    with tempfile.TemporaryDirectory(prefix="videon-stem-job-") as tmp:
        tmp_path = Path(tmp)
        suffix = Path(file.filename or "audio.wav").suffix or ".wav"
        source = (tmp_path / "source").with_suffix(suffix)
        source.write_bytes(await file.read())
        voice_out = tmp_path / "voice.wav"
        music_out = tmp_path / "music.wav"
        try:
            if method == "demucs":
                recorded = _separate_demucs(source, voice_out, music_out)
            else:
                recorded = _separate_ffmpeg(source, voice_out, music_out)
        except Exception as error:  # noqa: BLE001
            if method == "demucs":
                print(f"[stem-worker] demucs failed, using ffmpeg fallback: {error!r}", flush=True)
                try:
                    recorded = f"{_separate_ffmpeg(source, voice_out, music_out)}_fallback"
                except Exception as nested:  # noqa: BLE001
                    raise HTTPException(500, f"stem failed: {error}; fallback: {nested}") from nested
            else:
                raise HTTPException(500, f"stem failed: {error}") from error

        meta = {
            "method": recorded,
            "durationMs": _duration_ms(voice_out),
            "voicePeaks": _wav_peaks_from_path(voice_out),
            "musicPeaks": _wav_peaks_from_path(music_out),
        }
        return _multipart_response(meta, voice_out, music_out)
