/**
 * Миграция: кэширование VK-данных пользователя (ФИО, ссылка, фото) в таблице users
 * + гарантия уникальности псевдонимов (nickname) на уровне БД.
 *
 * Что делает:
 *  1. Добавляет в users колонки vk_first_name, vk_last_name, vk_photo_url, vk_screen_name.
 *  2. Устраняет уже существующие дубли псевдонимов (последствие старой гонки).
 *  3. Создаёт UNIQUE-индекс на nickname, чтобы гонка больше не могла выдать одинаковые ники.
 *
 * Идемпотентна: повторный запуск ничего не ломает.
 */
require('dotenv').config();

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(__dirname, 'voting.db');

console.log('Миграция VK-кэша. База:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.error('❌ Файл базы данных не найден!');
    process.exit(1);
}

const db = new Database(dbPath);

function columnExists(table, column) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(c => c.name === column);
}

try {
    db.pragma('foreign_keys = OFF');

    const migrate = db.transaction(() => {
        // 1. Новые колонки кэша
        const newColumns = [
            ['vk_first_name', 'TEXT'],
            ['vk_last_name', 'TEXT'],
            ['vk_photo_url', 'TEXT'],
            ['vk_screen_name', 'TEXT']
        ];

        for (const [name, type] of newColumns) {
            if (!columnExists('users', name)) {
                db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
                console.log(`  + колонка users.${name}`);
            } else {
                console.log(`  = колонка users.${name} уже есть`);
            }
        }

        // 2. Устраняем дубли псевдонимов
        const duplicates = db.prepare(`
            SELECT nickname, COUNT(*) as cnt
            FROM users
            WHERE nickname IS NOT NULL AND nickname != ''
            GROUP BY nickname
            HAVING cnt > 1
        `).all();

        if (duplicates.length > 0) {
            console.log(`  ! найдено дублирующихся псевдонимов: ${duplicates.length}, исправляю...`);

            // Набор всех занятых ников (для генерации уникальных суффиксов)
            const used = new Set(
                db.prepare(`SELECT nickname FROM users WHERE nickname IS NOT NULL AND nickname != ''`)
                    .all()
                    .map(r => r.nickname)
            );

            const updateStmt = db.prepare('UPDATE users SET nickname = ? WHERE id = ?');

            for (const dup of duplicates) {
                // Оставляем первого владельца как есть, остальным добавляем суффикс
                const rows = db.prepare(
                    'SELECT id FROM users WHERE nickname = ? ORDER BY id ASC'
                ).all(dup.nickname);

                for (let i = 1; i < rows.length; i++) {
                    let suffix = 2;
                    let candidate;
                    do {
                        candidate = `${dup.nickname} ${suffix}`;
                        suffix++;
                    } while (used.has(candidate));
                    used.add(candidate);
                    updateStmt.run(candidate, rows[i].id);
                    console.log(`    "${dup.nickname}" (id=${rows[i].id}) -> "${candidate}"`);
                }
            }
        } else {
            console.log('  = дубликатов псевдонимов нет');
        }

        // 3. UNIQUE-индекс на nickname
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_nickname ON users(nickname)');
        console.log('  + UNIQUE индекс idx_unique_nickname');
    });

    migrate();
    db.pragma('foreign_keys = ON');

    console.log('✅ Миграция VK-кэша выполнена успешно');
    db.close();
} catch (error) {
    console.error('❌ Ошибка миграции:', error.message);
    db.close();
    process.exit(1);
}
