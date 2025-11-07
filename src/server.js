require('dotenv').config();

// Установка часового пояса Asia/Chita
process.env.TZ = 'Asia/Chita';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Routes
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const botWebhookRoutes = require('./routes/botWebhook');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// Trust proxy (для корректной работы за Nginx)
app.set('trust proxy', true);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статические файлы
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting для API
app.use('/api', apiLimiter);

// Сохраняем io в app для доступа из контроллеров
app.set('io', io);

// Routes
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/bot', botWebhookRoutes); // VK Callback API webhook

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Админ страницы
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});

// WebSocket events
io.on('connection', (socket) => {
    logger.info('Client connected:', socket.id);

    socket.on('subscribe_shift', (shiftId) => {
        socket.join(`shift_${shiftId}`);
        logger.info(`Client ${socket.id} subscribed to shift ${shiftId}`);
    });

    socket.on('unsubscribe_shift', (shiftId) => {
        socket.leave(`shift_${shiftId}`);
        logger.info(`Client ${socket.id} unsubscribed from shift ${shiftId}`);
    });

    socket.on('disconnect', () => {
        logger.info('Client disconnected:', socket.id);
    });
});

// Error handler (должен быть последним)
app.use(errorHandler);

// Функция для отправки обновлений таймера, статуса и статистики через Socket.IO
function broadcastTimerUpdate() {
    const Settings = require('./models/Settings');
    const Vote = require('./models/Vote');
    const status = Settings.getVotingStatus();
    const endTime = Settings.getEndTime();

    // Получаем количество уникальных проголосовавших
    const uniqueVoters = Vote.getUniqueVotersCount();

    if (status === 'active' && endTime) {
        const now = new Date();
        const end = new Date(endTime);
        const diff = end - now;

        io.emit('timer_update', {
            endTime: endTime,
            timeLeft: Math.max(0, diff),
            status: status,
            uniqueVoters: uniqueVoters
        });
    } else {
        io.emit('timer_update', {
            endTime: null,
            timeLeft: 0,
            status: status,
            uniqueVoters: uniqueVoters
        });
    }
}

// Отправляем обновления таймера каждые 2 секунды
setInterval(broadcastTimerUpdate, 1000);

// Запуск сервера
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`WebSocket server ready`);

    // Отправляем первое обновление таймера через 1 секунду после старта
    setTimeout(broadcastTimerUpdate, 1000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

module.exports = { app, server, io };
