const db = require('../config/database');

class MessageQueue {
    // Добавить сообщение в очередь
    static enqueue(vkId, message) {
        // Используем транзакцию для атомарной операции проверки и вставки
        const transaction = db.transaction(() => {
            // Проверяем, нет ли уже такого же pending сообщения для этого пользователя
            const checkStmt = db.prepare(`
                SELECT id FROM message_queue
                WHERE vk_id = ? AND message = ? AND status = 'pending'
                LIMIT 1
            `);
            const existing = checkStmt.get(vkId.toString(), message);

            // Если уже есть такое же pending сообщение, возвращаем его id
            if (existing) {
                return existing.id;
            }

            // Иначе добавляем новое
            const stmt = db.prepare(`
                INSERT INTO message_queue (vk_id, message)
                VALUES (?, ?)
            `);
            const result = stmt.run(vkId.toString(), message);
            return result.lastInsertRowid;
        });

        return transaction();
    }

    // Получить все ожидающие отправки сообщения
    static getPending(limit = 100) {
        const stmt = db.prepare(`
            SELECT * FROM message_queue
            WHERE status = 'pending'
            AND attempts < max_attempts
            ORDER BY created_at ASC
            LIMIT ?
        `);
        return stmt.all(Math.floor(limit));
    }

    // Отметить сообщение как отправленное
    static markAsSent(id) {
        const stmt = db.prepare(`
            UPDATE message_queue
            SET status = 'sent',
                sent_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        const result = stmt.run(id);
        return result.changes > 0;
    }

    // Отметить сообщение как неудачное
    static markAsFailed(id, errorMessage) {
        const stmt = db.prepare(`
            UPDATE message_queue
            SET status = 'failed',
                attempts = attempts + 1,
                error_message = ?
            WHERE id = ?
        `);
        const result = stmt.run(errorMessage, id);
        return result.changes > 0;
    }

    // Увеличить счётчик попыток
    static incrementAttempts(id) {
        const stmt = db.prepare(`
            UPDATE message_queue
            SET attempts = attempts + 1
            WHERE id = ?
        `);
        const result = stmt.run(id);
        return result.changes > 0;
    }

    // Удалить старые отправленные сообщения (старше N дней)
    static cleanupOld(daysOld = 7) {
        const stmt = db.prepare(`
            DELETE FROM message_queue
            WHERE status = 'sent'
            AND datetime(sent_at) < datetime('now', '-' || ? || ' days')
        `);
        const result = stmt.run(daysOld);
        return result.changes;
    }

    // Получить статистику очереди
    static getStats() {
        const stmt = db.prepare(`
            SELECT
                status,
                COUNT(*) as count
            FROM message_queue
            GROUP BY status
        `);
        const results = stmt.all();

        const stats = {
            pending: 0,
            sent: 0,
            failed: 0,
            total: 0
        };

        results.forEach(row => {
            stats[row.status] = row.count;
            stats.total += row.count;
        });

        return stats;
    }

    // Удалить сообщение
    static delete(id) {
        const stmt = db.prepare('DELETE FROM message_queue WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
}

module.exports = MessageQueue;
