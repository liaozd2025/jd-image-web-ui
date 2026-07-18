from __future__ import annotations

from pathlib import Path
import unittest


class ServerVersionWorkspaceUiTests(unittest.TestCase):
    def test_workspace_uses_server_account_controls_without_codex_switcher(self) -> None:
        html = Path("codex_image/webui/static/index.html").read_text(encoding="utf-8")
        account = Path("codex_image/webui/frontend/src/server-account.ts").read_text(encoding="utf-8")

        self.assertIn('id="serverAccountName"', html)
        self.assertIn('id="serverLogoutButton"', html)
        self.assertIn('id="serverAdminLink"', html)
        self.assertNotIn('id="authSourceGroup"', html)
        self.assertNotIn('data-auth-source="codex"', html)
        self.assertNotIn('data-auth-source="api"', html)
        self.assertIn('id="systemSettingsCodexTab"', html)
        self.assertRegex(html, r'id="systemSettingsCodexTab"[^>]*hidden[^>]*disabled')
        self.assertIn('fetch("/api/auth/me")', account)
        self.assertIn('fetch("/api/auth/logout"', account)
        self.assertIn('user.role === "admin"', account)
        self.assertIn('"X-CSRF-Token"', account)

    def test_personal_and_shared_sources_are_marked_and_shared_wording_is_used(self) -> None:
        gallery = Path("codex_image/webui/frontend/src/gallery-grid.ts").read_text(encoding="utf-8")
        templates = Path("codex_image/webui/frontend/src/prompt-templates.ts").read_text(encoding="utf-8")
        snippets = Path("codex_image/webui/frontend/src/prompt-snippets.ts").read_text(encoding="utf-8")
        scope = Path("codex_image/webui/frontend/src/resource-scope.ts").read_text(encoding="utf-8")
        zh_cn = Path("codex_image/webui/frontend/src/i18n/zh-cn.ts").read_text(encoding="utf-8")
        html = Path("codex_image/webui/static/index.html").read_text(encoding="utf-8")

        self.assertIn("resourceScopeBadgeHtml(item.scope)", gallery)
        self.assertIn("resourceScopeBadgeHtml(template.scope)", templates)
        self.assertIn("resourceScopeBadgeHtml(snippet.scope)", snippets)
        self.assertIn('"resourceScope.personal"', scope)
        self.assertIn('"resourceScope.shared"', scope)
        self.assertNotIn("公用图库", zh_cn)
        self.assertNotIn("公用图库", html)
        self.assertIn("共享图库", zh_cn)
        self.assertIn("共享图库", html)

    def test_admin_read_only_view_renders_every_task_output(self) -> None:
        script = Path("codex_image/server/static/home.js").read_text(encoding="utf-8")
        styles = Path("codex_image/server/static/auth.css").read_text(encoding="utf-8")

        self.assertIn("task.outputs", script)
        self.assertIn("data-admin-output-index", script)
        self.assertIn("admin-task-results", script)
        self.assertIn(".admin-task-result-thumb", styles)


if __name__ == "__main__":
    unittest.main()
