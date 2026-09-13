import shutil
import tempfile
import io
import zipfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from repository.models import (
    ArchiveDocument,
    ArchiveDocumentVersion,
    Course,
    Department,
    Repository,
    RepositoryFile,
    ResearchOutput,
    ResearchSubmissionRequest,
)


def pdf_file(name='sample.pdf'):
    return SimpleUploadedFile(name, b'%PDF-1.4\n%Test PDF\n', content_type='application/pdf')


def text_file(name='notes.txt'):
    return SimpleUploadedFile(name, b'Research notes', content_type='text/plain')


def zip_file(name='system.zip'):
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('index.html', '<h1>Research system</h1>')
    return SimpleUploadedFile(name, payload.getvalue(), content_type='application/zip')


TEST_MEDIA_ROOT = tempfile.mkdtemp()
TEST_SUBMISSION_ROOT = tempfile.mkdtemp()
TEST_HOSTING_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT, SUBMISSION_STORAGE_PATH=TEST_SUBMISSION_ROOT, DEPLOYMENT_STORAGE_PATH=TEST_HOSTING_ROOT)
class RoleBasedAccessTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)
        shutil.rmtree(TEST_SUBMISSION_ROOT, ignore_errors=True)
        shutil.rmtree(TEST_HOSTING_ROOT, ignore_errors=True)

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
        self.other_student = User.objects.create_user(
            email='student2@example.com',
            password='Password123!',
            first_name='Other',
            last_name='User',
            role='student',
        )

    def test_only_admin_can_create_department(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(reverse('department-list-create'), {'name': 'Engineering'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse('department-list-create'), {'name': 'Engineering'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Department.objects.count(), 1)

    def test_anonymous_user_can_list_active_departments(self):
        Department.objects.create(name='Active Department')
        Department.objects.create(name='Inactive Department', is_active=False)

        response = self.client.get(reverse('department-list-create'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [item['name'] for item in response.data]
        self.assertIn('Active Department', names)
        self.assertNotIn('Inactive Department', names)

    def test_only_admin_can_create_course(self):
        department = Department.objects.create(name='Computer Studies')

        self.client.force_authenticate(self.other_student)
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

        for user in [self.student, self.faculty]:
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

        for user in [self.student, self.faculty]:
            self.client.force_authenticate(user)
            list_response = self.client.get(reverse('archive-list-create'))
            self.assertEqual(list_response.status_code, status.HTTP_200_OK)
            self.assertIn('Public Archive', [item['title'] for item in list_response.data['results']])

            detail_response = self.client.get(reverse('archive-detail', args=[archive.id]))
            self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

    def test_approved_archive_is_viewable_by_unassigned_users(self):
        archive = ArchiveDocument.objects.create(
            title='Approved Shared Archive',
            abstract='Approved paper',
            file=pdf_file('approved-shared-archive.pdf'),
            original_filename='approved-shared-archive.pdf',
            uploaded_by=self.student,
            assigned_faculty=self.faculty,
            is_approved=True,
        )

        self.client.force_authenticate(self.other_student)
        list_response = self.client.get(reverse('archive-list-create'))
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertIn('Approved Shared Archive', [item['title'] for item in list_response.data['results']])
        detail_response = self.client.get(reverse('archive-detail', args=[archive.id]))
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

        for user in [self.student, self.faculty, self.admin]:
            self.client.force_authenticate(user)
            detail_response = self.client.get(reverse('archive-detail', args=[archive.id]))
            self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

    def test_college_of_computing_and_ccis_department_filters_match(self):
        ArchiveDocument.objects.create(
            title='College Named Paper',
            abstract='Alias test',
            file=pdf_file('college-named.pdf'),
            original_filename='college-named.pdf',
            uploaded_by=self.admin,
            assigned_faculty=self.faculty,
            department='College of Computing',
            is_approved=True,
        )
        ArchiveDocument.objects.create(
            title='Acronym Named Paper',
            abstract='Alias test',
            file=pdf_file('acronym-named.pdf'),
            original_filename='acronym-named.pdf',
            uploaded_by=self.admin,
            assigned_faculty=self.faculty,
            department='CCIS',
            is_approved=True,
        )

        self.client.force_authenticate(self.student)
        response = self.client.get(reverse('archive-list-create'), {'department': 'CCIS'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item['title'] for item in response.data['results']]
        self.assertIn('College Named Paper', titles)
        self.assertIn('Acronym Named Paper', titles)

    def test_college_of_computing_and_ccis_are_grouped_in_stats(self):
        ResearchOutput.objects.create(
            title='College Named Stats Paper',
            abstract='Alias stats',
            uploaded_by=self.admin,
            author='Admin User',
            department='College of Computing',
            year=2026,
            is_approved=True,
        )
        ResearchOutput.objects.create(
            title='Acronym Named Stats Paper',
            abstract='Alias stats',
            uploaded_by=self.admin,
            author='Admin User',
            department='CCIS',
            year=2026,
            is_approved=True,
        )

        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('output-stats'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        dept_counts = {item['department']: item['count'] for item in response.data['by_dept']}
        self.assertEqual(dept_counts.get('College of Computing'), 2)
        self.assertNotIn('CCIS', dept_counts)

    def test_archive_activity_feed_only_contains_published_archives_for_non_admins(self):
        ArchiveDocument.objects.create(
            title='Student Own Activity',
            abstract='Own upload',
            file=pdf_file('student-own.pdf'),
            original_filename='student-own.pdf',
            uploaded_by=self.student,
            assigned_faculty=self.faculty,
            is_approved=True,
        )
        ArchiveDocument.objects.create(
            title='Other Public Activity',
            abstract='Visible in repository but not personal feed',
            file=pdf_file('other-public.pdf'),
            original_filename='other-public.pdf',
            uploaded_by=self.other_student,
            assigned_faculty=self.other_faculty,
            is_approved=True,
        )

        self.client.force_authenticate(self.student)
        response = self.client.get(reverse('archive-list-create'), {'activity_feed': 'true'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item['title'] for item in response.data['results']]
        self.assertIn('Student Own Activity', titles)
        self.assertIn('Other Public Activity', titles)

    def test_assigned_faculty_cannot_see_unpublished_archives(self):
        ArchiveDocument.objects.create(
            title='Assigned Faculty Activity',
            abstract='Assigned review',
            file=pdf_file('assigned-faculty.pdf'),
            original_filename='assigned-faculty.pdf',
            uploaded_by=self.student,
            assigned_faculty=self.faculty,
        )
        ArchiveDocument.objects.create(
            title='Unassigned Public Activity',
            abstract='Public but unrelated',
            file=pdf_file('unassigned-public.pdf'),
            original_filename='unassigned-public.pdf',
            uploaded_by=self.other_student,
            assigned_faculty=self.other_faculty,
            is_approved=True,
        )

        self.client.force_authenticate(self.faculty)
        response = self.client.get(reverse('archive-list-create'), {'activity_feed': 'true'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item['title'] for item in response.data['results']]
        self.assertNotIn('Assigned Faculty Activity', titles)
        self.assertIn('Unassigned Public Activity', titles)

    def test_archive_activity_feed_is_global_for_admin(self):
        ArchiveDocument.objects.create(
            title='Student Activity',
            abstract='Student upload',
            file=pdf_file('student-activity.pdf'),
            original_filename='student-activity.pdf',
            uploaded_by=self.student,
            assigned_faculty=self.faculty,
        )
        ArchiveDocument.objects.create(
            title='Other Student Activity',
            abstract='Other student upload',
            file=pdf_file('other-student-activity.pdf'),
            original_filename='other-student-activity.pdf',
            uploaded_by=self.other_student,
            assigned_faculty=self.other_faculty,
        )

        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('archive-list-create'), {'activity_feed': 'true'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item['title'] for item in response.data['results']]
        self.assertIn('Student Activity', titles)
        self.assertIn('Other Student Activity', titles)

    def test_student_cannot_upload_archive_directly(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(
            reverse('archive-list-create'),
            {
                'title': 'Archive Upload',
                'abstract': 'Test',
                'author': 'Student User',
                'department': 'CS',
                'course': 'BSCS',
                'year': 2026,
                'assigned_faculty': self.faculty.id,
                'file': pdf_file('archive-upload.pdf'),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ArchiveDocument.objects.count(), 0)

    def test_admin_archive_upload_rejects_non_pdf_research_file(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('archive-list-create'),
            {
                'title': 'Supporting Notes',
                'abstract': 'Test',
                'author': 'Student User',
                'department': 'CS',
                'course': 'BSCS',
                'year': 2026,
                'file': text_file('supporting-notes.txt'),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ArchiveDocument.objects.count(), 0)

    def test_only_admin_can_review_archive_document(self):
        archive = ArchiveDocument.objects.create(
            title='Assigned Paper',
            abstract='Test',
            file=pdf_file('archive.pdf'),
            original_filename='archive.pdf',
            uploaded_by=self.student,
            assigned_faculty=self.faculty,
        )

        self.client.force_authenticate(self.faculty)
        response = self.client.post(
            reverse('archive-review', args=[archive.id]),
            {'action': 'approve'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('archive-review', args=[archive.id]),
            {'action': 'revision', 'comment': 'Please fix chapter 2.'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        archive.refresh_from_db()
        self.assertTrue(archive.is_rejected)
        self.assertEqual(archive.revision_comment, 'Please fix chapter 2.')
        self.assertEqual(archive.reviewed_by, self.admin)

    def test_admin_can_publish_archive_without_assigned_faculty(self):
        self.client.force_authenticate(self.admin)
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
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        archive = ArchiveDocument.objects.get(pk=response.data['id'])
        self.assertTrue(archive.is_approved)
        self.assertEqual(archive.uploaded_by, self.admin)

    def test_archive_revision_creates_new_file_version_and_resets_review(self):
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

        self.client.force_authenticate(self.admin)
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

        self.client.force_authenticate(self.admin)
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
        self.assertEqual(backup.data['schema_version'], 3)
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

    def test_student_submits_pdf_request_and_only_admin_can_list_it(self):
        self.client.force_authenticate(self.student)
        created = self.client.post(
            reverse('submission-request-list-create'),
            {
                'title': 'Queue Paper',
                'abstract': 'Awaiting administrator review.',
                'submission_type': 'research_paper',
                'author': 'Student User',
                'department': 'CS',
                'course': 'BSCS',
                'year': 2026,
                'keywords': '["queue", "research"]',
                'research_file': pdf_file('queue-paper.pdf'),
            },
            format='multipart',
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ArchiveDocument.objects.count(), 0)
        self.assertEqual(ResearchSubmissionRequest.objects.count(), 1)

        student_list = self.client.get(reverse('submission-request-list-create'))
        student_detail = self.client.get(reverse('submission-request-detail', args=[created.data['id']]))
        owner_status = self.client.get(reverse('submission-request-owner-status', args=[created.data['id']]))
        self.assertEqual(student_list.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(student_detail.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(owner_status.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.other_student)
        other_status = self.client.get(reverse('submission-request-owner-status', args=[created.data['id']]))
        self.assertEqual(other_status.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.faculty)
        self.assertEqual(
            self.client.get(reverse('submission-request-list-create')).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(self.admin)
        admin_list = self.client.get(reverse('submission-request-list-create'))
        self.assertEqual(admin_list.status_code, status.HTTP_200_OK)
        self.assertEqual(admin_list.data['results'][0]['title'], 'Queue Paper')
        self.assertEqual(admin_list.data['results'][0]['queue_position'], 1)

    def test_submission_requests_are_processed_first_come_first_served(self):
        first = ResearchSubmissionRequest.objects.create(
            title='First Request', author='First Student', requested_by=self.student,
        )
        second = ResearchSubmissionRequest.objects.create(
            title='Second Request', author='Second Student', requested_by=self.other_student,
        )

        self.client.force_authenticate(self.admin)
        out_of_order = self.client.post(
            reverse('submission-request-review', args=[second.id]),
            {'action': 'reject', 'comment': 'Processed out of order.'},
            format='json',
        )
        self.assertEqual(out_of_order.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(out_of_order.data['next_request_id'], first.id)

        returned = self.client.post(
            reverse('submission-request-review', args=[first.id]),
            {'action': 'revision', 'comment': 'Clarify the abstract.'},
            format='json',
        )
        self.assertEqual(returned.status_code, status.HTTP_200_OK)
        self.assertEqual(returned.data['status'], 'revision_requested')

        approved = self.client.post(
            reverse('submission-request-review', args=[second.id]),
            {
                'action': 'approve',
                'comment': 'Ready to publish.',
                'research_file': pdf_file('second-request.pdf'),
            },
            format='multipart',
        )
        self.assertEqual(approved.status_code, status.HTTP_200_OK)
        second.refresh_from_db()
        self.assertEqual(second.status, ResearchSubmissionRequest.STATUS_APPROVED)
        self.assertIsNotNone(second.published_archive)
        self.assertTrue(second.published_archive.is_approved)
        self.assertEqual(second.published_archive.uploaded_by, self.admin)
        self.assertEqual(second.published_archive.versions.count(), 1)

    def test_admin_can_publish_approved_executable_system(self):
        submission = ResearchSubmissionRequest.objects.create(
            title='Runnable Capstone',
            author='Student User',
            submission_type=ResearchSubmissionRequest.TYPE_EXECUTABLE_SYSTEM,
            system_details='Static site with index.html.',
            requested_by=self.student,
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('submission-request-review', args=[submission.id]),
            {
                'action': 'approve',
                'system_file': zip_file(),
                'system_link': 'https://example.com/capstone',
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        submission.refresh_from_db()
        archive = submission.published_archive
        self.assertTrue(archive.system_file)
        self.assertFalse(archive.file)
        self.assertEqual(archive.system_original_filename, 'system.zip')
        self.assertEqual(archive.uploaded_by, self.admin)

        self.client.force_authenticate(self.student)
        download = self.client.get(reverse('archive-system-download', args=[archive.id]))
        self.assertEqual(download.status_code, status.HTTP_200_OK)

    def test_resubmitted_request_rejoins_the_end_of_the_fifo_queue(self):
        returned = ResearchSubmissionRequest.objects.create(
            title='Returned Request',
            author='Student User',
            requested_by=self.student,
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('submission-request-review', args=[returned.id]),
            {'action': 'revision', 'comment': 'Add details.'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        waiting = ResearchSubmissionRequest.objects.create(
            title='Waiting Request',
            author='Other Student',
            requested_by=self.other_student,
        )

        self.client.force_authenticate(self.student)
        resubmitted = self.client.post(
            reverse('submission-request-resubmit', args=[returned.id]),
            {'abstract': 'Expanded details.', 'research_file': pdf_file('revised-request.pdf')},
            format='multipart',
        )
        self.assertEqual(resubmitted.status_code, status.HTTP_200_OK)
        self.assertEqual(resubmitted.data['status'], 'pending')
        self.assertEqual(resubmitted.data['queue_position'], 2)

        self.client.force_authenticate(self.admin)
        queue = self.client.get(reverse('submission-request-list-create'), {'status': 'pending'})
        self.assertEqual([item['id'] for item in queue.data['results']], [waiting.id, returned.id])

    def test_students_cannot_use_legacy_file_upload_endpoints(self):
        self.client.force_authenticate(self.student)
        legacy_output = self.client.post(
            reverse('output-list-create'),
            {
                'title': 'Bypass', 'author': 'Student', 'department': 'CS',
                'year': 2026, 'file': pdf_file('bypass.pdf'),
            },
            format='multipart',
        )
        repository = self.client.post(
            reverse('repository-list-create'),
            {'title': 'System Bypass', 'file': pdf_file('bypass-repository.pdf')},
            format='multipart',
        )
        self.assertEqual(legacy_output.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(repository.status_code, status.HTTP_403_FORBIDDEN)

    def test_only_admin_can_upload_an_archive_hosting_package(self):
        archive = ArchiveDocument.objects.create(
            title='Published System',
            author='Student User',
            uploaded_by=self.admin,
            is_approved=True,
        )
        self.client.force_authenticate(self.student)
        response = self.client.post(
            reverse('archive-hosting-start', args=[archive.id]),
            {
                'name': 'Bypass System',
                'project_type': 'static',
                'site_zip': zip_file('bypass-system.zip'),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

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
