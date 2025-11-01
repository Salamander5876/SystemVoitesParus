const logger = require('./logger');

/**
 * Система очередей для обработки сообщений бота
 * Решает проблемы с конкурентным доступом к БД
 */
class BotMessageQueue {
    constructor() {
        this.queues = new Map(); // userId -> Promise chain
        this.processing = new Map(); // userId -> boolean
    }

    /**
     * Добавить задачу в очередь пользователя
     * @param {number} userId - ID пользователя
     * @param {Function} task - Асинхронная функция для выполнения
     * @returns {Promise} - Результат выполнения задачи
     */
    async enqueue(userId, task) {
        // Получаем или создаём цепочку промисов для пользователя
        const existingChain = this.queues.get(userId) || Promise.resolve();

        // Создаём новую цепочку, добавляя задачу
        const newChain = existingChain
            .then(async () => {
                this.processing.set(userId, true);
                try {
                    logger.debug(`Processing task for user ${userId}`);
                    const result = await task();
                    return result;
                } catch (error) {
                    logger.error(`Task error for user ${userId}:`, error);
                    throw error;
                } finally {
                    this.processing.set(userId, false);
                }
            })
            .catch((error) => {
                // Логируем ошибку, но не прерываем цепочку
                logger.error(`Error in queue for user ${userId}:`, error);
                throw error;
            });

        // Сохраняем новую цепочку
        this.queues.set(userId, newChain);

        // Очищаем очередь после выполнения, если больше нет задач
        newChain.finally(() => {
            if (!this.processing.get(userId)) {
                this.queues.delete(userId);
            }
        });

        return newChain;
    }

    /**
     * Проверить, обрабатывается ли сейчас сообщение от пользователя
     * @param {number} userId - ID пользователя
     * @returns {boolean}
     */
    isProcessing(userId) {
        return this.processing.get(userId) || false;
    }

    /**
     * Получить размер очереди
     * @returns {number}
     */
    getSize() {
        return this.queues.size;
    }

    /**
     * Очистить очередь пользователя (например, при /start)
     * @param {number} userId - ID пользователя
     */
    clear(userId) {
        this.queues.delete(userId);
        this.processing.delete(userId);
        logger.debug(`Cleared queue for user ${userId}`);
    }

    /**
     * Очистить все очереди
     */
    clearAll() {
        this.queues.clear();
        this.processing.clear();
        logger.info('All queues cleared');
    }
}

// Singleton instance
const botMessageQueue = new BotMessageQueue();

module.exports = botMessageQueue;
