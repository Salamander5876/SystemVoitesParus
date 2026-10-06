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

    setVoterCount(data.uniqueVoters || 0);
    updateTurnout(data);
}

// Явка от списка избирателей (процент + прогресс-бар)
function updateTurnout(data) {
    const tpEl = document.getElementById('turnout-percent');
    const barEl = document.getElementById('turnout-bar-fill');
    const subEl = document.getElementById('turnout-sub');
    if (!tpEl) return;

    const tp = data.turnoutPercent;
    if (tp === null || tp === undefined) {
        tpEl.textContent = '—';
        if (barEl) barEl.style.width = '0%';
        if (subEl) subEl.textContent = 'список избирателей не загружен';
        return;
    }
    tpEl.textContent = tp + '%';
    if (barEl) barEl.style.width = Math.min(100, tp) + '%';
    if (subEl) subEl.textContent = `${data.eligibleVoted} из ${data.eligibleTotal} избирателей`;
}

// Загрузка журнала голосов
async function loadVotesLog(flashTop = false) {
    try {
        const response = await fetch('/api/votes/public-log');
        const data = await response.json();

        if (data.success) {
            renderVotesLog(data.votes, flashTop);
        }
    } catch (error) {
        console.error('Error loading votes log:', error);
        elements.votesLogBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">Ошибка загрузки данных</td></tr>';
    }
}

// Экранирование текста для безопасной вставки в HTML
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

// Инициалы из ФИО для аватарки-заглушки
function getInitials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    const letters = parts.slice(0, 2).map(p => p[0].toUpperCase()).join('');
    return letters || '?';
}

// Аватарка избирателя: фото из кэша ВК, при ошибке/отсутствии — инициалы
function buildAvatar(vote) {
    const initials = escapeHtml(getInitials(vote.full_name));
    const photo = vote.vk_photo_url
        ? `<img src="${escapeHtml(vote.vk_photo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
        : '';
    return `<div class="avatar" aria-hidden="true">${initials}${photo}</div>`;
}

// Ячейка избирателя: аватар + ФИО + ссылка на профиль ВК
function buildVoterCell(vote) {
    const vkUrl = vote.vk_screen_name
        ? `https://vk.com/${encodeURIComponent(vote.vk_screen_name)}`
        : `https://vk.com/id${encodeURIComponent(vote.vk_id)}`;

    const vkName = (vote.vk_first_name || vote.vk_last_name)
        ? `${vote.vk_first_name || ''} ${vote.vk_last_name || ''}`.trim()
        : `id${vote.vk_id}`;

    return `
        <div class="voter-cell">
            ${buildAvatar(vote)}
            <div class="voter-meta">
                <span class="voter-name">${escapeHtml(vote.full_name)}</span>
                <a class="voter-vk" href="${vkUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(vkName)}</a>
            </div>
        </div>
    `;
}

