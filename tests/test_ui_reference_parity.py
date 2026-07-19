import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
JS = (ROOT / "web" / "app_write.js").read_text(encoding="utf-8")
CSS = (ROOT / "web" / "app.css").read_text(encoding="utf-8")


class ProjectProfileCardParityTest(unittest.TestCase):
    def test_only_the_import_workspace_has_the_reference_card_contract(self):
        for marker in (
            'class="panel project-profile-card"',
            'class="project-profile-grid"',
            'class="ppi-source-picker"',
            'class="project-profile-actions"',
            'data-ui-scope="import-card-only"',
        ):
            self.assertIn(marker, JS)
        self.assertIn('.project-profile-card', CSS)
        self.assertIn('.project-profile-grid', CSS)

    def test_dashboard_content_below_the_card_is_still_present(self):
        self.assertIn('projectProfileImportPanel()', JS)
        self.assertIn('mountProjectProfileImport(el)', JS)


class JournalReferenceParityTest(unittest.TestCase):
    def test_journal_uses_the_approved_card_structure(self):
        for marker in (
            'class="panel journal-entry-card"',
            'class="journal-card-head"',
            'class="journal-reference-grid"',
            'class="journal-material-panel"',
            'class="journal-photo-slot',
            'class="journal-photo-preview"',
        ):
            self.assertIn(marker, JS)
        self.assertIn('.journal-entry-card', CSS)
        self.assertIn('.journal-photo-slot', CSS)

    def test_existing_journal_workflow_contract_is_preserved(self):
        for marker in (
            'name="boq_stage_qty_id"',
            'name="photo_before"',
            'name="photo_during"',
            'name="photo_after"',
            'data-action="draft"',
            'data-action="submit"',
            'write/ct_nhat_ky_submit',
        ):
            self.assertIn(marker, JS)


class NormalizationSandboxParityTest(unittest.TestCase):
    def test_import_audit_is_a_single_full_view_workspace(self):
        for marker in (
            'wrap.id = "normalization-sandbox"',
            'wrap.setAttribute("role", "dialog")',
            'wrap.setAttribute("aria-modal", "true")',
            'appShell.inert = true',
            'returnFocus: previewBtn',
            'const returnFocus = document.activeElement',
            'event.key === "Escape"',
            'sandbox-next',
            'sandbox-prev',
            'audit-row-current',
        ):
            self.assertIn(marker, JS)
        for marker in (
            '.normalization-sandbox { position: fixed; inset: 0;',
            'width: 100vw; height: 100vh;',
            'height: 100dvh;',
            'overflow: hidden;',
            'body.sandbox-open { overflow: hidden;',
        ):
            self.assertIn(marker, CSS)

    def test_project_profile_opens_the_full_screen_sandbox(self):
        self.assertIn('openNormalizationSandbox(pv, {', JS)
        self.assertIn('showSandbox(pv);', JS)


if __name__ == "__main__":
    unittest.main()
