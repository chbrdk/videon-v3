#!/usr/bin/env python3
"""Split source audio into voice and music stems.

Default: ffmpeg mid/side (CPU-safe, always available).
Optional: Demucs two-stem vocals/no_vocals when --method demucs and demucs is installed.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path


def run_ffmpeg(args: list[str]) -> None:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
        check=True,
    )


def probe_channels(path: Path) -> int:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=channels",
            "-of",
            "csv=p=0",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    raw = (result.stdout or "").strip().splitlines()
    try:
        return max(int(raw[0]), 1)
    except (IndexError, ValueError):
        return 1


def wav_peaks(path: Path, buckets: int = 240) -> list[float]:
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        sample_width = handle.getsampwidth()
        frame_count = handle.getnframes()
        raw = handle.readframes(frame_count)

    if frame_count <= 0 or sample_width not in (1, 2, 3, 4):
        return [0.0] * buckets

    if sample_width == 1:
        fmt = f"{len(raw)}B"
        samples = struct.unpack(fmt, raw)
        centered = [((sample - 128) / 128.0) for sample in samples]
    elif sample_width == 2:
        count = len(raw) // 2
        samples = struct.unpack(f"<{count}h", raw)
        centered = [sample / 32768.0 for sample in samples]
    elif sample_width == 3:
        centered = []
        for index in range(0, len(raw) - 2, 3):
            value = int.from_bytes(raw[index : index + 3], "little", signed=True)
            centered.append(value / 8388608.0)
    else:
        count = len(raw) // 4
        samples = struct.unpack(f"<{count}i", raw)
        centered = [sample / 2147483648.0 for sample in samples]

    frame_samples = max(len(centered) // max(channels, 1), 1)
    mono = []
    for frame_index in range(frame_samples):
        start = frame_index * channels
        chunk = centered[start : start + channels]
        if not chunk:
            continue
        mono.append(sum(abs(sample) for sample in chunk) / len(chunk))

    if not mono:
        return [0.0] * buckets

    peaks: list[float] = []
    for bucket in range(buckets):
        start = math.floor((bucket / buckets) * len(mono))
        end = max(start + 1, math.floor(((bucket + 1) / buckets) * len(mono)))
        window = mono[start:end]
        peaks.append(min(1.0, max(window) if window else 0.0))
    return peaks


def wav_duration_ms(path: Path) -> int:
    with wave.open(str(path), "rb") as handle:
        frames = handle.getnframes()
        rate = handle.getframerate() or 1
        return int(round((frames / rate) * 1000))


def demucs_available() -> bool:
    import importlib.util

    return importlib.util.find_spec("demucs") is not None


def separate_with_demucs(stereo: Path, voice_out: Path, music_out: Path) -> str:
    if not demucs_available():
        raise RuntimeError("demucs is not installed")

    with tempfile.TemporaryDirectory(prefix="videon-demucs-") as tmp:
        out_dir = Path(tmp)
        subprocess.run(
            [
                sys.executable,
                "-m",
                "demucs",
                "-n",
                "htdemucs",
                "--two-stems=vocals",
                "-o",
                str(out_dir),
                str(stereo),
            ],
            check=True,
            timeout=30 * 60,
        )
        vocals = next(out_dir.rglob("vocals.wav"), None)
        no_vocals = next(out_dir.rglob("no_vocals.wav"), None)
        if vocals is None or no_vocals is None:
            raise RuntimeError("demucs did not produce vocals/no_vocals stems")
        shutil.copyfile(vocals, voice_out)
        shutil.copyfile(no_vocals, music_out)
    return "demucs_htdemucs"


def separate_with_ffmpeg(stereo: Path, voice_out: Path, music_out: Path) -> str:
    channels = probe_channels(stereo)
    if channels < 2:
        run_ffmpeg(["-i", str(stereo), "-ac", "1", str(voice_out)])
        run_ffmpeg(
            [
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=mono:sample_rate=44100",
                "-t",
                str(max(wav_duration_ms(voice_out) / 1000, 0.05)),
                str(music_out),
            ]
        )
        return "mono_passthrough"

    run_ffmpeg(
        [
            "-i",
            str(stereo),
            "-af",
            "pan=mono|c0=0.5*c0+0.5*c1",
            str(voice_out),
        ]
    )
    run_ffmpeg(
        [
            "-i",
            str(stereo),
            "-af",
            "pan=mono|c0=0.5*c0+-0.5*c1",
            str(music_out),
        ]
    )
    return "ffmpeg_mid_side"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("voice_out")
    parser.add_argument("music_out")
    parser.add_argument("--buckets", type=int, default=240)
    parser.add_argument(
        "--method",
        choices=("ffmpeg_mid_side", "demucs"),
        default="ffmpeg_mid_side",
    )
    args = parser.parse_args()

    source = Path(args.source)
    voice_out = Path(args.voice_out)
    music_out = Path(args.music_out)
    stereo = source.with_suffix(".stem-stereo.wav")

    run_ffmpeg(
        [
            "-i",
            str(source),
            "-vn",
            "-ac",
            "2",
            "-ar",
            "44100",
            str(stereo),
        ]
    )

    method = "ffmpeg_mid_side"
    if args.method == "demucs":
        try:
            method = separate_with_demucs(stereo, voice_out, music_out)
        except Exception as error:  # noqa: BLE001
            sys.stderr.write(f"demucs failed, falling back to mid/side: {error}\n")
            method = f"{separate_with_ffmpeg(stereo, voice_out, music_out)}_fallback"
    else:
        method = separate_with_ffmpeg(stereo, voice_out, music_out)

    stereo.unlink(missing_ok=True)

    payload = {
        "method": method,
        "voicePath": str(voice_out),
        "musicPath": str(music_out),
        "durationMs": wav_duration_ms(voice_out),
        "voicePeaks": wav_peaks(voice_out, args.buckets),
        "musicPeaks": wav_peaks(music_out, args.buckets),
    }
    sys.stdout.write(json.dumps(payload))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        sys.stderr.write(f"stem separation failed: {error}\n")
        raise SystemExit(1)
