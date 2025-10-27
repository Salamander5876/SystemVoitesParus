const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../database/voting.db');

// Создаём директорию для БД если её нет
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('✓ Database connected');
        // Включаем foreign keys
        db.run('PRAGMA foreign_keys = ON');
        db.run('PRAGMA journal_mode = WAL');
    }
});

// Обертка для синхронного API (как в better-sqlite3)
const dbWrapper = {
    prepare: (sql) => {
        return {
            run: (...params) => {
                return new Promise((resolve, reject) => {
                    db.run(sql, params, function(err) {
                        if (err) reject(err);
                        else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
                    });
                });
            },
            get: (...params) => {
                return new Promise((resolve, reject) => {
                    db.get(sql, params, (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });
            },
            all: (...params) => {
                return new Promise((resolve, reject) => {
                    db.all(sql, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });
            }
        };
    },
    exec: (sql) => {
        return new Promise((resolve, reject) => {
            db.exec(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },
    run: (sql, ...params) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastInsertRowid: this.lastID, changes: this.changes });
            });
        });
    },
    transaction: (fn) => {
        return async (...args) => {
            await dbWrapper.run('BEGIN TRANSACTION');
            try {
                const result = await fn(...args);
                await dbWrapper.run('COMMIT');
                return result;
            } catch (error) {
                await dbWrapper.run('ROLLBACK');
                throw error;
            }
        };
    }
};

module.exports = dbWrapper;
