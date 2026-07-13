from __future__ import annotations

from pathlib import Path
import unittest


class WebUIResponsiveWorkspaceContractTests(unittest.TestCase):
    def test_ultrawide_workspace_keeps_the_remote_bounded_geometry(self) -> None:
        layout = Path(
            "codex_image/webui/static/styles/30-layout-top-nav-panels.css"
        ).read_text(encoding="utf-8")
        responsive = Path(
            "codex_image/webui/static/styles/80-utilities-responsive.css"
        ).read_text(encoding="utf-8")

        self.assertRegex(
            layout,
            r"\.dashboard\s*\{[^}]*width:\s*min\(100%,\s*1760px\)[^}]*"
            r"grid-template-columns:\s*minmax\(520px,\s*760px\)\s+minmax\(520px,\s*1fr\)",
        )
        self.assertRegex(
            layout,
            r"\.controls-col\s*\{[^}]*max-width:\s*760px",
        )
        self.assertNotIn("@container workspace (min-width: 1761px)", responsive)
        self.assertNotIn("clamp(760px, 42%, 1120px)", responsive)


if __name__ == "__main__":
    unittest.main()