// Рендеринг таблицы голосов
function renderVotesLog(votes, flashTop = false) {
    if (votes.length === 0) {
        elements.votesLogBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 30px;">Голосов пока нет</td></tr>';
        return;
    }

    // Сортируем голоса по ID (от новых к старым)
    votes.sort((a, b) => b.id - a.id);

    // Заполняем тело таблицы
    elements.votesLogBody.innerHTML = '';

    votes.forEach((vote, index) => {
        const row = document.createElement('tr');
        // Подсвечиваем самую свежую строку при live-обновлении
        if (flashTop && index === 0) row.classList.add('flash');

        // Форматируем дату (парсим как локальное время, БЕЗ 'Z' для избежания сдвига на границе суток)
        const date = vote.created_at ? new Date(vote.created_at).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Chita'
        }).replace(',', '') : 'Нет данных';

        // Определяем статус голоса
        const status = vote.is_cancelled
            ? '<span class="vote-status cancelled">Аннулирован</span>'
            : '<span class="vote-status counted">Учтён</span>';

        // Формируем строку таблицы
        row.innerHTML = `
            <td>${vote.id}</td>
            <td>${date}</td>
            <td>${buildVoterCell(vote)}</td>
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

        const workspace = document.getElementById('workspace');

        if (data.success && data.published) {
            // Результаты опубликованы — плитка слева, лента/сводка справа.
            // Количество смен прокидываем в атрибуты: сетка и пропорции
            // рабочей зоны адаптируются под 1–6 смен.
            const count = (data.results || []).length;

            resultsSection.style.display = 'block';
            downloadSection.style.display = 'block';
            if (workspace) {
                workspace.classList.add('has-results');
                workspace.dataset.shifts = Math.min(count, 6);
            }

            const grid = document.createElement('div');
            grid.className = 'results-grid';
            grid.dataset.count = Math.min(count, 6);
            data.results.forEach(sr => grid.appendChild(buildShiftTile(sr)));
            resultsContainer.innerHTML = '';
            resultsContainer.appendChild(grid);
        } else {
            resultsSection.style.display = 'none';
            downloadSection.style.display = 'none';
            if (workspace) {
                workspace.classList.remove('has-results');
                delete workspace.dataset.shifts;
            }
        }
    } catch (error) {
        console.error('Error loading election results:', error);
    }
}

// ============================================================
// Проверка своего голоса по псевдониму
// ============================================================
async function verifyMyVote(event) {
    if (event) event.preventDefault();

    const input = document.getElementById('verify-input');
    const btn = document.getElementById('verify-btn');
    const result = document.getElementById('verify-result');
    if (!input || !result) return;

    const nickname = input.value.trim();
    if (nickname.length < 3) {
        result.innerHTML = '<div class="verify-msg verify-msg--warn">Введите псевдоним (минимум 3 символа)</div>';
        return;
    }

    btn.disabled = true;
    result.innerHTML = '<div class="verify-msg">Проверяем…</div>';

    try {
        const response = await fetch('/api/verify-vote?nickname=' + encodeURIComponent(nickname));

        if (response.status === 429) {
            result.innerHTML = '<div class="verify-msg verify-msg--warn">Слишком много запросов. Подождите минуту.</div>';
            return;
        }

        const data = await response.json();

        if (!data.success) {
            result.innerHTML = `<div class="verify-msg verify-msg--warn">${escapeHtml(data.error || 'Ошибка проверки')}</div>`;
            return;
        }

        if (!data.found) {
            result.innerHTML = '<div class="verify-msg verify-msg--warn">Псевдоним не найден. Проверьте написание -он указан в сообщении бота.</div>';
            return;
        }

        const items = data.votes.map(v => {
            const status = v.is_cancelled
                ? `<span class="vote-status cancelled">Аннулирован</span>`
                : `<span class="vote-status counted">Учтён</span>`;
            const reason = v.is_cancelled && v.cancellation_reason
                ? `<div class="verify-reason">Причина: ${escapeHtml(v.cancellation_reason)}</div>`
                : '';
            return `
                <div class="verify-item">
                    <div class="verify-item-head">
                        <span class="verify-shift">${escapeHtml(v.shift_name)}</span>
                        ${status}
                    </div>
                    <div class="verify-choice">${escapeHtml(v.choice)}</div>
                    ${reason}
                </div>
            `;
        }).join('');

        result.innerHTML = `
            <div class="verify-msg verify-msg--ok">Найдено голосов: ${data.votes.length}</div>
            ${items}
        `;
    } catch (error) {
        console.error('Verify vote error:', error);
        result.innerHTML = '<div class="verify-msg verify-msg--warn">Ошибка соединения. Попробуйте позже.</div>';
    } finally {
        btn.disabled = false;
    }
}

// Компактная плитка результата смены (Bento)
function buildShiftTile(sr) {
    const tile = document.createElement('div');
    tile.className = 'shift-tile';

    const total = (sr.stats && sr.stats.total_votes) || 0;
    const cands = sr.candidates || [];
    const sv = sr.special_votes || { against_all: 0, abstain: 0 };
    const winner = sr.winner;

    const bars = cands.map((c, i) => `
        <div class="tbar ${i === 0 ? 'is-winner' : ''}">
            <span class="tbar-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
            <span class="tbar-track"><span class="tbar-fill" style="width:${Math.min(100, Number(c.percentage) || 0)}%"></span></span>
            <span class="tbar-val">${c.percentage}%</span>
        </div>
    `).join('');

    const winnerHTML = winner
        ? `<div class="tile-winner">
               <span class="tile-crown">★</span>
               <span class="tile-winner-name" title="${escapeHtml(winner.name)}">${escapeHtml(winner.name)}</span>
               <span class="tile-winner-pct">${winner.percentage}%</span>
           </div>`
        : `<div class="tile-winner tile-winner--none">Победитель не определён</div>`;

    tile.innerHTML = `
        <div class="tile-head">
            <h3>${escapeHtml(sr.shift.name)}</h3>
            
        </div>
        ${winnerHTML}
        <div class="tbars">${bars || '<div class="tbar-empty">Нет кандидатов</div>'}</div>
        <div class="tile-special">
            <span>Против всех: <b>${sv.against_all}</b></span>
            <span>Воздерж.: <b>${sv.abstain}</b></span>
        </div>
    `;
    return tile;
}

// Настройка WebSocket
function setupWebSocket() {
    // Обновление статистики в реальном времени
    socket.on('stats_update', (data) => {
        setVoterCount(data.uniqueVoters || 0);
    });

    // Новый голос — празднуем и перезагружаем ленту с подсветкой
    socket.on('new_vote', () => {
        celebrateVote();
        loadVotesLog(true);
        // подтягиваем актуальный счётчик с сервера
        loadStatus();
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

        // Обновляем количество проголосовавших (с анимацией count-up)
        if (data.uniqueVoters !== undefined) {
            setVoterCount(data.uniqueVoters);
        }
    });

    // Канвасы искр/угольков + применяем сохранённую тему
    initEmbers();
    initEmberBg();
    applyTheme(localStorage.getItem('parus-theme') || 'light');
});

// ============================================================
// Темы: светлая / тёмная (с угольками)
// ============================================================
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // тёмная — угольки/костёр, светлая — лава-лампа
    setBgMode(theme === 'dark' ? 'ember' : 'lava');
}

// Обновляем интенсивность фона при изменении явки
function onVoterCountChanged(count) {
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
        updateEmberIntensity(count);
    } else {
        updateLava(count);
    }
}

function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';

    const doSwitch = () => {
        localStorage.setItem('parus-theme', next);
        applyTheme(next);
    };

    // Плавная волна из кнопки (круговое раскрытие новой темы)
    const btn = document.getElementById('theme-toggle');
    if (!document.startViewTransition || reducedMotion || !btn) {
        doSwitch();
        return;
    }

    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(doSwitch);
    transition.ready.then(() => {
        document.documentElement.animate(
            {
                clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${endRadius}px at ${x}px ${y}px)`
                ]
            },
            {
                duration: 600,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                pseudoElement: '::view-transition-new(root)'
            }
        );
    });
}

