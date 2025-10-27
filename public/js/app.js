// Подключение к WebSocket
const socket = io();

let currentShiftId = null;
let resultsChart = null;

// Элементы DOM
const elements = {
    votingStatus: document.getElementById('voting-status'),
    totalVotes: document.getElementById('total-votes'),
    uniqueVoters: document.getElementById('unique-voters'),
    shiftButtons: document.getElementById('shift-buttons'),
    noShift: document.getElementById('no-shift'),
    candidatesList: document.getElementById('candidates-list'),
    chartContainer: document.querySelector('.chart-container'),
    recentVotes: document.getElementById('recent-votes')
};

// Инициализация
async function init() {
    await loadStatus();
    await loadShifts();
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

    elements.totalVotes.textContent = data.totalVotes || 0;
    elements.uniqueVoters.textContent = data.uniqueVoters || 0;
}

// Загрузка списка смен
async function loadShifts() {
    try {
        const response = await fetch('/api/shifts');
        const data = await response.json();
        renderShifts(data.shifts);
    } catch (error) {
        console.error('Error loading shifts:', error);
    }
}

// Отрисовка кнопок смен
function renderShifts(shifts) {
    elements.shiftButtons.innerHTML = '';

    if (shifts.length === 0) {
        elements.shiftButtons.innerHTML = '<p class="no-data">Смены не найдены</p>';
        return;
    }

    shifts.forEach(shift => {
        const button = document.createElement('button');
        button.className = 'shift-btn';
        button.textContent = shift.name;
        button.onclick = () => selectShift(shift.id);
        elements.shiftButtons.appendChild(button);
    });
}

// Выбор смены
async function selectShift(shiftId) {
    currentShiftId = shiftId;

    // Обновляем активную кнопку
    document.querySelectorAll('.shift-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Подписываемся на обновления этой смены
    socket.emit('subscribe_shift', shiftId);

    // Загружаем данные смены
    await loadShiftStats(shiftId);
}

// Загрузка статистики смены
async function loadShiftStats(shiftId) {
    try {
        const response = await fetch(`/api/shifts/${shiftId}/stats`);
        const data = await response.json();
        renderShiftStats(data);
    } catch (error) {
        console.error('Error loading shift stats:', error);
    }
}

// Отрисовка статистики смены
function renderShiftStats(data) {
    elements.noShift.style.display = 'none';
    elements.candidatesList.style.display = 'block';
    elements.chartContainer.style.display = 'block';

    // Обновляем статистику
    if (data.stats) {
        elements.totalVotes.textContent = data.stats.total_votes || 0;
        elements.uniqueVoters.textContent = data.stats.unique_voters || 0;
    }

    // Отрисовываем кандидатов
    renderCandidates(data.candidates);

    // Отрисовываем график
    renderChart(data.candidates);

    // Отрисовываем последние голоса
    renderRecentVotes(data.recentVotes);
}

// Отрисовка списка кандидатов
function renderCandidates(candidates) {
    elements.candidatesList.innerHTML = '';

    if (candidates.length === 0) {
        elements.candidatesList.innerHTML = '<p class="no-data">Кандидаты не найдены</p>';
        return;
    }

    candidates.forEach(candidate => {
        const card = document.createElement('div');
        card.className = 'candidate-card';

        const totalVotes = candidate.vote_count || 0;

        card.innerHTML = `
            <div class="candidate-header">
                <div class="candidate-name">${candidate.name}</div>
            </div>
            ${candidate.description ? `<p style="color: #666; margin-bottom: 15px;">${candidate.description}</p>` : ''}
            <div class="candidate-stats">
                <div class="stat-item">
                    <div class="stat-item-label">Голосов</div>
                    <div class="stat-item-value" style="font-size: 32px; color: #3498db;">${totalVotes}</div>
                </div>
            </div>
        `;

        elements.candidatesList.appendChild(card);
    });
}

// Отрисовка графика
function renderChart(candidates) {
    const ctx = document.getElementById('results-chart');

    if (resultsChart) {
        resultsChart.destroy();
    }

    const labels = candidates.map(c => c.name);
    const voteCounts = candidates.map(c => c.vote_count || 0);

    resultsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Голосов',
                    data: voteCounts,
                    backgroundColor: 'rgba(52, 152, 219, 0.8)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Распределение голосов',
                    font: { size: 16 }
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Отрисовка последних голосов
function renderRecentVotes(votes) {
    if (!votes || votes.length === 0) {
        elements.recentVotes.innerHTML = '<div class="no-data">Голосов пока нет</div>';
        return;
    }

    elements.recentVotes.innerHTML = '';

    votes.forEach(vote => {
        const voteItem = document.createElement('div');
        voteItem.className = 'vote-item';

        const time = new Date(vote.created_at).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        voteItem.innerHTML = `
            <div class="vote-info">
                <div class="vote-nickname">${vote.nickname}</div>
                <div class="vote-candidate">${vote.candidate_name}</div>
            </div>
            <span class="vote-type ${vote.vote_type}">${vote.vote_type === 'for' ? 'ЗА' : 'ПРОТИВ'}</span>
            <span class="vote-time">${time}</span>
        `;

        elements.recentVotes.appendChild(voteItem);
    });
}

// Настройка WebSocket
function setupWebSocket() {
    socket.on('connect', () => {
        console.log('Connected to WebSocket');
    });

    socket.on('new_vote', (data) => {
        console.log('New vote:', data);

        // Добавляем новый голос в ленту
        addNewVoteToFeed(data);

        // Обновляем статистику текущей смены
        if (currentShiftId) {
            loadShiftStats(currentShiftId);
        }

        // Обновляем общую статистику
        loadStatus();
    });

    socket.on('voting_status_change', (data) => {
        console.log('Status changed:', data);
        loadStatus();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from WebSocket');
    });
}

// Добавление нового голоса в ленту
function addNewVoteToFeed(vote) {
    const voteItem = document.createElement('div');
    voteItem.className = 'vote-item';

    const time = new Date(vote.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });

    voteItem.innerHTML = `
        <div class="vote-info">
            <div class="vote-nickname">${vote.nickname}</div>
            <div class="vote-candidate">${vote.candidateName || ''}</div>
        </div>
        <span class="vote-type ${vote.voteType}">${vote.voteType === 'for' ? 'ЗА' : 'ПРОТИВ'}</span>
        <span class="vote-time">${time}</span>
    `;

    // Удаляем "нет данных" если есть
    const noData = elements.recentVotes.querySelector('.no-data');
    if (noData) {
        noData.remove();
    }

    // Добавляем в начало списка
    elements.recentVotes.insertBefore(voteItem, elements.recentVotes.firstChild);

    // Ограничиваем количество отображаемых голосов
    const voteItems = elements.recentVotes.querySelectorAll('.vote-item');
    if (voteItems.length > 20) {
        voteItems[voteItems.length - 1].remove();
    }
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', init);
