from django.contrib import admin
from .models import CollabProject, ProjectMember, Issue, IssueComment, MergeRequest, MRComment, Commit, Notification


@admin.register(CollabProject)
class CollabProjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'owner', 'status', 'created_at']
    list_filter = ['status']
    search_fields = ['name', 'owner__email']


@admin.register(ProjectMember)
class ProjectMemberAdmin(admin.ModelAdmin):
    list_display = ['project', 'user', 'role', 'joined_at']
    list_filter = ['role']


@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
    list_display = ['project', 'number', 'title', 'status', 'label', 'author', 'created_at']
    list_filter = ['status', 'label']
    search_fields = ['title', 'author__email']


@admin.register(IssueComment)
class IssueCommentAdmin(admin.ModelAdmin):
    list_display = ['issue', 'author', 'created_at']


@admin.register(MergeRequest)
class MergeRequestAdmin(admin.ModelAdmin):
    list_display = ['project', 'number', 'title', 'status', 'author', 'created_at']
    list_filter = ['status']
    search_fields = ['title', 'author__email']


@admin.register(MRComment)
class MRCommentAdmin(admin.ModelAdmin):
    list_display = ['merge_request', 'author', 'created_at']


@admin.register(Commit)
class CommitAdmin(admin.ModelAdmin):
    list_display = ['project', 'sha', 'message', 'author', 'created_at']
    search_fields = ['message', 'sha', 'author__email']


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['recipient', 'notif_type', 'project', 'is_read', 'created_at']
    list_filter = ['notif_type', 'is_read']
