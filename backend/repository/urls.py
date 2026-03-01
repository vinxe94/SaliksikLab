from django.urls import path
from .views import (
    ResearchOutputListCreateView,
    ResearchOutputDetailView,
    ApproveOutputView,
    DownloadFileView,
    PreviewFileView,
    ReviseOutputView,
    VersionHistoryView,
    RollbackVersionView,
    BackupView,
    StatsView,
    ExportCSVView,
)

urlpatterns = [
    path('', ResearchOutputListCreateView.as_view(), name='output-list-create'),
    path('stats/', StatsView.as_view(), name='output-stats'),
    path('export/csv/', ExportCSVView.as_view(), name='output-export-csv'),
    path('backup/', BackupView.as_view(), name='backup'),
    path('<int:pk>/', ResearchOutputDetailView.as_view(), name='output-detail'),
    path('<int:pk>/approve/', ApproveOutputView.as_view(), name='output-approve'),
    path('<int:pk>/download/', DownloadFileView.as_view(), name='output-download'),
    path('<int:pk>/download/<int:file_id>/', DownloadFileView.as_view(), name='file-download'),
    path('<int:pk>/preview/', PreviewFileView.as_view(), name='output-preview'),
    path('<int:pk>/preview/<int:file_id>/', PreviewFileView.as_view(), name='file-preview'),
    path('<int:pk>/revise/', ReviseOutputView.as_view(), name='output-revise'),
    path('<int:pk>/versions/', VersionHistoryView.as_view(), name='output-versions'),
    path('<int:pk>/rollback/', RollbackVersionView.as_view(), name='output-rollback'),
]
