const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'voting.db');
const migrationPath = path.join(__dirname, 'add-voters-table.sql');

try {
    const db = new Database(dbPath);
    const migration = fs.readFileSync(migrationPath, 'utf8');

    console.log('Применение миграции для таблицы избирателей...');
    db.exec(migration);
    console.log('✅ Миграция успешно применена!');

    db.close();
} catch (error) {
    console.error('❌ Ошибка при применении миграции:', error.message);
    process.exit(1);
}
