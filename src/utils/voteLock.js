const { Mutex } = require('async-mutex');

/**
 * Простая система блокировок для голосования
 * Гарантирует что только один голос обрабатывается одновременно
 */
class VoteLock {
    constructor() {
        this.mutex = new Mutex();
    }

    /**
     * Выполнить операцию голосования с блокировкой
     * @param {Function} operation - Функция для выполнения
     * @returns {Promise} Результат операции
     */
    async executeVote(operation) {
        const release = await this.mutex.acquire();
        try {
            return await operation();
        } finally {
            release();
        }
    }

    /**
     * Проверить заблокирован ли mutex
     * @returns {boolean}
     */
    isLocked() {
        return this.mutex.isLocked();
    }
}

// Singleton instance
const voteLock = new VoteLock();

module.exports = voteLock;
