const express = require('express');
const router = express.Router();
const vk = require('../bot');
const logger = require('../utils/logger');

// Middleware для парсинга тела запроса
router.use(express.json());

// Endpoint для VK Callback API
router.post('/webhook', async (req, res) => {
    try {
        const { type, secret, object, group_id } = req.body;

        // Проверка секретного ключа
        if (secret && secret !== process.env.VK_SECRET) {
            logger.warn('Invalid secret key from VK webhook');
            return res.status(403).send('Invalid secret');
        }

        // Подтверждение сервера
        if (type === 'confirmation') {
            logger.info('VK Webhook confirmation request');
            return res.send(process.env.VK_CONFIRMATION);
        }

        // Обработка события
        if (type) {
            // Передаём событие в VK-IO для обработки
            await vk.updates.handleWebhookUpdate({
                type,
                object,
                group_id: parseInt(group_id)
            });

            // Отправляем ответ VK что событие получено
            res.send('ok');

            logger.info(`Webhook event processed: ${type}`);
        } else {
            res.status(400).send('Bad Request');
        }
    } catch (error) {
        logger.error('Webhook processing error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mode: 'webhook',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
