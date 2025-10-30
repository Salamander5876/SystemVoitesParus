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
                CASE
                    WHEN v.vote_type = 'against_all' THEN 'Против всех'
                    WHEN v.vote_type = 'abstain' THEN 'Воздержался'
                    ELSE c.name
                END as candidate_name,
                s.name as shift_name
            FROM votes v
            JOIN users u ON v.user_id = u.id
            LEFT JOIN candidates c ON v.candidate_id = c.id
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
                CASE
                    WHEN v.vote_type = 'against_all' THEN 'Против всех'
                    WHEN v.vote_type = 'abstain' THEN 'Воздержался'
                    ELSE c.name
                END as candidate_name
            FROM votes v
            JOIN users u ON v.user_id = u.id
            LEFT JOIN candidates c ON v.candidate_id = c.id
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
                CASE
                    WHEN v.vote_type = 'against_all' THEN 'Против всех'
                    WHEN v.vote_type = 'abstain' THEN 'Воздержался'
                    ELSE c.name
                END as candidate_name
            FROM votes v
            JOIN users u ON v.user_id = u.id
            LEFT JOIN candidates c ON v.candidate_id = c.id
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

    // Аннулировать голос
    static cancelVote(voteId, adminId, reason) {
        const stmt = db.prepare(`
            UPDATE votes
            SET is_cancelled = 1,
                cancellation_reason = ?,
                cancelled_at = CURRENT_TIMESTAMP,
                cancelled_by = ?
            WHERE id = ?
        `);
        const result = stmt.run(reason, adminId, voteId);
        return result.changes > 0;
    }

    // Получить информацию о голосе с данными пользователя (для аннулирования)
    static getVoteWithUserInfo(voteId) {
        const stmt = db.prepare(`
            SELECT
                v.id,
                v.shift_id,
                v.candidate_id,
                v.vote_type,
                v.is_cancelled,
                v.cancellation_reason,
                v.cancelled_at,
                v.created_at,
                u.id as user_id,
                u.vk_id,
                u.full_name,
                u.nickname,
                s.name as shift_name
            FROM votes v
            JOIN users u ON v.user_id = u.id
            JOIN shifts s ON v.shift_id = s.id
            WHERE v.id = ?
        `);
        return stmt.get(voteId);
    }

    // Получить все голоса с полной информацией для журнала (включая VK ID)
    static getAllWithFullInfo() {
        const stmt = db.prepare(`
            SELECT
                v.id,
                v.vote_type,
                v.created_at,
                v.is_cancelled,
                v.cancellation_reason,
                v.cancelled_at,
                u.vk_id,
                u.full_name,
                u.nickname,
                s.name as shift_name,
                CASE
                    WHEN v.vote_type = 'against_all' THEN 'Против всех'
                    WHEN v.vote_type = 'abstain' THEN 'Воздержался'
                    ELSE c.name
                END as candidate_name
            FROM votes v
            JOIN users u ON v.user_id = u.id
            LEFT JOIN candidates c ON v.candidate_id = c.id
            JOIN shifts s ON v.shift_id = s.id
            ORDER BY v.created_at DESC
        `);
        return stmt.all();
    }

    static getTotalCount() {
        const stmt = db.prepare('SELECT COUNT(*) as total FROM votes WHERE is_cancelled = 0');
        return stmt.get().total;
    }

    static getCountByShift(shiftId) {
        const stmt = db.prepare('SELECT COUNT(*) as total FROM votes WHERE shift_id = ? AND is_cancelled = 0');
        return stmt.get(shiftId).total;
    }

    static getUniqueVotersCount() {
        const stmt = db.prepare('SELECT COUNT(DISTINCT user_id) as total FROM votes WHERE is_cancelled = 0');
        return stmt.get().total;
    }

    static getUniqueVotersByShift(shiftId) {
        const stmt = db.prepare('SELECT COUNT(DISTINCT user_id) as total FROM votes WHERE shift_id = ? AND is_cancelled = 0');
        return stmt.get(shiftId).total;
    }

    static getVoteDistribution(shiftId) {
        const stmt = db.prepare(`
            SELECT
                c.id,
                c.name,
                c.vote_count,
                c.vote_count as total_votes
            FROM candidates c
            WHERE c.shift_id = ? AND c.is_active = 1
            ORDER BY vote_count DESC
        `);
        return stmt.all(shiftId);
    }

    static getSpecialVotesCounts(shiftId) {
        const stmt = db.prepare(`
            SELECT
                vote_type,
                COUNT(*) as count
            FROM votes
            WHERE shift_id = ? AND vote_type IN ('against_all', 'abstain') AND is_cancelled = 0
            GROUP BY vote_type
        `);
        const results = stmt.all(shiftId);

        const counts = {
            against_all: 0,
            abstain: 0
        };

        results.forEach(row => {
            counts[row.vote_type] = row.count;
        });

        return counts;
    }

    static verifyVoteHash(voteId, expectedHash) {
        const stmt = db.prepare('SELECT vote_hash FROM votes WHERE id = ?');
        const vote = stmt.get(voteId);
        return vote && vote.vote_hash === expectedHash;
    }

    // Проверить, голосовал ли человек с таким ФИО за конкретную смену (только НЕ аннулированные голоса)
    static hasVotedByFullNameAndShift(fullName, shiftId) {
        const normalizedFullName = fullName.trim().replace(/\s+/g, ' ');

        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM votes v
            JOIN users u ON v.user_id = u.id
            WHERE TRIM(REPLACE(u.full_name, '  ', ' ')) = ? COLLATE NOCASE
            AND v.shift_id = ?
            AND v.is_cancelled = 0
        `);

        const result = stmt.get(normalizedFullName, shiftId);
        return result.count > 0;
    }

    // Проверить, голосовал ли человек с таким ФИО хотя бы по одной смене (только НЕ аннулированные голоса)
    // Возвращает объект с информацией о VK ID, который использовал это ФИО
    static hasVotedByFullName(fullName) {
        const normalizedFullName = fullName.trim().replace(/\s+/g, ' ');

        const stmt = db.prepare(`
            SELECT u.vk_id, u.full_name, COUNT(DISTINCT v.shift_id) as shifts_count
            FROM votes v
            JOIN users u ON v.user_id = u.id
            WHERE TRIM(REPLACE(u.full_name, '  ', ' ')) = ? COLLATE NOCASE
            AND v.is_cancelled = 0
            GROUP BY u.vk_id, u.full_name
            LIMIT 1
        `);

        const result = stmt.get(normalizedFullName);
        return result || null;
    }

    // Проверить, голосовал ли уже этот VK ID (только НЕ аннулированные голоса)
    // Возвращает объект с информацией о ФИО, которое использовал этот VK ID
    static hasVotedByVkId(vkId) {
        const stmt = db.prepare(`
            SELECT u.vk_id, u.full_name, COUNT(DISTINCT v.shift_id) as shifts_count
            FROM votes v
            JOIN users u ON v.user_id = u.id
            WHERE u.vk_id = ?
            AND v.is_cancelled = 0
            GROUP BY u.vk_id, u.full_name
            LIMIT 1
        `);

        const result = stmt.get(vkId.toString());
        return result || null;
    }

    // Получить голоса, сгруппированные по псевдониму (без персональных данных)
    // Включает информацию об аннулированных голосах
    static getGroupedByNickname() {
        // Получаем все голоса
        const stmt = db.prepare(`
            SELECT
                u.nickname,
                s.id as shift_id,
                s.name as shift_name,
                CASE
                    WHEN v.vote_type = 'against_all' THEN 'Против всех'
                    WHEN v.vote_type = 'abstain' THEN 'Воздержался'
                    ELSE c.name
                END as candidate_name,
                v.vote_type,
                v.is_cancelled,
                v.cancellation_reason
            FROM votes v
            JOIN users u ON v.user_id = u.id
            LEFT JOIN candidates c ON v.candidate_id = c.id
            JOIN shifts s ON v.shift_id = s.id
            ORDER BY u.nickname, s.name
        `);

        const votes = stmt.all();

        // Группируем по псевдониму
        const grouped = {};

        votes.forEach(vote => {
            if (!grouped[vote.nickname]) {
                grouped[vote.nickname] = {
                    nickname: vote.nickname,
                    votes: {}
                };
            }

            grouped[vote.nickname].votes[vote.shift_name] = {
                candidate: vote.candidate_name,
                type: vote.vote_type,
                is_cancelled: vote.is_cancelled,
                cancellation_reason: vote.cancellation_reason
            };
        });

        return Object.values(grouped);
    }

    // Получить список всех смен для заголовков таблицы
    static getAllShiftNames() {
        const stmt = db.prepare(`
            SELECT DISTINCT s.name
            FROM shifts s
            WHERE EXISTS (SELECT 1 FROM votes v WHERE v.shift_id = s.id)
            ORDER BY s.name
        `);
        return stmt.all().map(row => row.name);
    }

    // Получить количество голосов "Против всех" для смены
    static getAgainstAllCount(shiftId) {
        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM votes
            WHERE shift_id = ? AND vote_type = 'against_all' AND is_cancelled = 0
        `);
        return stmt.get(shiftId).count;
    }

    // Получить количество голосов "Воздержался" для смены
    static getAbstainCount(shiftId) {
        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM votes
            WHERE shift_id = ? AND vote_type = 'abstain' AND is_cancelled = 0
        `);
        return stmt.get(shiftId).count;
    }
}

module.exports = Vote;
