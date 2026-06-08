from __future__ import annotations

from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from PIL import Image

from codex_image.webui.thumbnails import (
    THUMBNAIL_MAX_EDGE,
    create_image_thumbnail,
)


class WebUIThumbnailTests(unittest.TestCase):
    def _image_bytes(self, size: tuple[int, int] = (2160, 3840), mode: str = "RGB") -> bytes:
        image = Image.new(mode, size, (120, 180, 160))
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    def test_create_image_thumbnail_writes_small_jpeg(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.png"
            target = root / "thumbs" / "source.jpg"
            source.write_bytes(self._image_bytes())

            result = create_image_thumbnail(source, target)

            self.assertEqual(result, target)
            self.assertTrue(target.exists())
            self.assertLess(target.stat().st_size, source.stat().st_size)
            with Image.open(target) as thumb:
                self.assertEqual(thumb.format, "JPEG")
                self.assertLessEqual(max(thumb.size), THUMBNAIL_MAX_EDGE)

    def test_create_image_thumbnail_flattens_alpha(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.png"
            target = root / "thumbs" / "source.jpg"
            source.write_bytes(self._image_bytes(size=(400, 400), mode="RGBA"))

            result = create_image_thumbnail(source, target)

            self.assertEqual(result, target)
            with Image.open(target) as thumb:
                self.assertEqual(thumb.mode, "RGB")

    def test_create_image_thumbnail_returns_none_for_invalid_image(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "broken.png"
            target = root / "thumbs" / "broken.jpg"
            source.write_bytes(b"not an image")

            result = create_image_thumbnail(source, target)

            self.assertIsNone(result)
            self.assertFalse(target.exists())
