const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/auth');
const { adminLoginLimiter } = require('../middleware/rateLimiter');

// Вход администратора (без auth middleware)
router.post('/login', adminLoginLimiter, AdminController.login);

// Все остальные роуты требуют аутентификации
router.use(authMiddleware);

// Управление голосованием
router.post('/voting/control', AdminController.controlVoting);
router.post('/voting/publish-results', AdminController.publishResults);
router.post('/voting/unpublish-results', AdminController.unpublishResults);

// Управление сменами
router.get('/shifts', AdminController.getAllShifts);
router.post('/shifts', AdminController.createShift);
router.put('/shifts/:id', AdminController.updateShift);
router.delete('/shifts/:id', AdminController.deleteShift);

// Управление кандидатами
router.get('/candidates', AdminController.getAllCandidates);
router.post('/candidates', AdminController.createCandidate);
router.put('/candidates/:id', AdminController.updateCandidate);
router.delete('/candidates/:id', AdminController.deleteCandidate);

// Просмотр голосов
router.get('/votes', AdminController.getAllVotes);

// Журнал аудита голосов (с полной информацией)
router.get('/votes/audit', AdminController.getVotesAuditLog);

// Аннулирование ВСЕХ голосов пользователя по VK ID
router.post('/votes/user/:vkId/cancel', AdminController.cancelVote);

// Экспорт данных
router.get('/export/votes', AdminController.exportVotes);

// Логи
router.get('/logs', AdminController.getAuditLogs);

// Управление списком избирателей
router.get('/voters', AdminController.getAllVoters);
router.get('/voters/stats', AdminController.getVotersStats);
router.post('/voters/upload', AdminController.uploadVoters);
router.delete('/voters/:id', AdminController.deleteVoter);
router.post('/voters/clear', AdminController.clearVoters);
router.post('/voters/reset-status', AdminController.resetVotersStatus);
router.get('/export/voters', AdminController.exportVoters);

// Сброс базы данных
router.post('/database/reset', AdminController.resetDatabase);

module.exports = router;
