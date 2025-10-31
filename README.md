# Система голосования "Парус"

Веб-система для проведения анонимного голосования с поддержкой нескольких смен и интеграцией с VK ботом.

## Возможности

- 📊 **Голосование по сменам** - поддержка нескольких смен с отдельными кандидатами
- 🤖 **VK бот** - голосование через ВКонтакте с анонимностью
- 🔐 **Анонимность** - использование псевдонимов и хеширование голосов
- 📈 **Админ-панель** - управление выборами, кандидатами, результатами
- 📱 **Адаптивный дизайн** - работает на всех устройствах
- 🔔 **Рассылки** - автоматические уведомления о результатах
- 📋 **Список избирателей** - контроль по ФИО
- 📊 **Экспорт данных** - выгрузка результатов в Excel
- ⚡ **Реалтайм обновления** - WebSocket для мгновенного обновления результатов

## Технологии

- **Backend**: Node.js, Express
- **Database**: SQLite3
- **Bot**: VK-IO
- **Frontend**: Vanilla JS, CSS3
- **Real-time**: Socket.IO

## Требования

- Node.js >= 18.x
- npm >= 9.x
- VK группа для бота

## Установка на VPS

### 1. Подготовка сервера

```bash
# Обновление системы (Ubuntu/Debian)
sudo apt update && sudo apt upgrade -y

# Установка Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка версий
node --version
npm --version

# Установка PM2 (менеджер процессов)
sudo npm install -g pm2

# Установка Nginx (опционально, для reverse proxy)
sudo apt install -y nginx
```

### 2. Клонирование проекта

```bash
# Создание директории для проекта
cd /var/www
sudo mkdir voting-system
sudo chown $USER:$USER voting-system

# Загрузка проекта (замените на ваш путь)
cd voting-system
# Скопируйте файлы проекта на сервер через SCP, FTP или Git
```

### 3. Настройка проекта

```bash
# Переход в директорию проекта
cd /var/www/voting-system

# Установка зависимостей
npm install

# Создание файла .env
cp .env.example .env
nano .env
```

### 4. Конфигурация .env

Отредактируйте файл `.env`:

```env
# Node Environment
NODE_ENV=production
PORT=3000
BOT_API_PORT=3001
BOT_API_URL=http://localhost:3001
SITE_URL=https://ваш-домен.com

# VK Bot Configuration
VK_TOKEN=ваш_vk_токен
VK_GROUP_ID=ваш_group_id
VK_CONFIRMATION=код_подтверждения
VK_SECRET=секретный_ключ

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=СильныйПароль123!

# Security (сгенерируйте случайные строки)
JWT_SECRET=ваш_длинный_случайный_jwt_secret_минимум_32_символа
JWT_EXPIRES_IN=86400
VOTE_SALT=ваш_длинный_случайный_salt_минимум_32_символа
SESSION_SECRET=ваш_session_secret

# Database
DB_PATH=./src/database/voting.db
DB_BACKUP_INTERVAL=3600000

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=30

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# Optional
ENABLE_CORS=true
CORS_ORIGIN=https://ваш-домен.com
MAX_VOTE_ATTEMPTS=3
VOTING_TIME_LIMIT=28800
```

### 5. Инициализация базы данных

```bash
# Создание и инициализация БД
npm run init-db
```

### 6. Настройка VK бота

1. Создайте сообщество ВКонтакте
2. Перейдите в **Управление** → **Работа с API**
3. Создайте ключ доступа с правами:
   - Доступ к сообщениям сообщества
   - Управление сообществом
4. В настройках **Сообщения** → **Настройки для бота**:
   - Включите "Возможности ботов"
   - Включите "Разрешить добавлять сообщество в беседы"
5. В **Long Poll API**:
   - Включите Long Poll API
   - Версия API: 5.131 или выше
   - Включите типы событий: `message_new`

### 7. Запуск через PM2

```bash
# Запуск приложения
pm2 start npm --name "voting-system" -- start

# Проверка статуса
pm2 status

# Просмотр логов
pm2 logs voting-system

# Автозапуск при перезагрузке
pm2 startup
pm2 save

# Остановка
pm2 stop voting-system

# Перезапуск
pm2 restart voting-system
```

### 8. Настройка Nginx (опционально)

Создайте конфигурацию Nginx:

```bash
sudo nano /etc/nginx/sites-available/voting-system
```

Добавьте конфигурацию:

