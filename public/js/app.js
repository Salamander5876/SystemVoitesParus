// Подключение к WebSocket
const socket = io();

// Элементы DOM
const elements = {
    votingStatus: document.getElementById('voting-status'),
    uniqueVoters: document.getElementById('unique-voters'),
    votesLogBody: document.getElementById('votes-log-body')
};

let allShifts = [];

// Инициализация
async function init() {
    await loadStatus();
    await loadElectionResults(); // Проверяем, опубликованы ли результаты
    await loadVotesLog();
    setupWebSocket();
}

// Загрузка статуса голосования
async function loadStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        updateStatus(data);
    } catch (error) {
        console.error('Error loading status:', error);
    }
}

// Обновление статуса
function updateStatus(data) {
    const statusMap = {
        'active': { text: '✅ Голосование активно', class: 'active' },
        'not_started': { text: '⏳ Голосование не началось', class: 'not-started' },
        'finished': { text: '🏁 Голосование завершено', class: 'finished' },
        'paused': { text: '⏸️ Голосование приостановлено', class: 'paused' }
    };

    const status = statusMap[data.status] || { text: 'Неизвестно', class: '' };
    elements.votingStatus.textContent = status.text;
    elements.votingStatus.className = 'status ' + status.class;

    elements.uniqueVoters.textContent = data.uniqueVoters || 0;
}

// Загрузка журнала голосов
async function loadVotesLog() {
    try {
        const response = await fetch('/api/votes/public-log');
        const data = await response.json();

        if (data.success) {
            renderVotesLog(data.votes);
        }
    } catch (error) {
        console.error('Error loading votes log:', error);
        elements.votesLogBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Ошибка загрузки данных</td></tr>';
    }
}

// Рендеринг таблицы голосов
function renderVotesLog(votes) {
    if (votes.length === 0) {
        elements.votesLogBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">Голосов пока нет</td></tr>';
        return;
    }

    // Сортируем голоса по ID (от новых к старым)
    votes.sort((a, b) => b.id - a.id);

    // Заполняем тело таблицы
    elements.votesLogBody.innerHTML = '';

    votes.forEach(vote => {
        const row = document.createElement('tr');

        // Форматируем дату (парсим как локальное время, БЕЗ 'Z' для избежания сдвига на границе суток)
        const date = vote.created_at ? new Date(vote.created_at).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Chita'
        }) : 'Нет данных';

        // Формируем ссылку на профиль VK (показываем только VK ID)
        const vkLink = `https://vk.com/id${vote.vk_id}`;
        const vkProfile = `<a href="${vkLink}" target="_blank" rel="noopener noreferrer">id${vote.vk_id}</a>`;

        // Определяем статус голоса
        const status = vote.is_cancelled
            ? '<span class="vote-status cancelled">Аннулирован</span>'
            : '<span class="vote-status counted">Учтён</span>';

        // Формируем строку таблицы
        row.innerHTML = `
            <td>${vote.id}</td>
            <td>${date}</td>
            <td>${vote.full_name}</td>
            <td>${vkProfile}</td>
            <td>${status}</td>
        `;

        elements.votesLogBody.appendChild(row);
    });
}

