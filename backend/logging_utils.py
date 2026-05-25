import json
import logging
import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_FILE = Path(os.getenv("LOG_FILE", PROJECT_ROOT / "backend" / "logs" / "app.log"))

LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)

logger = logging.getLogger("image_enhancer_backend")


def log_event(event: str, data: dict, level: str = "info"):
    message = json.dumps({"event": event, "data": data}, ensure_ascii=False)
    getattr(logger, normalize_log_level(level))(message)


def read_log_lines(limit: int) -> list[str]:
    if not LOG_FILE.exists():
        return []
    with LOG_FILE.open("r", encoding="utf-8") as file:
        return [line.rstrip("\n") for line in file.readlines()[-limit:]]


def normalize_log_level(level: str) -> str:
    value = level.lower()
    if value == "error":
        return "error"
    if value in {"warn", "warning"}:
        return "warning"
    return "info"
