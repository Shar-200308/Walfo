import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'walfo_config.settings')

application = get_wsgi_application()

try:
    from django.core.management import call_command
    call_command('migrate', interactive=False)
    print("[Startup] Database migrations completed successfully.")
except Exception as e:
    print(f"[Startup Migration Error]: {e}")

