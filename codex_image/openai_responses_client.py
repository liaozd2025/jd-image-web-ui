from __future__ import annotations

import json
import base64
from datetime import UTC, datetime
from os import PathLike
from pathlib import Path
from typing import Any

from .client_types import (
    DEFAULT_IMAGE_MODEL,
    DEFAULT_MAIN_MODEL,
    DEFAULT_OPENAI_API_BASE_URL,
    OPENAI_COMPATIBLE_USER_AGENT,
    ImageResult,
    ResponsesInputFile,
    ResponsesRequestError,
    _collect_responses_file_data_values,
    _redact_responses_value,
    image_model_supports_input_fidelity,
    safe_responses_error_message,
)
from .http import MAX_PROVIDER_RESPONSE_BYTES, Transport, UrllibTransport

WEB_SEARCH_INSTRUCTIONS = """Web search image workflow:
First call web_search to research the user's topic. Do not call image_generation until web_search has returned. Then call image_generation exactly once to create the requested image. Do not answer with text only."""
from .openai_images_client import OpenAIImagesImageClient

class OpenAIResponsesImageClient:
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
        self.base_url = OpenAIImagesImageClient._normalize_base_url(base_url)
        self.image_model = str(image_model or DEFAULT_IMAGE_MODEL).strip() or DEFAULT_IMAGE_MODEL
        self.transport = transport or UrllibTransport()
        self.responses_url = f"{self.base_url}/responses"

    def generate_image(
        self,
        *,
        prompt: str,
        instructions: str | None = None,
        main_model: str = DEFAULT_MAIN_MODEL,
        model: str | None = None,
        reference_images: list[str] | None = None,
        reference_files: list[ResponsesInputFile] | None = None,
        size: str | None = None,
        quality: str | None = None,
        background: str | None = None,
        output_format: str = "png",
        moderation: str | None = None,
        output_compression: int | None = None,
        partial_images: int | None = None,
        web_search: bool = False,
        debug_sse_path: str | PathLike[str] | None = None,
    ) -> ImageResult:
        action = "edit" if reference_images else "generate"
        payload = self.build_payload(
            prompt=prompt,
            instructions=instructions,
            action=action,
            main_model=main_model,
            model=model,
            input_images=reference_images or [],
            input_files=reference_files,
            size=size,
            quality=quality,
            background=background,
            output_format=output_format,
            moderation=moderation,
            output_compression=output_compression,
            partial_images=partial_images,
            web_search=web_search,
        )
        return self._request_and_parse(payload, debug_sse_path=debug_sse_path)

    def edit_image(
        self,
        *,
        prompt: str,
        images: list[str],
        reference_files: list[ResponsesInputFile] | None = None,
        mask_image: str | None = None,
        instructions: str | None = None,
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
        web_search: bool = False,
        debug_sse_path: str | PathLike[str] | None = None,
    ) -> ImageResult:
        if not images:
            raise RuntimeError("edit_image requires at least one input image")

        payload = self.build_payload(
            prompt=prompt,
            instructions=instructions,
            action="edit",
            main_model=main_model,
            model=model,
            input_images=images,
            input_files=reference_files,
            mask_image=mask_image,
            size=size,
            quality=quality,
            background=background,
            output_format=output_format,
            input_fidelity=input_fidelity,
            moderation=moderation,
            output_compression=output_compression,
            partial_images=partial_images,
            web_search=web_search,
        )
        return self._request_and_parse(payload, debug_sse_path=debug_sse_path)

    def build_payload(
        self,
        *,
        prompt: str,
        instructions: str | None = None,
        action: str = "generate",
        main_model: str = DEFAULT_MAIN_MODEL,
        model: str | None = None,
        input_images: list[str] | None = None,
        input_files: list[ResponsesInputFile] | None = None,
        mask_image: str | None = None,
        size: str | None = None,
        quality: str | None = None,
        background: str | None = None,
        output_format: str = "png",
        input_fidelity: str | None = None,
        moderation: str | None = None,
        output_compression: int | None = None,
        partial_images: int | None = None,
        web_search: bool = False,
    ) -> dict[str, Any]:
        image_model = str(model or self.image_model or DEFAULT_IMAGE_MODEL).strip() or DEFAULT_IMAGE_MODEL
        tool: dict[str, Any] = {
            "type": "image_generation",
            "action": action,
            "model": image_model,
            "output_format": output_format,
        }
        if size:
            tool["size"] = size
        if quality:
            tool["quality"] = quality
        if background:
            tool["background"] = background
        if input_fidelity and image_model_supports_input_fidelity(image_model):
            tool["input_fidelity"] = input_fidelity
        if moderation:
            tool["moderation"] = moderation
        if output_compression is not None:
            tool["output_compression"] = output_compression
        if partial_images is not None:
            tool["partial_images"] = partial_images
        if mask_image:
            tool["input_image_mask"] = {"image_url": mask_image}

        content: list[dict[str, Any]] = [{"type": "input_text", "text": prompt}]
        for image_url in input_images or []:
            content.append({"type": "input_image", "image_url": image_url})
        for input_file in input_files or []:
            content.append(input_file.to_content_part())

        tools: list[dict[str, Any]] = [tool]
        tool_choice: Any = {"type": "image_generation"}
        if web_search:
            tools.insert(0, {"type": "web_search", "search_context_size": "low"})
            tool_choice = "required"

        payload: dict[str, Any] = {
            "endpoint": "/responses",
            "stream": True,
            "model": main_model or DEFAULT_MAIN_MODEL,
            "store": False,
            "tool_choice": tool_choice,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": content,
                }
            ],
            "tools": tools,
        }
        if web_search:
            payload["parallel_tool_calls"] = False
        if instructions:
            payload["instructions"] = self._instructions_with_web_search(instructions, web_search=web_search)
        elif web_search:
            payload["instructions"] = self._instructions_with_web_search("", web_search=True)
        return payload

    def _request_and_parse(
        self,
        payload: dict[str, Any],
        *,
        debug_sse_path: str | PathLike[str] | None = None,
    ) -> ImageResult:
        body = json.dumps(self._json_request_payload(payload)).encode("utf-8")
        response = self.transport.request(
            method="POST",
            url=self.responses_url,
            headers=self._build_headers(),
            body=body,
        )
        if response.status < 200 or response.status >= 300:
            body_text = response.body.decode("utf-8", errors="replace")
            raise ResponsesRequestError(
                safe_responses_error_message(response.status, body_text),
                status=response.status,
                body=body_text,
                sensitive_values=_collect_responses_file_data_values(payload),
            )
        if len(response.body) > MAX_PROVIDER_RESPONSE_BYTES:
            raise ResponsesRequestError(
                "Responses response exceeds the server response limit",
                status=response.status,
                body="",
            )
        result = self.parse_sse_response(
            response.body,
            debug_sse_path=debug_sse_path,
            sensitive_values=_collect_responses_file_data_values(payload),
        )
        if not result.provider_request_id:
            normalized_headers = {str(key).lower(): str(value).strip() for key, value in response.headers.items()}
            for name in ("x-request-id", "x-tt-logid", "request-id"):
                if normalized_headers.get(name):
                    result.provider_request_id = normalized_headers[name][:512]
                    break
        return result

    @staticmethod
    def _json_request_payload(payload: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in payload.items() if key != "endpoint" and value is not None}

    def _build_headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": OPENAI_COMPATIBLE_USER_AGENT,
        }

    @staticmethod
    def _instructions_with_web_search(instructions: str | None, *, web_search: bool) -> str:
        base = str(instructions or "")
        return f"{base}\n\n{WEB_SEARCH_INSTRUCTIONS}".strip() if web_search else base

    def parse_sse_response(
        self,
        body: bytes,
        *,
        debug_sse_path: str | PathLike[str] | None = None,
        sensitive_values: set[str] | None = None,
    ) -> ImageResult:
        output_by_index: dict[int, dict[str, Any]] = {}
        fallback: list[dict[str, Any]] = []
        for raw_line in body.splitlines():
            line = raw_line.strip()
            if not line.startswith(b"data:"):
                continue
            payload = line[5:].strip()
            if not payload or payload == b"[DONE]":
                continue
            event = json.loads(payload.decode("utf-8"))
            if debug_sse_path is not None:
                self._write_sse_debug_event(debug_sse_path, event, sensitive_values=sensitive_values)
            event_type = event.get("type")
            if event_type in {"error", "response.failed", "response.incomplete"}:
                text = payload.decode("utf-8", errors="replace")
                raise ResponsesRequestError(
                    safe_responses_error_message(200, text),
                    status=200,
                    body=text,
                    sensitive_values=sensitive_values,
                )
            if event_type == "response.output_item.done" and isinstance(event.get("item"), dict):
                index = event.get("output_index")
                if isinstance(index, int):
                    output_by_index[index] = event["item"]
                else:
                    fallback.append(event["item"])
                continue
            if event_type != "response.completed":
                continue
            response = event.get("response") or {}
            output = response.get("output") or self._reconstruct_output(output_by_index, fallback)
            result = self._extract_image_call(output)
            if result is None:
                raise RuntimeError(self._format_missing_image_call_error(output))
            return ImageResult(
                image_bytes=base64.b64decode(result["result"]),
                revised_prompt=str(result.get("revised_prompt", "")),
                output_format=str(result.get("output_format", "")),
                size=str(result.get("size", "")),
                background=str(result.get("background", "")),
                quality=str(result.get("quality", "")),
                usage=response.get("usage") if isinstance(response.get("usage"), dict) else {},
                tool_usage=response.get("tool_usage") if isinstance(response.get("tool_usage"), dict) else {},
                provider_request_id=str(response.get("id") or "").strip()[:512] or None,
            )
        raise RuntimeError("No response.completed event found in SSE stream")

    @staticmethod
    def _reconstruct_output(
        output_items_by_index: dict[int, dict[str, Any]],
        output_items_fallback: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        ordered = [output_items_by_index[index] for index in sorted(output_items_by_index)]
        return ordered + output_items_fallback

    @staticmethod
    def _format_sse_error(event: dict[str, Any]) -> str:
        error = event.get("error")
        return f"OpenAI-compatible responses error: {error}" if error else "OpenAI-compatible responses error"

    @staticmethod
    def _format_response_terminal_error(event: dict[str, Any]) -> str:
        return f"OpenAI-compatible responses terminal error: {event.get('type', 'unknown')}"

    @staticmethod
    def _extract_image_call(output: Any) -> dict[str, Any] | None:
        if not isinstance(output, list):
            return None
        return next(
            (item for item in output if isinstance(item, dict) and item.get("type") == "image_generation_call" and item.get("result")),
            None,
        )

    @staticmethod
    def _format_missing_image_call_error(output: Any) -> str:
        return "OpenAI-compatible responses completed without image_generation_call output"

    @staticmethod
    def _write_sse_debug_event(
        path: str | PathLike[str],
        event: dict[str, Any],
        *,
        sensitive_values: set[str] | None = None,
    ) -> None:
        debug_path = Path(path)
        debug_path.parent.mkdir(parents=True, exist_ok=True)
        safe_event = _redact_responses_value(
            event,
            sensitive_values=set(sensitive_values or ()),
        )
        record = {"logged_at": datetime.now(UTC).isoformat(), "event": safe_event}
        with debug_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
