"""
Collaboration models – Git/GitHub-inspired research project collaboration.

Entities
--------
CollabProject   – A shared research workspace (like a GitHub repo)
ProjectMember   – Members with roles: owner, contributor, viewer
Issue           – Task / discussion thread tied to a project
IssueComment    – Threaded reply on an Issue
MergeRequest    – A merge/pull-request-like change proposal
MRComment       – Comment on a MergeRequest
Commit          – Represents a file submission / revision within a project
Notification    – In-app notification for mentions, reviews, etc.
"""

import uuid
from django.db import models
from django.conf import settings


class CollabProject(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('archived', 'Archived'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='owned_collab_projects'
    )
    # Link to a repository output (optional)
    research_output = models.ForeignKey(
        'repository.ResearchOutput',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='collab_projects'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.name


class ProjectMember(models.Model):
    ROLE_CHOICES = [
        ('owner', 'Owner'),
        ('contributor', 'Contributor'),
        ('viewer', 'Viewer'),
    ]

    project = models.ForeignKey(CollabProject, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='collab_memberships'
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='viewer')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('project', 'user')
        ordering = ['joined_at']

    def __str__(self):
        return f'{self.user} → {self.project} ({self.role})'


class Issue(models.Model):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_progress', 'In Progress'),
        ('closed', 'Closed'),
    ]
    LABEL_CHOICES = [
        ('bug', 'Bug'),
        ('feature', 'Feature'),
        ('discussion', 'Discussion'),
        ('question', 'Question'),
        ('documentation', 'Documentation'),
    ]

    project = models.ForeignKey(CollabProject, on_delete=models.CASCADE, related_name='issues')
    number = models.PositiveIntegerField()          # sequential per project
    title = models.CharField(max_length=500)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    label = models.CharField(max_length=30, choices=LABEL_CHOICES, blank=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_issues'
    )
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='assigned_issues'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('project', 'number')

    def __str__(self):
        return f'[{self.project.name} #{self.number}] {self.title}'

    def save(self, *args, **kwargs):
        if not self.number:
            last = Issue.objects.filter(project=self.project).order_by('-number').first()
            self.number = (last.number + 1) if last else 1
        super().save(*args, **kwargs)


class IssueComment(models.Model):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='issue_comments'
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'Comment by {self.author} on {self.issue}'


class MergeRequest(models.Model):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('merged', 'Merged'),
        ('closed', 'Closed'),
    ]

    project = models.ForeignKey(CollabProject, on_delete=models.CASCADE, related_name='merge_requests')
    number = models.PositiveIntegerField()
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_mrs'
    )
    reviewers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='reviewing_mrs'
    )
    # Attach related output file (optional)
    output_file = models.ForeignKey(
        'repository.OutputFile',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='merge_requests'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    merged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('project', 'number')

    def __str__(self):
        return f'[MR #{self.number}] {self.title}'

    def save(self, *args, **kwargs):
        if not self.number:
            last = MergeRequest.objects.filter(project=self.project).order_by('-number').first()
            self.number = (last.number + 1) if last else 1
        super().save(*args, **kwargs)


class MRComment(models.Model):
    merge_request = models.ForeignKey(MergeRequest, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='mr_comments'
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']


class Commit(models.Model):
    """Represents a versioned file contribution to a project."""
    project = models.ForeignKey(CollabProject, on_delete=models.CASCADE, related_name='commits')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='collab_commits'
    )
    message = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    # Optional: link to the actual file
    output_file = models.ForeignKey(
        'repository.OutputFile',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='commits'
    )
    merge_request = models.ForeignKey(
        MergeRequest,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='commits'
    )
    sha = models.CharField(max_length=40, unique=True)   # simulated commit hash
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.sha[:7]} – {self.message}'

    def save(self, *args, **kwargs):
        if not self.sha:
            import hashlib, time
            raw = f'{self.project_id}{self.message}{time.time()}'
            self.sha = hashlib.sha1(raw.encode()).hexdigest()
        super().save(*args, **kwargs)


class Notification(models.Model):
    TYPE_CHOICES = [
        ('issue_opened', 'Issue Opened'),
        ('issue_closed', 'Issue Closed'),
        ('issue_comment', 'Issue Comment'),
        ('mr_opened', 'MR Opened'),
        ('mr_merged', 'MR Merged'),
        ('mr_closed', 'MR Closed'),
        ('mr_comment', 'MR Comment'),
        ('member_added', 'Member Added'),
        ('commit_pushed', 'Commit Pushed'),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='collab_notifications'
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='sent_notifications'
    )
    notif_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    project = models.ForeignKey(CollabProject, on_delete=models.CASCADE, related_name='notifications')
    object_id = models.PositiveIntegerField(null=True, blank=True)   # issue/mr number
    message = models.CharField(max_length=500)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.recipient} – {self.notif_type}'
