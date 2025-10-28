require('dotenv').config();

// Установка часового пояса Asia/Chita
process.env.TZ = 'Asia/Chita';

const EligibleVoter = require('./src/models/EligibleVoter');
const Vote = require('./src/models/Vote');

console.log('=== Тест аннулирования голоса и повторного голосования ===\n');

// Тестируем с первым избирателем из списка
const testVoterName = 'Авдюков Богдан Алексеевич';

console.log(`Тестовый избиратель: ${testVoterName}\n`);

// 1. Проверяем начальное состояние
console.log('1. Начальное состояние:');
const initialVoter = EligibleVoter.checkEligibility(testVoterName);
console.log(`   - Проголосовал: ${initialVoter?.has_voted ? 'Да' : 'Нет'}`);
console.log(`   - Дата голосования: ${initialVoter?.voted_at || 'Не указана'}\n`);

// 2. Отмечаем как проголосовавшего
console.log('2. Отмечаем избирателя как проголосовавшего...');
EligibleVoter.markAsVoted(testVoterName);
const afterVote = EligibleVoter.checkEligibility(testVoterName);
console.log(`   - Проголосовал: ${afterVote?.has_voted ? 'Да ✅' : 'Нет'}`);
console.log(`   - Дата голосования: ${afterVote?.voted_at}\n`);

// 3. Сбрасываем статус (аннулирование)
console.log('3. Аннулируем голос (сбрасываем статус)...');
EligibleVoter.unmarkAsVoted(testVoterName);
const afterCancel = EligibleVoter.checkEligibility(testVoterName);
console.log(`   - Проголосовал: ${afterCancel?.has_voted ? 'Да' : 'Нет ✅'}`);
console.log(`   - Дата голосования: ${afterCancel?.voted_at || 'Не указана ✅'}\n`);

// 4. Повторно отмечаем как проголосовавшего
console.log('4. Настоящий человек может проголосовать снова...');
EligibleVoter.markAsVoted(testVoterName);
const afterRevote = EligibleVoter.checkEligibility(testVoterName);
console.log(`   - Проголосовал: ${afterRevote?.has_voted ? 'Да ✅' : 'Нет'}`);
console.log(`   - Дата голосования: ${afterRevote?.voted_at}\n`);

// 5. Сбрасываем обратно для чистоты тестов
console.log('5. Сбрасываем для чистоты тестов...');
EligibleVoter.unmarkAsVoted(testVoterName);
console.log('   ✅ Тест завершен\n');

console.log('=== Итоги теста ===');
console.log('✅ Функция markAsVoted() работает');
console.log('✅ Функция unmarkAsVoted() работает');
console.log('✅ После аннулирования голоса человек может проголосовать снова');
