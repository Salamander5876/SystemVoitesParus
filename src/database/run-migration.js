const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'voting.db');
const MIGRATION_PATH = path.join(__dirname, 'migrate-voting-system.sql');

console.log('🔄 Запуск миграции базы данных...\n');

try {
    // Создаем бэкап
    const backupPath = `${DB_PATH}.backup-${Date.now()}`;
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`✅ Создан бэкап: ${backupPath}\n`);

    // Открываем базу данных
    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = OFF'); // Отключаем внешние ключи на время миграции

    // Читаем и выполняем миграцию
    const migration = fs.readFileSync(MIGRATION_PATH, 'utf-8');
    db.exec(migration);

    db.pragma('foreign_keys = ON'); // Включаем обратно
    db.close();

    console.log('✅ Миграция успешно выполнена!');
    console.log('\nИзменения:');
    console.log('- Удалены поля votes_for и votes_against из candidates');
    console.log('- Добавлено поле vote_count в candidates');
    console.log('- Изменена таблица votes: теперь один голос на смену');
    console.log('- vote_type теперь: candidate, against_all, abstain');
    console.log('- Старые голоса очищены (новая система голосования)\n');

} catch (error) {
    console.error('❌ Ошибка миграции:', error.message);
    process.exit(1);
}
