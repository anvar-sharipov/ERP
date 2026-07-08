# backend/config/celery.py
"""
Точка входа Celery — здесь создаётся объект приложения ("app"), который:
1) знает настройки Django (брокер/бэкенд результатов, часовой пояс и т.д. —
   через CELERY_* в settings.py),
2) сам находит задачи (@shared_task) во всех INSTALLED_APPS — не нужно
   регистрировать каждую задачу руками, autodiscover_tasks() сама заглянет в
   каждое приложение и подхватит его tasks.py, если он есть.

Периодичность запуска задач (расписание) настраивается ОТДЕЛЬНО — через
django-celery-beat (хранит расписание в БД, см. INSTALLED_APPS в settings.py),
а не здесь. Этот файл только про "как вообще подключиться и найти задачи".
"""
import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('config')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
