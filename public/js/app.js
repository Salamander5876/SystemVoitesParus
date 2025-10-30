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

        const date = new Date(vote.created_at).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Chita'
        });

        // Формируем ссылку на профиль VK
        let vkProfile = '';
        if (vote.vk_first_name && vote.vk_last_name) {
            const vkName = `${vote.vk_first_name} ${vote.vk_last_name}`;
            const vkLink = `https://vk.com/id${vote.vk_id}`;
            vkProfile = `<a href="${vkLink}" target="_blank" rel="noopener noreferrer">${vkName}</a>`;
        } else {
            vkProfile = '<span style="color: #999;">—</span>';
        }

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

                let winnerHTML = '';
                if (shiftResult.winner) {
                    winnerHTML = `
                        <div class="winner-announcement">
                            <div class="winner-badge">🏆</div>
                            <h4>Победитель</h4>
                            <div class="winner-name">${shiftResult.winner.name}</div>
                            <div class="winner-stats">
                                <div class="winner-stat">
                                    <span class="winner-stat-label">Голосов</span>
                                    <span class="winner-stat-value">${shiftResult.winner.vote_count}</span>
                                </div>
                                <div class="winner-stat">
                                    <span class="winner-stat-label">Процент</span>
                                    <span class="winner-stat-value">${shiftResult.winner.percentage}%</span>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    winnerHTML = `
                        <div class="winner-announcement" style="background: linear-gradient(135deg, #e0e0e0 0%, #bdbdbd 100%);">
                            <div class="winner-badge">❓</div>
                            <h4>Победитель не определен</h4>
                        </div>
                    `;
                }

                let candidatesHTML = '';
                if (shiftResult.candidates && shiftResult.candidates.length > 0) {
                    candidatesHTML = `
                        <div class="candidates-list">
                            <h5>Все кандидаты</h5>
                            ${shiftResult.candidates.map((candidate, index) => `
                                <div class="candidate-item">
                                    <div class="candidate-name">
                                        ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•'} ${candidate.name}
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
                        <div class="shift-result-stats">
                            Всего голосов: ${shiftResult.stats.total_votes} |
                            Проголосовало: ${shiftResult.stats.unique_voters}
                        </div>
                    </div>
                    ${winnerHTML}
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
        const response = await fetch('/api/admin/export-votes', {
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

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', init);
