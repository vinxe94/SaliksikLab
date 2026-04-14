from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import (
    CollabProject, ProjectMember, Issue, IssueComment,
    MergeRequest, MRComment, Commit, Notification, CollabProjectFile
)

User = get_user_model()


class UserMiniSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name', 'role']

    def get_full_name(self, obj):
        return obj.get_full_name()


# ── Project ───────────────────────────────────────────────────────────────────

class ProjectMemberSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True
    )

    class Meta:
        model = ProjectMember
        fields = ['id', 'user', 'user_id', 'role', 'joined_at']


class CollabProjectSerializer(serializers.ModelSerializer):
    owner = UserMiniSerializer(read_only=True)
    members = ProjectMemberSerializer(many=True, read_only=True)
    member_count = serializers.SerializerMethodField()
    open_issues = serializers.SerializerMethodField()
    open_mrs = serializers.SerializerMethodField()
    commit_count = serializers.SerializerMethodField()
    linked_repository_title = serializers.SerializerMethodField()
    linked_repository_current_version = serializers.SerializerMethodField()

    class Meta:
        model = CollabProject
        fields = [
            'id', 'name', 'description', 'status',
            'owner', 'members', 'member_count',
            'open_issues', 'open_mrs', 'commit_count',
            'research_output', 'linked_repository',
            'linked_repository_title', 'linked_repository_current_version',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'owner', 'created_at', 'updated_at']

    def get_member_count(self, obj):
        return obj.members.count()

    def get_open_issues(self, obj):
        return obj.issues.filter(status='open').count()

    def get_open_mrs(self, obj):
        return obj.merge_requests.filter(status='open').count()

    def get_commit_count(self, obj):
        return obj.commits.count()

    def get_linked_repository_title(self, obj):
        if not obj.linked_repository:
            return None
        return obj.linked_repository.title

    def get_linked_repository_current_version(self, obj):
        if not obj.linked_repository:
            return 0
        return obj.linked_repository.current_version


# ── Issue ─────────────────────────────────────────────────────────────────────

class IssueCommentSerializer(serializers.ModelSerializer):
    author = UserMiniSerializer(read_only=True)

    class Meta:
        model = IssueComment
        fields = ['id', 'author', 'body', 'created_at', 'updated_at']
        read_only_fields = ['id', 'author', 'created_at', 'updated_at']


class IssueSerializer(serializers.ModelSerializer):
    author = UserMiniSerializer(read_only=True)
    assignees = UserMiniSerializer(many=True, read_only=True)
    assignee_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.all(), source='assignees', write_only=True, required=False
    )
    comments = IssueCommentSerializer(many=True, read_only=True)
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = Issue
        fields = [
            'id', 'number', 'title', 'body', 'status', 'label',
            'author', 'assignees', 'assignee_ids',
            'comments', 'comment_count',
            'created_at', 'updated_at', 'closed_at',
        ]
        read_only_fields = ['id', 'number', 'author', 'created_at', 'updated_at']

    def get_comment_count(self, obj):
        return obj.comments.count()


# ── Merge Request ─────────────────────────────────────────────────────────────

class MRCommentSerializer(serializers.ModelSerializer):
    author = UserMiniSerializer(read_only=True)

    class Meta:
        model = MRComment
        fields = ['id', 'author', 'body', 'created_at', 'updated_at']
        read_only_fields = ['id', 'author', 'created_at', 'updated_at']


class MergeRequestSerializer(serializers.ModelSerializer):
    author = UserMiniSerializer(read_only=True)
    reviewers = UserMiniSerializer(many=True, read_only=True)
    reviewer_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=User.objects.all(), source='reviewers', write_only=True, required=False
    )
    comments = MRCommentSerializer(many=True, read_only=True)
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = MergeRequest
        fields = [
            'id', 'number', 'title', 'description', 'status',
            'author', 'reviewers', 'reviewer_ids',
            'output_file', 'comments', 'comment_count',
            'created_at', 'updated_at', 'merged_at',
        ]
        read_only_fields = ['id', 'number', 'author', 'created_at', 'updated_at']

    def get_comment_count(self, obj):
        return obj.comments.count()


# ── Commit ────────────────────────────────────────────────────────────────────

class CommitSerializer(serializers.ModelSerializer):
    author = UserMiniSerializer(read_only=True)

    class Meta:
        model = Commit
        fields = [
            'id', 'sha', 'message', 'description',
            'author', 'output_file', 'merge_request',
            'created_at',
        ]
        read_only_fields = ['id', 'sha', 'author', 'created_at']


# ── Notification ──────────────────────────────────────────────────────────────

class NotificationSerializer(serializers.ModelSerializer):
    actor = UserMiniSerializer(read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id', 'notif_type', 'message',
            'actor', 'project', 'project_name',
            'object_id', 'is_read', 'created_at',
        ]
        read_only_fields = ['id', 'notif_type', 'message', 'actor', 'project', 'created_at']


# ── IDE File ──────────────────────────────────────────────────────────────────

class CollabProjectFileSerializer(serializers.ModelSerializer):
    created_by = UserMiniSerializer(read_only=True)
    last_edited_by = UserMiniSerializer(read_only=True)

    class Meta:
        model = CollabProjectFile
        fields = [
            'id', 'path', 'content', 'language',
            'created_by', 'last_edited_by',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'last_edited_by', 'created_at', 'updated_at']
