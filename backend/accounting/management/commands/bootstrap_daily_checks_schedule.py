# accounting/management/commands/bootstrap_daily_checks_schedule.py
"""
Разовая настройка: создаёт запись расписания в Celery Beat (django_celery_beat),
чтобы accounting.tasks.run_daily_checks выполнялась каждые 24 часа
автоматически. Идемпотентна — повторный запуск не плодит дубликаты, просто
поправит существующую запись, если что-то поменялось.

Запускать один раз после первого docker-compose up --build (аналогично
python manage.py sync_permissions — тоже разовая настройка, а не то, что
нужно повторять при каждом деплое).

    python manage.py bootstrap_daily_checks_schedule
"""
from django.core.management.base import BaseCommand
from django_celery_beat.models import IntervalSchedule, PeriodicTask

TASK_NAME = 'Ежедневная проверка склада (снапшоты + остатки)'


class Command(BaseCommand):
    help = 'Создаёт/обновляет расписание Celery Beat для accounting.run_daily_checks (раз в 24 часа).'

    def handle(self, *args, **options):
        schedule, _ = IntervalSchedule.objects.get_or_create(
            every=24, period=IntervalSchedule.HOURS,
        )
        task, created = PeriodicTask.objects.get_or_create(
            name=TASK_NAME,
            defaults={'interval': schedule, 'task': 'accounting.run_daily_checks'},
        )
        if not created:
            task.interval = schedule
            task.task = 'accounting.run_daily_checks'
            task.enabled = True
            task.save()

        action = 'создано' if created else 'обновлено'
        self.stdout.write(self.style.SUCCESS(
            f"Расписание {action}: «{task.name}» — каждые 24 часа (task={task.task})"
        ))
