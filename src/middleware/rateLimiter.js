const rateLimit = require('express-rate-limit');

// Раньше хватало ЛЮБОГО значения заголовка, чтобы обойти лимит
const isBotRequest = (req) =>
    !!process.env.VK_SECRET && req.headers['x-bot-secret'] === process.env.VK_SECRET;

// Общий rate limiter для API (изменяющие запросы).
// GET-запросы страницы сюда не входят: на каждый голос каждая открытая страница
// делает 2 запроса, и при 30/мин сайт отдавал 429 уже через ~5 проголосовавших.
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
    skip: (req) => isBotRequest(req) || req.method === 'GET'
});

// Лимит на чтение публичных данных — защищает от флуда, но не от обычной работы страницы
const readLimiter = rateLimit({
    windowMs: 60000,
    max: parseInt(process.env.RATE_LIMIT_READ_MAX) || 300,
    message: 'Слишком много запросов с этого IP, попробуйте позже',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    skip: (req) => isBotRequest(req) || req.method !== 'GET'
});

// Проверка голоса по псевдониму — строгий лимит от перебора
const verifyVoteLimiter = rateLimit({
    windowMs: 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 30,
    message: 'Слишком много запросов с этого IP, попробуйте позже',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip
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
    readLimiter,
    verifyVoteLimiter,
    adminLoginLimiter,
    voteLimiter
};
