"""Student attachments, review authorization, and approved hosting defaults."""
import io
import json
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import User
from hosting.models import HostingSession
from hosting.services.errors import HostingError
from repository.models import ArchiveDocument, ResearchSubmissionRequest


def paper(name='research.pdf', content=b'%PDF-1.4\nReviewed research\n%%EOF'):
    return SimpleUploadedFile(name, content, content_type='application/pdf')


def system(name='research-system.zip', files=None):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path, content in (files or {'index.html': '<h1>Research app</h1>'}).items():
            archive.writestr(path, content)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='application/zip')


class SubmissionAttachmentTests(APITestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        settings = override_settings(
            MEDIA_ROOT=root / 'media', SUBMISSION_STORAGE_PATH=root / 'private',
            DEPLOYMENT_STORAGE_PATH=root / 'hosting', DEPLOYMENT_REQUIRE_WORKER=True,
            EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        )
        settings.enable()
        self.addCleanup(settings.disable)
        self.root = root
        self.student = User.objects.create_user(email='submitter@example.com', password='test', role='student')
        self.other = User.objects.create_user(email='other@example.com', password='test', role='student')
        self.admin = User.objects.create_user(email='reviewer@example.com', password='test', role='admin')
        self.faculty = User.objects.create_user(email='faculty@example.com', password='test', role='faculty')

    def submit(self, **changes):
        self.client.force_authenticate(self.student)
        data = {
            'title': 'Research with a runnable system', 'author': 'Student Author',
            'submission_type': 'paper_and_system', 'system_details': 'Static web app.',
            'keywords': json.dumps(['research', 'system']),
            'research_file': paper(), 'system_file': system(),
        }
        data.update(changes)
        response = self.client.post(reverse('submission-request-list-create'), data, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        return ResearchSubmissionRequest.objects.get(pk=response.data['id']), response

    def review(self, submission, action='approve', **changes):
        self.client.force_authenticate(self.admin)
        return self.client.post(reverse('submission-request-review', args=[submission.id]), {
            'action': action, **changes,
        }, format='json')

    def read_attachment(self, response):
        content = b''.join(response.streaming_content)
        response.close()
        return content

    def test_student_uploads_both_files_privately_and_metadata_survives_multipart(self):
        submission, response = self.submit()
        self.assertEqual(submission.keywords, ['research', 'system'])
        self.assertTrue(response.data['has_research_file'])
        self.assertTrue(response.data['has_system_file'])
        self.assertEqual(response.data['research_original_filename'], 'research.pdf')
        self.assertEqual(response.data['system_original_filename'], 'research-system.zip')
        self.assertGreater(response.data['research_file_size'], 0)
        self.assertGreater(response.data['system_file_size'], 0)
        self.assertNotIn('research_file', response.data)
        self.assertNotIn('system_file', response.data)
        self.assertTrue(Path(submission.research_file.path).is_relative_to(self.root / 'private'))
        self.assertFalse(list((self.root / 'media').rglob('*')))
        self.assertFalse(ArchiveDocument.objects.exists())
        self.assertFalse(HostingSession.objects.exists())

    def test_only_owner_and_admin_can_preview_or_download_pending_attachments(self):
        submission, _ = self.submit()
        for role, allowed in [(self.student, True), (self.admin, True), (self.other, False), (self.faculty, False), (None, False)]:
            self.client.force_authenticate(role)
            for kind in ['research', 'system']:
                with self.subTest(role=role, kind=kind):
                    response = self.client.get(reverse('submission-request-' + kind, args=[submission.id]))
                    self.assertEqual(response.status_code, 200 if allowed else 404 if role else 401)
                    if allowed:
                        self.assertEqual(response['Cache-Control'], 'private, no-store')
                        self.assertEqual(response['Content-Type'], 'application/pdf' if kind == 'research' else 'application/zip')
                        self.assertTrue(response['Content-Disposition'].startswith('inline' if kind == 'research' else 'attachment'))
                        content = self.read_attachment(response)
                        self.assertTrue(content.startswith(b'%PDF-' if kind == 'research' else b'PK'))

    def test_required_and_invalid_attachments_are_rejected(self):
        self.client.force_authenticate(self.student)
        base = {'title': 'Invalid submission', 'author': 'Student', 'submission_type': 'paper_and_system', 'system_details': 'A system'}
        cases = [
            ({}, 'research_file'),
            ({'research_file': paper()}, 'system_file'),
            ({'research_file': paper(content=b'not a PDF'), 'system_file': system()}, 'research_file'),
            ({'research_file': paper(), 'system_file': SimpleUploadedFile('fake.zip', b'PK\x03\x04fake')}, 'system_file'),
            ({'research_file': paper(), 'system_file': system(files={'../outside.txt': 'bad'})}, 'system_file'),
        ]
        for attachments, field in cases:
            with self.subTest(field=field):
                response = self.client.post(reverse('submission-request-list-create'), {**base, **attachments}, format='multipart')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn(field, response.data)
        self.assertFalse(ResearchSubmissionRequest.objects.exists())

    def test_approval_uses_exact_uploaded_files_and_saves_stopped_default_without_worker(self):
        uploaded_zip = system()
        zip_bytes = uploaded_zip.read()
        uploaded_zip.seek(0)
        submission, _ = self.submit(system_file=uploaded_zip)
        # Another deployment and an offline worker must not prevent approval.
        busy = HostingSession.objects.create(name='Unrelated running site', project_type='static', status='building', active_slot=1)
        with patch('hosting.services.deployment_service.require_worker') as worker:
            response = self.review(submission)
        self.assertEqual(response.status_code, 200, response.data)
        worker.assert_not_called()
        submission.refresh_from_db()
        archive = submission.published_archive
        self.assertTrue(archive.is_approved)
        self.assertEqual(archive.uploaded_by, self.admin)
        self.assertEqual(archive.original_filename, 'research.pdf')
        self.assertEqual(archive.system_original_filename, 'research-system.zip')
        with archive.system_file.open('rb') as uploaded:
            self.assertEqual(uploaded.read(), zip_bytes)
        with archive.file.open('rb') as pdf:
            self.assertEqual(pdf.read(), b'%PDF-1.4\nReviewed research\n%%EOF')
        self.assertFalse(Path(archive.file.path).is_relative_to(self.root / 'private'))
        self.assertEqual(archive.versions.count(), 1)
        default = HostingSession.objects.get(archive_document=archive, is_default=True)
        self.assertEqual(default.status, 'stopped')
        self.assertIsNone(default.active_slot)
        self.assertEqual(default.project_type, 'auto')
        self.assertEqual(Path(default.source_zip).read_bytes(), zip_bytes)
        busy.refresh_from_db()
        self.assertEqual(busy.status, 'building')
        self.assertEqual(busy.active_slot, 1)
        status = self.client.get(reverse('archive-hosting-status', args=[archive.id]))
        self.assertEqual(status.data['default_session_id'], default.id)
        self.assertEqual(status.data['session']['id'], default.id)
        self.assertTrue(status.data['systems'][0]['is_default'])
        # A second decision cannot publish another archive/configuration.
        self.assertEqual(self.review(submission).status_code, 409)
        self.assertEqual(ArchiveDocument.objects.count(), 1)

    @override_settings(DEPLOYMENT_REQUIRE_WORKER=False)
    def test_approved_default_can_be_started_without_another_upload(self):
        submission, _ = self.submit()
        self.assertEqual(self.review(submission).status_code, 200)
        submission.refresh_from_db()
        default = HostingSession.objects.get(archive_document=submission.published_archive, is_default=True)
        response = self.client.post(reverse('archive-hosting-saved-system-start', args=[submission.published_archive_id, default.id]), {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        default.refresh_from_db()
        self.assertTrue(default.restart_requested)
        self.assertEqual(default.active_slot, 1)
        self.assertEqual(default.status, 'stopping')

    def test_returned_student_can_replace_files_before_resubmission(self):
        submission, _ = self.submit()
        self.assertEqual(self.review(submission, 'revision', comment='Revise the paper and code.').status_code, 200)
        self.client.force_authenticate(self.student)
        response = self.client.post(reverse('submission-request-resubmit', args=[submission.id]), {
            'abstract': 'Updated research', 'research_file': paper('revised.pdf', b'%PDF-1.4\nRevision two'),
            'system_file': system('revised.zip', {'index.html': 'Revision two'}),
        }, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'pending')
        self.assertEqual(response.data['research_original_filename'], 'revised.pdf')
        self.assertEqual(response.data['system_original_filename'], 'revised.zip')
        self.assertEqual(self.review(submission).status_code, 200)
        submission.refresh_from_db()
        self.assertEqual(submission.published_archive.original_filename, 'revised.pdf')
        default = HostingSession.objects.get(archive_document=submission.published_archive, is_default=True)
        with zipfile.ZipFile(default.source_zip) as archive:
            self.assertEqual(archive.read('index.html'), b'Revision two')

    def test_metadata_only_revision_retains_previously_uploaded_files(self):
        submission, _ = self.submit()
        original = (submission.research_file.name, submission.system_file.name)
        self.assertEqual(self.review(submission, 'revision', comment='Expand the abstract.').status_code, 200)
        self.client.force_authenticate(self.student)
        response = self.client.post(reverse('submission-request-resubmit', args=[submission.id]), {'abstract': 'Expanded abstract'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        submission.refresh_from_db()
        self.assertEqual(original, (submission.research_file.name, submission.system_file.name))

    def test_rejection_never_publishes_or_saves_a_configuration(self):
        submission, _ = self.submit()
        response = self.review(submission, 'reject', comment='The research needs further work.')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(ArchiveDocument.objects.exists())
        self.assertFalse(HostingSession.objects.exists())
        self.assertTrue(Path(submission.research_file.path).exists())

    def test_configuration_storage_failure_rolls_back_publication(self):
        submission, _ = self.submit()
        with patch('hosting.services.deployment_service.save_default_archive_configuration', side_effect=HostingError('Disk full')):
            response = self.review(submission)
        self.assertEqual(response.status_code, 400)
        submission.refresh_from_db()
        self.assertEqual(submission.status, 'pending')
        self.assertIsNone(submission.published_archive_id)
        self.assertFalse(ArchiveDocument.objects.exists())
        self.assertFalse(HostingSession.objects.exists())
        self.assertFalse([p for p in (self.root / 'media').rglob('*') if p.is_file()])

    def test_approved_pdf_only_request_does_not_create_a_hosting_configuration(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(reverse('submission-request-list-create'), {
            'title': 'Paper only', 'author': 'Student', 'submission_type': 'research_paper', 'research_file': paper(),
        }, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        submission = ResearchSubmissionRequest.objects.get(pk=response.data['id'])
        self.assertEqual(self.review(submission).status_code, 200)
        self.assertFalse(HostingSession.objects.exists())

    def test_student_cannot_replace_files_while_pending_or_approve_own_request(self):
        submission, _ = self.submit()
        original = submission.research_file.name
        response = self.client.post(reverse('submission-request-resubmit', args=[submission.id]), {
            'research_file': paper('unreviewed.pdf'),
        }, format='multipart')
        self.assertEqual(response.status_code, 409)
        response = self.client.post(reverse('submission-request-review', args=[submission.id]), {'action': 'approve'}, format='json')
        self.assertEqual(response.status_code, 403)
        submission.refresh_from_db()
        self.assertEqual(submission.research_file.name, original)

    def test_admin_cannot_replace_the_student_attachment_during_approval(self):
        submission, _ = self.submit()
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse('submission-request-review', args=[submission.id]), {
            'action': 'approve', 'system_file': system('different.zip'),
        }, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertIn('system_file', response.data)
        self.assertFalse(ArchiveDocument.objects.exists())

    def test_default_selection_remains_linked_to_its_research_after_a_newer_configuration(self):
        submission, _ = self.submit()
        self.assertEqual(self.review(submission).status_code, 200)
        submission.refresh_from_db()
        default = HostingSession.objects.get(archive_document=submission.published_archive, is_default=True)
        HostingSession.objects.create(name='Later configuration', project_type='static', archive_document=submission.published_archive)
        response = self.client.get(reverse('archive-hosting-status', args=[submission.published_archive_id]))
        self.assertEqual(response.data['session']['id'], default.id)
        other_archive = ArchiveDocument.objects.create(title='Another research', uploaded_by=self.admin, is_approved=True)
        response = self.client.post(reverse('archive-hosting-saved-system-start', args=[other_archive.id, default.id]), {}, format='json')
        self.assertEqual(response.status_code, 404)

    def test_pending_attachments_are_included_in_admin_backup_and_restored_privately(self):
        submission, _ = self.submit()
        self.client.force_authenticate(self.admin)
        backup = self.client.get(reverse('backup'))
        self.assertEqual(backup.status_code, 200)
        entry = backup.data['data']['submission_requests'][0]
        self.assertTrue(entry['research_file']['content_base64'])
        self.assertTrue(entry['system_file']['content_base64'])
        submission.research_file.delete(save=False)
        submission.system_file.delete(save=False)
        submission.delete()
        response = self.client.post(reverse('restore'), backup.data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        restored = ResearchSubmissionRequest.objects.get(pk=entry['id'])
        self.assertEqual(restored.research_original_filename, 'research.pdf')
        self.assertEqual(restored.system_original_filename, 'research-system.zip')
        self.assertTrue(Path(restored.research_file.path).is_relative_to(self.root / 'private'))
        self.assertTrue(Path(restored.system_file.path).exists())
