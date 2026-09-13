from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from hosting.services.proxy_service import public_proxy

urlpatterns = [
    path('temp/<uuid:deployment_id>/', public_proxy, name='temporary-website'),
    path('temp/<uuid:deployment_id>/<path:path>', public_proxy, name='temporary-website-path'),
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/repository/', include('repository.urls')),
    path('api/hosting/', include('hosting.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