// ============================================================
// Живой счётчик (count-up) + празднование «+1 голос»
// ============================================================
let currentVoterCount = 0;
let counterInitialized = false;
let countRaf = null;

function setVoterCount(target) {
    target = Number(target) || 0;
    const el = elements.uniqueVoters;
    if (!el) return;

    // Первый раз — просто ставим значение без анимации
    if (!counterInitialized) {
        counterInitialized = true;
        currentVoterCount = target;
        el.textContent = target;
        onVoterCountChanged(target);
        return;
    }
    if (target === currentVoterCount) return;

    // Плотность костра сразу подстраиваем под новую явку
    onVoterCountChanged(target);

    const from = currentVoterCount;
    const to = target;
    const dur = 700;
    const start = performance.now();
    cancelAnimationFrame(countRaf);

    const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = Math.round(from + (to - from) * eased);
        if (p < 1) {
            countRaf = requestAnimationFrame(tick);
        } else {
            el.textContent = to;
            currentVoterCount = to;
        }
    };
    countRaf = requestAnimationFrame(tick);

    // Если счётчик вырос — бампим и подсвечиваем
    if (to > from) {
        el.classList.remove('bump');
        void el.offsetWidth; // рестарт анимации
        el.classList.add('bump');
    }
}

// Празднование нового голоса: «+1» всплывашка + искры
function celebrateVote() {
    const counter = document.getElementById('live-counter');
    const fx = document.getElementById('fx-layer');
    const num = elements.uniqueVoters;
    if (num) {
        num.classList.remove('bump');
        void num.offsetWidth;
        num.classList.add('bump');
    }
    if (!counter || !fx) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const r = counter.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    // «+1 голос»
    const pop = document.createElement('div');
    pop.className = 'vote-pop';
    pop.textContent = '+1 голос';
    pop.style.left = cx + 'px';
    pop.style.top = (r.top - 6) + 'px';
    fx.appendChild(pop);
    setTimeout(() => pop.remove(), 1600);

    // Искры из счётчика
    spawnSparks(cx, cy);
}

function spawnSparks(cx, cy) {
    if (!emberCtx) return;
    const n = 30;
    for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        const speed = 2.4 + Math.random() * 4.6;
        emberParticles.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
            life: 1,
            decay: 0.012 + Math.random() * 0.02,
            size: 1.6 + Math.random() * 3,
            hue: 20 + Math.random() * 32   // оранжево-жёлтый диапазон
        });
    }
    runEmberLoop();
}

