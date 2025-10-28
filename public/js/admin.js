// Проверка авторизации
const token = localStorage.getItem('admin_token');
if (!token) {
    window.location.href = '/admin';
}

const username = localStorage.getItem('admin_username');
document.getElementById('admin-username').textContent = username || 'Администратор';

// === Tab Navigation ===
function switchTab(tabName) {
    // Скрываем все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Убираем активный класс со всех кнопок
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.remove('active');
    });

    // Показываем выбранную вкладку
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) {
        targetTab.classList.add('active');
    }

    // Активируем кнопку
    const targetBtn = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    // Сохраняем текущую вкладку
    localStorage.setItem('admin_current_tab', tabName);

    // Подгружаем данные для вкладки
    loadTabData(tabName);
}

function loadTabData(tabName) {
    switch (tabName) {
        case 'voting-control':
            loadStatus();
            break;
        case 'shifts-candidates':
            loadShifts();
            loadCandidates();
            break;
        case 'voters':
            loadVoters();
            break;
        case 'audit-log':
            loadAuditLog();
            break;
        case 'results':
            loadResults();
            break;
    }
}

// API helper
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`/api/admin${endpoint}`, options);

    if (response.status === 401) {
        logout();
        return null;
    }

    return response;
}

// Logout
function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_username');
    window.location.href = '/admin';
}

// Alerts
function showAlert(message, type = 'success') {
    const alertContainer = document.getElementById('alert-container');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alertContainer.appendChild(alert);

    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Load initial data
async function init() {
    // Восстанавливаем последнюю открытую вкладку
    const savedTab = localStorage.getItem('admin_current_tab') || 'voting-control';
    switchTab(savedTab);
}

// Load voting status
async function loadStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        const statusMap = {
            'active': 'Активно',
            'not_started': 'Не начато',
            'finished': 'Завершено',
            'paused': 'Приостановлено'
        };

        document.getElementById('voting-status').textContent = statusMap[data.status] || '-';
        document.getElementById('total-votes').textContent = data.totalVotes || 0;
        document.getElementById('total-voters').textContent = data.uniqueVoters || 0;
    } catch (error) {
        console.error('Error loading status:', error);
    }
}

