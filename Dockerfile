FROM node:18-alpine

# Установка зависимостей для SQLite
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/

# Создаём необходимые директории
RUN mkdir -p logs database backups

# Права доступа
RUN chown -R node:node /app

# Переключаемся на пользователя node
USER node

# Expose порт
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Запуск приложения
CMD ["node", "src/server.js"]
