const db = require('../config/database');

class Candidate {
    static getAll() {
        const stmt = db.prepare(`
            SELECT c.*, s.name as shift_name
            FROM candidates c
            JOIN shifts s ON c.shift_id = s.id
            ORDER BY s.created_at ASC, c.created_at ASC
        `);
        return stmt.all();
    }

    static getAllByShift(shiftId) {
        const stmt = db.prepare('SELECT * FROM candidates WHERE shift_id = ? ORDER BY created_at ASC');
        return stmt.all(shiftId);
    }

    static getAllActiveByShift(shiftId) {
        const stmt = db.prepare('SELECT * FROM candidates WHERE shift_id = ? AND is_active = 1 ORDER BY created_at ASC');
        return stmt.all(shiftId);
    }

    static getById(id) {
        const stmt = db.prepare('SELECT * FROM candidates WHERE id = ?');
        return stmt.get(id);
    }

    static create(shiftId, name, description = null) {
        const stmt = db.prepare(
            'INSERT INTO candidates (shift_id, name, description) VALUES (?, ?, ?)'
        );
        const result = stmt.run(shiftId, name, description);
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
        if (data.isActive !== undefined) {
            fields.push('is_active = ?');
            values.push(data.isActive ? 1 : 0);
        }

        if (fields.length === 0) return false;

        values.push(id);
        const stmt = db.prepare(`UPDATE candidates SET ${fields.join(', ')} WHERE id = ?`);
        const result = stmt.run(...values);
        return result.changes > 0;
    }

    static delete(id) {
        const stmt = db.prepare('DELETE FROM candidates WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    static incrementVoteCount(candidateId) {
        const stmt = db.prepare(`UPDATE candidates SET vote_count = vote_count + 1 WHERE id = ?`);
        const result = stmt.run(candidateId);
        return result.changes > 0;
    }

    static decrementVoteCount(candidateId) {
        const stmt = db.prepare(`UPDATE candidates SET vote_count = vote_count - 1 WHERE id = ? AND vote_count > 0`);
        const result = stmt.run(candidateId);
        return result.changes > 0;
    }

    static getWithVotes(id) {
        const stmt = db.prepare(`
            SELECT c.*, s.name as shift_name,
                   c.vote_count as total_votes
            FROM candidates c
            JOIN shifts s ON c.shift_id = s.id
            WHERE c.id = ?
        `);
        return stmt.get(id);
    }

    static getStatsForShift(shiftId) {
        const stmt = db.prepare(`
            SELECT
                c.id,
                c.name,
                c.description,
                c.vote_count,
                c.vote_count as total_votes
            FROM candidates c
            WHERE c.shift_id = ? AND c.is_active = 1
            ORDER BY c.vote_count DESC
        `);
        return stmt.all(shiftId);
    }
}

module.exports = Candidate;
