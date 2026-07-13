from __future__ import annotations

from pathlib import Path
import unittest


class WebUIShortHeightContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.responsive = Path(
            "codex_image/webui/static/styles/80-utilities-responsive.css"
        ).read_text(encoding="utf-8")
        self.layout = Path(
            "codex_image/webui/static/styles/30-layout-top-nav-panels.css"
        ).read_text(encoding="utf-8")

    def test_short_workspace_uses_one_remote_density_rule(self) -> None:
        marker = "@media (max-height: 1390px) and (min-width: 900px)"
        self.assertIn(marker, self.responsive)
        start = self.responsive.index(marker)
        end = self.responsive.index("@media (max-width: 640px)", start)
        block = self.responsive[start:end]

        self.assertRegex(
            block,
            r"\.controls-col\s+\.image-panel\s*\{[^}]*flex:\s*1\s+1\s+194px[^}]*"
            r"min-height:\s*clamp\([\s\S]*160px,[\s\S]*var\(--compact-shell-extra,[\s\S]*194px",
        )
        self.assertRegex(
            block,
            r"\.controls-col\s+\.prompt-panel\s*\{[^}]*flex:\s*2\s+1\s+148px[^}]*"
            r"min-height:\s*clamp\([\s\S]*120px,[\s\S]*var\(--compact-shell-extra,[\s\S]*148px",
        )
        self.assertRegex(
            block,
            r"\.controls-col\s+\.output-panel\s*\{[^}]*flex:\s*0\s+0\s+auto",
        )
        self.assertNotRegex(block, r"\.controls-col\s+\.output-settings-stage\s*\{")
        self.assertNotIn("align-content: space-between", block)
        self.assertIn("grid-template-rows: repeat(2, var(--compact-settings-segment-height))", block)
        self.assertRegex(block, r"--mode-settings-stable-height:\s*clamp\([\s\S]*42px,[\s\S]*52px")
        self.assertNotIn("output-settings-editor-height", block)

    def test_short_workspace_keeps_all_section_headings_visible(self) -> None:
        self.assertNotIn("@media (max-height: 860px)", self.responsive)
        self.assertNotRegex(
            self.responsive,
            r"\.controls-col\s+\.image-panel\s+\.panel-heading\s*\{[^}]*height:\s*0",
        )
        self.assertNotRegex(
            self.responsive,
            r"\.controls-col\s+\.output-settings-header\s*\{[^}]*height:\s*0",
        )
        self.assertNotRegex(
            self.responsive,
            r"\.controls-col\s+\.panel-heading h2[\s\S]*clip-path:\s*inset\(50%\)",
        )

    def test_compact_topbar_subtracts_its_real_height_from_both_columns(self) -> None:
        marker = "@media (max-height: 1390px) and (min-width: 900px) and (max-width: 1180px)"
        self.assertIn(marker, self.responsive)
        block = self.responsive[self.responsive.index(marker):]
        formula = r"calc\(100dvh\s*-\s*var\(--header-height\)\s*-\s*64px\s*-\s*24px\)"
        self.assertRegex(
            block,
            rf"\.preview-col,\s*\.controls-col\s*\{{[^}}]*min-height:\s*{formula}[^}}]*height:\s*{formula}",
        )
        self.assertRegex(
            self.responsive,
            r"@media\s*\(max-width:\s*1180px\)[\s\S]*"
            r"\.sidebar\s*\{[^}]*height:\s*64px[^}]*flex:\s*0\s+0\s+64px",
        )

    def test_page_geometry_remains_natural_outside_short_density(self) -> None:
        self.assertRegex(
            self.layout,
            r"\.dashboard\s*\{[^}]*overflow-y:\s*auto[^}]*align-content:\s*safe\s+center",
        )
        controls = self.layout[
            self.layout.index(".controls-col {"):self.layout.index(".preview-col {")
        ]
        self.assertNotIn("overflow-y", controls)
        self.assertNotIn("height: 100%", controls)
        self.assertNotIn("Tall two-column workspaces", self.responsive)
        self.assertRegex(
            self.layout,
            r"\.nav-actions\s*\{[^}]*justify-content:\s*flex-end",
        )
        self.assertRegex(
            self.responsive,
            r"@container workspace \(max-width:\s*899px\)[\s\S]*"
            r"\.controls-col\s*\{[^}]*height:\s*auto[^}]*min-height:\s*auto[^}]*overflow:\s*visible",
        )
        self.assertRegex(
            self.responsive,
            r"@container workspace \(max-width:\s*899px\)[\s\S]*"
            r"\.preview-col\s*\{[^}]*height:\s*auto[^}]*min-height:\s*260px[^}]*overflow:\s*visible",
        )


if __name__ == "__main__":
    unittest.main()
