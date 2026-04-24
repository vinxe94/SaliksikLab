import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from repository.models import ArchiveDocument, ArchiveDocumentVersion, Course, Department, Repository, RepositoryFile


def pdf_file(name='sample.pdf'):
    return SimpleUploadedFile(name, b'%PDF-1.4\n%Test PDF\n', content_type='application/pdf')


TEST_MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class RoleBasedAccessTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@example.com',
            password='Password123!',
            first_name='Admin',
            last_name='User',
            role='admin',
        )
        self.faculty = User.objects.create_user(
            email='faculty@example.com',
            password='Password123!',
            first_name='Faculty',
            last_name='Member',
            role='faculty',
        )
        self.other_faculty = User.objects.create_user(
            email='faculty2@example.com',
            password='Password123!',
            first_name='Other',
            last_name='Faculty',
            role='faculty',
        )
        self.student = User.objects.create_user(
            email='student@example.com',
            password='Password123!',
            first_name='Student',
            last_name='User',
            role='student',
        )
        self.researcher = User.objects.create_user(
            email='researcher@example.com',
            password='Password123!',
            first_name='Researcher',
            last_name='User',
            role='researcher',
        )

    def test_only_admin_can_create_department(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(reverse('department-list-create'), {'name': 'Engineering'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse('department-list-create'), {'name': 'Engineering'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Department.objects.count(), 1)

    def test_only_admin_can_create_course(self):
        department = Department.objects.create(name='Computer Studies')

        self.client.force_authenticate(self.researcher)
        response = self.client.post(
            reverse('course-list-create'),
            {'name': 'BSCS', 'department': department.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('course-list-create'),
            {'name': 'BSCS', 'department': department.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Course.objects.count(), 1)

    def test_non_admin_only_sees_public_or_owned_repositories(self):
        public_repo = Repository.objects.create(title='Public Repo', description='Visible', created_by=self.admin, is_public=True)
        private_repo = Repository.objects.create(title='Private Repo', description='Hidden', created_by=self.admin, is_public=False)
        own_private_repo = Repository.objects.create(title='My Private Repo', description='Mine', created_by=self.student, is_public=False)
        for index, repository in enumerate([public_repo, private_repo, own_private_repo], start=1):
            RepositoryFile.objects.create(
                repository=repository,
                file=pdf_file(f'repo-{index}.pdf'),
                original_filename=f'repo-{index}.pdf',
                version=1,
                uploaded_by=repository.created_by,
            )

        self.client.force_authenticate(self.student)
        response = self.client.get(reverse('repository-list-create'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item['title'] for item in response.data['results']]
        self.assertIn('Public Repo', titles)
        self.assertIn('My Private Repo', titles)
        self.assertNotIn('Private Repo', titles)

    def test_non_owner_cannot_access_private_repository_detail(self):
        private_repo = Repository.objects.create(title='Private Repo', description='Hidden', created_by=self.admin, is_public=False)
        RepositoryFile.objects.create(
            repository=private_repo,
            file=pdf_file('private-repo.pdf'),
            original_filename='private-repo.pdf',
            version=1,
            uploaded_by=self.admin,
        )

        self.client.force_authenticate(self.student)
        response = self.client.get(reverse('repository-detail', args=[private_repo.id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('repository-detail', args=[private_repo.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_public_repository_is_viewable_by_each_non_admin_role(self):
        public_repo = Repository.objects.create(title='Shared Repo', description='Visible', created_by=self.admin, is_public=True)
        RepositoryFile.objects.create(
            repository=public_repo,
            file=pdf_file('shared-repo.pdf'),
            original_filename='shared-repo.pdf',
            version=1,
            uploaded_by=self.admin,
        )

        for user in [self.student, self.faculty, self.researcher]:
            self.client.force_authenticate(user)
            list_response = self.client.get(reverse('repository-list-create'))
            self.assertEqual(list_response.status_code, status.HTTP_200_OK)
            self.assertIn('Shared Repo', [item['title'] for item in list_response.data['results']])

            detail_response = self.client.get(reverse('repository-detail', args=[public_repo.id]))
            self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

    def test_approved_archive_is_viewable_by_each_non_admin_role(self):
        archive = ArchiveDocument.objects.create(
            title='Public Archive',
            abstract='Approved paper',
            file=pdf_file('public-archive.pdf'),
            original_filename='public-archive.pdf',
            uploaded_by=self.admin,
            assigned_faculty=self.faculty,
            is_approved=True,
        )

        for user in [self.student, self.faculty, self.researcher]:
            self.client.force_authenticate(user)
            list_response = self.client.get(reverse('archive-list-create'))
            self.assertEqual(list_response.status_code, status.HTTP_200_OK)
            self.assertIn('Public Archive', [item['title'] for item in list_response.data['results']])

            detail_response = self.client.get(reverse('archive-detail', args=[archive.id]))
            self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

    def test_private_approved_archive_is_hidden_from_other_roles(self):
        archive = ArchiveDocument.objects.create(
            title='Private Archive',
            abstract='Approved private paper',
            file=pdf_file('private-archive.pdf'),
            original_filename='private-archive.pdf',
            uploaded_by=self.student,
            assigned_faculty=self.faculty,
            is_public=False,
            is_approved=True,
        )

        self.client.force_authenticate(self.researcher)
        list_response = self.client.get(reverse('archive-list-create'))
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertNotIn('Private Archive', [item['title'] for item in list_response.data['results']])
        detail_response = self.client.get(reverse('archive-detail', args=[archive.id]))
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

        for user in [self.student, self.faculty, self.admin]:
            self.client.force_authenticate(user)
            detail_response = self.client.get(reverse('archive-detail', args=[archive.id]))
            self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

    def test_archive_upload_accepts_private_visibility(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(
            reverse('archive-list-create'),
            {
                'title': 'Private Upload',
                'abstract': 'Test',
                'author': 'Student User',
                'department': 'CS',
                'course': 'BSCS',
                'year': 2026,
                'assigned_faculty': self.faculty.id,
                'is_public': 'false',
                'file': pdf_file('private-upload.pdf'),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(ArchiveDocument.objects.get(id=response.data['id']).is_public)

    def test_only_assigned_faculty_can_review_archive_document(self):
        archive = ArchiveDocument.objects.create(
            title='Assigned Paper',
            abstract='Test',
            file=pdf_file('archive.pdf'),
            original_filename='archive.pdf',
            uploaded_by=self.student,
            assigned_faculty=self.faculty,
        )

        self.client.force_authenticate(self.other_faculty)
        response = self.client.post(
            reverse('archive-review', args=[archive.id]),
            {'action': 'approve'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.faculty)
        response = self.client.post(
            reverse('archive-review', args=[archive.id]),
            {'action': 'revision', 'comment': 'Please fix chapter 2.'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        archive.refresh_from_db()
        self.assertTrue(archive.is_rejected)
        self.assertEqual(archive.revision_comment, 'Please fix chapter 2.')
        self.assertEqual(archive.reviewed_by, self.faculty)

    def test_archive_requires_assigned_faculty_on_create(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(
            reverse('archive-list-create'),
            {
                'title': 'Paper Without Faculty',
                'abstract': 'Test',
                'author': 'Student User',
                'department': 'CS',
                'course': 'BSCS',
                'year': 2026,
                'file': pdf_file('missing-faculty.pdf'),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('assigned_faculty', response.data)

    def test_archive_revision_creates_new_pdf_version_and_resets_review(self):
        archive = ArchiveDocument.objects.create(
            title='Versioned Paper',
            abstract='Test',
            file=pdf_file('archive-v1.pdf'),
            original_filename='archive-v1.pdf',
            uploaded_by=self.student,
            assigned_faculty=self.faculty,
            is_approved=True,
        )
        ArchiveDocumentVersion.objects.create(
            archive_document=archive,
            file=archive.file.name,
            original_filename='archive-v1.pdf',
            version=1,
            uploaded_by=self.student,
        )

        self.client.force_authenticate(self.student)
        response = self.client.post(
            reverse('archive-revise', args=[archive.id]),
            {
                'file': pdf_file('archive-v2.pdf'),
                'change_notes': 'Updated methodology section.',
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['version'], 2)
        self.assertEqual(archive.versions.count(), 2)

        archive.refresh_from_db()
        self.assertEqual(archive.original_filename, 'archive-v2.pdf')
        self.assertFalse(archive.is_approved)
        self.assertFalse(archive.is_rejected)

        history = self.client.get(reverse('archive-versions', args=[archive.id]))
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertEqual(history.data['results'][0]['version'], 2)

    def test_archive_version_can_be_downloaded(self):
        archive = ArchiveDocument.objects.create(
            title='Downloadable Paper',
            abstract='Test',
            file=pdf_file('download-v1.pdf'),
            original_filename='download-v1.pdf',
            uploaded_by=self.student,
            assigned_faculty=self.faculty,
        )
        version = ArchiveDocumentVersion.objects.create(
            archive_document=archive,
            file=archive.file.name,
            original_filename='download-v1.pdf',
            version=1,
            uploaded_by=self.student,
        )

        self.client.force_authenticate(self.student)
        response = self.client.get(reverse('archive-version-download', args=[archive.id, version.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.get('Content-Disposition'), 'attachment; filename="download-v1.pdf"')

    def test_admin_backup_and_restore_archive_versions(self):
        archive = ArchiveDocument.objects.create(
            title='Restorable Paper',
            abstract='Test',
            file=pdf_file('restore-v1.pdf'),
            original_filename='restore-v1.pdf',
            uploaded_by=self.student,
            assigned_faculty=self.faculty,
            is_approved=True,
        )
        ArchiveDocumentVersion.objects.create(
            archive_document=archive,
            file=archive.file.name,
            original_filename='restore-v1.pdf',
            version=1,
            uploaded_by=self.student,
        )

        self.client.force_authenticate(self.admin)
        backup = self.client.get(reverse('backup'))
        self.assertEqual(backup.status_code, status.HTTP_200_OK)
        self.assertEqual(backup.data['schema_version'], 2)
        self.assertEqual(backup.data['counts']['archives'], 1)
        self.assertTrue(backup.data['data']['archives'][0]['file']['content_base64'])

        ArchiveDocument.objects.all().delete()
        self.assertEqual(ArchiveDocument.objects.count(), 0)

        restored = self.client.post(reverse('restore'), backup.data, format='json')
        self.assertEqual(restored.status_code, status.HTTP_200_OK)
        self.assertEqual(restored.data['restored']['archives'], 1)
        self.assertEqual(restored.data['restored']['archive_versions'], 1)
        self.assertEqual(ArchiveDocument.objects.get(id=archive.id).title, 'Restorable Paper')
        self.assertEqual(ArchiveDocumentVersion.objects.get(archive_document_id=archive.id).version, 1)

    def test_faculty_list_only_returns_active_approved_faculty(self):
        inactive_faculty = User.objects.create_user(
            email='inactive@example.com',
            password='Password123!',
            first_name='Inactive',
            last_name='Faculty',
            role='faculty',
            is_active=False,
        )
        pending_faculty = User.objects.create_user(
            email='pending@example.com',
            password='Password123!',
            first_name='Pending',
            last_name='Faculty',
            role='faculty',
            is_account_approved=False,
        )
        self.assertIsNotNone(inactive_faculty)
        self.assertIsNotNone(pending_faculty)

        self.client.force_authenticate(self.student)
        response = self.client.get(reverse('faculty-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = [item['email'] for item in response.data]
        self.assertIn(self.faculty.email, emails)
        self.assertIn(self.other_faculty.email, emails)
        self.assertNotIn(inactive_faculty.email, emails)
        self.assertNotIn(pending_faculty.email, emails)
