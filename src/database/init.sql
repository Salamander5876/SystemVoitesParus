-- Таблица смен
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица кандидатов
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    vote_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
    UNIQUE(shift_id, name)
);

-- Таблица пользователей (голосовавших)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vk_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    nickname TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица голосов (один голос на смену: за кандидата, против всех, или воздержаться)
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    shift_id INTEGER NOT NULL,
    candidate_id INTEGER,
    vote_type TEXT NOT NULL CHECK(vote_type IN ('candidate', 'against_all', 'abstain')),
    vote_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_cancelled BOOLEAN DEFAULT 0,
    cancellation_reason TEXT,
    cancelled_at DATETIME,
    cancelled_by INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE SET NULL,
    FOREIGN KEY (cancelled_by) REFERENCES admins(id)
);

-- Таблица администраторов
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица настроек
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица логов действий
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id)
);

-- Таблица списка избирателей
CREATE TABLE IF NOT EXISTS eligible_voters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    full_name_normalized TEXT NOT NULL,
    has_voted BOOLEAN DEFAULT 0,
    voted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_users_vk_id ON users(vk_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
CREATE INDEX IF NOT EXISTS idx_votes_shift_id ON votes(shift_id);
CREATE INDEX IF NOT EXISTS idx_votes_candidate_id ON votes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes(created_at);
CREATE INDEX IF NOT EXISTS idx_votes_is_cancelled ON votes(is_cancelled);
CREATE INDEX IF NOT EXISTS idx_candidates_shift_id ON candidates(shift_id);
CREATE INDEX IF NOT EXISTS idx_shifts_is_active ON shifts(is_active);
CREATE INDEX IF NOT EXISTS idx_eligible_voters_normalized ON eligible_voters(full_name_normalized);

-- Partial unique index для голосов: уникальность только для неаннулированных голосов
-- Это позволяет пользователям голосовать повторно после аннулирования их голосов
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_votes
ON votes(user_id, shift_id)
WHERE is_cancelled = 0;