// ============================================================
// Канвас искр (салют при новом голосе). На светлом фоне —
// без фоновых угольков: рисуем только всплески искр.
// ============================================================
let emberCtx = null;
let emberParticles = [];
let emberCanvas = null;
let emberRunning = false;

function initEmbers() {
    emberCanvas = document.getElementById('ember-canvas');
    if (!emberCanvas) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    emberCtx = emberCanvas.getContext('2d');
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        emberCanvas.width = window.innerWidth * dpr;
        emberCanvas.height = window.innerHeight * dpr;
        emberCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
}

function runEmberLoop() {
    if (emberRunning || !emberCtx) return;
    emberRunning = true;

    const render = () => {
        const W = window.innerWidth, H = window.innerHeight;
        emberCtx.clearRect(0, 0, W, H);

        for (let i = emberParticles.length - 1; i >= 0; i--) {
            const p = emberParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.13;        // гравитация
            p.vx *= 0.985;
            p.life -= p.decay;
            if (p.life <= 0 || p.y > H + 30) { emberParticles.splice(i, 1); continue; }

            const a = Math.max(0, p.life);
            emberCtx.beginPath();
            emberCtx.fillStyle = `hsla(${p.hue}, 100%, ${52 + p.life * 18}%, ${a})`;
            emberCtx.shadowBlur = 10;
            emberCtx.shadowColor = `hsla(${p.hue}, 100%, 55%, ${a})`;
            emberCtx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2);
            emberCtx.fill();
        }
        emberCtx.shadowBlur = 0;

        if (emberParticles.length > 0) {
            requestAnimationFrame(render);
        } else {
            emberCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            emberRunning = false;
        }
    };
    requestAnimationFrame(render);
}

// ============================================================
// Фоновые угольки, поднимающиеся снизу (только тёмная тема)
// ============================================================
let bgCanvas = null, bgCtx = null, bgRunning = false, bgMode = 'off';
let bgParticles = [];   // угольки (тёмная тема)
let lavaBlobs = [];     // капли лава-лампы (светлая тема)
let reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initEmberBg() {
    bgCanvas = document.getElementById('ember-bg');
    if (!bgCanvas) return;
    bgCtx = bgCanvas.getContext('2d');
    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        bgCanvas.width = window.innerWidth * dpr;
        bgCanvas.height = window.innerHeight * dpr;
        bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
}

// ---------- Угольки (тёмная тема) ----------
function makeAmbient(spread) {
    const H = window.innerHeight, W = window.innerWidth;
    return {
        x: Math.random() * W,
        y: spread ? Math.random() * H : H + Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(0.3 + Math.random() * 0.95),
        size: 0.8 + Math.random() * 2.4,
        life: 0.6 + Math.random() * 0.6,
        decay: 0.0014 + Math.random() * 0.002,
        flick: Math.random() * Math.PI * 2,
        hue: 18 + Math.random() * 32
    };
}

// Чем больше проголосовало — тем гуще «костёр».
const EMBER_BASE = 14, EMBER_MAX = 200;
let emberTarget = 0;

function computeEmberTarget(count) {
    if (reducedMotion) return 0;
    const c = (count === undefined) ? currentVoterCount : count;
    const screenCap = Math.floor(window.innerWidth / 6);
    return Math.max(EMBER_BASE, Math.min(EMBER_MAX, EMBER_BASE + c, screenCap));
}

function updateEmberIntensity(count) {
    emberTarget = computeEmberTarget(count);
    if (bgMode === 'ember') {
        let guard = 0;
        while (bgParticles.length < emberTarget && guard++ < EMBER_MAX) bgParticles.push(makeAmbient(false));
        startBgLoop();
    }
}

// ---------- Лава-лампа (светлая тема) ----------
const LAVA_MIN = 4, LAVA_MAX = 18;
let lavaSizeMul = 1;

