-- Миграция: переход к новой системе голосования
-- Один голос на смену (кандидат, против всех, воздержаться)

BEGIN TRANSACTION;

-- 1. Создаем новые таблицы с правильной структурой
CREATE TABLE IF NOT EXISTS candidates_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    photo_url TEXT,
    vote_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
    UNIQUE(shift_id, name)
);

CREATE TABLE IF NOT EXISTS votes_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    shift_id INTEGER NOT NULL,
    candidate_id INTEGER,
    vote_type TEXT NOT NULL CHECK(vote_type IN ('candidate', 'against_all', 'abstain')),
    vote_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates_new(id) ON DELETE SET NULL,
    UNIQUE(user_id, shift_id)
);

-- 2. Копируем кандидатов (объединяем votes_for в vote_count)
INSERT INTO candidates_new (id, shift_id, name, description, photo_url, vote_count, is_active, created_at)
SELECT id, shift_id, name, description, photo_url,
       COALESCE(votes_for, 0) as vote_count,
       is_active, created_at
FROM candidates;

-- 3. Удаляем старые таблицы
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS candidates;

-- 4. Переименовываем новые таблицы
ALTER TABLE candidates_new RENAME TO candidates;
ALTER TABLE votes_new RENAME TO votes;

-- 5. Пересоздаем индексы
CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
CREATE INDEX IF NOT EXISTS idx_votes_shift_id ON votes(shift_id);
CREATE INDEX IF NOT EXISTS idx_votes_candidate_id ON votes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_votes_created_at ON votes(created_at);
CREATE INDEX IF NOT EXISTS idx_candidates_shift_id ON candidates(shift_id);

-- 6. Добавляем специальные "кандидаты" для каждой смены
INSERT INTO candidates (shift_id, name, description, vote_count, is_active)
SELECT id, 'Против всех', 'Голос против всех кандидатов', 0, 1
FROM shifts
WHERE NOT EXISTS (
    SELECT 1 FROM candidates WHERE shift_id = shifts.id AND name = 'Против всех'
);

INSERT INTO candidates (shift_id, name, description, vote_count, is_active)
SELECT id, 'Воздержаться', 'Воздержаться от голосования', 0, 1
FROM shifts
WHERE NOT EXISTS (
    SELECT 1 FROM candidates WHERE shift_id = shifts.id AND name = 'Воздержаться'
);

COMMIT;