// Загрузка и отображение результатов выборов
async function loadElectionResults() {
    try {
        const response = await fetch('/api/election-results');
        const data = await response.json();

        const resultsSection = document.getElementById('results-section');
        const resultsContainer = document.getElementById('results-container');
        const downloadSection = document.getElementById('download-section');

        if (data.success && data.published) {
            // Результаты опубликованы - показываем их и секцию скачивания
            resultsSection.style.display = 'block';
            downloadSection.style.display = 'block';
            resultsContainer.innerHTML = '';

            data.results.forEach(shiftResult => {
                const shiftDiv = document.createElement('div');
                shiftDiv.className = 'shift-result';

                let candidatesHTML = '';
                if (shiftResult.candidates && shiftResult.candidates.length > 0) {
                    candidatesHTML = `
                        <div class="candidates-list">
                            <h5>Рейтинг кандидатов</h5>
                            ${shiftResult.candidates.map((candidate, index) => `
                                <div class="candidate-item ${index === 0 ? 'winner' : ''}">
                                    <div class="candidate-name">
                                        ${index === 0 ? '' : ''} ${candidate.name}
                                    </div>
                                    <div class="candidate-stats-inline">
                                        <span class="candidate-votes">${candidate.vote_count} голосов</span>
                                        <span class="candidate-percentage">${candidate.percentage}%</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `;
                }

                let specialVotesHTML = '';
                if (shiftResult.special_votes) {
                    specialVotesHTML = `
                        <div class="special-votes">
                            <h5>Специальные голоса</h5>
                            <div class="special-votes-grid">
                                <div class="special-vote-item">
                                    <span class="special-vote-label">Против всех</span>
                                    <span class="special-vote-count">${shiftResult.special_votes.against_all}</span>
                                </div>
                                <div class="special-vote-item">
                                    <span class="special-vote-label">Воздержался</span>
                                    <span class="special-vote-count">${shiftResult.special_votes.abstain}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }

                shiftDiv.innerHTML = `
                    <div class="shift-result-header">
                        <h3>${shiftResult.shift.name}</h3>
                    </div>
                    ${candidatesHTML}
                    ${specialVotesHTML}
                `;

                resultsContainer.appendChild(shiftDiv);
            });
        } else {
            // Результаты не опубликованы
            resultsSection.style.display = 'none';
            downloadSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading election results:', error);
    }
}

// Настройка WebSocket
function setupWebSocket() {
    // Обновление статистики в реальном времени
    socket.on('stats_update', (data) => {
        elements.uniqueVoters.textContent = data.uniqueVoters || 0;
    });

    // Новый голос - перезагружаем таблицу
    socket.on('new_vote', () => {
        loadVotesLog();
    });

    // Обновление статуса голосования
    socket.on('voting_status_changed', (data) => {
        updateStatus(data);
    });

    // Обновление результатов при публикации
    socket.on('results_published', () => {
        loadElectionResults();
    });
}

// Функция скачивания итоговой ведомости
async function downloadResults() {
    try {
        const response = await fetch('/api/export-results', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка при скачивании файла');
        }

        // Получаем blob
        const blob = await response.blob();

        // Создаем ссылку для скачивания
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Генерируем имя файла с датой
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        a.download = `Итоговая_ведомость_${dateStr}.xlsx`;

        // Триггерим скачивание
        document.body.appendChild(a);
        a.click();

        // Очищаем
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        console.log('Файл успешно скачан');
    } catch (error) {
        console.error('Error downloading results:', error);
        alert('Ошибка при скачивании файла. Попробуйте позже.');
    }
}

// ============================================================
// Таймер обратного отсчёта на главной странице через Socket.IO
// ============================================================
function updatePublicTimer(data) {
    const timerSection = document.getElementById('public-timer-section');
    const countdownDisplay = document.getElementById('public-countdown-timer');

    if (!timerSection || !countdownDisplay) return;

    // Если выборы активны и есть время окончания
    if (data.status === 'active' && data.endTime) {
        timerSection.style.display = 'block';

        const endTime = new Date(data.endTime);
        const now = new Date();
        const diff = Math.max(0, endTime - now);

        if (diff <= 0) {
            countdownDisplay.textContent = '00:00:00';
            // Обновляем статус после завершения
            setTimeout(() => {
                loadStatus();
                loadVotesLog();
            }, 2000);
            return;
        }

        // Вычисляем часы, минуты, секунды
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        countdownDisplay.textContent = timeString;
    } else {
        // Скрываем таймер если выборы не активны
        timerSection.style.display = 'none';
    }
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    init();

    // Подключаемся к Socket.IO для получения обновлений таймера, статистики и статуса
    socket.on('timer_update', (data) => {
        updatePublicTimer(data);

        // Обновляем статус голосования
        const statusElement = document.getElementById('voting-status');
        if (statusElement) {
            const statusMap = {
                'not_started': '⏸ Голосование не начато',
                'active': 'Голосование активно',
                'paused': '⏸ Голосование приостановлено',
                'finished': 'Голосование завершено'
            };
            statusElement.textContent = statusMap[data.status] || data.status;
        }

        // Обновляем количество проголосовавших
        const votersCountElement = document.getElementById('unique-voters');
        if (votersCountElement && data.uniqueVoters !== undefined) {
            votersCountElement.textContent = data.uniqueVoters;
        }
    });
});
