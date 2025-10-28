const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'voting.db');
const migrationPath = path.join(__dirname, 'add-vote-cancellation.sql');

console.log('Database path:', dbPath);
console.log('Migration file:', migrationPath);

const db = new Database(dbPath);

try {
    const migration = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration...');
    db.exec(migration);

    console.log('✅ Migration completed successfully!');

    // Проверяем структуру таблицы
    const tableInfo = db.prepare("PRAGMA table_info(votes)").all();
    console.log('\nTable structure:');
    console.log(tableInfo);

} catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
} finally {
    db.close();
}
