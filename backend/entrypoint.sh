#!/bin/sh
set -e

echo "Applying database migrations..."
python manage.py migrate_schemas --shared --noinput

echo "Initializing tenants and superusers (init_tenant.py)..."
python init_tenant.py

echo "Syncing permissions..."
python manage.py sync_permissions

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Starting server..."
exec daphne -b 0.0.0.0 -p 8000 config.asgi:application