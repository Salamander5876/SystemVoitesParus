const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Shift = require('../models/Shift');
const Candidate = require('../models/Candidate');
const Vote = require('../models/Vote');
const User = require('../models/User');
const Settings = require('../models/Settings');
const EligibleVoter = require('../models/EligibleVoter');
const MessageQueue = require('../models/MessageQueue');
const logger = require('../utils/logger');
const { convertArrayToLocalTime, convertToLocalTime } = require('../utils/timezone');

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

            // Конвертируем время в локальную timezone
            const logsWithLocalTime = convertArrayToLocalTime(logs, ['created_at']);

            res.json({ logs: logsWithLocalTime });
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
                    resultsData.push(['ПОБЕДИТЕЛЬ:', winner.name]);
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
            });

            // Создаем лист Итоги
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

            // Добавляем уведомление в очередь для отправки через бота
            try {
                const message = `⚠️ Уведомление об аннулировании голосов\n\n` +
                    `Все ваши голоса (${cancelledCount}) были аннулированы администратором.\n\n` +
                    `Причина: ${reason.trim()}\n\n` +
                    `Теперь вы можете проголосовать заново. Используйте /start.`;

                MessageQueue.enqueue(vkId.toString(), message);
                logger.info('Cancellation notification queued', {
                    vk_id: vkId,
                    cancelled_count: cancelledCount
                });
            } catch (queueError) {
                logger.error('Failed to queue notification:', queueError);
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

            // Сохраняем текущий пароль администратора перед сбросом
            const currentAdmin = Admin.getById(req.admin.id);
            const savedPasswordHash = currentAdmin ? currentAdmin.password_hash : null;
            const savedUsername = currentAdmin ? currentAdmin.username : (process.env.ADMIN_USERNAME || 'admin');

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

            // Убеждаемся, что partial unique index существует (для поддержки повторного голосования после аннулирования)
            try {
                db.exec('DROP INDEX IF EXISTS idx_unique_active_votes');
                db.exec(`
                    CREATE UNIQUE INDEX idx_unique_active_votes
                    ON votes(user_id, shift_id)
                    WHERE is_cancelled = 0
                `);
                logger.info('Partial unique index recreated');
            } catch (indexError) {
                logger.warn('Could not recreate partial unique index:', indexError.message);
            }

            // Загружаем и выполняем seeds (начальные данные)
            const seedsSQL = fs.readFileSync(
                path.join(__dirname, '../database/seeds.sql'),
                'utf8'
            );
            db.exec(seedsSQL);

            // Пересоздаем администратора с сохраненным паролем
            const existingAdmin = Admin.getByUsername(savedUsername);

            if (savedPasswordHash) {
                // Восстанавливаем администратора с сохраненным паролем
                if (existingAdmin) {
                    // Обновляем существующего администратора сохраненным хешем пароля
                    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?')
                        .run(savedPasswordHash, existingAdmin.id);
                    logger.info('Admin password restored after database reset');
                } else {
                    // Создаем администратора с сохраненным хешем пароля
                    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
                        .run(savedUsername, savedPasswordHash);
                    logger.info('Admin recreated with saved password after database reset');
                }
            } else {
                // Если по какой-то причине не удалось сохранить пароль, используем дефолтный
                const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
                if (!existingAdmin) {
                    Admin.create(savedUsername, adminPassword);
                    logger.warn('Admin created with default password (saved password not available)');
                }
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

    // Смена пароля администратора
    static async changePassword(req, res, next) {
        try {
            const { oldPassword, newPassword, confirmPassword } = req.body;

            // Валидация входных данных
            if (!oldPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({ error: 'Новый пароль и подтверждение не совпадают' });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
            }

            // Проверяем старый пароль
            const admin = Admin.getByUsername(req.admin.username);
            const bcrypt = require('bcryptjs');
            const isOldPasswordValid = await bcrypt.compare(oldPassword, admin.password_hash);

            if (!isOldPasswordValid) {
                return res.status(401).json({ error: 'Неверный текущий пароль' });
            }

            // Меняем пароль
            await Admin.changePassword(req.admin.id, newPassword);

            // Логируем действие
            Admin.logAction(
                req.admin.id,
                'PASSWORD_CHANGED',
                'Администратор изменил свой пароль',
                req.ip
            );

            logger.info('Admin password changed', {
                admin_id: req.admin.id,
                username: req.admin.username
            });

            res.json({
                success: true,
                message: 'Пароль успешно изменён. Пожалуйста, войдите заново.'
            });

        } catch (error) {
            logger.error('Password change error:', error);
            next(error);
        }
    }
}

module.exports = AdminController;
