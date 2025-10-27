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
            SELECT id, name, description, votes_for, votes_against,
                   (votes_for + votes_against) as total_votes
            FROM candidates
            WHERE shift_id = ? AND is_active = 1
            ORDER BY total_votes DESC
        `);
        const candidates = candidatesStmt.all(id);

        const totalVotesStmt = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as unique_voters,
                   COUNT(*) as total_votes
            FROM votes
            WHERE shift_id = ?
        `);
        const stats = totalVotesStmt.get(id);

        return {
            ...shift,
            candidates,
            stats
        };
    }
}

module.exports = Shift;
