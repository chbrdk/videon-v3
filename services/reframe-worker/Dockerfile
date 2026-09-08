# VIDEON reframe worker — Robust OpenCV saliency + smooth crop (CPU).
# Coolify: Dockerfile path `services/reframe-worker/Dockerfile`, port 8092, never scale to zero.
ARG PYTHON_IMAGE=python:3.11-slim-bookworm

FROM ${PYTHON_IMAGE}
WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PORT=8092
ENV REFRAME_SAMPLE_EVERY=12
ENV REFRAME_MAX_MOVEMENT=15

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY services/reframe-worker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY services/reframe-worker/app.py /app/app.py

EXPOSE 8092
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8092", "--workers", "1", "--timeout-keep-alive", "120"]
