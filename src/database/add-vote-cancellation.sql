-- Добавляем поля для аннулирования голосов

-- Добавляем флаг аннулирования
ALTER TABLE votes ADD COLUMN is_cancelled BOOLEAN DEFAULT 0;

-- Добавляем причину аннулирования
ALTER TABLE votes ADD COLUMN cancellation_reason TEXT;

-- Добавляем дату/время аннулирования
ALTER TABLE votes ADD COLUMN cancelled_at DATETIME;

-- Добавляем ID админа, который аннулировал
ALTER TABLE votes ADD COLUMN cancelled_by INTEGER REFERENCES admins(id);
