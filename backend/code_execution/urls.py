from django.urls import path
from .views import (
    ExecuteCodeView,
    TranslateView,
    SubmissionHistoryView,
    SupportedLanguagesView,
)

urlpatterns = [
    path('execute/', ExecuteCodeView.as_view(), name='code-execute'),
    path('translate/', TranslateView.as_view(), name='code-translate'),
    path('history/', SubmissionHistoryView.as_view(), name='code-history'),
    path('languages/', SupportedLanguagesView.as_view(), name='code-languages'),
]
