from __future__ import annotations

import base64
import json
import re
import uuid
from io import BytesIO
from os import PathLike
from typing import Any
from urllib.parse import urlsplit

from .client_types import (
    DEFAULT_IMAGE_MODEL,
    DEFAULT_MAIN_MODEL,
    DEFAULT_OPENAI_API_BASE_URL,
    OPENAI_COMPATIBLE_USER_AGENT,
    ImageResult,
    image_model_supports_input_fidelity,
    normalize_openai_base_url,
)
from .http import MAX_PROVIDER_RESPONSE_BYTES, Transport, UrllibTransport


_DIMENSION_SIZE_RE = re.compile(r"^\s*(\d{1,5})\s*[xX×]\s*(\d{1,5})\s*$")


class OpenAIImagesImageClient:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = DEFAULT_OPENAI_API_BASE_URL,
        image_model: str = DEFAULT_IMAGE_MODEL,
        transport: Transport | None = None,
    ) -> None:
        clean_key = str(api_key or "").strip()
        if not clean_key:
            raise RuntimeError("OpenAI-compatible API key is required")
        self.api_key = clean_key
        self.base_url = self._normalize_base_url(base_url)
        self.image_model = str(image_model or DEFAULT_IMAGE_MODEL).strip() or DEFAULT_IMAGE_MODEL
        self.transport = transport or UrllibTransport()
        self.generations_url = f"{self.base_url}/images/generations"
        self.edits_url = f"{self.base_url}/images/edits"

    def generate_image(
        self,
        *,
        prompt: str,
        main_model: str = DEFAULT_MAIN_MODEL,
        model: str | None = None,
        reference_images: list[str] | None = None,
        size: str | None = None,
        quality: str | None = None,
        background: str | None = None,
        output_format: str = "png",
        moderation: str | None = None,
        output_compression: int | None = None,
        partial_images: int | None = None,
        debug_sse_path: str | PathLike[str] | None = None,
        seed: int | None = None,
        prompt_optimization_mode: str | None = None,
        watermark: bool | None = None,
    ) -> ImageResult:
        return self.generate_images(
            prompt=prompt,
            main_model=main_model,
            model=model,
            reference_images=reference_images,
            size=size,
            quality=quality,
            background=background,
            output_format=output_format,
            moderation=moderation,
            output_compression=output_compression,
            partial_images=partial_images,
            debug_sse_path=debug_sse_path,
            seed=seed,
            prompt_optimization_mode=prompt_optimization_mode,
            watermark=watermark,
            n=1,
        )[0]

    def generate_images(
        self,
        *,
        prompt: str,
        main_model: str = DEFAULT_MAIN_MODEL,
        model: str | None = None,
        reference_images: list[str] | None = None,
        size: str | None = None,
        quality: str | None = None,
        background: str | None = None,
        output_format: str = "png",
        moderation: str | None = None,
        output_compression: int | None = None,
        partial_images: int | None = None,
        debug_sse_path: str | PathLike[str] | None = None,
        n: int = 1,
        seed: int | None = None,
        prompt_optimization_mode: str | None = None,
        watermark: bool | None = None,
    ) -> list[ImageResult]:
        del partial_images, debug_sse_path
        action = "edit" if reference_images else "generate"
        payload = self.build_payload(
            prompt=prompt,
            action=action,
            main_model=main_model,
            model=model,
            input_images=reference_images or [],
            size=size,
            quality=quality,
            background=background,
            output_format=output_format,
            moderation=moderation,
            output_compression=output_compression,
            n=n,
            seed=seed,
            prompt_optimization_mode=prompt_optimization_mode,
            watermark=watermark,
        )
        return self._request_and_parse_many(payload)

    def edit_image(
        self,
        *,
        prompt: str,
        images: list[str],
        mask_image: str | None = None,
        main_model: str = DEFAULT_MAIN_MODEL,
        model: str | None = None,
        size: str | None = None,
        quality: str | None = None,
        background: str | None = None,
        output_format: str = "png",
        input_fidelity: str | None = None,
        moderation: str | None = None,
        output_compression: int | None = None,
        partial_images: int | None = None,
        debug_sse_path: str | PathLike[str] | None = None,
        seed: int | None = None,
        prompt_optimization_mode: str | None = None,
        watermark: bool | None = None,
    ) -> ImageResult:
        return self.edit_images(
            prompt=prompt,
            images=images,
            mask_image=mask_image,
            main_model=main_model,
            model=model,
            size=size,
            quality=quality,
            background=background,
            output_format=output_format,
            input_fidelity=input_fidelity,
            moderation=moderation,
            output_compression=output_compression,
            partial_images=partial_images,
            debug_sse_path=debug_sse_path,
            n=1,
            seed=seed,
            prompt_optimization_mode=prompt_optimization_mode,
            watermark=watermark,
        )[0]

    def edit_images(
        self,
        *,
        prompt: str,
        images: list[str],
        mask_image: str | None = None,
        main_model: str = DEFAULT_MAIN_MODEL,
        model: str | None = None,
        size: str | None = None,
        quality: str | None = None,
        background: str | None = None,
        output_format: str = "png",
        input_fidelity: str | None = None,
        moderation: str | None = None,
        output_compression: int | None = None,
        partial_images: int | None = None,
        debug_sse_path: str | PathLike[str] | None = None,
        n: int = 1,
        seed: int | None = None,
        prompt_optimization_mode: str | None = None,
        watermark: bool | None = None,
    ) -> list[ImageResult]:
        del partial_images, debug_sse_path
        if not images:
            raise RuntimeError("edit_image requires at least one input image")

        payload = self.build_payload(
            prompt=prompt,
            action="edit",
            main_model=main_model,
            model=model,
            input_images=images,
            mask_image=mask_image,
            size=size,
            quality=quality,
            background=background,
            output_format=output_format,
            input_fidelity=input_fidelity,
            moderation=moderation,
            output_compression=output_compression,
            n=n,
            seed=seed,
            prompt_optimization_mode=prompt_optimization_mode,
            watermark=watermark,
        )
        return self._request_and_parse_many(payload)

    def build_payload(
        self,
        *,
        prompt: str,
        action: str = "generate",
        main_model: str = DEFAULT_MAIN_MODEL,
        model: str | None = None,
        input_images: list[str] | None = None,
        mask_image: str | None = None,
        size: str | None = None,
        quality: str | None = None,
        background: str | None = None,
        output_format: str = "png",
        input_fidelity: str | None = None,
        moderation: str | None = None,
        output_compression: int | None = None,
        n: int = 1,
        seed: int | None = None,
        prompt_optimization_mode: str | None = None,
        watermark: bool | None = None,
    ) -> dict[str, Any]:
        del main_model
        image_model = str(model or self.image_model or DEFAULT_IMAGE_MODEL).strip() or DEFAULT_IMAGE_MODEL
        images = list(input_images or [])
        count = self._normalize_image_count(n)
        endpoint = "/images/edits" if action == "edit" or images else "/images/generations"
        payload: dict[str, Any] = {
            "endpoint": endpoint,
            "model": image_model,
            "prompt": prompt,
            "n": count,
            "output_format": output_format,
        }
        if size:
            payload["size"] = size
        if quality:
            payload["quality"] = quality
        if background:
            payload["background"] = background
        if input_fidelity and image_model_supports_input_fidelity(image_model):
            payload["input_fidelity"] = input_fidelity
        if moderation:
            payload["moderation"] = moderation
        if output_compression is not None:
            payload["output_compression"] = output_compression
        if images:
            payload["images"] = [{"image_url": image_url} for image_url in images]
        if mask_image:
            payload["mask"] = {"image_url": mask_image}
        if seed is not None:
            payload["seed"] = int(seed)
        if prompt_optimization_mode and prompt_optimization_mode != "off":
            payload["optimize_prompt_options"] = {"mode": prompt_optimization_mode}
        if watermark is not None:
            payload["watermark"] = bool(watermark)
        return payload

    def _request_and_parse(self, payload: dict[str, Any]) -> ImageResult:
        return self._request_and_parse_many(payload)[0]

    def _request_and_parse_many(self, payload: dict[str, Any]) -> list[ImageResult]:
        if self._uses_volcengine_ark_dialect(payload) and self._normalize_image_count(payload.get("n", 1)) > 1:
            results: list[ImageResult] = []
            for _ in range(self._normalize_image_count(payload.get("n", 1))):
                results.extend(self._request_and_parse_many({**payload, "n": 1}))
            return results
        endpoint = str(payload.get("endpoint") or "/images/generations")
        if self._uses_volcengine_ark_dialect(payload):
            request_payload = self._volcengine_ark_request_payload(payload)
            body = json.dumps(request_payload).encode("utf-8")
            url = self.generations_url
            headers = self._build_headers(content_type="application/json")
        elif endpoint == "/images/edits":
            body, content_type = self._build_multipart_edit_body(payload)
            url = self.edits_url
            headers = self._build_headers(content_type=content_type)
        else:
            request_payload = self._json_request_payload(payload)
            body = json.dumps(request_payload).encode("utf-8")
            url = self.generations_url
            headers = self._build_headers(content_type="application/json")

        response = self.transport.request(
            method="POST",
            url=url,
            headers=headers,
            body=body,
        )
        if len(response.body) > MAX_PROVIDER_RESPONSE_BYTES:
            raise RuntimeError("OpenAI-compatible images response exceeds the server response limit")
        if response.status < 200 or response.status >= 300:
            try:
                decoded = json.loads(response.body.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                decoded = None
            if isinstance(decoded, dict) and isinstance(decoded.get("error"), dict):
                detail = self._format_api_error(decoded["error"])
            else:
                detail = f"OpenAI-compatible images request failed: HTTP {response.status}"
            raise RuntimeError(detail)
        return self.parse_response_json_items(response.body, request_payload=payload, url_fetcher=self._fetch_image_url)

    def _uses_volcengine_ark_dialect(self, payload: dict[str, Any]) -> bool:
        host = str(urlsplit(self.base_url).hostname or "").lower()
        model = str(payload.get("model") or self.image_model or "").lower()
        return host.endswith(".volces.com") and model.startswith("doubao-seedream-")

    @staticmethod
    def _volcengine_ark_request_payload(payload: dict[str, Any]) -> dict[str, Any]:
        request_payload: dict[str, Any] = {
            "model": payload.get("model"),
            "prompt": payload.get("prompt"),
            "response_format": "b64_json",
        }
        if payload.get("size"):
            request_payload["size"] = payload["size"]
        if payload.get("output_format"):
            request_payload["output_format"] = payload["output_format"]
        if payload.get("seed") is not None:
            request_payload["seed"] = payload["seed"]
        if payload.get("optimize_prompt_options"):
            request_payload["optimize_prompt_options"] = payload["optimize_prompt_options"]
        if payload.get("watermark") is not None:
            request_payload["watermark"] = payload["watermark"]
        request_payload["sequential_image_generation"] = "disabled"
        request_payload["stream"] = False
        images = payload.get("images")
        image_values = [
            str(item.get("image_url") or "")
            for item in images
            if isinstance(item, dict) and item.get("image_url")
        ] if isinstance(images, list) else []
        mask = payload.get("mask")
        if isinstance(mask, dict) and mask.get("image_url"):
            image_values.append(str(mask["image_url"]))
        if image_values:
            request_payload["image"] = image_values
        return request_payload

    def _build_headers(self, *, content_type: str) -> dict[str, str]:
        return {
            "Content-Type": content_type,
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": OPENAI_COMPATIBLE_USER_AGENT,
        }

    @staticmethod
    def _json_request_payload(payload: dict[str, Any]) -> dict[str, Any]:
        omitted = {"endpoint", "images", "mask"}
        return {key: value for key, value in payload.items() if key not in omitted and value is not None}

    @classmethod
    def _build_multipart_edit_body(cls, payload: dict[str, Any]) -> tuple[bytes, str]:
        boundary = f"----codex-image-{uuid.uuid4().hex}"
        chunks: list[bytes] = []

        def add_field(name: str, value: Any) -> None:
            if value is None:
                return
            chunks.append(f"--{boundary}\r\n".encode("utf-8"))
            chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
            chunks.append(str(value).encode("utf-8"))
            chunks.append(b"\r\n")

        def add_file(name: str, filename: str, mime_type: str, data: bytes) -> None:
            chunks.append(f"--{boundary}\r\n".encode("utf-8"))
            chunks.append(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode("utf-8"))
            chunks.append(f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"))
            chunks.append(data)
            chunks.append(b"\r\n")

        for key in (
            "model",
            "prompt",
            "n",
            "size",
            "quality",
            "background",
            "output_format",
            "output_compression",
            "moderation",
            "input_fidelity",
        ):
            add_field(key, payload.get(key))

        images = payload.get("images")
        if not isinstance(images, list) or not images:
            raise RuntimeError("OpenAI-compatible images edit requires at least one input image")
        for index, image in enumerate(images, start=1):
            image_url = image.get("image_url") if isinstance(image, dict) else None
            mime_type, data = cls._decode_data_url(str(image_url or ""))
            add_file("image", f"image-{index}{cls._extension_for_mime_type(mime_type)}", mime_type, data)

        mask = payload.get("mask")
        if isinstance(mask, dict) and mask.get("image_url"):
            mime_type, data = cls._decode_data_url(str(mask["image_url"]))
            add_file("mask", f"mask{cls._extension_for_mime_type(mime_type)}", mime_type, data)

        chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
        return b"".join(chunks), f"multipart/form-data; boundary={boundary}"

    @staticmethod
    def _decode_data_url(image_url: str) -> tuple[str, bytes]:
        match = re.fullmatch(r"data:([^;,]+)?(;base64)?,(.*)", image_url, flags=re.DOTALL)
        if match is None or match.group(2) != ";base64":
            raise RuntimeError("OpenAI-compatible images edit requires base64 data URL input images")
        mime_type = match.group(1) or "image/png"
        try:
            return mime_type, base64.b64decode(match.group(3), validate=True)
        except (ValueError, base64.binascii.Error) as exc:
            raise RuntimeError("OpenAI-compatible images edit received invalid base64 image data") from exc

    @staticmethod
    def _extension_for_mime_type(mime_type: str) -> str:
        if mime_type == "image/jpeg":
            return ".jpg"
        if mime_type == "image/webp":
            return ".webp"
        if mime_type == "image/gif":
            return ".gif"
        return ".png"

    def _fetch_image_url(self, url: str) -> bytes:
        requested = urlsplit(url)
        configured = urlsplit(self.base_url)
        if (
            requested.scheme not in {"http", "https"}
            or requested.scheme != configured.scheme
            or requested.hostname != configured.hostname
            or requested.port != configured.port
        ):
            raise RuntimeError("OpenAI-compatible images returned a URL outside the configured provider")
        try:
            response = self.transport.request(
                method="GET",
                url=url,
                headers=self._build_image_download_headers(),
                body=b"",
                allow_redirects=False,
            )
        except TypeError:
            response = self.transport.request(
                method="GET",
                url=url,
                headers=self._build_image_download_headers(),
                body=b"",
            )
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"OpenAI-compatible images returned URL but download failed: HTTP {response.status}")
        return response.body

    def _build_image_download_headers(self) -> dict[str, str]:
        return {
            "Accept": "image/*,*/*",
            "User-Agent": OPENAI_COMPATIBLE_USER_AGENT,
        }

    @staticmethod
    def parse_response_json(
        body: bytes,
        *,
        request_payload: dict[str, Any] | None = None,
        url_fetcher: Any | None = None,
    ) -> ImageResult:
        return OpenAIImagesImageClient.parse_response_json_items(
            body,
            request_payload=request_payload,
            url_fetcher=url_fetcher,
        )[0]

    @staticmethod
    def parse_response_json_items(
        body: bytes,
        *,
        request_payload: dict[str, Any] | None = None,
        url_fetcher: Any | None = None,
    ) -> list[ImageResult]:
        try:
            response = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise RuntimeError("OpenAI-compatible images returned invalid JSON") from exc
        if not isinstance(response, dict):
            raise RuntimeError("OpenAI-compatible images returned non-object JSON")
        if isinstance(response.get("error"), dict):
            raise RuntimeError(OpenAIImagesImageClient._format_api_error(response["error"]))

        data = response.get("data")
        if not isinstance(data, list):
            raise RuntimeError("OpenAI-compatible images completed without image data")
        usage = response.get("usage", {})
        request_payload = request_payload or {}
        response_usage = usage if isinstance(usage, dict) else {}
        results: list[ImageResult] = []
        for item in data:
            if not isinstance(item, dict) or not (item.get("b64_json") or item.get("url")):
                continue
            image_bytes = OpenAIImagesImageClient._image_bytes_from_response_item(item, url_fetcher=url_fetcher)
            results.append(
                ImageResult(
                    image_bytes=image_bytes,
                    revised_prompt=str(item.get("revised_prompt", "")),
                    output_format=str(item.get("output_format") or response.get("output_format") or request_payload.get("output_format") or ""),
                    size=OpenAIImagesImageClient._result_size(
                        image_bytes,
                        item.get("size"),
                        response.get("size"),
                        request_payload.get("size"),
                    ),
                    background=str(item.get("background") or response.get("background") or request_payload.get("background") or ""),
                    quality=str(item.get("quality") or response.get("quality") or request_payload.get("quality") or ""),
                    usage=response_usage,
                )
            )
        if not results:
            raise RuntimeError("OpenAI-compatible images completed without image data")
        return results

    @staticmethod
    def _result_size(image_bytes: bytes, *candidates: Any) -> str:
        image_size = OpenAIImagesImageClient._image_pixel_size(image_bytes)
        if image_size:
            return image_size
        for candidate in candidates:
            normalized = OpenAIImagesImageClient._normalize_dimension_size(candidate)
            if normalized:
                return normalized
        return ""

    @staticmethod
    def _normalize_dimension_size(value: Any) -> str:
        match = _DIMENSION_SIZE_RE.match(str(value or ""))
        if not match:
            return ""
        width = int(match.group(1))
        height = int(match.group(2))
        if width <= 0 or height <= 0:
            return ""
        return f"{width}x{height}"

    @staticmethod
    def _image_pixel_size(image_bytes: bytes) -> str:
        if not image_bytes:
            return ""
        try:
            from PIL import Image

            with Image.open(BytesIO(image_bytes)) as image:
                width, height = image.size
        except Exception:
            return ""
        if width <= 0 or height <= 0:
            return ""
        return f"{int(width)}x{int(height)}"

    @staticmethod
    def _image_bytes_from_response_item(item: dict[str, Any], *, url_fetcher: Any | None = None) -> bytes:
        image_url = str(item.get("url") or "")
        if item.get("b64_json"):
            return base64.b64decode(str(item["b64_json"]))
        if image_url.startswith("data:image/"):
            _, image_bytes = OpenAIImagesImageClient._decode_data_url(image_url)
            return image_bytes
        if image_url.startswith("http://") or image_url.startswith("https://"):
            if url_fetcher is None:
                raise RuntimeError("OpenAI-compatible images returned image URL but no downloader is available")
            return url_fetcher(image_url)
        raise RuntimeError("OpenAI-compatible images completed without image data")

    @staticmethod
    def _normalize_image_count(value: int) -> int:
        try:
            count = int(value)
        except (TypeError, ValueError) as exc:
            raise RuntimeError("OpenAI-compatible images n must be an integer") from exc
        if count < 1:
            raise RuntimeError("OpenAI-compatible images n must be at least 1")
        return count

    @staticmethod
    def _format_api_error(error: dict[str, Any]) -> str:
        code = str(error.get("code") or error.get("type") or "").strip()
        message = str(error.get("message") or "").strip()
        if code and message:
            return f"OpenAI-compatible images error: {code}: {message}"
        if message:
            return f"OpenAI-compatible images error: {message}"
        if code:
            return f"OpenAI-compatible images error: {code}"
        return f"OpenAI-compatible images error: {json.dumps(error, ensure_ascii=False)}"

    @staticmethod
    def _normalize_base_url(base_url: str) -> str:
        try:
            return normalize_openai_base_url(base_url)
        except ValueError as exc:
            raise RuntimeError(str(exc)) from exc
