const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Shift = require('../models/Shift');
const Candidate = require('../models/Candidate');
const Vote = require('../models/Vote');
const User = require('../models/User');
const Settings = require('../models/Settings');
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

    // Получить все голоса
    static getAllVotes(req, res, next) {
        try {
            const votes = Vote.getAll();
            res.json({ votes });
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

            // Автоматически создаем специальные варианты
            try {
                Candidate.create(shiftId, 'Против всех', 'Голос против всех кандидатов', null);
                Candidate.create(shiftId, 'Воздержаться', 'Воздержаться от голосования', null);
            } catch (candidateError) {
                logger.warn('Failed to create default options for shift:', candidateError);
            }

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
            const { shiftId, name, description, photoUrl } = req.body;

            if (!shiftId || !name) {
                return res.status(400).json({ error: 'Необходимы shiftId и name' });
            }

            const candidateId = Candidate.create(shiftId, name, description, photoUrl);
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

    // Экспорт данных в CSV
    static exportVotes(req, res, next) {
        try {
            const votes = Vote.getAll();

            // Формируем CSV
            const csvHeader = 'ID,VK ID,Full Name,Nickname,Shift,Candidate,Vote Type,Date\n';
            const csvRows = votes.map(v =>
                `${v.id},"${v.vk_id}","${v.full_name}","${v.nickname}","${v.shift_name}","${v.candidate_name}","${v.vote_type}","${v.created_at}"`
            ).join('\n');

            const csv = csvHeader + csvRows;

            Admin.logAction(req.admin.id, 'EXPORT_VOTES', `Count: ${votes.length}`, req.ip);

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=votes.csv');
            res.send('\uFEFF' + csv); // BOM для корректного отображения кириллицы в Excel

        } catch (error) {
            next(error);
        }
    }
}

module.exports = AdminController;
