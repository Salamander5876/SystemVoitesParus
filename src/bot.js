require('dotenv').config();

// Установка часового пояса Asia/Chita
process.env.TZ = 'Asia/Chita';

// ---------- МАССИВЫ ДЛЯ ГЕНЕРАЦИИ ПСЕВДОНИМОВ ----------
const adjectives = [
    "Сияющий", "Лунный", "Звёздный", "Туманный", "Искрящийся",
    "Серебристый", "Эфирный", "Солнечный", "Таинственный", "Мерцающий",
    "Кристальный", "Волшебный", "Небесный", "Добрый", "Закатный"
];

const nouns = [
    "Дух", "Эльф", "Феникс", "Единорог", "Грифон", "Дракон",
    "Ангел", "Гном", "Сильф", "Леший", "Водяной", "Домовой",
    "Светлячок", "Хранитель", "Странник", "Чародей", "Звёздочет",
    "Лунатик", "Волшебник", "Кот", "Мудрец", "Герой", "Филин",
    "Фавн", "Рыцарь", "Бард", "Морж", "Страж", "Вестник", "Мечтатель"
];
// ---------------------------------------------------------

const { VK, Keyboard } = require('vk-io');
const { QuestionManager } = require('vk-io-question');
const axios = require('axios');
const logger = require('./utils/logger');
const { MESSAGES, BUTTONS, USER_STATES } = require('./config/constants');

const vk = new VK({
    token: process.env.VK_TOKEN,
    apiVersion: '5.199',
    pollingGroupId: process.env.VK_GROUP_ID
});
const questionManager = new QuestionManager();

// Хранилище состояний
const userStates = new Map();

// API клиент
const API_URL = `http://localhost:${process.env.PORT || 3000}/api`;
const API_HEADERS = { 'x-bot-secret': process.env.VK_SECRET };

function getUserState(userId) {
    if (!userStates.has(userId)) {
        userStates.set(userId, { state: USER_STATES.IDLE, data: {} });
    }
    return userStates.get(userId);
}

function updateUserState(userId, state, data = {}) {
    const current = getUserState(userId);
    userStates.set(userId, { state, data: { ...current.data, ...data } });
}

function resetUserState(userId) {
    userStates.set(userId, { state: USER_STATES.IDLE, data: {} });
}

// ---------------------------------------------------------
// Генерация уникального псевдонима
// ---------------------------------------------------------
async function generateUniqueNickname() {
    const used = new Set();

    // Получаем уже занятые псевдонимы
    try {
        const { data } = await axios.get(`${API_URL}/users/nicknames`);
        data.nicknames.forEach(n => used.add(n));
    } catch (err) {
        logger.warn('Не удалось получить список псевдонимов, продолжаем без проверки');
    }

    let nickname;
    let attempts = 0;
    const maxAttempts = 200;   // 15×30 = 450 базовых комбинаций

    do {
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        nickname = `${adj} ${noun}`;

        attempts++;
        if (attempts > maxAttempts) {
            // Если закончились комбинации – добавляем случайное число
            const num = Math.floor(Math.random() * 900) + 100;
            nickname = `${adj} ${noun} ${num}`;
            break;
        }
    } while (used.has(nickname));

    return nickname;
}
// ---------------------------------------------------------

// API функции
async function getVotingStatus() {
    try {
        const { data } = await axios.get(`${API_URL}/status`);
        return data;
    } catch (error) {
        logger.error('Error fetching status:', error);
        return null;
    }
}

async function getShifts() {
    try {
        const { data } = await axios.get(`${API_URL}/shifts`);
        return data.shifts;
    } catch (error) {
        logger.error('Error fetching shifts:', error);
        return [];
    }
}

async function getCandidates(shiftId) {
    try {
        const { data } = await axios.get(`${API_URL}/shifts/${shiftId}/candidates`);
        return data.candidates;
    } catch (error) {
        logger.error('Error fetching candidates:', error);
        return [];
    }
}