// Control voting
async function controlVoting(action) {
    const confirmMessages = {
        'start': 'Запустить голосование?',
        'stop': 'Остановить голосование? Это действие нельзя отменить!',
        'pause': 'Приостановить голосование?',
        'reset': 'ВНИМАНИЕ! Это сбросит все настройки голосования. Продолжить?'
    };

    if (!confirm(confirmMessages[action])) {
        return;
    }

    try {
        const response = await apiCall('/voting/control', 'POST', { action });
        const data = await response.json();

        if (response.ok) {
            showAlert(data.message, 'success');
            await loadStatus();
        } else {
            showAlert(data.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error controlling voting:', error);
        showAlert('Ошибка подключения', 'error');
    }
}

// Load shifts
async function loadShifts() {
    try {
        const response = await apiCall('/shifts');
        const data = await response.json();
        renderShifts(data.shifts);

        // Обновляем select в форме кандидатов
        const select = document.getElementById('candidate-shift-select');
        select.innerHTML = '<option value="">Выберите смену</option>';
        data.shifts.filter(s => s.is_active).forEach(shift => {
            const option = document.createElement('option');
            option.value = shift.id;
            option.textContent = shift.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading shifts:', error);
    }
}

// Render shifts table
function renderShifts(shifts) {
    const tbody = document.querySelector('#shifts-table tbody');
    tbody.innerHTML = '';

    shifts.forEach(shift => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${shift.id}</td>
            <td>${shift.name}</td>
            <td>${shift.description || '-'}</td>
            <td>
                <span class="badge ${shift.is_active ? 'badge-success' : 'badge-danger'}">
                    ${shift.is_active ? 'Да' : 'Нет'}
                </span>
            </td>
            <td class="table-actions">
                <button class="btn btn-sm ${shift.is_active ? 'btn-warning' : 'btn-success'}"
                        onclick="toggleShift(${shift.id}, ${!shift.is_active})">
                    ${shift.is_active ? 'Деактивировать' : 'Активировать'}
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteShift(${shift.id})">
                    Удалить
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Toggle shift active status
async function toggleShift(id, isActive) {
    try {
        const response = await apiCall(`/shifts/${id}`, 'PUT', { isActive });
        const data = await response.json();

        if (response.ok) {
            showAlert(data.message, 'success');
            await loadShifts();
        } else {
            showAlert(data.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error toggling shift:', error);
        showAlert('Ошибка подключения', 'error');
    }
}

// Delete shift
async function deleteShift(id) {
    if (!confirm('Удалить смену? Это удалит всех кандидатов и голоса этой смены!')) {
        return;
    }

    try {
        const response = await apiCall(`/shifts/${id}`, 'DELETE');
        const data = await response.json();

        if (response.ok) {
            showAlert(data.message, 'success');
            await loadShifts();
            await loadCandidates();
        } else {
            showAlert(data.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error deleting shift:', error);
        showAlert('Ошибка подключения', 'error');
    }
}

// Load candidates
async function loadCandidates() {
    try {
        const response = await apiCall('/candidates');
        const data = await response.json();
        renderCandidates(data.candidates);
    } catch (error) {
        console.error('Error loading candidates:', error);
    }
}

// Render candidates table
function renderCandidates(candidates) {
    const tbody = document.querySelector('#candidates-table tbody');
    tbody.innerHTML = '';

    candidates.forEach(candidate => {
        const voteCount = candidate.vote_count || 0;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${candidate.id}</td>
            <td>${candidate.shift_name}</td>
            <td>${candidate.name}</td>
            <td><span class="badge badge-primary">${voteCount}</span></td>
            <td class="table-actions">
                <button class="btn btn-sm btn-danger" onclick="deleteCandidate(${candidate.id})">
                    Удалить
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Delete candidate
async function deleteCandidate(id) {
    if (!confirm('Удалить кандидата? Это удалит все связанные голоса!')) {
        return;
    }

    try {
        const response = await apiCall(`/candidates/${id}`, 'DELETE');
        const data = await response.json();

        if (response.ok) {
            showAlert(data.message, 'success');
            await loadCandidates();
        } else {
            showAlert(data.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error deleting candidate:', error);
        showAlert('Ошибка подключения', 'error');
    }
}

// Load votes
// Load audit log (full vote information with VK IDs)
async function loadAuditLog() {
    try {
        const response = await apiCall('/votes/audit');
        const data = await response.json();
        renderAuditLog(data.votes);
    } catch (error) {
        console.error('Error loading audit log:', error);
    }
}

// Render audit log table
function renderAuditLog(votes) {
    const tbody = document.getElementById('audit-log-body');
    tbody.innerHTML = '';

    if (votes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Голосов пока нет</td></tr>';
        return;
    }

    votes.forEach(vote => {
        const row = document.createElement('tr');
        if (vote.is_cancelled) {
            row.classList.add('vote-cancelled');
        }

        const date = new Date(vote.created_at).toLocaleString('ru-RU');
        const vkLink = `https://vk.com/id${vote.vk_id}`;

        // Формируем имя из VK
        let vkName = '';
        if (vote.vk_first_name && vote.vk_last_name) {
            vkName = `${vote.vk_first_name} ${vote.vk_last_name}`;
        } else {
            vkName = '<span style="color: #999;">Не загружено</span>';
        }

        let statusHTML = '';
        if (vote.is_cancelled) {
            statusHTML = `
                <span class="cancelled-badge">АННУЛИРОВАН</span>
                <span class="cancelled-reason">${vote.cancellation_reason}</span>
            `;
        } else {
            statusHTML = '<span style="color: green;">✓ Действителен</span>';
        }

        let actionsHTML = '';
        if (!vote.is_cancelled) {
            actionsHTML = `
                <button class="btn btn-danger btn-small" onclick="showCancelVoteModal(${vote.id}, '${vote.full_name}', '${vote.shift_name}', '${date}')">
                    Аннулировать
                </button>
            `;
        } else {
            actionsHTML = '<span style="color: #999;">—</span>';
        }

        row.innerHTML = `
            <td>${vote.id}</td>
            <td>${date}</td>
            <td>${vote.full_name}</td>
            <td>${vkName}</td>
            <td><a href="${vkLink}" target="_blank">${vote.vk_id}</a></td>
            <td>${vote.shift_name}</td>
            <td>${statusHTML}</td>
            <td>${actionsHTML}</td>
        `;

        tbody.appendChild(row);
    });
}

// Load results (итоговая ведомость - анонимная таблица)
async function loadResults() {
    try {
        // Проверяем статус голосования
        const statusResponse = await apiCall('/voting/status');
        const statusData = await statusResponse.json();

        const messageDiv = document.getElementById('results-status-message');

        if (statusData.status === 'active') {
            messageDiv.style.display = 'block';
            messageDiv.className = 'alert alert-warning';
            messageDiv.innerHTML = '⚠️ Голосование ещё активно. Итоговая ведомость доступна только после завершения голосования.';
            document.getElementById('results-table').style.display = 'none';
            document.querySelector('[onclick="exportVotes()"]').style.display = 'none';
            return;
        } else {
            messageDiv.style.display = 'none';
            document.getElementById('results-table').style.display = 'table';
            document.querySelector('[onclick="exportVotes()"]').style.display = 'inline-block';
        }

        const response = await apiCall('/votes');
        const data = await response.json();
        renderResults(data.votes, data.shifts);
    } catch (error) {
        console.error('Error loading results:', error);
    }
}

// Render results table (grouped by nickname with cancellation info)
function renderResults(votes, shifts) {
    const thead = document.getElementById('results-table-head');
    const tbody = document.getElementById('results-table-body');

    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (votes.length === 0) {
        tbody.innerHTML = '<tr><td style="text-align:center;">Голосов пока нет</td></tr>';
        return;
    }

    // Создаем заголовок таблицы
    const headerRow = document.createElement('tr');
    let headerHTML = '<th>Псевдоним</th>';

    shifts.forEach(shift => {
        headerHTML += `<th>${shift}</th>`;
    });

    headerRow.innerHTML = headerHTML;
    thead.appendChild(headerRow);

    // Заполняем строки
    votes.forEach(voter => {
        const row = document.createElement('tr');
        let rowHTML = `<td><strong>${voter.nickname}</strong></td>`;

        shifts.forEach(shift => {
            const vote = voter.votes[shift];

            if (vote) {
                let badgeClass = 'badge-primary';

                if (vote.type === 'candidate') {
                    badgeClass = 'badge-success';
                } else if (vote.type === 'against_all') {
                    badgeClass = 'badge-danger';
                } else if (vote.type === 'abstain') {
                    badgeClass = 'badge-secondary';
                }

                let voteHTML = `<span class="badge ${badgeClass}">${vote.candidate}</span>`;

                // Помечаем аннулированные голоса
                if (vote.is_cancelled) {
                    voteHTML += `<span class="cancelled-badge">АННУЛИРОВАН</span>`;
                    if (vote.cancellation_reason) {
                        voteHTML += `<span class="cancelled-reason">${vote.cancellation_reason}</span>`;
                    }
                }

                rowHTML += `<td>${voteHTML}</td>`;
            } else {
                rowHTML += '<td style="text-align:center; color: #999;">-</td>';
            }
        });

        row.innerHTML = rowHTML;
        tbody.appendChild(row);
    });
}

// Export votes
async function exportVotes() {
    try {
        const response = await fetch('/api/admin/export/votes', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Export failed');
        }

        // Получаем blob из ответа
        const blob = await response.blob();

        // Создаём ссылку для скачивания
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'votes.xls';
        document.body.appendChild(a);
        a.click();

        // Очищаем
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showAlert('Экспорт завершён', 'success');
    } catch (error) {
        console.error('Error exporting votes:', error);
        showAlert('Ошибка экспорта', 'error');
    }
}

// Modal functions
function showAddShiftModal() {
    document.getElementById('shift-modal').classList.add('active');
}

function showAddCandidateModal() {
    document.getElementById('candidate-modal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Show cancel vote modal
function showCancelVoteModal(voteId, fullName, shiftName, date) {
    const modal = document.getElementById('cancel-vote-modal');
    const infoDiv = document.getElementById('cancel-vote-info');
    const voteIdInput = document.getElementById('cancel-vote-id');
    const reasonTextarea = document.getElementById('cancel-reason');

    voteIdInput.value = voteId;
    reasonTextarea.value = '';

    infoDiv.innerHTML = `
        <p><strong>ID голоса:</strong> ${voteId}</p>
        <p><strong>ФИО:</strong> ${fullName}</p>
        <p><strong>Смена:</strong> ${shiftName}</p>
        <p><strong>Дата:</strong> ${date}</p>
    `;

    modal.classList.add('active');
}

// Form submissions
document.getElementById('shift-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    try {
        const response = await apiCall('/shifts', 'POST', data);
        const result = await response.json();

        if (response.ok) {
            showAlert(result.message, 'success');
            closeModal('shift-modal');
            e.target.reset();
            await loadShifts();
        } else {
            showAlert(result.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error creating shift:', error);
        showAlert('Ошибка подключения', 'error');
    }
});

document.getElementById('candidate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        shiftId: parseInt(formData.get('shiftId')),
        name: formData.get('name'),
        description: formData.get('description')
    };

    try {
        const response = await apiCall('/candidates', 'POST', data);
        const result = await response.json();

        if (response.ok) {
            showAlert(result.message, 'success');
            closeModal('candidate-modal');
            e.target.reset();
            await loadCandidates();
        } else {
            showAlert(result.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error creating candidate:', error);
        showAlert('Ошибка подключения', 'error');
    }
});

// Close modals on background click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// === Voters Management ===

// Load voters
async function loadVoters() {
    try {
        const response = await apiCall('/voters');
        const data = await response.json();
        renderVoters(data.voters);
        updateVotersStats(data.stats);
    } catch (error) {
        console.error('Error loading voters:', error);
    }
}

// Update voters stats
function updateVotersStats(stats) {
    document.getElementById('voters-total').textContent = stats.total || 0;
    document.getElementById('voters-voted').textContent = stats.voted || 0;
    document.getElementById('voters-remaining').textContent = stats.remaining || 0;
}

// Render voters table
function renderVoters(voters) {
    const tbody = document.querySelector('#voters-table tbody');
    tbody.innerHTML = '';

    if (voters.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Список избирателей пуст</td></tr>';
        return;
    }

    voters.forEach(voter => {
        const votedAt = voter.voted_at ? new Date(voter.voted_at).toLocaleString('ru-RU') : '-';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${voter.id}</td>
            <td>${voter.full_name}</td>
            <td>
                <span class="badge ${voter.has_voted ? 'badge-success' : 'badge-secondary'}">
                    ${voter.has_voted ? 'Да' : 'Нет'}
                </span>
            </td>
            <td>${votedAt}</td>
            <td class="table-actions">
                <button class="btn btn-sm btn-danger" onclick="deleteVoter(${voter.id})">
                    Удалить
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Show upload voters modal
function showUploadVotersModal() {
    document.getElementById('voters-modal').classList.add('active');
}

// Upload voters
document.getElementById('voters-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const textarea = document.getElementById('voters-textarea');
    const text = textarea.value.trim();

    if (!text) {
        showAlert('Введите список ФИО', 'error');
        return;
    }

    const voters = text.split('\n').map(line => line.trim()).filter(line => line);

    if (voters.length === 0) {
        showAlert('Список избирателей пуст', 'error');
        return;
    }

    try {
        const response = await apiCall('/voters/upload', 'POST', { voters });
        const result = await response.json();

        if (response.ok) {
            let message = `Загружено: ${result.added}`;
            if (result.duplicates > 0) {
                message += `, Дубликатов: ${result.duplicates}`;
            }
            if (result.invalid > 0) {
                message += `, Невалидных: ${result.invalid}`;
            }

            showAlert(message, 'success');

            if (result.invalidNames && result.invalidNames.length > 0) {
                console.warn('Невалидные ФИО:', result.invalidNames);
                showAlert(`Невалидные ФИО (см. консоль): ${result.invalidNames.slice(0, 3).join(', ')}...`, 'warning');
            }

            closeModal('voters-modal');
            e.target.reset();
            await loadVoters();
        } else {
            showAlert(result.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error uploading voters:', error);
        showAlert('Ошибка подключения', 'error');
    }
});

// Cancel vote form
document.getElementById('cancel-vote-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const voteId = document.getElementById('cancel-vote-id').value;
    const reason = document.getElementById('cancel-reason').value.trim();

    if (!reason) {
        showAlert('Укажите причину аннулирования', 'error');
        return;
    }

    if (!confirm('Вы уверены, что хотите аннулировать этот голос? Это действие нельзя отменить.')) {
        return;
    }

    try {
        const response = await apiCall(`/votes/${voteId}/cancel`, 'POST', { reason });
        const result = await response.json();

        if (response.ok) {
            showAlert('Голос аннулирован. Уведомление отправлено пользователю.', 'success');
            closeModal('cancel-vote-modal');
            await loadAuditLog();
            // Также обновляем результаты, если они открыты
            if (document.getElementById('tab-results').classList.contains('active')) {
                await loadResults();
            }
        } else {
            showAlert(result.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error cancelling vote:', error);
        showAlert('Ошибка подключения', 'error');
    }
});

// Delete voter
async function deleteVoter(id) {
    if (!confirm('Удалить избирателя?')) {
        return;
    }

    try {
        const response = await apiCall(`/voters/${id}`, 'DELETE');
        const data = await response.json();

        if (response.ok) {
            showAlert(data.message, 'success');
            await loadVoters();
        } else {
            showAlert(data.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error deleting voter:', error);
        showAlert('Ошибка подключения', 'error');
    }
}

// Clear all voters
async function clearVoters() {
    if (!confirm('ВНИМАНИЕ! Это удалит ВСЕ избирателей из списка. Продолжить?')) {
        return;
    }

    try {
        const response = await apiCall('/voters/clear', 'POST');
        const data = await response.json();

        if (response.ok) {
            showAlert(`Удалено избирателей: ${data.count}`, 'success');
            await loadVoters();
        } else {
            showAlert(data.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error clearing voters:', error);
        showAlert('Ошибка подключения', 'error');
    }
}

// Reset voters status
async function resetVotersStatus() {
    if (!confirm('Сбросить статус голосования для всех избирателей? Все избиратели смогут проголосовать снова.')) {
        return;
    }

    try {
        const response = await apiCall('/voters/reset-status', 'POST');
        const data = await response.json();

        if (response.ok) {
            showAlert(`Сброшен статус у ${data.count} избирателей`, 'success');
            await loadVoters();
        } else {
            showAlert(data.error || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Error resetting voters status:', error);
        showAlert('Ошибка подключения', 'error');
    }
}

// Export voters
async function exportVoters() {
    try {
        const response = await fetch('/api/admin/export/voters', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Export failed');
        }

        // Получаем blob из ответа
        const blob = await response.blob();

        // Создаём ссылку для скачивания
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'voters.xls';
        document.body.appendChild(a);
        a.click();

        // Очищаем
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showAlert('Экспорт завершён', 'success');
    } catch (error) {
        console.error('Error exporting voters:', error);
        showAlert('Ошибка экспорта', 'error');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', init);

// Auto-refresh every 30 seconds
setInterval(() => {
    const currentTab = localStorage.getItem('admin_current_tab') || 'voting-control';
    loadTabData(currentTab);
}, 30000);
