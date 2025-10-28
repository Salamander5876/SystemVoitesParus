require('dotenv').config();

// Установка часового пояса Asia/Chita
process.env.TZ = 'Asia/Chita';

const EligibleVoter = require('./src/models/EligibleVoter');

console.log('=== Тест обновления статуса избирателя ===\n');

// Получаем статистику
const stats = EligibleVoter.getStats();
console.log('Статистика избирателей:');
console.log(`- Всего: ${stats.total}`);
console.log(`- Проголосовало: ${stats.voted}`);
console.log(`- Осталось: ${stats.remaining}\n`);

// Получаем всех избирателей
const voters = EligibleVoter.getAll();
console.log('Список избирателей:');
voters.forEach(voter => {
    const status = voter.has_voted ? '✅ Проголосовал' : '❌ Не голосовал';
    const votedAt = voter.voted_at ? ` (${voter.voted_at})` : '';
    console.log(`${voter.id}. ${voter.full_name} - ${status}${votedAt}`);
});

console.log('\n=== Проверка часового пояса ===');
console.log('Текущее время (Asia/Chita):', new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Chita' }));
console.log('Текущее время (UTC):', new Date().toISOString());