```nginx
server {
    listen 80;
    server_name ваш-домен.com www.ваш-домен.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Активируйте конфигурацию:

```bash
sudo ln -s /etc/nginx/sites-available/voting-system /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 9. Настройка SSL (Let's Encrypt)

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получение сертификата
sudo certbot --nginx -d ваш-домен.com -d www.ваш-домен.com

# Автоматическое обновление
sudo certbot renew --dry-run
```

### 10. Настройка файрвола

```bash
# Открытие портов
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
sudo ufw status
```

## Локальная разработка

### Установка

```bash
# Клонирование репозитория
git clone <repository-url>
cd voting-system

# Установка зависимостей
npm install

# Настройка .env
cp .env.example .env
# Отредактируйте .env для локальной разработки

# Инициализация БД
npm run init-db
```

### Запуск

```bash
# Запуск в режиме разработки (с auto-reload)
npm run dev

# Запуск в обычном режиме
npm start

# Запуск только сервера
npm run start:server

# Запуск только бота
npm run start:bot
```

Приложение будет доступно:
- Веб-интерфейс: http://localhost:3000
- Админ-панель: http://localhost:3000/admin.html
- Bot API: http://localhost:3001

### Доступ к админ-панели

По умолчанию:
- **Логин**: admin
- **Пароль**: Admin123!

⚠️ **ВАЖНО**: Обязательно смените пароль после первого входа!

## Структура проекта

```
voting-system/
├── src/
│   ├── bot.js                    # VK бот
│   ├── server.js                 # Веб-сервер
│   ├── config/
│   │   └── database.js           # Конфигурация БД
│   ├── controllers/
│   │   ├── adminController.js    # Контроллер админки
│   │   └── statsController.js    # Контроллер статистики
│   ├── database/
│   │   ├── init.sql              # SQL схема
│   │   └── voting.db             # База данных SQLite
│   ├── middleware/
│   │   ├── auth.js               # Аутентификация
│   │   └── rateLimiter.js        # Rate limiting
│   ├── models/                   # Модели данных
│   ├── routes/                   # API роуты
│   └── utils/
│       ├── logger.js             # Логирование
│       └── timezone.js           # Работа с временем
├── public/
│   ├── index.html                # Главная страница
│   ├── admin.html                # Страница входа админа
│   ├── admin-dashboard.html      # Админ-панель
│   ├── css/                      # Стили
│   └── js/                       # Frontend JavaScript
├── scripts/
│   ├── init-db.js                # Инициализация БД
│   └── backup.js                 # Резервное копирование
├── logs/                         # Логи приложения
├── .env                          # Переменные окружения
├── .env.example                  # Пример .env
├── package.json                  # Зависимости
└── README.md                     # Документация
```

## API Endpoints

### Публичные

- `GET /` - Главная страница с результатами
- `GET /api/stats/votes` - Получение голосов
- `GET /api/stats/shifts` - Список смен
- `GET /api/stats/candidates/:shiftId` - Кандидаты по смене

### Админские (требуют авторизации)

- `POST /api/admin/login` - Вход
- `POST /api/admin/voting/control` - Управление голосованием
- `POST /api/admin/voting/publish-results` - Публикация результатов
- `POST /api/admin/broadcast/elections-closed` - Рассылка о завершении
- `POST /api/admin/broadcast/results` - Рассылка результатов
- `GET /api/admin/shifts` - Управление сменами
- `GET /api/admin/candidates` - Управление кандидатами
- `GET /api/admin/votes` - Просмотр голосов
- `POST /api/admin/votes/user/:vkId/cancel` - Аннулирование голосов
- `GET /api/admin/voters` - Управление списком избирателей
- `GET /api/admin/export/votes` - Экспорт в Excel

## Команды NPM

```bash
npm start              # Запуск сервера и бота
npm run dev            # Разработка с auto-reload
npm run start:server   # Только веб-сервер
npm run start:bot      # Только VK бот
npm run init-db        # Инициализация БД
npm run backup         # Резервное копирование БД
npm run test-bot       # Тест подключения бота
```

## Резервное копирование

### Автоматическое

База данных автоматически резервируется каждый час в директорию `backups/`.

### Ручное

```bash
# Создание резервной копии
npm run backup

# Копирование на другой сервер
scp backups/voting-backup-*.db user@remote-server:/path/to/backups/
```

## Мониторинг и логи

### PM2 логи

```bash
# Просмотр логов в реальном времени
pm2 logs voting-system

# Просмотр только ошибок
pm2 logs voting-system --err

# Очистка логов
pm2 flush
```

### Логи приложения

Логи хранятся в `logs/app.log`

```bash
# Просмотр последних логов
tail -f logs/app.log

# Поиск ошибок
grep ERROR logs/app.log
```

## Обновление приложения

```bash
# Остановка приложения
pm2 stop voting-system

# Обновление кода (git pull или загрузка новых файлов)
# ...

# Установка новых зависимостей
npm install

# Применение миграций БД (если есть)
# npm run migrate

# Перезапуск
pm2 restart voting-system

# Проверка статуса
pm2 status
```

## Решение проблем

### Бот не отвечает

1. Проверьте логи: `pm2 logs voting-system`
2. Убедитесь, что VK токен действителен
3. Проверьте настройки Long Poll в VK
4. Убедитесь, что порт 3001 не заблокирован

### Ошибки базы данных

```bash
# Пересоздание БД (УДАЛИТ ВСЕ ДАННЫЕ!)
rm src/database/voting.db
npm run init-db
```

### Высокая нагрузка

```bash
# Мониторинг ресурсов
pm2 monit

# Увеличение лимитов PM2
pm2 restart voting-system --max-memory-restart 500M
```

### Проблемы с SSL

```bash
# Проверка сертификата
sudo certbot certificates

# Обновление сертификата
sudo certbot renew --force-renewal
```

## Безопасность

1. ✅ Используйте сильные пароли в `.env`
2. ✅ Настройте файрвол (UFW)
3. ✅ Используйте HTTPS (SSL сертификат)
4. ✅ Регулярно обновляйте зависимости: `npm audit fix`
5. ✅ Ограничьте доступ к БД
6. ✅ Делайте регулярные резервные копии
7. ✅ Смените стандартный пароль админа
8. ✅ Используйте rate limiting (уже настроен)

## Поддержка

При возникновении проблем:

1. Проверьте логи: `pm2 logs voting-system`
2. Проверьте статус: `pm2 status`
3. Проверьте конфигурацию `.env`
4. Убедитесь, что все зависимости установлены: `npm install`

## Лицензия

MIT License

---

**Разработано для лагеря "Парус"**
