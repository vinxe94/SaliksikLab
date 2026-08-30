from django.urls import path

from .views import (
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
