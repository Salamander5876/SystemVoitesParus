const User = require('../models/User');
const Candidate = require('../models/Candidate');
const Vote = require('../models/Vote');
const Shift = require('../models/Shift');
const Settings = require('../models/Settings');
const logger = require('../utils/logger');
const db = require('../config/database');

class VoteController {
    // Создание голоса (вызывается из бота)
    static async createVote(req, res, next) {
        const transaction = db.transaction((vkId, fullName, nickname, shiftId, candidateId, voteType) => {
            // Проверка статуса голосования
            const votingStatus = Settings.getVotingStatus();
            if (votingStatus !== 'active') {
                throw new Error('VOTING_NOT_ACTIVE');
            }

            // Проверка существования смены
            const shift = Shift.getById(shiftId);
            if (!shift || !shift.is_active) {
                throw new Error('INVALID_SHIFT');
            }

            let candidate = null;
            // Проверка существования кандидата (если это голос за кандидата)
            if (voteType === 'candidate' && candidateId) {
                candidate = Candidate.getById(candidateId);
                if (!candidate || !candidate.is_active || candidate.shift_id !== shiftId) {
                    throw new Error('INVALID_CANDIDATE');
                }
            }

            // Получаем или создаём пользователя
            let user = User.getByVkId(vkId);
            if (!user) {
                const userId = User.create(vkId, fullName, nickname);
                user = User.getById(userId);
            }

            // Проверка на повторное голосование (один голос на смену)
            if (User.hasVotedOnShift(user.id, shiftId)) {
                throw new Error('ALREADY_VOTED');
            }

            // Создаём голос
            const voteResult = Vote.create(user.id, shiftId, candidateId, voteType);

            if (!voteResult.success) {
                throw new Error(voteResult.error);
            }

            // Обновляем счётчик кандидата (только если голос за кандидата)
            if (voteType === 'candidate' && candidateId) {
                Candidate.incrementVoteCount(candidateId);
            }

            return {
                voteId: voteResult.voteId,
                voteHash: voteResult.voteHash,
                user,
                candidate,
                shift
            };
        });

        try {
            const { vkId, fullName, nickname, shiftId, candidateId, voteType } = req.body;

            // Валидация
            if (!vkId || !fullName || !nickname || !shiftId || !voteType) {
                return res.status(400).json({ error: 'Недостаточно данных' });
            }

            if (!['candidate', 'against_all', 'abstain'].includes(voteType)) {
                return res.status(400).json({ error: 'Неверный тип голоса' });
            }

            // candidate_id обязателен только для голоса за кандидата
            if (voteType === 'candidate' && !candidateId) {
                return res.status(400).json({ error: 'Не указан кандидат' });
            }

            const result = transaction(vkId, fullName, nickname, shiftId, candidateId, voteType);

            logger.info('Vote created:', {
                vkId,
                nickname,
                shiftId,
                candidateId,
                voteType
            });

            // Отправляем WebSocket событие (если io доступен)
            if (req.app.get('io')) {
                let candidateName = 'Неизвестно';
                if (voteType === 'candidate' && result.candidate) {
                    candidateName = result.candidate.name;
                } else if (voteType === 'against_all') {
                    candidateName = 'Против всех';
                } else if (voteType === 'abstain') {
                    candidateName = 'Воздержался';
                }

                req.app.get('io').emit('new_vote', {
                    nickname: result.user.nickname,
                    candidateName: candidateName,
                    shiftName: result.shift.name,
                    voteType,
                    timestamp: new Date()
                });
            }

            res.status(201).json({
                success: true,
                message: 'Голос учтён',
                voteHash: result.voteHash
            });

        } catch (error) {
            logger.error('Vote creation error:', error);

            if (error.message === 'VOTING_NOT_ACTIVE') {
                return res.status(403).json({ error: 'Голосование не активно' });
            }
            if (error.message === 'INVALID_SHIFT') {
                return res.status(400).json({ error: 'Неверная смена' });
            }
            if (error.message === 'INVALID_CANDIDATE') {
                return res.status(400).json({ error: 'Неверный кандидат' });
            }
            if (error.message === 'ALREADY_VOTED') {
                return res.status(409).json({ error: 'Вы уже голосовали на этой смене' });
            }

            next(error);
        }
    }

    // Получить статистику пользователя
    static async getUserStats(req, res, next) {
        try {
            const { vkId } = req.params;
            const user = User.getByVkId(vkId);

            if (!user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }

            const stats = User.getUserStats(user.id);
            const votes = User.getUserVotes(user.id);

            res.json({
                user: {
                    nickname: user.nickname,
                    createdAt: user.created_at
                },
                stats,
                votes
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = VoteController;
