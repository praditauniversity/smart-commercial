# syntax=docker/dockerfile:1.7
# Local SAM3 inference service. The CUDA runtime comes from the torch cu130 wheels and the
# driver is injected by the NVIDIA Container Toolkit, so no nvidia/cuda base image is needed.
FROM python:3.14-slim

# ffmpeg (with libx264) encodes the annotated video; libgl1/libglib2.0-0 are the shared
# libraries opencv-python needs, which ultralytics pulls in alongside the headless build.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        ca-certificates \
        git \
    && rm -rf /var/lib/apt/lists/*

# YOLO_CONFIG_DIR: ultralytics writes a settings file at import time; keep it off the app dir.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    YOLO_CONFIG_DIR=/tmp/ultralytics

WORKDIR /app

COPY requirements.txt requirements-gpu.txt ./
RUN pip install --no-cache-dir -r requirements-gpu.txt \
        --extra-index-url https://download.pytorch.org/whl/cu130

COPY . .

RUN useradd --system --create-home --uid 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Reads AI_SERVICE_HOST / AI_SERVICE_PORT from the environment (no defaults in code).
CMD ["python", "main.py"]
