const User = require('../models/User');
const Candidate = require('../models/Candidate');
const Vote = require('../models/Vote');
const Shift = require('../models/Shift');
const Settings = require('../models/Settings');
const EligibleVoter = require('../models/EligibleVoter');
const logger = require('../utils/logger');
const db = require('../config/database');

class VoteController {
    // Создание голоса (вызывается из бота)
    static async createVote(req, res, next) {
        const transaction = db.transaction((vkId, fullName, nickname, shiftId, candidateId, voteType, vkProfile) => {
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

            // КРИТИЧЕСКАЯ ПРОВЕРКА: Проверяем, голосовал ли человек с таким ФИО за эту смену
            // (независимо от VK аккаунта - защита от повторного голосования с другого аккаунта)
            if (Vote.hasVotedByFullNameAndShift(fullName, shiftId)) {
                const error = new Error('VOTER_ALREADY_USED');
                error.shiftName = shift.name;
                throw error;
            }

            // ПРОВЕРКА: Если есть список избирателей, проверяем наличие ФИО в списке
            const voterStats = EligibleVoter.getStats();
            if (voterStats.total > 0) {
                // Список избирателей существует, проверяем наличие
                const eligibleVoter = EligibleVoter.checkEligibility(fullName);

                if (!eligibleVoter) {
                    throw new Error('NOT_ELIGIBLE');
                }
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
                // Создаём нового пользователя (кэшируем VK-профиль)
                const userId = User.create(vkId, fullName, nickname, vkProfile || {});
                user = User.getById(userId);
            } else {
                // Пользователь уже существует - обновляем его данные
                // (может голосовать повторно после аннулирования, возможно с другим ФИО)
                User.update(user.id, {
                    fullName: fullName,
                    nickname: nickname
                });
                // Обновляем закэшированный VK-профиль (не затирая уже сохранённое)
                User.updateVkProfile(vkId, vkProfile || {});
                // Перезагружаем обновлённые данные
                user = User.getById(user.id);
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

            // Отмечаем избирателя как проголосовавшего (если список избирателей используется)
            if (voterStats.total > 0) {
                EligibleVoter.markAsVoted(fullName);
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
            const { vkId, fullName, nickname, shiftId, candidateId, voteType, vkProfile } = req.body;

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

            const result = transaction(vkId, fullName, nickname, shiftId, candidateId, voteType, vkProfile);

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
            if (error.message === 'NOT_ELIGIBLE') {
                return res.status(403).json({ error: 'Ваше ФИО отсутствует в списке избирателей. Обратитесь к администратору.' });
            }
            if (error.message === 'VOTER_ALREADY_USED') {
                const shiftInfo = error.shiftName ? ` на смене "${error.shiftName}"` : '';
                return res.status(403).json({ error: `Под этим ФИО уже проголосовали${shiftInfo}. Если это ошибка, обратитесь к администратору.` });
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

    // Проверить избирателя по ФИО (для бота)
    static async checkVoterEligibility(req, res, next) {
        try {
            const { fullName, vkId } = req.body;

            if (!fullName || fullName.trim().length < 5) {
                return res.status(400).json({
                    success: false,
                    error: 'ФИО должно содержать минимум 5 символов'
                });
            }

            // ПРОВЕРКА 1: Голосовал ли уже этот VK аккаунт (с любым ФИО)?
            if (vkId) {
                const existingVkVote = Vote.hasVotedByVkId(vkId);

                if (existingVkVote) {
                    return res.json({
                        success: true,
                        eligible: false,
                        error: `Вы уже проголосовали от имени избирателя "${existingVkVote.full_name}". Повторное голосование с этой страницы ВКонтакте невозможно.`
                    });
                }
            }

            // ПРОВЕРКА 2: Голосовал ли уже этот избиратель (с любого VK аккаунта)?
            const existingFioVote = Vote.hasVotedByFullName(fullName);

            if (existingFioVote) {
                return res.json({
                    success: true,
                    eligible: false,
                    error: `Избиратель "${fullName}" уже проголосовал. Каждый избиратель может проголосовать только один раз.`
                });
            }

            // Проверяем, используется ли список избирателей
            const voterStats = EligibleVoter.getStats();

            if (voterStats.total === 0) {
                // Список избирателей не используется - все могут голосовать
                return res.json({
                    success: true,
                    eligible: true,
                    message: 'Список избирателей не используется'
                });
            }

            // Проверяем наличие в списке
            const eligibleVoter = EligibleVoter.checkEligibility(fullName);

            if (!eligibleVoter) {
                return res.json({
                    success: true,
                    eligible: false,
                    error: 'Ваше ФИО отсутствует в списке избирателей. Обратитесь к администратору.'
                });
            }

            res.json({
                success: true,
                eligible: true,
                message: 'ФИО найдено в списке избирателей'
            });

        } catch (error) {
            next(error);
        }
    }

    // Генерация уникального псевдонима (для бота)
    //
    // ВАЖНО (фикс гонки): раньше ник только возвращался боту, а в БД попадал
    // намного позже — при отправке голоса. Двое одновременно получали одинаковый ник.
    // Теперь ник СРАЗУ резервируется в таблице users (upsert по vk_id) под защитой
    // UNIQUE-индекса idx_unique_nickname. better-sqlite3 синхронный, поэтому
    // «прочитать занятые → сгенерировать → записать» выполняется атомарно.
    static async generateNickname(req, res, next) {
        try {
            const { vkId, fullName, vkProfile } = req.body;

            if (!vkId || !fullName) {
                return res.status(400).json({
                    success: false,
                    error: 'Необходимы vkId и fullName'
                });
            }

            const adjectives = [
                "Штормовой", "Глубоководный", "Жемчужный", "Коралловый", "Абордажный",
                "Просоленный", "Призрачный", "Затонувший", "Рифовый", "Бездонный",
                "Бесстрашный", "Подводный", "Вольный", "Трехмачтовый", "Морской",
                "Античный", "Спартанский", "Олимпийский", "Бронзовый", "Рунический",
                "Легендарный", "Божественный", "Мифический", "Мраморный", "Священный",
                "Эпический", "Грозный", "Непобедимый", "Золотой", "Мудрый"
            ];

            const nouns = ["Капитан", "Кракен", "Корсар", "Боцман", "Пират",
                "Скат", "Осьминог", "Кашалот", "Флибустьер", "Матрос",
                "Галеон", "Штурвал", "Маяк", "Компас", "Сундук", "Гладиатор", 
                "Фараон", "Титан", "Центурион", "Жрец",
                "Викинг", "Кентавр", "Минотавр", "Философ", "Оракул",
                "Легионер", "Циклоп", "Полубог", "Герой", "Атлант"
                ];

            const randomNickname = () => {
                const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
                const noun = nouns[Math.floor(Math.random() * nouns.length)];
                return { base: `${adj} ${noun}`, adj, noun };
            };

            const maxAttempts = 250;
            let nickname = null;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                // Читаем актуальный набор занятых ников на каждой попытке —
                // между итерациями другой запрос мог уже что-то зарезервировать.
                const used = new Set(
                    db.prepare("SELECT nickname FROM users WHERE nickname IS NOT NULL AND nickname != ''")
                        .all()
                        .map(u => u.nickname)
                );

                const { base } = randomNickname();
                let candidate = base;

                // Если базовая комбинация занята — добавляем число
                if (used.has(candidate)) {
                    candidate = `${base} ${Math.floor(Math.random() * 900) + 100}`;
                }
                if (used.has(candidate)) {
                    continue; // редкая коллизия — пробуем заново
                }

                try {
                    // Атомарно резервируем ник за пользователем
                    User.reserveNickname(vkId.toString(), fullName, candidate, vkProfile || {});
                    nickname = candidate;
                    break;
                } catch (err) {
                    // UNIQUE-коллизия по nickname — параллельный запрос успел раньше.
                    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT') {
                        logger.warn(`Nickname collision on reserve: "${candidate}", retrying`);
                        continue;
                    }
                    throw err;
                }
            }

            if (!nickname) {
                logger.error('Failed to reserve unique nickname after retries');
                return res.status(500).json({
                    success: false,
                    error: 'Не удалось сгенерировать уникальный псевдоним'
                });
            }

            logger.info(`Reserved unique nickname: ${nickname} for vk_id ${vkId}`);

            res.json({
                success: true,
                nickname
            });

        } catch (error) {
            logger.error('Error generating nickname:', error);
            next(error);
        }
    }
}

module.exports = VoteController;