function computeLavaCount(count) {
    if (reducedMotion) return 0;
    const c = (count === undefined) ? currentVoterCount : count;
    return Math.max(LAVA_MIN, Math.min(LAVA_MAX, LAVA_MIN + Math.floor(c / 12)));
}
function computeLavaSize(count) {
    const c = (count === undefined) ? currentVoterCount : count;
    return 1 + Math.min(1.5, c / 110); // при ~110+ голосах капли крупные
}
function makeBlob() {
    const W = window.innerWidth, H = window.innerHeight;
    // Светлые (жёлтые) и глубокие (красно-оранжевые) капли — чтобы читались на оранжевом поле
    const warm = [[255, 232, 150], [255, 200, 70], [255, 150, 20], [226, 74, 0], [255, 105, 0]];
    const col = warm[Math.floor(Math.random() * warm.length)];
    return {
        cx: Math.random() * W,
        cy: H * (0.24 + Math.random() * 0.55),
        range: 0.5 + Math.random() * 0.62,
        phase: Math.random() * Math.PI * 2,
        speed: 0.0022 + Math.random() * 0.0038,
        baseR: 70 + Math.random() * 100,
        color: `rgba(${col[0]},${col[1]},${col[2]},0.72)`,
        edge: `rgba(${col[0]},${col[1]},${col[2]},0)`
    };
}
function ensureLava(count) {
    lavaSizeMul = computeLavaSize(count);
    const target = computeLavaCount(count);
    while (lavaBlobs.length < target) lavaBlobs.push(makeBlob());
    if (lavaBlobs.length > target) lavaBlobs.length = target;
}
function updateLava(count) {
    if (bgMode === 'lava') { ensureLava(count); startBgLoop(); }
}

// ---------- Управление режимом фона ----------
function setBgMode(mode) {
    if (!bgCtx) return;
    if (reducedMotion) { bgMode = 'off'; bgCtx.clearRect(0, 0, window.innerWidth, window.innerHeight); return; }
    bgMode = mode;
    if (mode === 'ember') {
        lavaBlobs.length = 0;
        emberTarget = computeEmberTarget();
        while (bgParticles.length < emberTarget) bgParticles.push(makeAmbient(true));
    } else if (mode === 'lava') {
        bgParticles.length = 0;
        ensureLava();
    } else {
        bgParticles.length = 0;
        lavaBlobs.length = 0;
    }
    startBgLoop();
}
// Совместимость со старыми вызовами
function startAmbient() { setBgMode('ember'); }
function stopAmbient() { /* режим переключается через setBgMode */ }

function startBgLoop() {
    if (bgRunning || !bgCtx || reducedMotion) return;
    bgRunning = true;
    requestAnimationFrame(bgFrame);
}

function bgFrame() {
    const W = window.innerWidth, H = window.innerHeight;
    bgCtx.clearRect(0, 0, W, H);

    if (bgMode === 'ember') renderEmbers(W, H);
    else if (bgMode === 'lava') renderLava(W, H);

    const active = (bgMode === 'ember' && bgParticles.length > 0) || bgMode === 'lava';
    if (active) {
        requestAnimationFrame(bgFrame);
    } else {
        bgCtx.clearRect(0, 0, W, H);
        bgRunning = false;
    }
}

function renderEmbers(W, H) {
    bgCtx.globalCompositeOperation = 'lighter';
    for (let i = bgParticles.length - 1; i >= 0; i--) {
        const p = bgParticles[i];
        p.x += p.vx; p.y += p.vy;
        p.vx += (Math.random() - 0.5) * 0.05;
        p.vx = Math.max(-0.8, Math.min(0.8, p.vx));
        p.flick += 0.08; p.life -= p.decay;
        if (p.y < -20 || p.life <= 0) {
            if (bgMode === 'ember' && bgParticles.length <= emberTarget) { Object.assign(p, makeAmbient(false)); }
            else { bgParticles.splice(i, 1); continue; }
        }
        const tw = 0.5 + 0.5 * Math.sin(p.flick);
        const a = Math.min(1, p.life) * (0.4 + 0.5 * tw);
        bgCtx.beginPath();
        bgCtx.fillStyle = `hsla(${p.hue}, 100%, 58%, ${a})`;
        bgCtx.shadowBlur = 8;
        bgCtx.shadowColor = `hsla(${p.hue}, 100%, 55%, ${a})`;
        bgCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        bgCtx.fill();
    }
    bgCtx.shadowBlur = 0;
    bgCtx.globalCompositeOperation = 'source-over';
}

function renderLava(W, H) {
    // source-over (обычное наложение): и светлые, и тёмные капли видны на оранжевом поле
    for (const b of lavaBlobs) {
        b.phase += b.speed;
        const x = b.cx + Math.cos(b.phase * 0.6) * W * 0.05;
        const y = b.cy + Math.sin(b.phase) * H * 0.28 * b.range;
        const r = b.baseR * lavaSizeMul * (1 + 0.16 * Math.sin(b.phase * 1.4));
        const g = bgCtx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, b.color);
        g.addColorStop(0.6, b.color.replace(/0\.72\)/, '0.4)'));
        g.addColorStop(1, b.edge);
        bgCtx.fillStyle = g;
        bgCtx.beginPath();
        bgCtx.arc(x, y, r, 0, Math.PI * 2);
        bgCtx.fill();
    }
}
