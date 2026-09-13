from django.urls import path
from items.views import health, items

urlpatterns = [
    path('api/health/', health),
    path('api/items/', items),
]
