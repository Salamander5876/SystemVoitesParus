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

// Экспорт данных
router.get('/export/votes', AdminController.exportVotes);

// Логи
router.get('/logs', AdminController.getAuditLogs);

module.exports = router;
