// Проверка авторизации
const token = localStorage.getItem('admin_token');
if (!token) {
    window.location.href = '/admin';
}

const username = localStorage.getItem('admin_username');
document.getElementById('admin-username').textContent = username || 'Администратор';

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
    await loadStatus();
    await loadShifts();
    await loadCandidates();
    await loadVotes();
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
async function loadVotes() {
    try {
        const response = await apiCall('/votes');
        const data = await response.json();
        renderVotes(data.votes);
    } catch (error) {
        console.error('Error loading votes:', error);
    }
}

// Render votes table
function renderVotes(votes) {
    const tbody = document.querySelector('#votes-table tbody');
    tbody.innerHTML = '';

    if (votes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Голосов пока нет</td></tr>';
        return;
    }

    votes.slice(0, 100).forEach(vote => {
        const time = new Date(vote.created_at).toLocaleString('ru-RU');

        // Определяем отображение типа голоса
        let voteTypeDisplay = '';
        let badgeClass = 'badge-primary';

        if (vote.vote_type === 'candidate') {
            voteTypeDisplay = vote.candidate_name;
            badgeClass = 'badge-success';
        } else if (vote.vote_type === 'against_all') {
            voteTypeDisplay = 'Против всех';
            badgeClass = 'badge-danger';
        } else if (vote.vote_type === 'abstain') {
            voteTypeDisplay = 'Воздержался';
            badgeClass = 'badge-secondary';
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${time}</td>
            <td><a href="https://vk.com/id${vote.vk_id}" target="_blank" title="Открыть профиль ВК">${vote.vk_id}</a></td>
            <td>${vote.full_name}</td>
            <td>${vote.nickname}</td>
            <td>${vote.shift_name}</td>
            <td>${vote.candidate_name || '-'}</td>
            <td>
                <span class="badge ${badgeClass}">
                    ${voteTypeDisplay}
                </span>
            </td>
        `;
        tbody.appendChild(row);
    });

    if (votes.length > 100) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="7" style="text-align:center; color: #999;">
            Показано первых 100 из ${votes.length} голосов
        </td>`;
        tbody.appendChild(row);
    }
}

// Export votes
async function exportVotes() {
    try {
        window.location.href = `/api/admin/export/votes?token=${token}`;
        showAlert('Экспорт начат', 'info');
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
        description: formData.get('description'),
        photoUrl: formData.get('photoUrl')
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

// Initialize
document.addEventListener('DOMContentLoaded', init);

// Auto-refresh every 30 seconds
setInterval(() => {
    loadStatus();
    loadVotes();
}, 30000);
