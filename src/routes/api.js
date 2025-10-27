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

module.exports = router;
