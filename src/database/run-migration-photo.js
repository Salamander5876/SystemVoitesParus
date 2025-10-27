const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../../voting.db');
const migrationPath = path.join(__dirname, 'remove-photo-url.sql');

console.log('Starting migration: Remove photo_url from candidates...');
console.log('Database:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.error('❌ Database file not found!');
    process.exit(1);
}

try {
    const db = new Database(dbPath);
    const migration = fs.readFileSync(migrationPath, 'utf-8');

    console.log('Executing migration...');
    db.exec(migration);

    console.log('✅ Migration completed successfully!');
    console.log('Backup table created: candidates_backup_photo');

    db.close();
} catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
}
