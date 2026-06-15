# Фронтенд + Nginx (frontend/Dockerfile)
# Этап 1: Сборка React статики
# FROM node:20-alpine AS builder
# FROM node:22-alpine AS builder
FROM node:22 AS builder
WORKDIR /app
COPY package*.json ./
# RUN npm install

# Используем ci вместо install для стабильности
# Увеличиваем лимит памяти для процесса node
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm ci --no-audit --prefer-offline --legacy-peer-deps

COPY . .
RUN npm run build

# Этап 2: Финальный образ Nginx
FROM nginx:1.25-alpine
# Копируем скомпилированный фронтенд в папку веб-сервера
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
EXPOSE 443
CMD ["nginx", "-g", "daemon off;"]