"""Repository helpers for locating and reading model checkpoints."""

import json
from pathlib import Path

from backend.models import Checkpoint, ModelConfig


MODEL_FILES = (
    "model.with_runtime_opt.ort",
    "model.ort",
    "model.onnx",
)
CONFIG_FILE = "config.json"


class CheckpointError(Exception):
    """Base checkpoint lookup error."""


class CheckpointNotFoundError(CheckpointError):
    """Raised when requested checkpoint does not exist."""


class InvalidCheckpointConfigError(CheckpointError):
    """Raised when checkpoint config cannot be read."""


class CheckpointRepository:  # pylint: disable=too-few-public-methods
    """Filesystem-backed checkpoint repository."""

    def __init__(self, model_dir: Path) -> None:
        """Create repository rooted at model directory."""
        self.model_dir = model_dir

    def get(self, model_id: str) -> Checkpoint:
        """Return checkpoint by id, or latest checkpoint for latest alias."""
        model_path = (
            self._latest_model_dir()
            if model_id == "latest"
            else self._model_dir(model_id)
        )
        return Checkpoint(
            model_id=model_path.name,
            model_path=self._model_file(model_path),
            config=self._read_config(model_path),
        )

    def _model_dirs(self) -> list[Path]:
        return [
            path
            for path in self.model_dir.iterdir()
            if path.is_dir()
            and self._model_file(path).is_file()
            and (path / CONFIG_FILE).is_file()
        ]

    def _latest_model_dir(self) -> Path:
        model_dirs = self._model_dirs()
        if not model_dirs:
            raise CheckpointNotFoundError("No model checkpoints found")
        return max(model_dirs, key=model_number)

    def _model_dir(self, model_id: str) -> Path:
        path = (self.model_dir / model_id).resolve()
        if (
            not path.is_relative_to(self.model_dir)
            or not path.is_dir()
            or not self._model_file(path).is_file()
        ):
            raise CheckpointNotFoundError("Checkpoint not found")
        return path

    @staticmethod
    def _model_file(model_path: Path) -> Path:
        for file_name in MODEL_FILES:
            path = model_path / file_name
            if path.is_file():
                return path
        return model_path / MODEL_FILES[-1]

    @staticmethod
    def _read_config(model_path: Path) -> ModelConfig:
        config_path = model_path / CONFIG_FILE
        try:
            with config_path.open("r", encoding="utf-8") as file:
                return ModelConfig.model_validate(json.load(file))
        except json.JSONDecodeError as error:
            raise InvalidCheckpointConfigError(
                f"Invalid model config: {model_path.name}"
            ) from error
        except ValueError as error:
            raise InvalidCheckpointConfigError(
                f"Invalid model config schema: {model_path.name}"
            ) from error


def model_number(path: Path) -> int:
    """Extract numeric suffix from model folder name."""
    try:
        return int(path.name.rsplit("_", 1)[1])
    except (IndexError, ValueError):
        return -1
