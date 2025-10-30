const express = require('express');
const router = express.Router();
const StatsController = require('../controllers/statsController');
const VoteController = require('../controllers/voteController');
const { voteLimiter } = require('../middleware/rateLimiter');

// Публичные эндпоинты

// Статус голосования
router.get('/status', StatsController.getStatus);

// Список смен
router.get('/shifts', StatsController.getShifts);

// Кандидаты по смене
router.get('/shifts/:shiftId/candidates', StatsController.getCandidatesByShift);

// Статистика по смене
router.get('/shifts/:shiftId/stats', StatsController.getShiftStats);

// Общая статистика
router.get('/stats', StatsController.getOverallStats);

// Создание голоса (только от бота с секретным ключом)
router.post('/vote', voteLimiter, (req, res, next) => {
    // Проверка секретного ключа бота
    const botSecret = req.headers['x-bot-secret'];
    if (botSecret !== process.env.VK_SECRET) {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
}, VoteController.createVote);

// Статистика пользователя
router.get('/users/:vkId/stats', VoteController.getUserStats);

// Публичный журнал голосов (с VK именами)
router.get('/votes/public-log', StatsController.getPublicVotesLog);

// Результаты выборов
router.get('/election-results', StatsController.getElectionResults);

// Получить все псевдонимы (для проверки уникальности при генерации)
router.get('/users/nicknames', async (req, res) => {
    try {
        const db = req.app.locals.db; // Получаем db из app
        const users = await db.all('SELECT nickname FROM users WHERE nickname IS NOT NULL AND nickname != ""');
        const nicknames = users.map(u => u.nickname).filter(Boolean);
        res.json({ nicknames });
    } catch (error) {
        console.error('Error fetching nicknames:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Проверить избирателя по ФИО (для бота)
router.post('/check-voter', (req, res, next) => {
    // Проверка секретного ключа бота
    const botSecret = req.headers['x-bot-secret'];
    if (botSecret !== process.env.VK_SECRET) {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
}, VoteController.checkVoterEligibility);

// Генерация уникального псевдонима (для бота)
router.post('/generate-nickname', (req, res, next) => {
    // Проверка секретного ключа бота
    const botSecret = req.headers['x-bot-secret'];
    if (botSecret !== process.env.VK_SECRET) {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    next();
}, VoteController.generateNickname);

module.exports = router;
