require('dotenv').config();

// Установка часового пояса Asia/Chita
process.env.TZ = 'Asia/Chita';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter, readLimiter } = require('./middleware/rateLimiter');

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

// Trust proxy (для корректной работы за Nginx на этом же сервере).
// 'loopback' вместо true: с true req.ip брался из подделываемого клиентом X-Forwarded-For.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статические файлы
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting для API
app.use('/api', apiLimiter, readLimiter);

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
    logger.info(`Client connected: ${socket.id}`);

    socket.on('subscribe_shift', (shiftId) => {
        socket.join(`shift_${shiftId}`);
        logger.info(`Client ${socket.id} subscribed to shift ${shiftId}`);
    });

    socket.on('unsubscribe_shift', (shiftId) => {
        socket.leave(`shift_${shiftId}`);
        logger.info(`Client ${socket.id} unsubscribed from shift ${shiftId}`);
    });

    socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
    });
});

// Error handler (должен быть последним)
app.use(errorHandler);

// Функция для отправки обновлений таймера, статуса и статистики через Socket.IO
function broadcastTimerUpdate() {
    // Без try/catch любое исключение (например SQLITE_BUSY) внутри setInterval
    // становится uncaughtException и роняет весь процесс.
    try {
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
    } catch (error) {
        logger.error('Error broadcasting timer update:', error);
    }
}

// Отправляем обновления таймера каждую секунду
const timerUpdateInterval = setInterval(broadcastTimerUpdate, 1000);

// ---------------------------------------------------------
// Автоматическое завершение выборов по таймеру
// ---------------------------------------------------------
async function checkElectionTimeout() {
    try {
        const Settings = require('./models/Settings');
        const status = Settings.getVotingStatus();
        const endTime = Settings.getEndTime();

        // Проверяем только если выборы активны и есть время окончания
        if (status !== 'active' || !endTime) {
            return;
        }

        const now = new Date();
        const end = new Date(endTime);

        // Если время вышло
        if (now >= end) {
            // АТОМАРНАЯ ОПЕРАЦИЯ: Используем транзакцию для проверки и установки флага
            const db = require('./config/database');

            let shouldSendNotifications = false;

            // Выполняем транзакцию для атомарной проверки и установки флага
            const transaction = db.transaction(() => {
                const autoFinishSent = Settings.get('auto_finish_notification_sent');

                if (autoFinishSent === 'true') {
                    // Уведомления уже были отправлены
                    return false;
                }

                // Устанавливаем флаг
                Settings.set('auto_finish_notification_sent', 'true');
                return true;
            });

            try {
                shouldSendNotifications = transaction();
            } catch (error) {
                logger.error('Error in auto-finish transaction:', error);
                return;
            }

            // Если уведомления уже были отправлены, просто останавливаем голосование
            if (!shouldSendNotifications) {
                Settings.stopVoting();
                logger.info('Auto-finish: Notifications already sent, just stopping voting');
                return;
            }

            logger.info(`Election time expired, automatically finishing elections [PID: ${process.pid}]`);

            // Останавливаем голосование
            Settings.stopVoting();

            // Получаем всех пользователей для рассылки
            const User = require('./models/User');
            const MessageQueue = require('./models/MessageQueue');
            const users = User.getAll();

            if (users.length > 0) {
                const message = '🗳 Выборы завершились!\n\nСпасибо за участие. Результаты будут опубликованы в ближайшее время. Вы получите уведомление, когда результаты будут доступны.';

                users.forEach(user => {
                    MessageQueue.enqueue(user.vk_id, message);
                });

                logger.info(`Auto-finish: Elections closed notification queued for ${users.length} users`);
            }

            // Логируем автоматическое завершение
            const Admin = require('./models/Admin');
            Admin.logAction(1, 'AUTO_FINISH_ELECTIONS', 'Выборы автоматически завершены по таймеру', 'system');

            // Отправляем обновление всем клиентам через Socket.IO
            io.emit('voting_status_changed', {
                status: 'finished',
                message: 'Выборы автоматически завершены'
            });
        }

    } catch (error) {
        logger.error('Error checking election timeout:', error);
    }
}

// Проверяем таймер каждые 10 секунд
const electionCheckInterval = setInterval(checkElectionTimeout, 10000);

// Первая проверка через 5 секунд после старта
const electionCheckTimeout = setTimeout(checkElectionTimeout, 5000);

logger.info('Auto-finish election timer initialized (checking every 10 seconds)');

// Запуск сервера
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`WebSocket server ready`);

    // Отправляем первое обновление таймера через 1 секунду после старта
    setTimeout(broadcastTimerUpdate, 1000);
});

// ---------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------
// server.close() сам по себе НЕ завершается, пока открыты WebSocket-соединения
// Socket.IO и keep-alive соединения — из-за этого процесс висел до SIGKILL от PM2.
// Поэтому: останавливаем таймеры и бота, закрываем io (отключает клиентов и
// закрывает HTTP-сервер), принудительно рвём оставшиеся соединения, закрываем БД.
const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT) || 8000;
let isShuttingDown = false;

async function shutdown(signal, exitCode = 0) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`${signal} received, shutting down gracefully [PID: ${process.pid}]`);

    // Страховка: если что-то зависло — выходим сами, не дожидаясь SIGKILL
    setTimeout(() => {
        logger.error(`Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT}ms, forcing exit`);
        process.exit(1);
    }, SHUTDOWN_TIMEOUT).unref();

    try {
        clearInterval(timerUpdateInterval);
        clearInterval(electionCheckInterval);
        clearTimeout(electionCheckTimeout);

        // Таймеры очереди сообщений и long poll бота (bot.js подключается через routes/botWebhook)
        await require('./bot').stopBot();

        // Закрываем idle keep-alive соединения сразу, активные — через 3 секунды
        server.closeIdleConnections?.();
        const forceCloseTimer = setTimeout(() => server.closeAllConnections?.(), 3000);
        forceCloseTimer.unref();

        // io.close() отключает всех клиентов Socket.IO и вызывает server.close()
        await new Promise((resolve) => {
            io.close((err) => {
                if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') {
                    logger.error('Error closing server:', err);
                }
                resolve();
            });
        });
        clearTimeout(forceCloseTimer);
        logger.info('HTTP and WebSocket server closed');

        const db = require('./config/database');
        if (db.open) {
            db.close();
            logger.info('Database connection closed');
        }
    } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        exitCode = 1;
    }

    process.exit(exitCode);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception, shutting down:', error);
    shutdown('uncaughtException', 1);
});

module.exports = { app, server, io };
