const logger = require('./logger');

/**
 * Очередь для операций с базой данных
 * Гарантирует последовательное выполнение операций записи
 */
class DatabaseQueue {
    constructor() {
        this.queue = Promise.resolve();
        this.pending = 0;
    }

    /**
     * Выполнить операцию с БД в очереди
     * @param {Function} operation - Функция, возвращающая промис
     * @param {string} description - Описание операции для логов
     * @returns {Promise}
     */
    async execute(operation, description = 'DB operation') {
        this.pending++;

        const task = this.queue.then(async () => {
            try {
                logger.debug(`Executing: ${description} (pending: ${this.pending})`);
                const startTime = Date.now();

                const result = await operation();

                const duration = Date.now() - startTime;
                logger.debug(`Completed: ${description} in ${duration}ms`);

                return result;
            } catch (error) {
                logger.error(`Error in ${description}:`, error);
                throw error;
            } finally {
                this.pending--;
            }
        });

        // Обновляем очередь
        this.queue = task.catch(() => {}); // Не прерываем цепочку при ошибках

        return task;
    }

    /**
     * Получить количество ожидающих операций
     * @returns {number}
     */
    getPendingCount() {
        return this.pending;
    }

    /**
     * Дождаться завершения всех операций
     * @returns {Promise<void>}
     */
    async waitForCompletion() {
        while (this.pending > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

// Singleton instance
const dbQueue = new DatabaseQueue();

module.exports = dbQueue;
