const Shift = require('../models/Shift');
const Candidate = require('../models/Candidate');
const Vote = require('../models/Vote');
const Settings = require('../models/Settings');
const { convertArrayToLocalTime, convertToLocalTime } = require('../utils/timezone');

class StatsController {
    // Получить статус голосования
    static getStatus(req, res, next) {
        try {
            const status = Settings.getVotingStatus();
            const startTime = Settings.getStartTime();
            const endTime = Settings.getEndTime();
            const totalVotes = Vote.getTotalCount();
            const uniqueVoters = Vote.getUniqueVotersCount();

            // Явка от списка избирателей (в процентах)
            const EligibleVoter = require('../models/EligibleVoter');
            const evStats = EligibleVoter.getStats();
            const turnoutPercent = evStats.total > 0
                ? Math.round((evStats.voted / evStats.total) * 100)
                : null; // список избирателей не загружен — процент не считаем

            res.json({
                status,
                startTime,
                endTime,
                totalVotes,
                uniqueVoters,
                eligibleTotal: evStats.total,
                eligibleVoted: evStats.voted,
                turnoutPercent
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

            // Получаем все голоса. VK-данные (ФИО, фото, ссылка) уже закэшированы
            // в БД при голосовании — VK API здесь НЕ дёргаем (защита от rate-limit).
            const allVotes = Vote.getAllWithFullInfo();

            // Группируем голоса по VK ID
            const groupedVotes = {};

            allVotes.forEach(vote => {
                if (!groupedVotes[vote.vk_id]) {
                    groupedVotes[vote.vk_id] = {
                        vk_id: vote.vk_id,
                        full_name: vote.full_name,
                        vk_first_name: vote.vk_first_name || null,
                        vk_last_name: vote.vk_last_name || null,
                        vk_photo_url: vote.vk_photo_url || null,
                        vk_screen_name: vote.vk_screen_name || null,
                        created_at: vote.created_at, // Дата первого голоса
                        votes_count: 0,
                        all_cancelled: true
                    };
                }

                groupedVotes[vote.vk_id].votes_count++;

                // Если есть хотя бы один НЕ аннулированный голос - значит не все аннулированы
                if (!vote.is_cancelled) {
                    groupedVotes[vote.vk_id].all_cancelled = false;
                }

                // Берем самую раннюю дату голосования
                if (new Date(vote.created_at) < new Date(groupedVotes[vote.vk_id].created_at)) {
                    groupedVotes[vote.vk_id].created_at = vote.created_at;
                }
            });

            // Преобразуем в массив и добавляем ID (порядковый номер)
            const votesArray = Object.values(groupedVotes).map((vote, index) => ({
                id: index + 1,
                vk_id: vote.vk_id,
                full_name: vote.full_name,
                vk_first_name: vote.vk_first_name,
                vk_last_name: vote.vk_last_name,
                vk_photo_url: vote.vk_photo_url,
                vk_screen_name: vote.vk_screen_name,
                created_at: vote.created_at,
                votes_count: vote.votes_count,
                is_cancelled: vote.all_cancelled ? 1 : 0 // Если ВСЕ голоса аннулированы
            }));

            // Порядковый номер = хронология голосования:
            // самый ранний проголосовавший = №1, самый свежий = №N.
            // (Сортировку для показа новых сверху делает фронтенд по убыванию номера.)
            votesArray.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            votesArray.forEach((vote, index) => {
                vote.id = index + 1;
            });

            // Конвертируем время в локальную timezone
            const votesWithLocalTime = convertArrayToLocalTime(votesArray, ['created_at']);

            res.json({
                success: true,
                votes: votesWithLocalTime
            });

        } catch (error) {
            next(error);
        }
    }

    // Публичная проверка голоса по псевдониму.
    // Анонимность сохраняется: в ответе только псевдоним, смены, выбор и статус —
    // ни ФИО, ни vk_id не раскрываются.
    static verifyVote(req, res, next) {
        try {
            const nickname = (req.query.nickname || '').trim();

            if (nickname.length < 3 || nickname.length > 60) {
                return res.status(400).json({
                    success: false,
                    error: 'Введите псевдоним (от 3 до 60 символов)'
                });
            }

            const votes = Vote.getByNickname(nickname);

            if (votes.length === 0) {
                return res.json({
                    success: true,
                    found: false
                });
            }

            const votesWithLocalTime = convertArrayToLocalTime(votes, ['created_at']);

            res.json({
                success: true,
                found: true,
                votes: votesWithLocalTime.map(v => ({
                    shift_name: v.shift_name,
                    choice: v.choice,
                    is_cancelled: v.is_cancelled ? 1 : 0,
                    cancellation_reason: v.is_cancelled ? (v.cancellation_reason || null) : null,
                    created_at: v.created_at
                }))
            });
        } catch (error) {
            next(error);
        }
    }

    // Получить результаты выборов с победителями
    static async getElectionResults(req, res, next) {
        try {
            const Vote = require('../models/Vote');
            const Shift = require('../models/Shift');
            const Candidate = require('../models/Candidate');
            const Settings = require('../models/Settings');

            // Проверяем, опубликованы ли результаты
            const resultsPublished = Settings.getResultsPublished();

            // Получаем все смены
            const allShifts = Shift.getAll();
            const resultsData = [];

            for (const shift of allShifts) {
                // Получаем статистику по смене
                const shiftStats = Shift.getWithStats(shift.id);
                const candidates = Candidate.getStatsForShift(shift.id);

                // Сортируем кандидатов по количеству голосов
                const sortedCandidates = candidates.sort((a, b) => b.vote_count - a.vote_count);

                // Определяем победителя (первый в списке)
                const winner = sortedCandidates.length > 0 ? sortedCandidates[0] : null;

                // Подсчитываем специальные голоса
                const againstAll = Vote.getAgainstAllCount(shift.id);
                const abstain = Vote.getAbstainCount(shift.id);

                resultsData.push({
                    shift: {
                        id: shift.id,
                        name: shift.name,
                        description: shift.description
                    },
                    stats: {
                        total_votes: shiftStats.stats.total_votes,
                        unique_voters: shiftStats.stats.unique_voters
                    },
                    winner: winner ? {
                        id: winner.id,
                        name: winner.name,
                        vote_count: winner.vote_count,
                        percentage: shiftStats.stats.total_votes > 0
                            ? ((winner.vote_count / shiftStats.stats.total_votes) * 100).toFixed(1)
                            : 0
                    } : null,
                    candidates: sortedCandidates.map(c => ({
                        id: c.id,
                        name: c.name,
                        vote_count: c.vote_count,
                        percentage: shiftStats.stats.total_votes > 0
                            ? ((c.vote_count / shiftStats.stats.total_votes) * 100).toFixed(1)
                            : 0
                    })),
                    special_votes: {
                        against_all: againstAll,
                        abstain: abstain
                    }
                });
            }

            // Получаем журнал голосов (для итоговой ведомости).
            // VK-данные берём из кэша в БД, без обращения к VK API.
            const allVotes = Vote.getAllWithFullInfo();

            const userVotesMap = {};
            allVotes.forEach(vote => {
                if (vote.is_cancelled) return;

                const key = `${vote.vk_id}_${vote.full_name}`;
                if (!userVotesMap[key]) {
                    userVotesMap[key] = {
                        id: vote.id,
                        vk_id: vote.vk_id,
                        full_name: vote.full_name,
                        vk_first_name: vote.vk_first_name || null,
                        vk_last_name: vote.vk_last_name || null,
                        vk_photo_url: vote.vk_photo_url || null,
                        vk_screen_name: vote.vk_screen_name || null,
                        created_at: vote.created_at,
                        shifts: {}
                    };
                }
                userVotesMap[key].shifts[vote.shift_name] = true;
            });

            res.json({
                success: true,
                published: resultsPublished,
                published_at: Settings.getResultsPublishedAt(),
                results: resultsData,
                voters_log: Object.values(userVotesMap),
                shifts: allShifts.map(s => s.name)
            });

        } catch (error) {
            next(error);
        }
    }

    // Экспорт итоговой ведомости (публичный, только при опубликованных результатах)
    static exportPublicResults(req, res, next) {
        try {
            const resultsPublished = Settings.getResultsPublished();

            // Проверяем, опубликованы ли результаты
            if (!resultsPublished) {
                return res.status(403).json({
                    success: false,
                    error: 'Результаты еще не опубликованы'
                });
            }

            const XLSX = require('xlsx');
            const groupedVotes = Vote.getGroupedByNickname();
            const shiftNames = Vote.getAllShiftNames();

            // ===== ЛИСТ 1: ГОЛОСА =====
            const votesData = [];

            // Примечание о рандомизации
            votesData.push(['⚠️ ПРИМЕЧАНИЕ: Порядок строк рандомизирован для обеспечения анонимности голосования']);
            votesData.push(['']); // Пустая строка

            // Заголовок
            const votesHeader = ['Псевдоним', ...shiftNames];
            votesData.push(votesHeader);

            // Данные - сначала собираем все строки
            const dataRows = [];
            groupedVotes.forEach(voter => {
                const row = [voter.nickname];

                shiftNames.forEach(shift => {
                    const vote = voter.votes[shift];
                    if (vote) {
                        let cellValue = vote.candidate;
                        // Помечаем аннулированные голоса
                        if (vote.is_cancelled) {
                            cellValue += ` [АННУЛИРОВАН: ${vote.cancellation_reason || 'причина не указана'}]`;
                        }
                        row.push(cellValue);
                    } else {
                        row.push('-');
                    }
                });

                dataRows.push(row);
            });

            // РАНДОМИЗАЦИЯ: Перемешиваем строки для анонимности (алгоритм Fisher-Yates)
            for (let i = dataRows.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [dataRows[i], dataRows[j]] = [dataRows[j], dataRows[i]];
            }

            // Добавляем перемешанные строки в данные
            dataRows.forEach(row => votesData.push(row));

            // Создаём workbook
            const workbook = XLSX.utils.book_new();

            // Лист 1: Голоса
            const votesWorksheet = XLSX.utils.aoa_to_sheet(votesData);

            // Настраиваем ширину столбцов
            const votesColWidths = [{ wch: 80 }]; // Первый столбец шире для примечания
            shiftNames.forEach(() => votesColWidths.push({ wch: 25 })); // Смены
            votesWorksheet['!cols'] = votesColWidths;

            // Объединяем ячейки для примечания (первая строка)
            if (!votesWorksheet['!merges']) votesWorksheet['!merges'] = [];
            votesWorksheet['!merges'].push({
                s: { r: 0, c: 0 }, // start: row 0, col 0
                e: { r: 0, c: shiftNames.length } // end: row 0, last column
            });

            XLSX.utils.book_append_sheet(workbook, votesWorksheet, '1. Голоса (анонимные)');

            // ===== ЛИСТ 2: ИЗБИРАТЕЛИ =====
            const EligibleVoter = require('../models/EligibleVoter');
            const votersData = [];

            // Заголовок
            votersData.push(['№', 'ФИО', 'Проголосовал', 'Дата голосования']);

            // Получаем всех избирателей и сортируем по ФИО
            const allVoters = EligibleVoter.getAll();
            allVoters.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'));

            // Получаем все голоса с полной информацией
            const allVotesInfo = Vote.getAllWithFullInfo();

            // Создаем карту голосов по ФИО (нормализованное)
            const votesMap = {};
            allVotesInfo.forEach(vote => {
                if (vote.is_cancelled) return; // Пропускаем аннулированные голоса

                const normalizedName = vote.full_name.trim().replace(/\s+/g, ' ').toLowerCase();

                if (!votesMap[normalizedName]) {
                    votesMap[normalizedName] = {
                        hasVoted: true,
                        firstVoteDate: vote.created_at
                    };
                } else {
                    // Берем самую раннюю дату
                    if (new Date(vote.created_at) < new Date(votesMap[normalizedName].firstVoteDate)) {
                        votesMap[normalizedName].firstVoteDate = vote.created_at;
                    }
                }
            });

            // Добавляем избирателей с информацией о голосовании
            allVoters.forEach((voter, index) => {
                const normalizedName = voter.full_name.trim().replace(/\s+/g, ' ').toLowerCase();
                const voteInfo = votesMap[normalizedName];

                let hasVoted = 'Нет';
                let voteDate = '-';

                if (voteInfo && voteInfo.hasVoted) {
                    hasVoted = 'Да';
                    // Конвертируем UTC время в локальное
                    voteDate = convertToLocalTime(voteInfo.firstVoteDate);
                }

                votersData.push([index + 1, voter.full_name, hasVoted, voteDate]);
            });

            // Создаём лист избирателей
            const votersWorksheet = XLSX.utils.aoa_to_sheet(votersData);
            votersWorksheet['!cols'] = [
                { wch: 10 }, // №
                { wch: 40 }, // ФИО
                { wch: 15 }, // Проголосовал
                { wch: 20 }  // Дата голосования
            ];
            XLSX.utils.book_append_sheet(workbook, votersWorksheet, '2. Избиратели');

            // ===== ЛИСТ 3: ИТОГИ =====
            const resultsData = [];
            const allShifts = Shift.getAll();

            allShifts.forEach((shift, shiftIndex) => {
                // Заголовок смены
                if (shiftIndex > 0) {
                    resultsData.push(['']); // Пустая строка между сменами
                    resultsData.push(['']); // Еще одна для лучшего разделения
                }
                resultsData.push([`СМЕНА: ${shift.name}`]);
                resultsData.push(['']);

                // Получаем статистику
                const shiftStats = Shift.getWithStats(shift.id);
                const candidates = Candidate.getStatsForShift(shift.id);

                // Сортируем по количеству голосов
                const sortedCandidates = candidates.sort((a, b) => b.vote_count - a.vote_count);

                // Определяем победителя
                const winner = sortedCandidates.length > 0 ? sortedCandidates[0] : null;

                // Победитель
                if (winner) {
                    resultsData.push(['🏆 ПОБЕДИТЕЛЬ:', winner.name]);
                    resultsData.push(['Голосов:', winner.vote_count]);
                    const percentage = shiftStats.stats.total_votes > 0
                        ? ((winner.vote_count / shiftStats.stats.total_votes) * 100).toFixed(1)
                        : 0;
                    resultsData.push(['Процент:', `${percentage}%`]);
                } else {
                    resultsData.push(['ПОБЕДИТЕЛЬ:', 'Не определен']);
                }
                resultsData.push(['']);

                // Рейтинг кандидатов
                resultsData.push(['РЕЙТИНГ КАНДИДАТОВ:']);
                resultsData.push(['Кандидат', 'Голосов', 'Процент']);

                sortedCandidates.forEach((candidate) => {
                    const percentage = shiftStats.stats.total_votes > 0
                        ? ((candidate.vote_count / shiftStats.stats.total_votes) * 100).toFixed(1)
                        : 0;
                    resultsData.push([
                        candidate.name,
                        candidate.vote_count,
                        `${percentage}%`
                    ]);
                });

                // Добавляем статистику по специальным вариантам голосования
                resultsData.push(['']); // Пустая строка для разделения

                // Находим "Против всех" и "Воздержался" из shiftStats.candidates
                const againstAll = shiftStats.candidates.find(c => c.name === 'Против всех');
                const abstain = shiftStats.candidates.find(c => c.name === 'Воздержался');

                if (againstAll) {
                    const percentage = shiftStats.stats.total_votes > 0
                        ? ((againstAll.vote_count / shiftStats.stats.total_votes) * 100).toFixed(1)
                        : 0;
                    resultsData.push([
                        'Против всех',
                        againstAll.vote_count,
                        `${percentage}%`
                    ]);
                }

                if (abstain) {
                    const percentage = shiftStats.stats.total_votes > 0
                        ? ((abstain.vote_count / shiftStats.stats.total_votes) * 100).toFixed(1)
                        : 0;
                    resultsData.push([
                        'Воздержался',
                        abstain.vote_count,
                        `${percentage}%`
                    ]);
                }
            });

            // Создаём лист итогов
            const resultsWorksheet = XLSX.utils.aoa_to_sheet(resultsData);
            resultsWorksheet['!cols'] = [
                { wch: 35 }, // Кандидат
                { wch: 15 }, // Голосов
                { wch: 15 }  // Процент
            ];
            XLSX.utils.book_append_sheet(workbook, resultsWorksheet, '3. Итоги');

            // Генерируем файл
            const buffer = XLSX.write(workbook, {
                type: 'buffer',
                bookType: 'xlsx',
                bookSST: false
            });

            // Отправляем файл
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=results.xlsx');
            res.send(buffer);

        } catch (error) {
            next(error);
        }
    }
}

module.exports = StatsController;
