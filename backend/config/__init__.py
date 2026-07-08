# ✅ Импортируем Celery-приложение здесь, чтобы оно гарантированно
# инициализировалось при любом старте Django (runserver, daphne, manage.py
# команды) — иначе @shared_task в других приложениях не будут видеть
# правильно настроенный app и не смогут исполняться воркером.
from .celery import app as celery_app

__all__ = ('celery_app',)