async function submitVote(vkId, fullName, nickname, shiftId, candidateId, voteType) {
    try {
        const { data } = await axios.post(`${API_URL}/vote`, {
            vkId: vkId.toString(),
            fullName,
            nickname,
            shiftId,
            candidateId,
            voteType
        }, { headers: API_HEADERS });
        return data;
    } catch (error) {
        logger.error('Error submitting vote:', error);
        if (error.response) {
            return { success: false, error: error.response.data.error };
        }
        return { success: false, error: 'Ошибка сервера' };
    }
}

// Обработчик сообщений
vk.updates.on('message_new', questionManager.middleware);

vk.updates.on('message_new', async (context) => {
    const userId = context.senderId;
    const text = context.text || '';
    const state = getUserState(userId);

    try {
        // ----------------- Команды -----------------
        if (text === '/start' || text === 'Начать') {
            resetUserState(userId);
            return context.send(MESSAGES.WELCOME, {
                keyboard: Keyboard.builder()
                    .textButton({ label: BUTTONS.START_VOTING, color: Keyboard.PRIMARY_COLOR })
                    .row()
                    .textButton({ label: '/help', color: Keyboard.SECONDARY_COLOR })
            });
        }

        if (text === '/help') {
            return context.send(MESSAGES.HELP);
        }

        if (text === '/status') {
            const status = await getVotingStatus();
            if (status) {
                return context.send(MESSAGES.STATUS_INFO(status.status, status.startTime, status.endTime));
            }
            return context.send('Не удалось получить статус');
        }

        if (text === '/shifts') {
            const shifts = await getShifts();
            if (shifts.length === 0) {
                return context.send('Смены не найдены');
            }
            let msg = 'Список смен:\n\n';
            shifts.forEach((s, i) => {
                msg += `${i + 1}. ${s.name}`;
                if (s.description) msg += ` - ${s.description}`;
                msg += '\n';
            });
            return context.send(msg);
        }

        if (text === '/mystats') {
            try {
                const { data } = await axios.get(`${API_URL}/users/${userId}/stats`);
                const { user, stats, votes } = data;
                let msg = `Ваша статистика:\n\n`;
                msg += `Псевдоним: ${user.nickname}\n`;
                msg += `Всего голосов: ${stats.totalVotes}\n`;
                msg += `Смен проголосовано: ${stats.shiftsVoted}\n`;
                if (votes.length > 0) {
                    msg += `\nВаши голоса:\n`;
                    votes.forEach(v => {
                        let choice = v.candidate_name;
                        if (v.vote_type === 'against_all') choice = 'Против всех';
                        else if (v.vote_type === 'abstain') choice = 'Воздержался';
                        msg += `• ${v.shift_name}: ${choice}\n`;
                    });
                }
                return context.send(msg);
            } catch (error) {
                return context.send(error.response?.status === 404 ? 'Вы ещё не голосовали' : MESSAGES.ERROR);
            }
        }

        // ----------------- Начало голосования -----------------
        if (text === '/vote' || text === BUTTONS.START_VOTING) {
            const status = await getVotingStatus();
            if (!status) return context.send(MESSAGES.ERROR);
            if (status.status === 'not_started') return context.send(MESSAGES.VOTING_NOT_STARTED);
            if (status.status === 'finished') return context.send(MESSAGES.VOTING_ENDED);

            updateUserState(userId, USER_STATES.AWAITING_NAME);
            return context.send(MESSAGES.ASK_NAME, {
                keyboard: Keyboard.builder()
                    .textButton({ label: BUTTONS.CANCEL, color: Keyboard.NEGATIVE_COLOR })
            });
        }

        // ----------------- Отмена -----------------
        if (text === BUTTONS.CANCEL) {
            resetUserState(userId);
            return context.send('Отменено', {
                keyboard: Keyboard.builder()
                    .textButton({ label: BUTTONS.START_VOTING })
            });
        }

        // ----------------- Продолжить после голоса -----------------
        if (text === BUTTONS.CONTINUE) {
            if (state.data.fullName && state.data.nickname) {
                updateUserState(userId, USER_STATES.AWAITING_SHIFT);
                const shifts = await getShifts();
                const kb = Keyboard.builder();
                shifts.forEach(s => kb.textButton({ label: s.name }).row());
                kb.textButton({ label: BUTTONS.FINISH, color: Keyboard.NEGATIVE_COLOR });
                return context.send('Выберите смену:', { keyboard: kb });
            }
        }

        // ----------------- Завершить -----------------
        if (text === BUTTONS.FINISH) {
            resetUserState(userId);
            return context.send('Спасибо!', {
                keyboard: Keyboard.builder()
                    .textButton({ label: BUTTONS.START_VOTING })
            });
        }

        // ----------------- Обработка состояний -----------------
        switch (state.state) {

            // ----- ВВОД ФИО -----
            case USER_STATES.AWAITING_NAME:
                if (text.length < 5 || !/^[а-яА-ЯёЁ\s]+$/.test(text)) {
                    return context.send(MESSAGES.ERROR_INVALID_NAME);
                }

                // Генерируем уникальный псевдоним
                const nickname = await generateUniqueNickname();

                updateUserState(userId, USER_STATES.AWAITING_SHIFT, {
                    fullName: text,
                    nickname
                });

                const shifts = await getShifts();
                if (shifts.length === 0) {
                    resetUserState(userId);
                    return context.send('Нет активных смен для голосования');
                }

                const kb = Keyboard.builder();
                shifts.forEach(s => kb.textButton({ label: s.name }).row());
                kb.textButton({ label: BUTTONS.CANCEL, color: Keyboard.NEGATIVE_COLOR });

                return context.send(
                    `${MESSAGES.NICKNAME_ASSIGNED(nickname)}\n\n${MESSAGES.CHOOSE_SHIFT}`,
                    { keyboard: kb }
                );

            // ----- ВЫБОР СМЕНЫ -----
            case USER_STATES.AWAITING_SHIFT:
                const allShifts = await getShifts();
                const shift = allShifts.find(s => s.name === text);
                if (!shift) return context.send('Неверная смена');

                const candidates = await getCandidates(shift.id);
                if (candidates.length === 0) return context.send('Нет кандидатов');

                const allOptions = [
                    ...candidates,
                    { id: null, name: 'Против всех', is_special: true },
                    { id: null, name: 'Воздержаться', is_special: true }
                ];

                updateUserState(userId, USER_STATES.AWAITING_CANDIDATE, {
                    shiftId: shift.id,
                    shiftName: shift.name
                });

                const kbCand = Keyboard.builder();
                allOptions.forEach(c => kbCand.textButton({ label: c.name }).row());
                kbCand.textButton({ label: BUTTONS.BACK, color: Keyboard.SECONDARY_COLOR });
                return context.send(MESSAGES.CHOOSE_CANDIDATE, { keyboard: kbCand });

            // ----- ВЫБОР КАНДИДАТА -----
            case USER_STATES.AWAITING_CANDIDATE:
                if (text === BUTTONS.BACK) {
                    // Возврат к выбору смены (псевдоним уже есть)
                    updateUserState(userId, USER_STATES.AWAITING_SHIFT);
                    const shiftsBack = await getShifts();
                    const kbBack = Keyboard.builder();
                    shiftsBack.forEach(s => kbBack.textButton({ label: s.name }).row());
                    kbBack.textButton({ label: BUTTONS.CANCEL, color: Keyboard.NEGATIVE_COLOR });
                    return context.send(MESSAGES.CHOOSE_SHIFT, { keyboard: kbBack });
                }

                const cands = await getCandidates(state.data.shiftId);
                const special = [{ id: null, name: 'Против всех' }, { id: null, name: 'Воздержаться' }];
                const allVoteOptions = [...cands, ...special];

                const selected = allVoteOptions.find(c => c.name === text);
                if (!selected) return context.send('Неверный вариант');

                let voteType = 'candidate';
                let candidateId = selected.id;

                if (text === 'Против всех') { voteType = 'against_all'; candidateId = null; }
                else if (text === 'Воздержаться') { voteType = 'abstain'; candidateId = null; }

                updateUserState(userId, USER_STATES.AWAITING_CONFIRMATION, {
                    candidateId,
                    candidateName: text,
                    voteType
                });

                const confirmMsg = `Подтвердите ваш выбор:\n\n` +
                    `Смена: ${state.data.shiftName}\n` +
                    `Ваш голос: ${text}`;

                return context.send(confirmMsg, {
                    keyboard: Keyboard.builder()
                        .textButton({ label: BUTTONS.CONFIRM, color: Keyboard.POSITIVE_COLOR })
                        .textButton({ label: BUTTONS.CHANGE, color: Keyboard.SECONDARY_COLOR })
                });

            // ----- ПОДТВЕРЖДЕНИЕ -----
            case USER_STATES.AWAITING_CONFIRMATION:
                if (text === BUTTONS.CHANGE) {
                    updateUserState(userId, USER_STATES.AWAITING_CANDIDATE);
                    return;
                }
                if (text !== BUTTONS.CONFIRM) return context.send('Нажмите «Подтвердить»');

                const voteData = state.data;
                const result = await submitVote(
                    userId,
                    voteData.fullName,
                    voteData.nickname,
                    voteData.shiftId,
                    voteData.candidateId,
                    voteData.voteType
                );

                if (result.success) {
                    // Сохраняем ФИО + псевдоним для дальнейшего голосования
                    updateUserState(userId, USER_STATES.AWAITING_SHIFT, {
                        fullName: voteData.fullName,
                        nickname: voteData.nickname
                    });

                    return context.send(
                        MESSAGES.VOTE_SUCCESS(voteData.nickname, voteData.shiftName, voteData.candidateName),
                        {
                            keyboard: Keyboard.builder()
                                .textButton({ label: BUTTONS.CONTINUE, color: Keyboard.POSITIVE_COLOR })
                                .textButton({ label: BUTTONS.FINISH, color: Keyboard.SECONDARY_COLOR })
                        }
                    );
                } else {
                    await context.send(`Ошибка: ${result.error}`);
                    if (result.error.includes('голосовали')) {
                        updateUserState(userId, USER_STATES.AWAITING_SHIFT, {
                            fullName: voteData.fullName,
                            nickname: voteData.nickname
                        });
                    }
                }
                break;
        }

    } catch (error) {
        logger.error('Bot error:', error);
        return context.send('Произошла ошибка. Попробуйте /start');
    }
});

