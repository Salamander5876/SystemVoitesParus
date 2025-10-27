const db = require('../config/database');

class Shift {
    static getAll() {
        const stmt = db.prepare('SELECT * FROM shifts ORDER BY created_at ASC');
        return stmt.all();
    }

    static getAllActive() {
        const stmt = db.prepare('SELECT * FROM shifts WHERE is_active = 1 ORDER BY created_at ASC');
        return stmt.all();
    }

    static getById(id) {
        const stmt = db.prepare('SELECT * FROM shifts WHERE id = ?');
        return stmt.get(id);
    }

    static create(name, description, startDate = null, endDate = null) {
        const stmt = db.prepare(
            'INSERT INTO shifts (name, description, start_date, end_date) VALUES (?, ?, ?, ?)'
        );
        const result = stmt.run(name, description, startDate, endDate);
        return result.lastInsertRowid;
    }

    static update(id, data) {
        const fields = [];
        const values = [];

        if (data.name !== undefined) {
            fields.push('name = ?');
            values.push(data.name);
        }
        if (data.description !== undefined) {
            fields.push('description = ?');
            values.push(data.description);
        }
        if (data.startDate !== undefined) {
            fields.push('start_date = ?');
            values.push(data.startDate);
        }
        if (data.endDate !== undefined) {
            fields.push('end_date = ?');
            values.push(data.endDate);
        }
        if (data.isActive !== undefined) {
            fields.push('is_active = ?');
            values.push(data.isActive ? 1 : 0);
        }

        if (fields.length === 0) return false;

        values.push(id);
        const stmt = db.prepare(`UPDATE shifts SET ${fields.join(', ')} WHERE id = ?`);
        const result = stmt.run(...values);
        return result.changes > 0;
    }

    static delete(id) {
        const stmt = db.prepare('DELETE FROM shifts WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    static getWithStats(id) {
        const shift = this.getById(id);
        if (!shift) return null;

        const candidatesStmt = db.prepare(`
            SELECT id, name, description, vote_count,
                   vote_count as total_votes
            FROM candidates
            WHERE shift_id = ? AND is_active = 1
            ORDER BY vote_count DESC
        `);
        const candidates = candidatesStmt.all(id);

        const totalVotesStmt = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as unique_voters,
                   COUNT(*) as total_votes
            FROM votes
            WHERE shift_id = ?
        `);
        const stats = totalVotesStmt.get(id);

        // Получаем количество специальных голосов
        const specialVotesStmt = db.prepare(`
            SELECT
                vote_type,
                COUNT(*) as count
            FROM votes
            WHERE shift_id = ? AND vote_type IN ('against_all', 'abstain')
            GROUP BY vote_type
        `);
        const specialVotesResults = specialVotesStmt.all(id);

        const specialVotes = {
            against_all: 0,
            abstain: 0
        };

        specialVotesResults.forEach(row => {
            specialVotes[row.vote_type] = row.count;
        });

        // Добавляем специальные варианты в список кандидатов для отображения
        const allCandidates = [
            ...candidates,
            {
                id: null,
                name: 'Против всех',
                description: 'Голосов против всех кандидатов',
                vote_count: specialVotes.against_all,
                total_votes: specialVotes.against_all,
                is_special: true
            },
            {
                id: null,
                name: 'Воздержался',
                description: 'Воздержались от голосования',
                vote_count: specialVotes.abstain,
                total_votes: specialVotes.abstain,
                is_special: true
            }
        ];

        return {
            ...shift,
            candidates: allCandidates,
            stats
        };
    }
}

module.exports = Shift;
