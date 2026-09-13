from django.urls import path

from .views import (
    ArchiveHostingKillView,
    ArchiveHostingLogsView,
    ArchiveHostingRestartView,
    ArchiveHostingSavedSystemStartView,
    ArchiveHostingStartView,
    ArchiveHostingStatusView,
    ArchiveHostingStopView,
    HostingKillView,
    HostingLogsView,
    HostingRestartView,
    HostingSavedSystemDeleteView,
    HostingSavedSystemListView,
    HostingSavedSystemStartView,
    HostingStartView,
    HostingStatusView,
    HostingStopView,
)

urlpatterns = [
    path('archives/<int:archive_id>/status/', ArchiveHostingStatusView.as_view(), name='archive-hosting-status'),
    path('archives/<int:archive_id>/start/', ArchiveHostingStartView.as_view(), name='archive-hosting-start'),
    path('archives/<int:archive_id>/saved/<int:session_id>/start/', ArchiveHostingSavedSystemStartView.as_view(), name='archive-hosting-saved-system-start'),
    path('archives/<int:archive_id>/stop/', ArchiveHostingStopView.as_view(), name='archive-hosting-stop'),
    path('archives/<int:archive_id>/restart/', ArchiveHostingRestartView.as_view(), name='archive-hosting-restart'),
    path('archives/<int:archive_id>/kill/', ArchiveHostingKillView.as_view(), name='archive-hosting-kill'),
    path('archives/<int:archive_id>/logs/', ArchiveHostingLogsView.as_view(), name='archive-hosting-logs'),
    path('status/', HostingStatusView.as_view(), name='hosting-status'),
    path('saved/', HostingSavedSystemListView.as_view(), name='hosting-saved-systems'),
    path('saved/<int:session_id>/start/', HostingSavedSystemStartView.as_view(), name='hosting-saved-system-start'),
    path('saved/<int:session_id>/', HostingSavedSystemDeleteView.as_view(), name='hosting-saved-system-delete'),
    path('start/', HostingStartView.as_view(), name='hosting-start'),
    path('stop/', HostingStopView.as_view(), name='hosting-stop'),
    path('kill/', HostingKillView.as_view(), name='hosting-kill'),
    path('restart/', HostingRestartView.as_view(), name='hosting-restart'),
    path('logs/', HostingLogsView.as_view(), name='hosting-logs'),
]
