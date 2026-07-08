# # backend/Dockerfile
# FROM python:3.11-slim

# # Запрещаем Python писать .pyc файлы и буферизовать вывод
# ENV PYTHONDONTWRITEBYTECODE=1
# ENV PYTHONUNBUFFERED=1

# WORKDIR /app

# RUN apt-get update && apt-get install -y --no-install-recommends \
#     build-essential \
#     libpq-dev \
#     && rm -rf /var/lib/apt/lists/*

# # Проверь, чтобы в backend/requirements.txt были: daphne, psycopg2-binary (или psycopg2)
# COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt

# COPY . .

# RUN chmod +x /app/entrypoint.sh

# EXPOSE 8000


FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ✅ Контекст сборки — корень репо (там requirements.txt), но код бэкенда
# нужен внутри /app БЕЗ вложенной папки backend/ — иначе manage.py оказывается
# по пути /app/backend/manage.py, и это маскируется bind-mount'ом ./backend:/app
# в docker-compose (dev). В офлайн-проде bind-mount'а нет — образ должен быть
# самодостаточным, поэтому копируем содержимое backend/ прямо в /app.
COPY backend/ .

EXPOSE 8000