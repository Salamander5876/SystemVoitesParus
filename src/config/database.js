const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../database/voting.db');

// Создаём директорию для БД если её нет
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null,
    timeout: 10000 // 10 секунд таймаут для занятой БД
});

// Оптимизация для конкурентного доступа
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL'); // Write-Ahead Logging для лучшей конкурентности
db.pragma('synchronous = NORMAL'); // Баланс между скоростью и надёжностью
db.pragma('cache_size = -64000'); // 64MB кэш
db.pragma('temp_store = MEMORY'); // Временные таблицы в памяти
db.pragma('mmap_size = 30000000000'); // Memory-mapped I/O
db.pragma('busy_timeout = 10000'); // 10 секунд ожидания при блокировке

// Функция для безопасного выполнения операций с повторными попытками
db.safeRun = function(stmt, ...params) {
    const maxRetries = 3;
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return stmt.run(...params);
        } catch (error) {
            lastError = error;
            if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
                // Ждём и повторяем
                const waitTime = Math.min(100 * Math.pow(2, i), 1000);
                const start = Date.now();
                while (Date.now() - start < waitTime) {
                    // Активное ожидание
                }
                continue;
            }
            throw error;
        }
    }
    throw lastError;
};

module.exports = db;
