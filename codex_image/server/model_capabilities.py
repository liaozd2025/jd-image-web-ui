from __future__ import annotations

from copy import deepcopy
from typing import Any


PROFILE_VERSION = 1


_PROFILES: tuple[dict[str, Any], ...] = (
    {
        "profile_id": "generic-basic",
        "version": PROFILE_VERSION,
        "display_name": "通用基础",
        "summary": "基础生成 · 兼容模式",
        "summary_key": "generationModel.summaryGeneric",
        "protocol_adapter": "openai-compatible",
        "api_modes": ["images", "responses"],
        "task_modes": ["generate", "edit"],
        "max_reference_images": 16,
        "sizes": ["1024x1024"],
        "default_size": "1024x1024",
        "custom_size": True,
        "size_constraints": {
            "min_dimension": 512,
            "max_dimension": 4096,
            "min_aspect_ratio": 0.333333,
            "max_aspect_ratio": 3.0,
        },
        "min_output_count": 1,
        "max_output_count": 4,
        "output_formats": ["png", "jpeg", "webp"],
        "default_output_format": "png",
        "prompt_optimization_modes": [],
        "seed": {"supported": False},
        "watermark": {"user_configurable": False, "enabled": False},
        "phase_features": {
            "precise_edit": False,
            "sequential_generation": False,
            "streaming": False,
        },
    },
    {
        "profile_id": "seedream-5-lite",
        "version": PROFILE_VERSION,
        "display_name": "Seedream 5.0 Lite",
        "summary": "连续组图 · 最高 4K",
        "summary_key": "generationModel.summarySeedreamLite",
        "protocol_adapter": "volcengine-ark-images",
        "api_modes": ["images"],
        "task_modes": ["generate", "edit"],
        "max_reference_images": 16,
        "sizes": ["1024x1024", "2048x2048", "4096x4096"],
        "default_size": "2048x2048",
        "custom_size": True,
        "size_constraints": {
            "min_dimension": 512,
            "max_dimension": 4096,
            "min_aspect_ratio": 0.333333,
            "max_aspect_ratio": 3.0,
        },
        "min_output_count": 1,
        "max_output_count": 4,
        "output_formats": ["png", "jpeg"],
        "default_output_format": "png",
        "prompt_optimization_modes": ["standard"],
        "seed": {"supported": True, "minimum": 0, "maximum": 2147483647},
        "watermark": {"user_configurable": False, "enabled": False},
        "phase_features": {
            "precise_edit": False,
            "sequential_generation": True,
            "streaming": True,
        },
    },
    {
        "profile_id": "seedream-5-pro",
        "version": PROFILE_VERSION,
        "display_name": "Seedream 5.0 Pro",
        "summary": "精准编辑 · 最高 2K",
        "summary_key": "generationModel.summarySeedreamPro",
        "protocol_adapter": "volcengine-ark-images",
        "api_modes": ["images"],
        "task_modes": ["generate", "edit"],
        "max_reference_images": 16,
        "sizes": ["1024x1024", "2048x2048"],
        "default_size": "2048x2048",
        "custom_size": True,
        "size_constraints": {
            "min_dimension": 512,
            "max_dimension": 2048,
            "min_aspect_ratio": 0.333333,
            "max_aspect_ratio": 3.0,
        },
        "min_output_count": 1,
        "max_output_count": 4,
        "output_formats": ["png", "jpeg"],
        "default_output_format": "png",
        "prompt_optimization_modes": ["standard", "fast"],
        "seed": {"supported": True, "minimum": 0, "maximum": 2147483647},
        "watermark": {"user_configurable": False, "enabled": False},
        "phase_features": {
            "precise_edit": True,
            "sequential_generation": False,
            "streaming": False,
        },
    },
)


def list_model_capability_profiles() -> list[dict[str, Any]]:
    return deepcopy(list(_PROFILES))


def get_model_capability_profile(profile_id: str) -> dict[str, Any]:
    for profile in _PROFILES:
        if profile["profile_id"] == profile_id:
            return deepcopy(profile)
    raise KeyError(profile_id)


def model_capability_profile_exists(profile_id: str) -> bool:
    return any(profile["profile_id"] == profile_id for profile in _PROFILES)
