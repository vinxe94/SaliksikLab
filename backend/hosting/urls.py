from django.urls import path

from .views import (
    HostingKillView,
    HostingLogsView,
    HostingRestartView,
    HostingStartView,
    HostingStatusView,
    HostingStopView,
)

urlpatterns = [
    path('status/', HostingStatusView.as_view(), name='hosting-status'),
    path('start/', HostingStartView.as_view(), name='hosting-start'),
    path('stop/', HostingStopView.as_view(), name='hosting-stop'),
    path('kill/', HostingKillView.as_view(), name='hosting-kill'),
    path('restart/', HostingRestartView.as_view(), name='hosting-restart'),
    path('logs/', HostingLogsView.as_view(), name='hosting-logs'),
]
