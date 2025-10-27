require('dotenv').config();
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../src/database/voting.db');
const backupDir = path.join(__dirname, '../backups');

// Создаём директорию для бекапов если её нет
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

// Имя файла бекапа с текущей датой и временем
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `voting_${timestamp}.db`);

try {
    // Копируем файл БД
    fs.copyFileSync(dbPath, backupPath);
    console.log(`✓ Резервная копия создана: ${backupPath}`);

    // Удаляем старые бекапы (старше 7 дней)
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 дней в миллисекундах

    files.forEach(file => {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
            fs.unlinkSync(filePath);
            console.log(`✓ Удалён старый бекап: ${file}`);
        }
    });

    console.log('\n✓ Резервное копирование завершено успешно!');
} catch (error) {
    console.error('Ошибка при создании резервной копии:', error);
    process.exit(1);
}
