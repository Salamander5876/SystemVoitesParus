const db = require('../config/database');
const crypto = require('crypto');

class Vote {
    static getAll() {
        const stmt = db.prepare(`
            SELECT
                v.id,
                v.vote_type,
                v.created_at,
                u.nickname,
                u.vk_id,
                u.full_name,
                c.name as candidate_name,
                s.name as shift_name
            FROM votes v
            JOIN users u ON v.user_id = u.id
            JOIN candidates c ON v.candidate_id = c.id
            JOIN shifts s ON v.shift_id = s.id
            ORDER BY v.created_at DESC
        `);
        return stmt.all();
    }

    static getByShift(shiftId) {
        const stmt = db.prepare(`
            SELECT
                v.id,
                v.vote_type,
                v.created_at,
                u.nickname,
                c.name as candidate_name
            FROM votes v
            JOIN users u ON v.user_id = u.id
            JOIN candidates c ON v.candidate_id = c.id
            WHERE v.shift_id = ?
            ORDER BY v.created_at DESC
        `);
        return stmt.all(shiftId);
    }

    static getRecentByShift(shiftId, limit = 20) {
        const stmt = db.prepare(`
            SELECT
                v.id,
                v.vote_type,
                v.created_at,
                u.nickname,
                c.name as candidate_name
            FROM votes v
            JOIN users u ON v.user_id = u.id
            JOIN candidates c ON v.candidate_id = c.id
            WHERE v.shift_id = ?
            ORDER BY v.created_at DESC
            LIMIT ?
        `);
        return stmt.all(shiftId, limit);
    }

    static create(userId, shiftId, candidateId, voteType) {
        // Генерируем хеш голоса для верификации
        const voteHash = crypto
            .createHash('sha256')
            .update(`${userId}-${shiftId}-${candidateId}-${voteType}-${Date.now()}-${process.env.VOTE_SALT}`)
            .digest('hex');

        const stmt = db.prepare(`
            INSERT INTO votes (user_id, shift_id, candidate_id, vote_type, vote_hash)
            VALUES (?, ?, ?, ?, ?)
        `);

        try {
            const result = stmt.run(userId, shiftId, candidateId, voteType, voteHash);
            return {
                success: true,
                voteId: result.lastInsertRowid,
                voteHash
            };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') {
                return {
                    success: false,
                    error: 'ALREADY_VOTED'
                };
            }
            throw error;
        }
    }

    static delete(id) {
        const stmt = db.prepare('DELETE FROM votes WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    static getTotalCount() {
        const stmt = db.prepare('SELECT COUNT(*) as total FROM votes');
        return stmt.get().total;
    }

    static getCountByShift(shiftId) {
        const stmt = db.prepare('SELECT COUNT(*) as total FROM votes WHERE shift_id = ?');
        return stmt.get(shiftId).total;
    }

    static getUniqueVotersCount() {
        const stmt = db.prepare('SELECT COUNT(DISTINCT user_id) as total FROM votes');
        return stmt.get().total;
    }

    static getUniqueVotersByShift(shiftId) {
        const stmt = db.prepare('SELECT COUNT(DISTINCT user_id) as total FROM votes WHERE shift_id = ?');
        return stmt.get(shiftId).total;
    }

    static getVoteDistribution(shiftId) {
        const stmt = db.prepare(`
            SELECT
                c.id,
                c.name,
                c.votes_for,
                c.votes_against,
                (c.votes_for + c.votes_against) as total_votes
            FROM candidates c
            WHERE c.shift_id = ? AND c.is_active = 1
            ORDER BY total_votes DESC
        `);
        return stmt.all(shiftId);
    }

    static verifyVoteHash(voteId, expectedHash) {
        const stmt = db.prepare('SELECT vote_hash FROM votes WHERE id = ?');
        const vote = stmt.get(voteId);
        return vote && vote.vote_hash === expectedHash;
    }
}

module.exports = Vote;
