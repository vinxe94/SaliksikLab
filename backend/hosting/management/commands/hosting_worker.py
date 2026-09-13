import fcntl
import logging
import signal
import threading

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections
from django.utils import timezone

from hosting.models import HostingSession
from hosting.services.archive_service import hosting_root
from hosting.services.deployment_service import process_queue, reconcile_all_deployments

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Run the single-host durable deployment queue, expiration and recovery worker.'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Reconcile and process the queue once, then exit.')

    def handle(self, *args, **options):
        root = hosting_root()
        with (root / 'worker.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise CommandError('Another hosting worker already owns this storage directory.') from exc
            stopped = threading.Event()
            old_handlers = {}
            if threading.current_thread() is threading.main_thread():
                for sig in (signal.SIGTERM, signal.SIGINT):
                    old_handlers[sig] = signal.signal(sig, lambda *_: stopped.set())
            heartbeat = root / 'worker.heartbeat'

            def beat():
                while not stopped.is_set():
                    heartbeat.touch(mode=0o600)
                    stopped.wait(5)

            thread = None
            try:
                reconcile_all_deployments(startup=True)
                thread = threading.Thread(target=beat, daemon=True)
                thread.start()
                self.stdout.write('Hosting worker ready; existing session deadlines retained.')
                while not stopped.is_set():
                    try:
                        close_old_connections()
                        reconcile_all_deployments()
                        process_queue(stop_event=stopped)
                    except Exception:
                        logger.exception('Hosting worker iteration failed; retrying without resetting deadlines')
                        if options['once']:
                            raise
                    if options['once']:
                        break
                    expiry = HostingSession.objects.filter(status='running').values_list('expires_at', flat=True).first()
                    delay = max(0.05, settings.DEPLOYMENT_CLEANUP_INTERVAL)
                    if expiry:
                        delay = min(delay, max(0.01, (expiry - timezone.now()).total_seconds()))
                    stopped.wait(delay)
            finally:
                stopped.set()
                if thread:
                    thread.join(timeout=2)
                heartbeat.unlink(missing_ok=True)
                close_old_connections()
                for sig, handler in old_handlers.items():
                    signal.signal(sig, handler)
