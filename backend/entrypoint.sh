#!/bin/sh
set -e

echo "Applying database migrations (public schema)..."
python manage.py migrate_schemas --shared --noinput

echo "Initializing tenants and superusers (init_tenant.py)..."
python init_tenant.py

# ✅ Без этого шага миграции, добавленные ПОСЛЕ первого создания тенанта,
# никогда не применялись бы к уже существующим схемам тенантов — только к
# новым (через auto_create_schema в момент Company.objects.create()).
echo "Applying database migrations (all tenant schemas)..."
python manage.py migrate_schemas --noinput

echo "Syncing permissions..."
python manage.py sync_permissions

echo "Setting up daily background checks schedule (Celery Beat)..."
python manage.py bootstrap_daily_checks_schedule

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting server..."
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application