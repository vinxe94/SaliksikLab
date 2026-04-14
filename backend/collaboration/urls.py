from django.urls import path
from .views import (
    ProjectListCreateView, ProjectDetailView,
    MemberListView, MemberDetailView,
    IssueListCreateView, IssueDetailView, IssueCommentListCreateView,
    MRListCreateView, MRDetailView, MRCommentListCreateView,
    CommitListCreateView,
    NotificationListView, MarkNotificationsReadView,
    UserSearchView,
    IDEFileListCreateView, IDEFileDetailView,
    IDEPreviewView, IDERunView,
    ProjectLinkedReposView,
    ProjectLinkRepositoryView,
    PublishToRepositoryView,
)

urlpatterns = [
    # Projects
    path('projects/', ProjectListCreateView.as_view(), name='collab-project-list'),
    path('projects/<uuid:pk>/', ProjectDetailView.as_view(), name='collab-project-detail'),

    # Members
    path('projects/<uuid:project_pk>/members/', MemberListView.as_view(), name='collab-member-list'),
    path('projects/<uuid:project_pk>/members/<int:member_pk>/', MemberDetailView.as_view(), name='collab-member-detail'),

    # Issues
    path('projects/<uuid:project_pk>/issues/', IssueListCreateView.as_view(), name='collab-issue-list'),
    path('projects/<uuid:project_pk>/issues/<int:issue_number>/', IssueDetailView.as_view(), name='collab-issue-detail'),
    path('projects/<uuid:project_pk>/issues/<int:issue_number>/comments/', IssueCommentListCreateView.as_view(), name='collab-issue-comments'),

    # Merge Requests
    path('projects/<uuid:project_pk>/mrs/', MRListCreateView.as_view(), name='collab-mr-list'),
    path('projects/<uuid:project_pk>/mrs/<int:mr_number>/', MRDetailView.as_view(), name='collab-mr-detail'),
    path('projects/<uuid:project_pk>/mrs/<int:mr_number>/comments/', MRCommentListCreateView.as_view(), name='collab-mr-comments'),

    # Commits
    path('projects/<uuid:project_pk>/commits/', CommitListCreateView.as_view(), name='collab-commit-list'),

    # IDE files
    path('projects/<uuid:project_pk>/ide-files/', IDEFileListCreateView.as_view(), name='collab-ide-files'),
    path('projects/<uuid:project_pk>/ide-files/<int:file_pk>/', IDEFileDetailView.as_view(), name='collab-ide-file-detail'),
    path('projects/<uuid:project_pk>/ide-preview/', IDEPreviewView.as_view(), name='collab-ide-preview'),
    path('projects/<uuid:project_pk>/ide-run/', IDERunView.as_view(), name='collab-ide-run'),

    # Linked repositories (for IDE import)
    path('projects/<uuid:project_pk>/repos/', ProjectLinkedReposView.as_view(), name='collab-project-repos'),
    path('projects/<uuid:project_pk>/link-repository/', ProjectLinkRepositoryView.as_view(), name='collab-project-link-repository'),

    # Publish IDE workspace → repository
    path('projects/<uuid:project_pk>/publish-to-repo/', PublishToRepositoryView.as_view(), name='collab-publish-to-repo'),

    # Notifications
    path('notifications/', NotificationListView.as_view(), name='collab-notifications'),
    path('notifications/read/', MarkNotificationsReadView.as_view(), name='collab-notifications-read'),

    # User search
    path('users/search/', UserSearchView.as_view(), name='collab-user-search'),
]
