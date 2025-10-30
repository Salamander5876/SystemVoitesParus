const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Shift = require('../models/Shift');
const Candidate = require('../models/Candidate');
const Vote = require('../models/Vote');
const User = require('../models/User');
const Settings = require('../models/Settings');
const EligibleVoter = require('../models/EligibleVoter');
const logger = require('../utils/logger');

class AdminController {
    // Вход администратора
    static async login(req, res, next) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: 'Необходимы логин и пароль' });
            }

            const admin = await Admin.verify(username, password);

            if (!admin) {
                Admin.logAction(null, 'LOGIN_FAILED', `Username: ${username}`, req.ip);
                return res.status(401).json({ error: 'Неверный логин или пароль' });
            }

            const token = jwt.sign(
                { id: admin.id, username: admin.username },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '3600s' }
            );

            Admin.logAction(admin.id, 'LOGIN_SUCCESS', null, req.ip);

            res.json({
                token,
                expiresIn: parseInt(process.env.JWT_EXPIRES_IN) || 3600,
                admin: {
                    id: admin.id,
                    username: admin.username
                }
            });

        } catch (error) {
            next(error);
        }
    }

    // Управление голосованием
    static controlVoting(req, res, next) {
        try {
            const { action, startTime, endTime } = req.body;

            if (!action) {
                return res.status(400).json({ error: 'Необходимо указать действие' });
            }

            let message = '';

            switch (action) {
                case 'start':
                    Settings.startVoting(startTime, endTime);
                    message = 'Голосование запущено';
                    break;
                case 'stop':
                    Settings.stopVoting();
                    message = 'Голосование остановлено';
                    break;
                case 'pause':
                    Settings.pauseVoting();
                    message = 'Голосование приостановлено';
                    break;
                case 'reset':
                    Settings.resetVoting();
                    message = 'Голосование сброшено';
                    break;
                default:
                    return res.status(400).json({ error: 'Неверное действие' });
            }

            Admin.logAction(req.admin.id, 'VOTING_CONTROL', action, req.ip);

            // Отправляем WebSocket событие
            if (req.app.get('io')) {
                req.app.get('io').emit('voting_status_change', {
                    status: Settings.getVotingStatus(),
                    message
                });
            }

            res.json({ success: true, message });

        } catch (error) {
            next(error);
        }
    }

    // Получить все голоса (сгруппированные по псевдониму без персональных данных)
    static getAllVotes(req, res, next) {
        try {
            const groupedVotes = Vote.getGroupedByNickname();
            const shiftNames = Vote.getAllShiftNames();
            res.json({
                votes: groupedVotes,
                shifts: shiftNames
            });
        } catch (error) {
            next(error);
        }
    }

    // Создать смену
    static createShift(req, res, next) {
        try {
            const { name, description, startDate, endDate } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Необходимо указать название смены' });
            }

            const shiftId = Shift.create(name, description, startDate, endDate);

            Admin.logAction(req.admin.id, 'SHIFT_CREATED', `ID: ${shiftId}, Name: ${name}`, req.ip);

            res.status(201).json({
                success: true,
                shiftId,
                message: 'Смена создана'
            });

        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') {
                return res.status(400).json({ error: 'Смена с таким названием уже существует' });
            }
            next(error);
        }
    }

    // Обновить смену
    static updateShift(req, res, next) {
        try {
            const { id } = req.params;
            const updated = Shift.update(id, req.body);

            if (!updated) {
                return res.status(404).json({ error: 'Смена не найдена' });
            }

            Admin.logAction(req.admin.id, 'SHIFT_UPDATED', `ID: ${id}`, req.ip);

            res.json({ success: true, message: 'Смена обновлена' });

        } catch (error) {
            next(error);
        }
    }

    // Удалить смену
    static deleteShift(req, res, next) {
        try {
            const { id } = req.params;
            const deleted = Shift.delete(id);

            if (!deleted) {
                return res.status(404).json({ error: 'Смена не найдена' });
            }

            Admin.logAction(req.admin.id, 'SHIFT_DELETED', `ID: ${id}`, req.ip);

            res.json({ success: true, message: 'Смена удалена' });

        } catch (error) {
            next(error);
        }
    }

    // Создать кандидата
    static createCandidate(req, res, next) {
        try {
            const { shiftId, name, description } = req.body;

            if (!shiftId || !name) {
                return res.status(400).json({ error: 'Необходимы shiftId и name' });
            }

            const candidateId = Candidate.create(shiftId, name, description);
            Admin.logAction(req.admin.id, 'CANDIDATE_CREATED', `ID: ${candidateId}, Name: ${name}`, req.ip);

            res.status(201).json({
                success: true,
                candidateId,
                message: 'Кандидат создан'
            });

        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') {
                return res.status(400).json({ error: 'Кандидат с таким именем уже существует на этой смене' });
            }
            next(error);
        }
    }

    // Обновить кандидата
    static updateCandidate(req, res, next) {
        try {
            const { id } = req.params;
            const updated = Candidate.update(id, req.body);

            if (!updated) {
                return res.status(404).json({ error: 'Кандидат не найден' });
            }

            Admin.logAction(req.admin.id, 'CANDIDATE_UPDATED', `ID: ${id}`, req.ip);

            res.json({ success: true, message: 'Кандидат обновлён' });

        } catch (error) {
            next(error);
        }
    }

    // Удалить кандидата
    static deleteCandidate(req, res, next) {
        try {
            const { id } = req.params;
            const deleted = Candidate.delete(id);

            if (!deleted) {
                return res.status(404).json({ error: 'Кандидат не найден' });
            }

            Admin.logAction(req.admin.id, 'CANDIDATE_DELETED', `ID: ${id}`, req.ip);

            res.json({ success: true, message: 'Кандидат удалён' });

        } catch (error) {
            next(error);
        }
    }

    // Получить все смены (включая неактивные)
    static getAllShifts(req, res, next) {
        try {
            const shifts = Shift.getAll();
            res.json({ shifts });
        } catch (error) {
            next(error);
        }
    }

    // Получить всех кандидатов
    static getAllCandidates(req, res, next) {
        try {
            const candidates = Candidate.getAll();
            res.json({ candidates });
        } catch (error) {
            next(error);
        }
    }

    // Получить логи
    static getAuditLogs(req, res, next) {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const logs = Admin.getAuditLogs(limit);
            res.json({ logs });
        } catch (error) {
            next(error);
        }
    }

    // Экспорт данных в Excel XLS (без персональных данных)
    static exportVotes(req, res, next) {
        try {
            const XLSX = require('xlsx');
            const groupedVotes = Vote.getGroupedByNickname();
            const shiftNames = Vote.getAllShiftNames();

            // ===== ЛИСТ 1: ГОЛОСА =====
            const votesData = [];

            // Заголовок
            const votesHeader = ['Псевдоним', ...shiftNames];
            votesData.push(votesHeader);

            // Данные
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

                votesData.push(row);
            });

            // Создаём workbook
            const workbook = XLSX.utils.book_new();

            // Лист 1: Голоса
            const votesWorksheet = XLSX.utils.aoa_to_sheet(votesData);
            const votesColWidths = [{ wch: 20 }]; // Псевдоним
            shiftNames.forEach(() => votesColWidths.push({ wch: 25 })); // Смены
            votesWorksheet['!cols'] = votesColWidths;
            XLSX.utils.book_append_sheet(workbook, votesWorksheet, 'Голоса');

            // ===== ЛИСТ 2: ИТОГИ =====
            const resultsData = [];
            const allShifts = Shift.getAll();

            allShifts.forEach((shift, shiftIndex) => {
                // Заголовок смены
                if (shiftIndex > 0) {
                    resultsData.push(['']); // Пустая строка между сменами
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

                // Статистика смены
                resultsData.push(['Всего голосов:', shiftStats.stats.total_votes]);
                resultsData.push(['Проголосовало:', shiftStats.stats.unique_voters]);
                resultsData.push(['']);

                // Победитель
                if (winner) {
                    resultsData.push(['🏆 ПОБЕДИТЕЛЬ:', winner.name]);
                    resultsData.push(['Голосов:', winner.vote_count]);
                    const percentage = shiftStats.stats.total_votes > 0
                        ? ((winner.vote_count / shiftStats.stats.total_votes) * 100).toFixed(1)
                        : 0;
                    resultsData.push(['Процент:', `${percentage}%`]);
                } else {
                    resultsData.push(['Победитель:', 'Не определен']);
                }
                resultsData.push(['']);

                // Все кандидаты
                resultsData.push(['РЕЙТИНГ КАНДИДАТОВ:']);
                resultsData.push(['Место', 'Кандидат', 'Голосов', 'Процент']);

                sortedCandidates.forEach((candidate, index) => {
                    const place = index + 1;
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
                    const percentage = shiftStats.stats.total_votes > 0
                        ? ((candidate.vote_count / shiftStats.stats.total_votes) * 100).toFixed(1)
                        : 0;
                    resultsData.push([
                        `${place} ${medal}`,
                        candidate.name,
                        candidate.vote_count,
                        `${percentage}%`
                    ]);
                });

                // Специальные голоса
                const againstAll = Vote.getAgainstAllCount(shift.id);
                const abstain = Vote.getAbstainCount(shift.id);

                resultsData.push(['']);
                resultsData.push(['СПЕЦИАЛЬНЫЕ ГОЛОСА:']);
                resultsData.push(['Против всех:', againstAll]);
                resultsData.push(['Воздержался:', abstain]);
            });

            // Создаем лист Итоги
            const resultsWorksheet = XLSX.utils.aoa_to_sheet(resultsData);
            resultsWorksheet['!cols'] = [
                { wch: 25 },
                { wch: 30 },
                { wch: 15 },
                { wch: 15 }
            ];
            XLSX.utils.book_append_sheet(workbook, resultsWorksheet, 'Итоги');

            // Генерируем файл
            const buffer = XLSX.write(workbook, {
                type: 'buffer',
                bookType: 'xlsx',
                bookSST: false
            });

            Admin.logAction(req.admin.id, 'EXPORT_VOTES', `Count: ${groupedVotes.length}`, req.ip);

            // Отправляем файл
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=results.xlsx');
            res.send(buffer);

        } catch (error) {
            next(error);
        }
    }

    // === Управление списком избирателей ===

    // Получить всех избирателей
    static getAllVoters(req, res, next) {
        try {
            const voters = EligibleVoter.getAll();
            const stats = EligibleVoter.getStats();
            res.json({ voters, stats });
        } catch (error) {
            next(error);
        }
    }

    // Получить статистику избирателей
    static getVotersStats(req, res, next) {
        try {
            const stats = EligibleVoter.getStats();
            res.json(stats);
        } catch (error) {
            next(error);
        }
    }

    // Загрузить список избирателей
    static uploadVoters(req, res, next) {
        try {
            const { voters } = req.body;

            if (!voters || !Array.isArray(voters)) {
                return res.status(400).json({ error: 'Необходимо передать массив ФИО избирателей' });
            }

            const result = EligibleVoter.bulkAdd(voters);

            Admin.logAction(
                req.admin.id,
                'VOTERS_UPLOADED',
                `Added: ${result.added}, Duplicates: ${result.duplicates}, Invalid: ${result.invalid}`,
                req.ip
            );

            res.json({
                success: true,
                message: 'Список избирателей загружен',
                ...result
            });

        } catch (error) {
            next(error);
        }
    }

    // Удалить избирателя
    static deleteVoter(req, res, next) {
        try {
            const { id } = req.params;
            const deleted = EligibleVoter.delete(id);

            if (!deleted) {
                return res.status(404).json({ error: 'Избиратель не найден' });
            }

            Admin.logAction(req.admin.id, 'VOTER_DELETED', `ID: ${id}`, req.ip);

            res.json({ success: true, message: 'Избиратель удалён' });

        } catch (error) {
            next(error);
        }
    }

    // Очистить список избирателей
    static clearVoters(req, res, next) {
        try {
            const count = EligibleVoter.deleteAll();

            Admin.logAction(req.admin.id, 'VOTERS_CLEARED', `Count: ${count}`, req.ip);

            res.json({
                success: true,
                message: 'Список избирателей очищен',
                count
            });

        } catch (error) {
            next(error);
        }
    }

    // Сбросить статус голосования избирателей
    static resetVotersStatus(req, res, next) {
        try {
            const count = EligibleVoter.resetVotingStatus();

            Admin.logAction(req.admin.id, 'VOTERS_STATUS_RESET', `Count: ${count}`, req.ip);

            res.json({
                success: true,
                message: 'Статус голосования сброшен',
                count
            });

        } catch (error) {
            next(error);
        }
    }

    // Экспорт списка избирателей в Excel
    static exportVoters(req, res, next) {
        try {
            const XLSX = require('xlsx');
            const voters = EligibleVoter.getAll();

            // Создаём данные для таблицы
            const data = [];

            // Заголовок
            const header = ['ID', 'ФИО', 'Проголосовал', 'Дата голосования'];
            data.push(header);

            // Данные
            voters.forEach(voter => {
                const row = [
                    voter.id,
                    voter.full_name,
                    voter.has_voted ? 'Да' : 'Нет',
                    voter.voted_at ? new Date(voter.voted_at).toLocaleString('ru-RU') : '-'
                ];
                data.push(row);
            });

            // Итоговая строка
            data.push([
                '',
                'ИТОГО:',
                `Проголосовало: ${voters.filter(v => v.has_voted).length} из ${voters.length}`,
                ''
            ]);

            // Создаём workbook и worksheet
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet(data);

            // Устанавливаем ширину колонок
            worksheet['!cols'] = [
                { wch: 10 },  // ID
                { wch: 35 },  // ФИО
                { wch: 15 },  // Проголосовал
                { wch: 20 }   // Дата голосования
            ];

            // Добавляем worksheet в workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Избиратели');

            // Генерируем файл
            const buffer = XLSX.write(workbook, {
                type: 'buffer',
                bookType: 'xls',
                bookSST: false
            });

            Admin.logAction(req.admin.id, 'EXPORT_VOTERS', `Count: ${voters.length}`, req.ip);

            // Отправляем файл
            res.setHeader('Content-Type', 'application/vnd.ms-excel');
            res.setHeader('Content-Disposition', 'attachment; filename=voters.xls');
            res.send(buffer);

        } catch (error) {
            next(error);
        }
    }

    // Получить все голоса с полной информацией (для журнала аудита)
    static async getVotesAuditLog(req, res, next) {
        try {
            const votes = Vote.getAllWithFullInfo();

            // Получаем информацию о пользователях из VK API
            const vkIds = [...new Set(votes.map(v => v.vk_id))]; // Уникальные VK ID

            let vkUsersMap = {};

            if (vkIds.length > 0) {
                try {
                    const axios = require('axios');
                    const VK_TOKEN = process.env.VK_TOKEN;

                    // VK API позволяет запрашивать до 1000 пользователей за раз
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
                    // Продолжаем без данных из VK
                }
            }

            // Группируем голоса по VK ID
            const groupedVotes = {};

            votes.forEach(vote => {
                if (!groupedVotes[vote.vk_id]) {
                    groupedVotes[vote.vk_id] = {
                        vk_id: vote.vk_id,
                        full_name: vote.full_name,
                        vk_first_name: vkUsersMap[vote.vk_id]?.first_name || null,
                        vk_last_name: vkUsersMap[vote.vk_id]?.last_name || null,
                        created_at: vote.created_at,
                        votes_count: 0,
                        all_cancelled: true,
                        cancellation_reason: null // Для админки
                    };
                }

                groupedVotes[vote.vk_id].votes_count++;

                // Если есть хотя бы один НЕ аннулированный голос - значит не все аннулированы
                if (!vote.is_cancelled) {
                    groupedVotes[vote.vk_id].all_cancelled = false;
                } else if (vote.cancellation_reason) {
                    // Сохраняем причину аннулирования (берем последнюю)
                    groupedVotes[vote.vk_id].cancellation_reason = vote.cancellation_reason;
                }

                // Берем самую раннюю дату голосования
                if (new Date(vote.created_at) < new Date(groupedVotes[vote.vk_id].created_at)) {
                    groupedVotes[vote.vk_id].created_at = vote.created_at;
                }
            });

            // Преобразуем в массив
            const votesArray = Object.values(groupedVotes).map((vote, index) => ({
                id: index + 1,
                vk_id: vote.vk_id,
                full_name: vote.full_name,
                vk_first_name: vote.vk_first_name,
                vk_last_name: vote.vk_last_name,
                created_at: vote.created_at,
                votes_count: vote.votes_count,
                is_cancelled: vote.all_cancelled ? 1 : 0,
                cancellation_reason: vote.cancellation_reason
            }));

            // Сортируем по дате (новые сначала)
            votesArray.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            // Переназначаем ID после сортировки
            votesArray.forEach((vote, index) => {
                vote.id = index + 1;
            });

            res.json({
                success: true,
                votes: votesArray
            });

        } catch (error) {
            next(error);
        }
    }

    // Аннулировать ВСЕ голоса пользователя по VK ID
    static async cancelVote(req, res, next) {
        try {
            const { vkId } = req.params;
            const { reason } = req.body;

            if (!reason || reason.trim().length === 0) {
                return res.status(400).json({ error: 'Необходимо указать причину аннулирования' });
            }

            // Получаем ВСЕ голоса этого пользователя
            const db = require('../config/database');
            const userVotes = db.prepare(`
                SELECT v.id, v.vote_type, v.candidate_id, v.is_cancelled, v.shift_id,
                       u.vk_id, u.full_name,
                       s.name as shift_name
                FROM votes v
                JOIN users u ON v.user_id = u.id
                JOIN shifts s ON v.shift_id = s.id
                WHERE u.vk_id = ?
            `).all(vkId.toString());

            if (userVotes.length === 0) {
                return res.status(404).json({ error: 'Голоса пользователя не найдены' });
            }

            // Проверяем, есть ли неаннулированные голоса
            const activeVotes = userVotes.filter(v => !v.is_cancelled);
            if (activeVotes.length === 0) {
                return res.status(400).json({ error: 'Все голоса пользователя уже аннулированы' });
            }

            // Аннулируем все голоса
            let cancelledCount = 0;
            const candidatesToDecrement = [];

            for (const vote of activeVotes) {
                const success = Vote.cancelVote(vote.id, req.admin.id, reason.trim());

                if (success) {
                    cancelledCount++;

                    // Сохраняем кандидатов для декремента
                    if (vote.vote_type === 'candidate' && vote.candidate_id) {
                        candidatesToDecrement.push(vote.candidate_id);
                    }
                }
            }

            // Уменьшаем счетчики всех кандидатов
            for (const candidateId of candidatesToDecrement) {
                Candidate.decrementVoteCount(candidateId);
                logger.info('Candidate vote count decremented after cancellation', {
                    candidate_id: candidateId,
                    vk_id: vkId
                });
            }

            // Сбрасываем статус избирателя (если список избирателей используется)
            const voterStats = EligibleVoter.getStats();
            if (voterStats.total > 0 && userVotes.length > 0) {
                EligibleVoter.unmarkAsVoted(userVotes[0].full_name);
                logger.info('Voter status reset after votes cancellation', {
                    full_name: userVotes[0].full_name,
                    vk_id: vkId
                });
            }

            // Логируем действие
            Admin.logAction(
                req.admin.id,
                'CANCEL_ALL_USER_VOTES',
                `VK ID: ${vkId}, User: ${userVotes[0].full_name}, Cancelled: ${cancelledCount} votes, Reason: ${reason}`,
                req.ip
            );

            // Отправляем одно уведомление о том, что ВСЕ голоса аннулированы
            try {
                const botApiUrl = process.env.BOT_API_URL || 'http://localhost:3001';
                const fetch = require('node-fetch');

                await fetch(`${botApiUrl}/api/notify-all-votes-cancelled`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vkId: vkId.toString(),
                        reason: reason.trim(),
                        votesCount: cancelledCount
                    })
                });
            } catch (notifyError) {
                // Не прерываем выполнение, если уведомление не отправилось
                console.error('Failed to send VK notification:', notifyError);
            }

            res.json({
                success: true,
                message: `Аннулировано голосов: ${cancelledCount}`,
                cancelledCount
            });

        } catch (error) {
            next(error);
        }
    }

    // Опубликовать результаты
    static publishResults(req, res, next) {
        try {
            Settings.publishResults();

            logger.info('Results published', {
                admin_id: req.admin.id,
                timestamp: new Date().toISOString()
            });

            // Отправляем WebSocket событие
            if (req.app.get('io')) {
                req.app.get('io').emit('results_published', {
                    published: true,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({
                success: true,
                message: 'Результаты опубликованы'
            });

        } catch (error) {
            next(error);
        }
    }

    // Скрыть результаты
    static unpublishResults(req, res, next) {
        try {
            Settings.unpublishResults();

            logger.info('Results unpublished', {
                admin_id: req.admin.id,
                timestamp: new Date().toISOString()
            });

            // Отправляем WebSocket событие
            if (req.app.get('io')) {
                req.app.get('io').emit('results_published', {
                    published: false,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({
                success: true,
                message: 'Результаты скрыты'
            });

        } catch (error) {
            next(error);
        }
    }

    // Полный сброс базы данных
    static resetDatabase(req, res, next) {
        try {
            const db = require('../config/database');
            const fs = require('fs');
            const path = require('path');

            logger.warn('Database reset initiated', {
                admin_id: req.admin.id,
                timestamp: new Date().toISOString()
            });

            // Список всех таблиц
            const tables = [
                'votes',
                'users',
                'candidates',
                'shifts',
                'eligible_voters',
                'audit_logs',
                'settings'
            ];

            // Отключаем foreign keys для удаления
            db.exec('PRAGMA foreign_keys = OFF');

            // Удаляем все данные из таблиц
            tables.forEach(table => {
                db.exec(`DELETE FROM ${table}`);
                db.exec(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
            });

            // Включаем обратно foreign keys
            db.exec('PRAGMA foreign_keys = ON');

            // Загружаем и выполняем seeds (начальные данные)
            const seedsSQL = fs.readFileSync(
                path.join(__dirname, '../database/seeds.sql'),
                'utf8'
            );
            db.exec(seedsSQL);

            // Пересоздаем администратора
            const adminUsername = process.env.ADMIN_USERNAME || 'admin';
            const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
            const existingAdmin = Admin.getByUsername(adminUsername);

            if (!existingAdmin) {
                Admin.create(adminUsername, adminPassword);
            }

            logger.warn('Database reset completed', {
                admin_id: req.admin.id,
                timestamp: new Date().toISOString()
            });

            // Отправляем WebSocket событие
            if (req.app.get('io')) {
                req.app.get('io').emit('database_reset', {
                    timestamp: new Date().toISOString()
                });
            }

            res.json({
                success: true,
                message: 'База данных успешно сброшена'
            });

        } catch (error) {
            logger.error('Database reset error:', error);
            next(error);
        }
    }
}

module.exports = AdminController;
