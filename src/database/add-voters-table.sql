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

-- Индекс для быстрого поиска по нормализованному ФИО
CREATE INDEX IF NOT EXISTS idx_eligible_voters_normalized ON eligible_voters(full_name_normalized);
CREATE INDEX IF NOT EXISTS idx_eligible_voters_has_voted ON eligible_voters(has_voted);
