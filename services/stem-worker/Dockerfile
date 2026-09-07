# VIDEON stem worker — always-on Demucs (CPU).
# Coolify: Dockerfile path `services/stem-worker/Dockerfile`, port 8091, never scale to zero.
ARG PYTHON_IMAGE=python:3.11-slim-bookworm

FROM ${PYTHON_IMAGE}
WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PORT=8091
ENV TORCH_DEVICE=cpu
ENV CUDA_VISIBLE_DEVICES=""
ENV VIDEON_STEM_DEMUCS_ENABLED=true

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY services/stem-worker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir \
      --index-url https://download.pytorch.org/whl/cpu \
      torch torchaudio \
    && pip install --no-cache-dir -r /app/requirements.txt \
    && pip install --no-cache-dir --force-reinstall \
      --index-url https://download.pytorch.org/whl/cpu \
      torch torchaudio \
    && python -c "from demucs.pretrained import get_model; get_model('htdemucs')"

COPY services/stem-worker/app.py /app/app.py
COPY scripts/separate-audio-stems.py /app/separate-audio-stems.py

EXPOSE 8091
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8091", "--workers", "1", "--timeout-keep-alive", "75"]
