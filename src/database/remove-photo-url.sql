-- Migration: Remove photo_url column from candidates table
-- Date: 2025-10-27

BEGIN TRANSACTION;

-- Создаём backup таблицы кандидатов
CREATE TABLE IF NOT EXISTS candidates_backup_photo AS SELECT * FROM candidates;

-- Создаём новую таблицу без photo_url
CREATE TABLE candidates_new (
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

-- Копируем данные (без photo_url)
INSERT INTO candidates_new (id, shift_id, name, description, vote_count, is_active, created_at)
SELECT id, shift_id, name, description, vote_count, is_active, created_at
FROM candidates;

-- Удаляем старую таблицу
DROP TABLE candidates;

-- Переименовываем новую таблицу
ALTER TABLE candidates_new RENAME TO candidates;

-- Пересоздаём индексы
CREATE INDEX IF NOT EXISTS idx_candidates_shift_id ON candidates(shift_id);

COMMIT;

-- Backup создан в таблице: candidates_backup_photo
-- Для отката выполните:
-- DROP TABLE candidates;
-- ALTER TABLE candidates_backup_photo RENAME TO candidates;
