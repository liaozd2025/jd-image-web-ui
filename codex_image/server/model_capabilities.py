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
        "profile_id": "gpt-image-2",
        "version": PROFILE_VERSION,
        "display_name": "GPT Image 2",
        "summary": "GPT 图像生成与编辑",
        "protocol_adapter": "openai-compatible",
        "api_modes": ["images", "responses"],
        "task_modes": ["generate", "edit"],
        "max_reference_images": 16,
        "sizes": ["1024x1024", "1536x1024", "1024x1536"],
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
            "precise_edit": True,
            "sequential_generation": False,
            "streaming": True,
        },
        "model_family_id": "gpt-image",
        "canonical_model_id": "gpt-image-2",
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
    {
        "profile_id": "nano-banana-pro",
        "version": PROFILE_VERSION,
        "display_name": "Nano Banana Pro",
        "summary": "Gemini 3 Pro Image · 最高 4K",
        "protocol_adapter": "gemini-generate-content",
        "api_modes": ["images"],
        "task_modes": ["generate", "edit"],
        "max_reference_images": 14,
        "sizes": ["1024x1024", "2048x2048", "4096x4096"],
        "default_size": "1024x1024",
        "custom_size": False,
        "aspect_ratios": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "min_output_count": 1,
        "max_output_count": 4,
        "output_formats": ["png"],
        "default_output_format": "png",
        "prompt_optimization_modes": [],
        "seed": {"supported": False},
        "watermark": {"user_configurable": False, "enabled": False},
        "google_search": True,
        "model_family_id": "gemini-image",
        "canonical_model_id": "nano-banana-pro",
    },
    {
        "profile_id": "nano-banana-2",
        "version": PROFILE_VERSION,
        "display_name": "Nano Banana 2",
        "summary": "Gemini 3.1 Flash Image · 最高 4K",
        "protocol_adapter": "gemini-generate-content",
        "api_modes": ["images"],
        "task_modes": ["generate", "edit"],
        "max_reference_images": 14,
        "sizes": ["512x512", "1024x1024", "2048x2048", "4096x4096"],
        "default_size": "1024x1024",
        "custom_size": False,
        "aspect_ratios": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "1:8", "4:1", "8:1"],
        "resolutions": ["512", "1K", "2K", "4K"],
        "min_output_count": 1,
        "max_output_count": 4,
        "output_formats": ["png"],
        "default_output_format": "png",
        "prompt_optimization_modes": [],
        "seed": {"supported": False},
        "watermark": {"user_configurable": False, "enabled": False},
        "google_search": True,
        "model_family_id": "gemini-image",
        "canonical_model_id": "nano-banana-2",
    },
    {
        "profile_id": "nano-banana-2-lite",
        "version": PROFILE_VERSION,
        "display_name": "Nano Banana 2 Lite",
        "summary": "Gemini 3.1 Flash Lite Image",
        "protocol_adapter": "gemini-generate-content",
        "api_modes": ["images"],
        "task_modes": ["generate", "edit"],
        "max_reference_images": 14,
        "sizes": ["1024x1024"],
        "default_size": "1024x1024",
        "custom_size": False,
        "aspect_ratios": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolutions": ["1K"],
        "min_output_count": 1,
        "max_output_count": 4,
        "output_formats": ["png"],
        "default_output_format": "png",
        "prompt_optimization_modes": [],
        "seed": {"supported": False},
        "watermark": {"user_configurable": False, "enabled": False},
        "google_search": False,
        "model_family_id": "gemini-image",
        "canonical_model_id": "nano-banana-2-lite",
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


def provider_binding_defaults(
    profile_id: str,
    *,
    model_id: str,
    api_mode: str,
) -> dict[str, object]:
    profile = get_model_capability_profile(profile_id)
    canonical_model_id = str(profile.get("canonical_model_id") or model_id)
    model_family_id = str(
        profile.get("model_family_id")
        or ("seedream-image" if profile_id.startswith("seedream-") else "gpt-image")
    )
    if model_family_id == "gemini-image":
        protocol_profile = "gemini_generate_content"
        parameter_codec = "gemini_generate_content_image"
    elif api_mode == "responses":
        protocol_profile = "openai_responses"
        parameter_codec = "gpt_openai_responses"
    else:
        protocol_profile = "openai_images"
        parameter_codec = "gpt_openai_images"
    return {
        "model_family_id": model_family_id,
        "canonical_model_id": canonical_model_id,
        "protocol_profile": protocol_profile,
        "parameter_codec": parameter_codec,
        "supported_operations": ["generate", "edit"],
        "append_aspect_ratio_prompt": False,
    }