// ---------------------------------------------------------
// HTTP-сервер для уведомлений от админ-панели
// ---------------------------------------------------------
const express = require('express');
const botApp = express();
const BOT_PORT = process.env.BOT_API_PORT || 3001;

botApp.use(express.json());

botApp.post('/api/notify-vote-cancelled', async (req, res) => {
    try {
        const { vkId, shiftName, reason } = req.body;
        if (!vkId || !shiftName || !reason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await vk.api.messages.send({
            user_id: vkId,
            message: `Уведомление об аннулировании голоса\n\n` +
                `Ваш голос на смене "${shiftName}" был аннулирован администратором.\n\n` +
                `Причина: ${reason}\n\n` +
                `Теперь вы можете проголосовать заново. Используйте /start.`,
            random_id: Math.floor(Math.random() * 1000000)
        });

        logger.info(`Vote cancellation notification sent to ${vkId} (shift: ${shiftName})`);
        res.json({ success: true });
    } catch (error) {
        logger.error('Error sending cancellation notification:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

botApp.listen(BOT_PORT, () => {
    logger.info(`Bot API server listening on port ${BOT_PORT}`);
    console.log(`Bot API сервер запущен на порту ${BOT_PORT}`);
});

// ---------------------------------------------------------
// Запуск VK-бота
// ---------------------------------------------------------
vk.updates.start()
    .then(() => {
        logger.info('VK Bot started (polling)');
        console.log('VK Бот запущен (polling)!');
    })
    .catch((error) => {
        logger.error('Bot error:', error);
        console.error('Ошибка:', error.message);
    });

module.exports = vk;