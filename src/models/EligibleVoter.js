const db = require('../config/database');

class EligibleVoter {
    // Нормализация ФИО: убираем лишние пробелы, приводим к нижнему регистру
    static normalizeName(fullName) {
        return fullName.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    // Получить всех избирателей
    static getAll() {
        const stmt = db.prepare('SELECT * FROM eligible_voters ORDER BY full_name');
        return stmt.all();
    }

    // Получить статистику
    static getStats() {
        const totalStmt = db.prepare('SELECT COUNT(*) as total FROM eligible_voters');
        const votedStmt = db.prepare('SELECT COUNT(*) as voted FROM eligible_voters WHERE has_voted = 1');

        const total = totalStmt.get().total;
        const voted = votedStmt.get().voted;

        return {
            total,
            voted,
            remaining: total - voted
        };
    }

    // Проверить, есть ли избиратель в списке
    static checkEligibility(fullName) {
        const normalized = this.normalizeName(fullName);
        const stmt = db.prepare('SELECT * FROM eligible_voters WHERE full_name_normalized = ?');
        return stmt.get(normalized);
    }

    // Отметить, что избиратель проголосовал
    static markAsVoted(fullName) {
        const normalized = this.normalizeName(fullName);
        const stmt = db.prepare(`
            UPDATE eligible_voters
            SET has_voted = 1, voted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE full_name_normalized = ?
        `);
        const result = stmt.run(normalized);
        return result.changes > 0;
    }

    // Сбросить статус голосования (для случая аннулирования голоса)
    static unmarkAsVoted(fullName) {
        const normalized = this.normalizeName(fullName);
        const stmt = db.prepare(`
            UPDATE eligible_voters
            SET has_voted = 0, voted_at = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE full_name_normalized = ?
        `);
        const result = stmt.run(normalized);
        return result.changes > 0;
    }

    // Добавить избирателя
    static add(fullName) {
        const normalized = this.normalizeName(fullName);
        const stmt = db.prepare(
            'INSERT INTO eligible_voters (full_name, full_name_normalized) VALUES (?, ?)'
        );
        try {
            const result = stmt.run(fullName.trim(), normalized);
            return result.lastInsertRowid;
        } catch (error) {
            // Игнорируем дубликаты
            if (error.code === 'SQLITE_CONSTRAINT') {
                return null;
            }
            throw error;
        }
    }

    // Массовая загрузка избирателей
    static bulkAdd(fullNames) {
        const added = [];
        const duplicates = [];
        const invalid = [];

        const insertStmt = db.prepare(
            'INSERT OR IGNORE INTO eligible_voters (full_name, full_name_normalized) VALUES (?, ?)'
        );

        const transaction = db.transaction((names) => {
            for (const name of names) {
                const trimmed = name.trim();

                // Пропускаем пустые строки
                if (!trimmed) continue;

                // Валидация ФИО (только кириллица и пробелы, минимум 5 символов)
                if (trimmed.length < 5 || !/^[а-яА-ЯёЁ\s]+$/.test(trimmed)) {
                    invalid.push(trimmed);
                    continue;
                }

                const normalized = this.normalizeName(trimmed);

                // Проверяем, есть ли уже такой избиратель
                const existing = db.prepare('SELECT id FROM eligible_voters WHERE full_name_normalized = ?').get(normalized);

                if (existing) {
                    duplicates.push(trimmed);
                } else {
                    insertStmt.run(trimmed, normalized);
                    added.push(trimmed);
                }
            }
        });

        transaction(fullNames);

        return {
            added: added.length,
            duplicates: duplicates.length,
            invalid: invalid.length,
            invalidNames: invalid
        };
    }

    // Удалить избирателя
    static delete(id) {
        const stmt = db.prepare('DELETE FROM eligible_voters WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    // Удалить всех избирателей
    static deleteAll() {
        const stmt = db.prepare('DELETE FROM eligible_voters');
        const result = stmt.run();
        return result.changes;
    }

    // Сбросить статус голосования для всех
    static resetVotingStatus() {
        const stmt = db.prepare('UPDATE eligible_voters SET has_voted = 0, voted_at = NULL, updated_at = CURRENT_TIMESTAMP');
        const result = stmt.run();
        return result.changes;
    }

    // Получить список проголосовавших
    static getVoted() {
        const stmt = db.prepare('SELECT * FROM eligible_voters WHERE has_voted = 1 ORDER BY voted_at DESC');
        return stmt.all();
    }

    // Получить список не проголосовавших
    static getNotVoted() {
        const stmt = db.prepare('SELECT * FROM eligible_voters WHERE has_voted = 0 ORDER BY full_name');
        return stmt.all();
    }
}

module.exports = EligibleVoter;
