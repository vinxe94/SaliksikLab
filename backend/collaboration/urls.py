from django.urls import path
from .views import (
    ProjectListCreateView, ProjectDetailView,
    MemberListView, MemberDetailView,
    IssueListCreateView, IssueDetailView, IssueCommentListCreateView,
    MRListCreateView, MRDetailView, MRCommentListCreateView,
    CommitListCreateView,
    NotificationListView, MarkNotificationsReadView,
    UserSearchView,
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

    # Notifications
    path('notifications/', NotificationListView.as_view(), name='collab-notifications'),
    path('notifications/read/', MarkNotificationsReadView.as_view(), name='collab-notifications-read'),

    # User search
    path('users/search/', UserSearchView.as_view(), name='collab-user-search'),
]
