"""Pydantic models used by checkpoint serving."""

from pathlib import Path

from pydantic import BaseModel, ConfigDict


class ModelConfig(BaseModel):
    """Configuration required to run a checkpoint in browser."""

    model_config = ConfigDict(frozen=True)

    input_image_size: int
    color_scheme: str
    input_param_names: list[str]
    output_name: str
    output_param_names: list[str]


class Checkpoint(BaseModel):
    """Resolved checkpoint with model path and parsed config."""

    model_config = ConfigDict(frozen=True)

    model_id: str
    model_path: Path
    config: ModelConfig

    @property
    def size(self) -> int:
        """Return ONNX model file size in bytes."""
        return self.model_path.stat().st_size
