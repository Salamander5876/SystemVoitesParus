const rateLimit = require('express-rate-limit');

// Общий rate limiter для API
const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 минута
    max: parseInt(process.env.RATE_LIMIT_MAX) || 30, // 30 запросов
    message: 'Слишком много запросов с этого IP, попробуйте позже',
    standardHeaders: true,
    legacyHeaders: false,
});

// Строгий limiter для админ логина
const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // максимум 5 попыток
    message: 'Слишком много попыток входа, попробуйте через 15 минут',
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
});

// Limiter для голосования
const voteLimiter = rateLimit({
    windowMs: 60000, // 1 минута
    max: 10, // максимум 10 голосов в минуту
    message: 'Слишком много попыток голосования, подождите минуту',
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    apiLimiter,
    adminLoginLimiter,
    voteLimiter
};
