require('dotenv').config();
const db = require('../config/database');

console.log('Добавление статуса "processing" в таблицу message_queue...\n');

try {
    // SQLite не поддерживает ALTER TABLE для изменения CHECK constraint
    // Поэтому нужно пересоздать таблицу

    console.log('1. Создание временной таблицы...');

    // Создаём новую таблицу с обновлённым CHECK constraint
    db.exec(`
        CREATE TABLE message_queue_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vk_id TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'sent', 'failed')),
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 3,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            sent_at DATETIME
        )
    `);

    console.log('✓ Временная таблица создана');

    console.log('2. Копирование данных...');

    // Копируем данные из старой таблицы в новую
    db.exec(`
        INSERT INTO message_queue_new (id, vk_id, message, status, attempts, max_attempts, error_message, created_at, sent_at)
        SELECT id, vk_id, message, status, attempts, max_attempts, error_message, created_at, sent_at
        FROM message_queue
    `);

    console.log('✓ Данные скопированы');

    console.log('3. Удаление старой таблицы...');

    // Удаляем старую таблицу
    db.exec(`DROP TABLE message_queue`);

    console.log('✓ Старая таблица удалена');

    console.log('4. Переименование новой таблицы...');

    // Переименовываем новую таблицу
    db.exec(`ALTER TABLE message_queue_new RENAME TO message_queue`);

    console.log('✓ Таблица переименована');

    console.log('5. Пересоздание индексов...');

    // Пересоздаём индексы
    db.exec(`
        CREATE INDEX idx_message_queue_status ON message_queue(status);
        CREATE INDEX idx_message_queue_created_at ON message_queue(created_at);
    `);

    console.log('✓ Индексы пересозданы');

    console.log('\n=================================');
    console.log('✅ Миграция успешно завершена!');
    console.log('=================================');
    console.log('Статус "processing" добавлен в таблицу message_queue.\n');

} catch (error) {
    console.error('\n❌ Ошибка при выполнении миграции:', error);
    process.exit(1);
}
