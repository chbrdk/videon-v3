#!/usr/bin/env python3
"""Transcribe a mono WAV file to JSON on stdout. Requires faster-whisper."""

import json
import os
import sys


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: transcribe-audio.py <wav-path>"}), file=sys.stderr)
        return 2

    audio_path = sys.argv[1]
    model_name = os.environ.get("VIDEON_WHISPER_MODEL", "tiny")
    language = os.environ.get("VIDEON_WHISPER_LANGUAGE", "de")

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"error": "faster-whisper is not installed"}), file=sys.stderr)
        return 3

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments_iter, _info = model.transcribe(audio_path, beam_size=5, language=language)
    segments = []
    texts = []
    for segment in segments_iter:
        text = segment.text.strip()
        if not text:
            continue
        entry = {
            "startMs": int(segment.start * 1000),
            "endMs": int(segment.end * 1000),
            "text": text,
        }
        segments.append(entry)
        texts.append(text)

    print(json.dumps({"text": " ".join(texts).strip(), "segments": segments}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
