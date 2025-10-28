const Shift = require('../models/Shift');
const Candidate = require('../models/Candidate');
const Vote = require('../models/Vote');
const Settings = require('../models/Settings');

class StatsController {
    // Получить статус голосования
    static getStatus(req, res, next) {
        try {
            const status = Settings.getVotingStatus();
            const startTime = Settings.getStartTime();
            const endTime = Settings.getEndTime();
            const totalVotes = Vote.getTotalCount();
            const uniqueVoters = Vote.getUniqueVotersCount();

            res.json({
                status,
                startTime,
                endTime,
                totalVotes,
                uniqueVoters
            });
        } catch (error) {
            next(error);
        }
    }

    // Получить список смен
    static getShifts(req, res, next) {
        try {
            const shifts = Shift.getAllActive();
            res.json({ shifts });
        } catch (error) {
            next(error);
        }
    }

    // Получить кандидатов по смене
    static getCandidatesByShift(req, res, next) {
        try {
            const { shiftId } = req.params;
            const candidates = Candidate.getStatsForShift(shiftId);
            res.json({ candidates });
        } catch (error) {
            next(error);
        }
    }

    // Получить статистику по смене
    static getShiftStats(req, res, next) {
        try {
            const { shiftId } = req.params;
            const shift = Shift.getWithStats(shiftId);

            if (!shift) {
                return res.status(404).json({ error: 'Смена не найдена' });
            }

            const recentVotes = Vote.getRecentByShift(shiftId, 20);
            const distribution = Vote.getVoteDistribution(shiftId);

            res.json({
                shift: {
                    id: shift.id,
                    name: shift.name,
                    description: shift.description
                },
                stats: shift.stats,
                candidates: shift.candidates,
                recentVotes,
                distribution
            });
        } catch (error) {
            next(error);
        }
    }

    // Получить общую статистику
    static getOverallStats(req, res, next) {
        try {
            const shifts = Shift.getAllActive();
            const totalVotes = Vote.getTotalCount();
            const uniqueVoters = Vote.getUniqueVotersCount();

            const shiftStats = shifts.map(shift => {
                const stats = Shift.getWithStats(shift.id);
                return {
                    id: shift.id,
                    name: shift.name,
                    totalVotes: stats.stats.total_votes,
                    uniqueVoters: stats.stats.unique_voters,
                    candidatesCount: stats.candidates.length
                };
            });

            res.json({
                totalVotes,
                uniqueVoters,
                shiftsCount: shifts.length,
                shifts: shiftStats
            });
        } catch (error) {
            next(error);
        }
    }

    // Публичный журнал голосов с группировкой по пользователям и сменам
    static async getPublicVotesLog(req, res, next) {
        try {
            const Vote = require('../models/Vote');
            const Shift = require('../models/Shift');
            const axios = require('axios');

            // Получаем все голоса
            const allVotes = Vote.getAllWithFullInfo();

            // Получаем все смены
            const allShifts = Shift.getAll();
            const shiftNames = allShifts.map(s => s.name);

            // Получаем уникальные VK ID
            const vkIds = [...new Set(allVotes.map(v => v.vk_id))];

            let vkUsersMap = {};

            // Получаем информацию из VK API
            if (vkIds.length > 0) {
                try {
                    const VK_TOKEN = process.env.VK_TOKEN;
                    const response = await axios.get('https://api.vk.com/method/users.get', {
                        params: {
                            user_ids: vkIds.join(','),
                            fields: 'first_name,last_name',
                            access_token: VK_TOKEN,
                            v: '5.199'
                        }
                    });

                    if (response.data.response) {
                        response.data.response.forEach(user => {
                            vkUsersMap[user.id] = {
                                first_name: user.first_name,
                                last_name: user.last_name
                            };
                        });
                    }
                } catch (vkError) {
                    console.error('Error fetching VK user info:', vkError);
                }
            }

            // Группируем голоса по пользователям
            const userVotesMap = {};

            allVotes.forEach(vote => {
                // Пропускаем аннулированные голоса
                if (vote.is_cancelled) return;

                const key = `${vote.vk_id}_${vote.full_name}`;

                if (!userVotesMap[key]) {
                    userVotesMap[key] = {
                        id: vote.id, // Используем ID первого голоса для сортировки
                        vk_id: vote.vk_id,
                        full_name: vote.full_name,
                        vk_first_name: vkUsersMap[vote.vk_id]?.first_name || null,
                        vk_last_name: vkUsersMap[vote.vk_id]?.last_name || null,
                        created_at: vote.created_at,
                        shifts: {}
                    };
                }

                // Добавляем информацию о смене
                userVotesMap[key].shifts[vote.shift_name] = true;
            });

            // Преобразуем в массив
            const usersVotes = Object.values(userVotesMap);

            res.json({
                success: true,
                votes: usersVotes,
                shifts: shiftNames
            });

        } catch (error) {
            next(error);
        }
    }
}

module.exports = StatsController;
