#!/bin/sh
# Shell script to ensure environment variables are expanded correctly
uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
