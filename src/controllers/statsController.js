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
}

module.exports = StatsController;
