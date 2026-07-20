from __future__ import annotations

from pathlib import Path
import unittest


class ServerVersionWorkspaceUiTests(unittest.TestCase):
    def test_workspace_uses_sidebar_account_controls_without_separate_admin_ui(self) -> None:
        html = Path("codex_image/webui/static/index.html").read_text(encoding="utf-8")
        account = Path("codex_image/webui/frontend/src/server-account.ts").read_text(encoding="utf-8")

        self.assertIn('id="serverAccountName"', html)
        self.assertIn('id="serverLogoutButton"', html)
        self.assertIn('id="serverAccountButton"', html)
        self.assertIn('id="serverAccountSettingsButton"', html)
        self.assertNotIn('id="serverAdminLink"', html)
        self.assertNotIn('id="authSourceGroup"', html)
        self.assertNotIn('data-auth-source="codex"', html)
        self.assertNotIn('data-auth-source="api"', html)
        self.assertIn('data-system-settings-tab="users"', html)
        self.assertIn('data-admin-only', html)
        self.assertIn('fetch("/api/auth/me")', account)
        self.assertIn('fetch("/api/auth/logout"', account)
        self.assertIn('document.documentElement.dataset.userRole = context.user.role', account)
        self.assertIn('translate(role === "admin" ? "serverAccount.roleAdmin" : "serverAccount.roleUser")', account)
        self.assertIn('document.addEventListener(LOCALE_CHANGE_EVENT, renderCurrentUser)', account)
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

    def test_gallery_shared_image_publish_controls_are_admin_only(self) -> None:
        html = Path("codex_image/webui/static/index.html").read_text(encoding="utf-8")
        gallery_actions = Path("codex_image/webui/frontend/src/gallery-item-actions.ts").read_text(encoding="utf-8")
        gallery = Path("codex_image/webui/frontend/src/gallery.ts").read_text(encoding="utf-8")
        gallery_grid = Path("codex_image/webui/frontend/src/gallery-grid.ts").read_text(encoding="utf-8")
        settings = Path("codex_image/webui/frontend/src/server-settings.ts").read_text(encoding="utf-8")

        self.assertIn('id="galleryScopeInput"', html)
        self.assertRegex(
            html,
            r'id="galleryScopeInput"[\s\S]*value="personal"[\s\S]*id="galleryScopeSharedOption"[^>]*value="shared"[^>]*hidden[^>]*disabled',
        )
        self.assertRegex(html, r'id="gallerySharedImageUploadButton"[^>]*hidden')
        self.assertIn('id="galleryCategoryField"', html)
        self.assertIn('id="galleryPromptNoteField"', html)
        self.assertIn('form.append("category_id", els.galleryCategoryInput.value)', gallery_actions)
        self.assertIn('form.append("file", imageFile)', gallery_actions)
        self.assertIn('scope === "shared" ? "/api/shared-gallery/items" : "/api/gallery"', gallery_actions)
        self.assertIn('getCurrentServerUser()?.role === "admin"', gallery_actions)
        self.assertIn('findGalleryItem(`shared:${data.item?.asset_id || ""}`)', gallery_actions)
        self.assertIn('state.sharedGalleryCategories', gallery_actions)
        self.assertIn('function syncGalleryRoleVisibility()', gallery)
        self.assertIn('getCurrentServerUser()?.role === "admin"', gallery)
        self.assertIn('document.addEventListener("codex-image-user-context", syncGalleryRoleVisibility)', gallery)
        self.assertIn('const canManage = item.scope !== "shared" || isAdmin;', gallery_grid)
        self.assertIn('const canDeactivate = item.scope !== "shared" || isAdmin;', gallery_grid)
        self.assertIn('api("/api/gallery")', settings)
        self.assertIn("getLegacyBridge().methods.addGalleryInput(item)", settings)
        self.assertIn("closeSystemSettingsModal()", settings)

    def test_shared_gallery_drawer_upload_is_revealed_only_for_an_administrator(self) -> None:
        html = Path("codex_image/webui/static/index.html").read_text(encoding="utf-8")
        gallery = Path("codex_image/webui/frontend/src/gallery.ts").read_text(encoding="utf-8")

        self.assertIn('id="gallerySharedImageUploadButton"', html)
        self.assertIn('id="gallerySharedImageInput"', html)
        self.assertIn('accept="image/*"', html)
        self.assertIn('const showSharedAdmin = shared && isAdmin', gallery)
        self.assertIn('if (getCurrentServerUser()?.role !== "admin") return;', gallery)
        self.assertIn('form.append("category_id", categoryId)', gallery)
        self.assertIn('endpoint = "/api/shared-gallery/items/batch"', gallery)
        self.assertIn("await refreshGallery()", gallery)

    def test_gallery_management_uses_approved_personal_and_shared_tabs_with_role_aware_actions(self) -> None:
        html = Path("codex_image/webui/static/index.html").read_text(encoding="utf-8")
        gallery = Path("codex_image/webui/frontend/src/gallery.ts").read_text(encoding="utf-8")
        gallery_grid = Path("codex_image/webui/frontend/src/gallery-grid.ts").read_text(encoding="utf-8")
        categories = Path("codex_image/webui/frontend/src/gallery-categories.ts").read_text(encoding="utf-8")
        prompt_chips = Path("codex_image/webui/frontend/src/prompt-gallery-chips.ts").read_text(encoding="utf-8")
        zh_cn = Path("codex_image/webui/frontend/src/i18n/zh-cn.ts").read_text(encoding="utf-8")

        self.assertIn('id="galleryPersonalManageButton"', html)
        self.assertIn('id="gallerySharedManageButton"', html)
        self.assertIn('data-gallery-scope-tab="personal"', html)
        self.assertIn('data-gallery-scope-tab="shared"', html)
        self.assertIn('id="gallerySearchInput"', html)
        self.assertIn('id="galleryBatchUploadButton"', html)
        self.assertIn('id="galleryInactiveToggle"', html)
        self.assertIn('data-i18n="gallery.managementTitle">图库管理', html)
        self.assertIn('data-i18n="gallery.personalLibrary">个人图库', html)
        self.assertIn('data-i18n="gallery.sharedLibrary">共享图库', html)
        for deprecated in ("管理公用库", "公共库", "团队图库", "团队管理库"):
            self.assertNotIn(deprecated, html)
            self.assertNotIn(deprecated, zh_cn)

        self.assertIn('openGallery("personal")', gallery)
        self.assertIn('openGallery("shared")', gallery)
        self.assertIn("state.galleryLibraryState.personal", gallery)
        self.assertIn("state.galleryLibraryState.shared", gallery)
        self.assertIn('fetch("/api/shared-gallery/categories")', gallery)
        self.assertIn('endpoint = "/api/shared-gallery/items/batch"', gallery)
        self.assertIn('getCurrentServerUser()?.role === "admin"', gallery)
        self.assertIn("data-gallery-scope-tab", gallery)
        self.assertIn("sharedGalleryCategories", categories)
        self.assertIn('"/api/shared-gallery/categories"', categories)
        self.assertIn('const canEditDetails = item.scope !== "shared" || isAdmin;', gallery_grid)
        self.assertIn('item.scope === "shared" && isAdmin', gallery_grid)
        self.assertIn('resourceScopeBadgeHtml(item.scope)', prompt_chips)
        self.assertIn("item.asset_version_id", prompt_chips)

    def test_admin_read_only_view_renders_every_task_output(self) -> None:
        script = Path("codex_image/server/static/home.js").read_text(encoding="utf-8")
        styles = Path("codex_image/server/static/auth.css").read_text(encoding="utf-8")

        self.assertIn("task.outputs", script)
        self.assertIn("data-admin-output-index", script)
        self.assertIn("admin-task-results", script)
        self.assertIn(".admin-task-result-thumb", styles)


if __name__ == "__main__":
    unittest.main()
