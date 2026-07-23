from __future__ import annotations

import base64
import json
import unittest

from codex_image.openai_images_client import OpenAIImagesImageClient
from tests.helpers import FakeResponse, FakeTransport


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class VolcengineArkImagesClientTests(unittest.TestCase):
    def test_seedream_pro_omits_unsupported_sequential_and_stream_parameters(self) -> None:
        transport = FakeTransport(
            [
                FakeResponse(
                    status=200,
                    body=json.dumps(
                        {
                            "model": "doubao-seedream-5-0-pro-260628",
                            "data": [{"b64_json": base64.b64encode(PNG_1X1).decode("ascii")}],
                        }
                    ).encode("utf-8"),
                )
            ]
        )
        client = OpenAIImagesImageClient(
            api_key="test-ark-key",
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            image_model="doubao-seedream-5-0-pro-260628",
            protocol_adapter="volcengine-ark-images",
            transport=transport,
        )

        client.generate_images(prompt="generate one image", n=1)

        payload = json.loads(transport.requests[0]["body"])
        self.assertNotIn("sequential_image_generation", payload)
        self.assertNotIn("sequential_image_generation_options", payload)
        self.assertNotIn("stream", payload)

    def test_seedream_uses_ark_json_generation_contract_for_reference_images(self) -> None:
        transport = FakeTransport(
            [
                FakeResponse(
                    status=200,
                    body=json.dumps(
                        {
                            "model": "doubao-seedream-test",
                            "data": [{"b64_json": base64.b64encode(PNG_1X1).decode("ascii")}],
                        }
                    ).encode("utf-8"),
                ),
                FakeResponse(
                    status=200,
                    body=json.dumps(
                        {
                            "model": "doubao-seedream-test",
                            "data": [{"b64_json": base64.b64encode(PNG_1X1).decode("ascii")}],
                        }
                    ).encode("utf-8"),
                ),
            ]
        )
        reference_image = "data:image/png;base64," + base64.b64encode(PNG_1X1).decode("ascii")
        client = OpenAIImagesImageClient(
            api_key="test-ark-key",
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            image_model="doubao-seedream-test",
            protocol_adapter="volcengine-ark-images",
            transport=transport,
        )

        results = client.generate_images(
            prompt="generate from reference",
            reference_images=[reference_image],
            size="2048x2048",
            quality="high",
            output_format="png",
            seed=41,
            prompt_optimization_mode="standard",
            watermark=False,
            sequential_image_generation="disabled",
            stream=False,
            n=2,
        )

        self.assertEqual(len(results), 2)
        self.assertEqual(len(transport.requests), 2)
        request = transport.requests[0]
        self.assertEqual(request["url"], "https://ark.cn-beijing.volces.com/api/v3/images/generations")
        self.assertEqual(request["headers"]["Content-Type"], "application/json")
        payload = json.loads(request["body"])
        self.assertEqual(payload["model"], "doubao-seedream-test")
        self.assertEqual(payload["prompt"], "generate from reference")
        self.assertEqual(payload["image"], [reference_image])
        self.assertEqual(payload["size"], "2048x2048")
        self.assertEqual(payload["response_format"], "b64_json")
        self.assertEqual(payload["sequential_image_generation"], "disabled")
        self.assertIs(payload["stream"], False)
        self.assertNotIn("sequential_image_generation_options", payload)
        self.assertNotIn("n", payload)
        self.assertEqual(payload["output_format"], "png")
        self.assertEqual(payload["seed"], 41)
        self.assertEqual(payload["optimize_prompt_options"], {"mode": "standard"})
        self.assertIs(payload["watermark"], False)
        self.assertNotIn("quality", payload)

    def test_explicit_generic_adapter_does_not_guess_from_host_or_model_name(self) -> None:
        transport = FakeTransport(
            [
                FakeResponse(
                    status=200,
                    body=json.dumps(
                        {"data": [{"b64_json": base64.b64encode(PNG_1X1).decode("ascii")}]}
                    ).encode("utf-8"),
                )
            ]
        )
        client = OpenAIImagesImageClient(
            api_key="test-key",
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            image_model="doubao-seedream-custom-endpoint",
            protocol_adapter="openai-compatible",
            transport=transport,
        )

        client.generate_images(prompt="generic", n=2)

        payload = json.loads(transport.requests[0]["body"])
        self.assertEqual(payload["n"], 2)
        self.assertNotIn("sequential_image_generation", payload)


if __name__ == "__main__":
    unittest.main()
