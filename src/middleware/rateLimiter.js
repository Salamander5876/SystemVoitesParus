const rateLimit = require('express-rate-limit');

// Общий rate limiter для API
const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 минута
    max: parseInt(process.env.RATE_LIMIT_MAX) || 30, // 30 запросов
    message: 'Слишком много запросов с этого IP, попробуйте позже',
    standardHeaders: true,
    legacyHeaders: false,
    // Используем x-bot-secret как ключ для запросов от бота (не IP)
    keyGenerator: (req) => {
        // Если запрос от бота (есть заголовок x-bot-secret), используем его как ключ
        if (req.headers['x-bot-secret']) {
            return `bot:${req.headers['x-bot-secret']}`;
        }
        // Иначе используем IP (работает с trust proxy)
        return req.ip;
    },
    skip: (req) => {
        // Отключаем валидацию для запросов от бота
        return !!req.headers['x-bot-secret'];
    }
});

// Строгий limiter для админ логина
const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // максимум 5 попыток
    message: 'Слишком много попыток входа, попробуйте через 15 минут',
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip
});

// Limiter для голосования - более мягкий для процесса голосования
const voteLimiter = rateLimit({
    windowMs: 60000, // 1 минута
    max: 50, // увеличен до 50 запросов (3 смены × ~10 запросов + запас)
    message: 'Too Many Requests',
    standardHeaders: true,
    legacyHeaders: false,
    // Используем VK ID из тела запроса вместо IP
    keyGenerator: (req) => {
        // Если есть vkId в теле запроса, используем его
        if (req.body && req.body.vkId) {
            return `vote:${req.body.vkId}`;
        }
        // Иначе IP (с поддержкой trust proxy)
        return `ip:${req.ip}`;
    },
    skip: (req) => {
        // НЕ пропускаем запросы - всем нужен rate limit
        return false;
    }
});

module.exports = {
    apiLimiter,
    adminLoginLimiter,
    voteLimiter
};
