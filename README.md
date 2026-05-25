# Browser Image Enhancer

Client-side image enhancement demo. It accepts one browser-decodable image, loads the latest ONNX checkpoint from backend, runs it locally with ONNX Runtime Web, then applies predicted brightness, contrast, and saturation.

## Project Structure

- `frontend/` - simple browser demo and ONNX inference code.
- `backend/` - FastAPI API server for sessions, logs, and model checkpoint serving; it does not run ML inference.
- `ml/` - CNN notebook, ONNX model file.

## Docker

```bash
docker compose up --build
```

This starts both services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`

Copy `.env.example` to `.env` and change ports if needed.
