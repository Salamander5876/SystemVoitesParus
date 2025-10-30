require('dotenv').config();
const db = require('../config/database');

console.log('Начало миграции: удаление UNIQUE constraint и создание partial unique index...\n');

try {
    // Получаем текущую схему таблицы votes
    const tableInfo = db.pragma('table_info(votes)');
    console.log('Текущая схема таблицы votes:');
    console.log(tableInfo);

    // Шаг 1: Создаём новую таблицу votes_new без UNIQUE constraint
    console.log('\n1. Создание новой таблицы votes_new...');
    db.exec(`
        CREATE TABLE votes_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            shift_id INTEGER NOT NULL,
            candidate_id INTEGER,
            vote_type TEXT NOT NULL CHECK(vote_type IN ('candidate', 'against_all', 'abstain')),
            vote_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_cancelled BOOLEAN DEFAULT 0,
            cancellation_reason TEXT,
            cancelled_at DATETIME,
            cancelled_by INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
            FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE SET NULL,
            FOREIGN KEY (cancelled_by) REFERENCES admins(id)
        )
    `);
    console.log('✓ Таблица votes_new создана');

    // Шаг 2: Копируем все данные из старой таблицы
    console.log('\n2. Копирование данных из votes в votes_new...');
    db.exec(`
        INSERT INTO votes_new (
            id, user_id, shift_id, candidate_id, vote_type, vote_hash,
            created_at, is_cancelled, cancellation_reason, cancelled_at, cancelled_by
        )
        SELECT
            id, user_id, shift_id, candidate_id, vote_type, vote_hash,
            created_at, is_cancelled, cancellation_reason, cancelled_at, cancelled_by
        FROM votes
    `);
    const copiedRows = db.prepare('SELECT COUNT(*) as count FROM votes_new').get();
    console.log(`✓ Скопировано ${copiedRows.count} записей`);

    // Шаг 3: Удаляем старую таблицу
    console.log('\n3. Удаление старой таблицы votes...');
    db.exec('DROP TABLE votes');
    console.log('✓ Таблица votes удалена');

    // Шаг 4: Переименовываем новую таблицу
    console.log('\n4. Переименование votes_new в votes...');
    db.exec('ALTER TABLE votes_new RENAME TO votes');
    console.log('✓ Таблица переименована');

    // Шаг 5: Создаём partial unique index (только для неаннулированных голосов)
    console.log('\n5. Создание partial unique index...');
    db.exec(`
        CREATE UNIQUE INDEX idx_unique_active_votes
        ON votes(user_id, shift_id)
        WHERE is_cancelled = 0
    `);
    console.log('✓ Partial unique index создан');

    // Шаг 6: Пересоздаём обычные индексы
    console.log('\n6. Пересоздание индексов...');
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
        CREATE INDEX IF NOT EXISTS idx_votes_shift_id ON votes(shift_id);
        CREATE INDEX IF NOT EXISTS idx_votes_candidate_id ON votes(candidate_id);
        CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes(created_at);
        CREATE INDEX IF NOT EXISTS idx_votes_is_cancelled ON votes(is_cancelled);
    `);
    console.log('✓ Индексы созданы');

    console.log('\n=================================');
    console.log('✅ Миграция успешно завершена!');
    console.log('=================================');
    console.log('Теперь пользователи могут голосовать повторно после аннулирования.\n');

} catch (error) {
    console.error('\n❌ Ошибка при выполнении миграции:', error);
    console.error('\nВозможно, миграция уже была выполнена ранее.');
    process.exit(1);
}
