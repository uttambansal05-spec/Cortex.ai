#!/bin/bash

# Start Celery worker in background
celery -A workers.build_brain.celery_app worker --loglevel=info --concurrency=1 &

# Start FastAPI
uvicorn main:app --host 0.0.0.0 --port $PORT