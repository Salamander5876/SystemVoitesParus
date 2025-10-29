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

            // Создаём данные для таблицы
            const data = [];

            // Заголовок
            const header = ['Псевдоним', ...shiftNames];
            data.push(header);

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

                data.push(row);
            });

            // Создаём workbook и worksheet
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet(data);

            // Устанавливаем ширину колонок
            const colWidths = [{ wch: 20 }]; // Псевдоним
            shiftNames.forEach(() => colWidths.push({ wch: 25 })); // Смены
            worksheet['!cols'] = colWidths;

            // Добавляем worksheet в workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Голоса');

            // Генерируем файл
            const buffer = XLSX.write(workbook, {
                type: 'buffer',
                bookType: 'xls',
                bookSST: false
            });

            Admin.logAction(req.admin.id, 'EXPORT_VOTES', `Count: ${groupedVotes.length}`, req.ip);

            // Отправляем файл
            res.setHeader('Content-Type', 'application/vnd.ms-excel');
            res.setHeader('Content-Disposition', 'attachment; filename=votes.xls');
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

            // Добавляем информацию из VK к голосам
            const votesWithVkInfo = votes.map(vote => ({
                ...vote,
                vk_first_name: vkUsersMap[vote.vk_id]?.first_name || null,
                vk_last_name: vkUsersMap[vote.vk_id]?.last_name || null
            }));

            res.json({
                success: true,
                votes: votesWithVkInfo
            });

        } catch (error) {
            next(error);
        }
    }

    // Аннулировать голос
    static async cancelVote(req, res, next) {
        try {
            const { voteId } = req.params;
            const { reason } = req.body;

            if (!reason || reason.trim().length === 0) {
                return res.status(400).json({ error: 'Необходимо указать причину аннулирования' });
            }

            // Получаем информацию о голосе
            const vote = Vote.getVoteWithUserInfo(parseInt(voteId));

            if (!vote) {
                return res.status(404).json({ error: 'Голос не найден' });
            }

            if (vote.is_cancelled) {
                return res.status(400).json({ error: 'Голос уже аннулирован' });
            }

            // Аннулируем голос
            const success = Vote.cancelVote(parseInt(voteId), req.admin.id, reason.trim());

            if (!success) {
                return res.status(500).json({ error: 'Не удалось аннулировать голос' });
            }

            // Уменьшаем счетчик кандидата (если это был голос за кандидата)
            if (vote.vote_type === 'candidate' && vote.candidate_id) {
                Candidate.decrementVoteCount(vote.candidate_id);
                logger.info('Candidate vote count decremented after cancellation', {
                    candidate_id: vote.candidate_id,
                    vote_id: voteId
                });
            }

            // Сбрасываем статус избирателя (если список избирателей используется)
            const voterStats = EligibleVoter.getStats();
            if (voterStats.total > 0) {
                EligibleVoter.unmarkAsVoted(vote.full_name);
                logger.info('Voter status reset after vote cancellation', {
                    full_name: vote.full_name,
                    vote_id: voteId
                });
            }

            // Логируем действие
            Admin.logAction(
                req.admin.id,
                'CANCEL_VOTE',
                `Vote ID: ${voteId}, User: ${vote.full_name}, Shift: ${vote.shift_name}, Reason: ${reason}`,
                req.ip
            );

            // Отправляем уведомление в VK
            try {
                const botApiUrl = process.env.BOT_API_URL || 'http://localhost:3001';
                const fetch = require('node-fetch');

                await fetch(`${botApiUrl}/api/notify-vote-cancelled`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vkId: vote.vk_id,
                        shiftName: vote.shift_name,
                        reason: reason.trim()
                    })
                });
            } catch (notifyError) {
                // Не прерываем выполнение, если уведомление не отправилось
                console.error('Failed to send VK notification:', notifyError);
            }

            res.json({
                success: true,
                message: 'Голос аннулирован'
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
