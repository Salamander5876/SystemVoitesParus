const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error('Error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    });

    // SQLite ошибки
    if (err.code && err.code.startsWith('SQLITE_')) {
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({
                error: 'Нарушение ограничения базы данных',
                details: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        }
        return res.status(500).json({
            error: 'Ошибка базы данных',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }

    // Validation ошибки (Joi)
    if (err.isJoi) {
        return res.status(400).json({
            error: 'Ошибка валидации',
            details: err.details.map(d => d.message)
        });
    }

    // JWT ошибки
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Неверный токен' });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Токен истёк' });
    }

    // По умолчанию
    res.status(err.status || 500).json({
        error: err.message || 'Внутренняя ошибка сервера',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};

module.exports = errorHandler;
