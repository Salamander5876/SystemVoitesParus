require('dotenv').config();

// Установка часового пояса Asia/Chita
process.env.TZ = 'Asia/Chita';

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
        userStates.set(userId, {
            state: USER_STATES.IDLE,
            data: {
                messagesToDelete: [] // Массив ID сообщений для удаления
            }
        });
    }
    return userStates.get(userId);
}

function updateUserState(userId, state, data = {}) {
    const current = getUserState(userId);
    userStates.set(userId, {
        state,
        data: { ...current.data, ...data }
    });
}

function resetUserState(userId) {
    userStates.set(userId, {
        state: USER_STATES.IDLE,
        data: { messagesToDelete: [] }
    });
}

// Функция для удаления сообщений пользователя (для анонимности)
async function deleteUserMessage(userId, conversationMessageId) {
    try {
        await vk.api.messages.delete({
            peer_id: userId,
            conversation_message_ids: [conversationMessageId],
            delete_for_all: 1
        });
        logger.info(`Deleted message ${conversationMessageId} for user ${userId}`);
    } catch (error) {
        logger.error('Error deleting message:', error);
    }
}

// ---------------------------------------------------------
// Генерация уникального псевдонима (запрос к серверу)
// ---------------------------------------------------------
async function generateUniqueNickname() {
    try {
        const { data } = await axios.post(`${API_URL}/generate-nickname`, {}, {
            headers: API_HEADERS
        });

        if (data.success && data.nickname) {
            logger.info(`Received unique nickname from server: ${data.nickname}`);
            return data.nickname;
        }

        throw new Error('Invalid response from server');
    } catch (err) {
        logger.error('Не удалось получить псевдоним с сервера:', err.message);
        throw new Error('Не удалось сгенерировать псевдоним. Попробуйте позже.');
    }
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

async function checkVoterEligibility(fullName, vkId) {
    try {
        const { data } = await axios.post(`${API_URL}/check-voter`, {
            fullName,
            vkId
        }, { headers: API_HEADERS });
        return data;
    } catch (error) {
        logger.error('Error checking voter eligibility:', error);
        return { success: false, error: 'Ошибка сервера' };
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
    const conversationMessageId = context.conversationMessageId;

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

        // ----------------- Обработка состояний -----------------
        switch (state.state) {

            // ----- ВВОД ФИО -----
            case USER_STATES.AWAITING_NAME:
                // Удаляем сообщение с ФИО для анонимности
                await deleteUserMessage(userId, conversationMessageId);

                if (text.length < 5 || !/^[а-яА-ЯёЁ\s]+$/.test(text)) {
                    return context.send(MESSAGES.ERROR_INVALID_NAME);
                }

                // Проверяем ФИО сразу (включая проверку на повторное голосование)
                const eligibilityCheck = await checkVoterEligibility(text, userId);

                if (!eligibilityCheck.success) {
                    return context.send('Ошибка при проверке ФИО. Попробуйте ещё раз.');
                }

                if (!eligibilityCheck.eligible) {
                    resetUserState(userId);
                    return context.send(eligibilityCheck.error || 'Ваше ФИО отсутствует в списке избирателей.', {
                        keyboard: Keyboard.builder()
                            .textButton({ label: BUTTONS.START_VOTING })
                    });
                }

                // Генерируем уникальный псевдоним
                let nickname;
                try {
                    nickname = await generateUniqueNickname();
                } catch (error) {
                    resetUserState(userId);
                    return context.send('Не удалось сгенерировать псевдоним. Попробуйте позже.', {
                        keyboard: Keyboard.builder()
                            .textButton({ label: BUTTONS.START_VOTING })
                    });
                }

                // Получаем все смены
                const allShifts = await getShifts();
                if (allShifts.length === 0) {
                    resetUserState(userId);
                    return context.send('Нет активных смен для голосования');
                }

                // Инициализируем данные для последовательного голосования
                updateUserState(userId, USER_STATES.AWAITING_CANDIDATE, {
                    fullName: text,
                    nickname,
                    shifts: allShifts,
                    currentShiftIndex: 0,
                    votes: [] // Массив всех голосов для финального подтверждения
                });

                // Начинаем с первой смены
                const firstShift = allShifts[0];
                const firstCandidates = await getCandidates(firstShift.id);

                if (firstCandidates.length === 0) {
                    return context.send('Нет кандидатов для голосования');
                }

                const allOptions = [
                    ...firstCandidates,
                    { id: null, name: 'Против всех', is_special: true },
                    { id: null, name: 'Воздержаться', is_special: true }
                ];

                const kbCand = Keyboard.builder();
                allOptions.forEach(c => kbCand.textButton({ label: c.name }).row());
                kbCand.textButton({ label: BUTTONS.CANCEL, color: Keyboard.NEGATIVE_COLOR });

                return context.send(
                    `${MESSAGES.NICKNAME_ASSIGNED(nickname)}\n\n` +
                    `Сейчас вы будете последовательно голосовать по каждой смене.\n\n` +
                    `Смена 1 из ${allShifts.length}: ${firstShift.name}\n\n` +
                    MESSAGES.CHOOSE_CANDIDATE,
                    { keyboard: kbCand }
                );

            // ----- ВЫБОР КАНДИДАТА -----
            case USER_STATES.AWAITING_CANDIDATE:
                // Удаляем сообщение с выбором кандидата
                await deleteUserMessage(userId, conversationMessageId);

                const currentShift = state.data.shifts[state.data.currentShiftIndex];
                const cands = await getCandidates(currentShift.id);
                const special = [
                    { id: null, name: 'Против всех' },
                    { id: null, name: 'Воздержаться' }
                ];
                const allVoteOptions = [...cands, ...special];

                const selected = allVoteOptions.find(c => c.name === text);
                if (!selected) return context.send('Неверный вариант. Выберите из предложенных.');

                let voteType = 'candidate';
                let candidateId = selected.id;

                if (text === 'Против всех') {
                    voteType = 'against_all';
                    candidateId = null;
                } else if (text === 'Воздержаться') {
                    voteType = 'abstain';
                    candidateId = null;
                }

                // Сохраняем выбор для подтверждения
                updateUserState(userId, USER_STATES.AWAITING_SHIFT_CONFIRMATION, {
                    pendingVote: {
                        shiftId: currentShift.id,
                        shiftName: currentShift.name,
                        candidateId,
                        candidateName: text,
                        voteType
                    }
                });

                const confirmMsg = `Подтвердите ваш выбор:\n\n` +
                    `Смена: ${currentShift.name}\n` +
                    `Ваш голос: ${text}`;

                return context.send(confirmMsg, {
                    keyboard: Keyboard.builder()
                        .textButton({ label: BUTTONS.CONFIRM, color: Keyboard.POSITIVE_COLOR })
                        .textButton({ label: BUTTONS.CHANGE, color: Keyboard.SECONDARY_COLOR })
                });

            // ----- ПОДТВЕРЖДЕНИЕ ВЫБОРА ДЛЯ СМЕНЫ -----
            case USER_STATES.AWAITING_SHIFT_CONFIRMATION:
                // Удаляем сообщение с подтверждением
                await deleteUserMessage(userId, conversationMessageId);

                if (text === BUTTONS.CHANGE) {
                    // Возврат к выбору кандидата
                    updateUserState(userId, USER_STATES.AWAITING_CANDIDATE);
                    const currentShiftBack = state.data.shifts[state.data.currentShiftIndex];
                    const candsBack = await getCandidates(currentShiftBack.id);
                    const optionsBack = [
                        ...candsBack,
                        { id: null, name: 'Против всех' },
                        { id: null, name: 'Воздержаться' }
                    ];
                    const kbBack = Keyboard.builder();
                    optionsBack.forEach(c => kbBack.textButton({ label: c.name }).row());
                    return context.send(`Выберите кандидата для смены "${currentShiftBack.name}":`, {
                        keyboard: kbBack
                    });
                }

                if (text !== BUTTONS.CONFIRM) {
                    return context.send('Нажмите «Подтвердить» или «Изменить»');
                }

                // Сохраняем голос
                state.data.votes.push(state.data.pendingVote);

                // Проверяем, есть ли ещё смены
                const nextIndex = state.data.currentShiftIndex + 1;

                if (nextIndex < state.data.shifts.length) {
                    // Переходим к следующей смене
                    updateUserState(userId, USER_STATES.AWAITING_CANDIDATE, {
                        currentShiftIndex: nextIndex,
                        pendingVote: null
                    });

                    const nextShift = state.data.shifts[nextIndex];
                    const nextCandidates = await getCandidates(nextShift.id);

                    const nextOptions = [
                        ...nextCandidates,
                        { id: null, name: 'Против всех' },
                        { id: null, name: 'Воздержаться' }
                    ];

                    const kbNext = Keyboard.builder();
                    nextOptions.forEach(c => kbNext.textButton({ label: c.name }).row());
                    kbNext.textButton({ label: BUTTONS.CANCEL, color: Keyboard.NEGATIVE_COLOR });

                    return context.send(
                        `Смена ${nextIndex + 1} из ${state.data.shifts.length}: ${nextShift.name}\n\n` +
                        MESSAGES.CHOOSE_CANDIDATE,
                        { keyboard: kbNext }
                    );
                } else {
                    // Все смены пройдены - показываем финальное подтверждение
                    updateUserState(userId, USER_STATES.AWAITING_FINAL_CONFIRMATION);

                    let summaryMsg = '📋 Итоговый список ваших голосов:\n\n';
                    state.data.votes.forEach((vote, idx) => {
                        summaryMsg += `${idx + 1}. ${vote.shiftName}: ${vote.candidateName}\n`;
                    });
                    summaryMsg += `\nВы проголосовали по всем сменам. Подтвердите отправку всех голосов.`;

                    return context.send(summaryMsg, {
                        keyboard: Keyboard.builder()
                            .textButton({ label: '✅ Подтвердить все голоса', color: Keyboard.POSITIVE_COLOR })
                            .row()
                            .textButton({ label: BUTTONS.CANCEL, color: Keyboard.NEGATIVE_COLOR })
                    });
                }

            // ----- ФИНАЛЬНОЕ ПОДТВЕРЖДЕНИЕ ВСЕХ ГОЛОСОВ -----
            case USER_STATES.AWAITING_FINAL_CONFIRMATION:
                // Удаляем сообщение с финальным подтверждением
                await deleteUserMessage(userId, conversationMessageId);

                if (text !== '✅ Подтвердить все голоса') {
                    return context.send('Нажмите «✅ Подтвердить все голоса» для завершения голосования.');
                }

                // Отправляем все голоса на сервер
                const results = [];
                for (const vote of state.data.votes) {
                    const result = await submitVote(
                        userId,
                        state.data.fullName,
                        state.data.nickname,
                        vote.shiftId,
                        vote.candidateId,
                        vote.voteType
                    );
                    results.push({ ...vote, success: result.success, error: result.error });
                }

                // Проверяем результаты
                const failed = results.filter(r => !r.success);

                if (failed.length === 0) {
                    // Все голоса успешно отправлены
                    resetUserState(userId);
                    return context.send(
                        `✅ Спасибо! Все ваши голоса успешно учтены.\n\n` +
                        `Ваш псевдоним: ${state.data.nickname}\n\n` +
                        `Вы проголосовали по ${results.length} сменам.`,
                        {
                            keyboard: Keyboard.builder()
                                .textButton({ label: '/mystats', color: Keyboard.PRIMARY_COLOR })
                        }
                    );
                } else {
                    // Были ошибки
                    let errorMsg = '⚠️ Некоторые голоса не были учтены:\n\n';
                    failed.forEach(f => {
                        errorMsg += `• ${f.shiftName}: ${f.error}\n`;
                    });
                    errorMsg += '\nПопробуйте проголосовать заново или обратитесь к администратору.';

                    resetUserState(userId);
                    return context.send(errorMsg, {
                        keyboard: Keyboard.builder()
                            .textButton({ label: BUTTONS.START_VOTING })
                    });
                }
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

// Примечание: Старый endpoint /api/notify-all-votes-cancelled удалён
// Теперь используется система очереди сообщений (message_queue)

botApp.listen(BOT_PORT, () => {
    logger.info(`Bot API server listening on port ${BOT_PORT}`);
    console.log(`Bot API сервер запущен на порту ${BOT_PORT}`);
});

// ---------------------------------------------------------
// Обработчик очереди сообщений (запускается каждую минуту)
// ---------------------------------------------------------
const MessageQueue = require('./models/MessageQueue');

async function processMessageQueue() {
    try {
        const pendingMessages = MessageQueue.getPending(50); // Берём до 50 сообщений за раз

        if (pendingMessages.length === 0) {
            return; // Нет сообщений в очереди
        }

        logger.info(`Processing ${pendingMessages.length} messages from queue`);

        for (const msg of pendingMessages) {
            try {
                // Отправляем сообщение через VK API
                await vk.api.messages.send({
                    user_id: msg.vk_id,
                    message: msg.message,
                    random_id: Math.floor(Math.random() * 1000000)
                });

                // Отмечаем как отправленное
                MessageQueue.markAsSent(msg.id);
                logger.info(`Message sent successfully`, {
                    message_id: msg.id,
                    vk_id: msg.vk_id
                });

            } catch (sendError) {
                // Увеличиваем счётчик попыток
                MessageQueue.incrementAttempts(msg.id);

                // Если превышен лимит попыток, отмечаем как failed
                if (msg.attempts + 1 >= msg.max_attempts) {
                    MessageQueue.markAsFailed(msg.id, sendError.message);
                    logger.error(`Message failed after ${msg.max_attempts} attempts`, {
                        message_id: msg.id,
                        vk_id: msg.vk_id,
                        error: sendError.message
                    });
                } else {
                    logger.warn(`Message send failed, will retry`, {
                        message_id: msg.id,
                        vk_id: msg.vk_id,
                        attempt: msg.attempts + 1,
                        error: sendError.message
                    });
                }
            }
        }

        // Очищаем старые отправленные сообщения (старше 7 дней)
        const cleanedUp = MessageQueue.cleanupOld(7);
        if (cleanedUp > 0) {
            logger.info(`Cleaned up ${cleanedUp} old messages from queue`);
        }

    } catch (error) {
        logger.error('Error processing message queue:', error);
    }
}

// Запускаем обработчик очереди каждую минуту
setInterval(processMessageQueue, 60000); // 60000 мс = 1 минута

// Запускаем первую обработку сразу после старта (через 5 секунд)
setTimeout(processMessageQueue, 5000);

// ---------------------------------------------------------
// Запуск VK-бота
// ---------------------------------------------------------
vk.updates.start()
    .then(() => {
        logger.info('VK Bot started (polling)');
        console.log('VK Бот запущен (polling)!');
        console.log('Обработчик очереди сообщений запущен (каждую минуту)');
    })
    .catch((error) => {
        logger.error('Bot error:', error);
        console.error('Ошибка:', error.message);
    });

module.exports = vk;
