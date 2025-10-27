const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const migrationPath = path.join(__dirname, 'remove-special-candidates.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

try {
    db.exec(sql);
    console.log('Migration completed: Special candidates removed');
} catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
}
