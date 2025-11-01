const db = require('../config/database');

class User {
    static getAll() {
        const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC');
        return stmt.all();
    }

    static getById(id) {
        const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(id);
    }

    static getByVkId(vkId) {
        const stmt = db.prepare('SELECT * FROM users WHERE vk_id = ?');
        return stmt.get(vkId);
    }

    static create(vkId, fullName, nickname) {
        const stmt = db.prepare(
            'INSERT INTO users (vk_id, full_name, nickname) VALUES (?, ?, ?)'
        );
        const result = stmt.run(vkId, fullName, nickname);
        return result.lastInsertRowid;
    }

    static update(id, data) {
        const fields = [];
        const values = [];

        if (data.fullName !== undefined) {
            fields.push('full_name = ?');
            values.push(data.fullName);
        }
        if (data.nickname !== undefined) {
            fields.push('nickname = ?');
            values.push(data.nickname);
        }

        if (fields.length === 0) return false;

        values.push(id);
        const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
        const result = stmt.run(...values);
        return result.changes > 0;
    }

    static delete(id) {
        const stmt = db.prepare('DELETE FROM users WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    static getUserVotes(userId) {
        const stmt = db.prepare(`
            SELECT
                v.id,
                v.vote_type,
                v.created_at,
                COALESCE(c.name, 'Против всех') as candidate_name,
                s.name as shift_name,
                s.id as shift_id,
                c.id as candidate_id
            FROM votes v
            LEFT JOIN candidates c ON v.candidate_id = c.id
            JOIN shifts s ON v.shift_id = s.id
            WHERE v.user_id = ? AND v.is_cancelled = 0
            ORDER BY v.created_at DESC
        `);
        return stmt.all(userId);
    }

    static getUserVotesByShift(userId, shiftId) {
        const stmt = db.prepare(`
            SELECT
                v.id,
                v.vote_type,
                v.created_at,
                c.name as candidate_name,
                c.id as candidate_id
            FROM votes v
            JOIN candidates c ON v.candidate_id = c.id
            WHERE v.user_id = ? AND v.shift_id = ? AND v.is_cancelled = 0
            ORDER BY v.created_at DESC
        `);
        return stmt.all(userId, shiftId);
    }

    static hasVotedOnShift(userId, shiftId) {
        const stmt = db.prepare(`
            SELECT id FROM votes
            WHERE user_id = ? AND shift_id = ? AND is_cancelled = 0
        `);
        return stmt.get(userId, shiftId) !== undefined;
    }

    static getUserStats(userId) {
        const totalVotesStmt = db.prepare(`
            SELECT COUNT(*) as total FROM votes WHERE user_id = ? AND is_cancelled = 0
        `);
        const totalVotes = totalVotesStmt.get(userId).total;

        const shiftsVotedStmt = db.prepare(`
            SELECT COUNT(DISTINCT shift_id) as total FROM votes WHERE user_id = ? AND is_cancelled = 0
        `);
        const shiftsVoted = shiftsVotedStmt.get(userId).total;

        const voteBreakdownStmt = db.prepare(`
            SELECT
                vote_type,
                COUNT(*) as count
            FROM votes
            WHERE user_id = ? AND is_cancelled = 0
            GROUP BY vote_type
        `);
        const breakdown = voteBreakdownStmt.all(userId);

        return {
            totalVotes,
            shiftsVoted,
            votesForCandidate: breakdown.find(b => b.vote_type === 'candidate')?.count || 0,
            votesAgainstAll: breakdown.find(b => b.vote_type === 'against_all')?.count || 0,
            votesAbstain: breakdown.find(b => b.vote_type === 'abstain')?.count || 0
        };
    }
}

module.exports = User;
