module.exports = {
    VOTING_STATUS: {
        NOT_STARTED: 'not_started',
        ACTIVE: 'active',
        FINISHED: 'finished',
        PAUSED: 'paused'
    },

    VOTE_TYPE: {
        CANDIDATE: 'candidate',
        AGAINST_ALL: 'against_all',
        ABSTAIN: 'abstain'
    },

    USER_STATES: {
        IDLE: 'idle',
        AWAITING_NAME: 'awaiting_name',
        AWAITING_SHIFT: 'awaiting_shift',
        AWAITING_CANDIDATE: 'awaiting_candidate',
        AWAITING_CONFIRMATION: 'awaiting_confirmation'
    },

    MESSAGES: {
        WELCOME: `Добро пожаловать в систему голосования "Парус"! 🗳️

Здесь вы можете проголосовать за кандидатов на должность старшего вожатого на каждой смене.

На каждой смене вы выбираете ОДИН вариант:
• Кандидат 1
• Кандидат 2
• ...
• Против всех
• Воздержаться

Для начала нажмите кнопку ниже:`,

        ASK_NAME: 'Введите ваше ФИО (Фамилия Имя Отчество):',

        NICKNAME_ASSIGNED: (nickname) => `✨ Вам присвоен псевдоним: *${nickname}*\nОн будет виден в результатах голосования и статистике.`,

        CHOOSE_SHIFT: 'Выберите смену для голосования:',

        CHOOSE_CANDIDATE: 'Выберите ОДИН вариант:\n(Кандидат, Против всех, или Воздержаться)',

        VOTE_SUCCESS: (nickname, shiftName, choice) =>
            `✅ Ваш голос учтён!\n\nПсевдоним: ${nickname}\nСмена: ${shiftName}\nВаш выбор: ${choice}\n\nВы можете продолжить голосование на других сменах.`,

        ALREADY_VOTED: (shiftName) =>
            `Вы уже голосовали на смене "${shiftName}".\n\nВыберите другую смену.`,

        VOTING_NOT_STARTED: 'Голосование ещё не началось. Следите за объявлениями!',

        VOTING_ENDED: 'Голосование завершено. Спасибо всем за участие!',

        ERROR_INVALID_NAME: 'Пожалуйста, введите корректное ФИО (минимум 5 символов, только буквы и пробелы)',

        ERROR_INVALID_NICKNAME: 'Пожалуйста, введите корректный псевдоним (от 3 до 30 символов)',

        ERROR: 'Произошла ошибка. Попробуйте снова или обратитесь к администратору.',

        HELP: `Команды бота:

/start - Начать работу
/vote - Начать голосование
/shifts - Показать список смен
/status - Проверить статус голосования
/mystats - Посмотреть мою статистику
/help - Помощь

На каждой смене выбираете ОДИН вариант: кандидата, "Против всех", или "Воздержаться".`,

        STATUS_INFO: (status, startTime, endTime) => {
            let statusText = '';
            switch(status) {
                case 'not_started':
                    statusText = '⏳ Не началось';
                    break;
                case 'active':
                    statusText = '✅ Активно';
                    break;
                case 'finished':
                    statusText = '🏁 Завершено';
                    break;
                case 'paused':
                    statusText = '⏸️ Приостановлено';
                    break;
            }
            return `Статус голосования: ${statusText}\n${startTime ? `\nНачало: ${new Date(startTime).toLocaleString('ru-RU')}` : ''}\n${endTime ? `Окончание: ${new Date(endTime).toLocaleString('ru-RU')}` : ''}`;
        }
    },

    BUTTONS: {
        START_VOTING: 'Начать голосование',
        CONFIRM: '✅ Подтвердить',
        CANCEL: '❌ Отмена',
        CHANGE: '🔄 Изменить',
        CONTINUE: '➡️ Продолжить',
        FINISH: '🏁 Завершить',
        BACK: '⬅️ Назад'
    }
};
