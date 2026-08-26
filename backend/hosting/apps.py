from django.apps import AppConfig
import threading


class HostingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'hosting'

    def ready(self):
        from .manager import schedule_active_sessions

        timer = threading.Timer(1, schedule_active_sessions)
        timer.daemon = True
        timer.start()
