require('dotenv').config();
const db = require('../config/database');

console.log('Добавление таблицы message_queue...\n');

try {
    // Проверяем, существует ли таблица
    const tableExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='message_queue'
    `).get();

    if (tableExists) {
        console.log('⚠️  Таблица message_queue уже существует.');
        process.exit(0);
    }

    // Создаём таблицу очереди сообщений
    db.exec(`
        CREATE TABLE message_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vk_id TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 3,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            sent_at DATETIME
        )
    `);

    console.log('✓ Таблица message_queue создана');

    // Создаём индексы
    db.exec(`
        CREATE INDEX idx_message_queue_status ON message_queue(status);
        CREATE INDEX idx_message_queue_created_at ON message_queue(created_at);
    `);

    console.log('✓ Индексы созданы');

    console.log('\n=================================');
    console.log('✅ Миграция успешно завершена!');
    console.log('=================================');
    console.log('Таблица message_queue готова к использованию.\n');

} catch (error) {
    console.error('\n❌ Ошибка при выполнении миграции:', error);
    process.exit(1);
}
