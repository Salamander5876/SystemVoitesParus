// Тестовый скрипт для проверки функционала избирателей
const EligibleVoter = require('./src/models/EligibleVoter');

console.log('=== Тест функционала избирателей ===\n');

// Тест 1: Добавление тестовых избирателей
console.log('Тест 1: Добавление тестовых избирателей');
const testVoters = [
    'Иванов Иван Иванович',
    'Петров Петр Петрович',
    'Сидорова Мария Александровна',
    'Кузнецов Алексей Викторович',
    'Смирнова Елена Сергеевна',
    'Иванов Иван Иванович', // дубликат
    'тест 123', // невалидное ФИО (цифры)
    'ABC', // невалидное ФИО (латиница)
    '' // пустая строка
];

const result = EligibleVoter.bulkAdd(testVoters);
console.log('Результат загрузки:');
console.log(`  Добавлено: ${result.added}`);
console.log(`  Дубликатов: ${result.duplicates}`);
console.log(`  Невалидных: ${result.invalid}`);
if (result.invalidNames.length > 0) {
    console.log(`  Невалидные ФИО: ${result.invalidNames.join(', ')}`);
}
console.log();

// Тест 2: Получение статистики
console.log('Тест 2: Статистика избирателей');
const stats = EligibleVoter.getStats();
console.log(`  Всего: ${stats.total}`);
console.log(`  Проголосовало: ${stats.voted}`);
console.log(`  Осталось: ${stats.remaining}`);
console.log();

// Тест 3: Проверка наличия избирателя
console.log('Тест 3: Проверка наличия избирателей');
const testNames = [
    'Иванов Иван Иванович',
    'ИВАНОВ ИВАН ИВАНОВИЧ',
    '  Иванов    Иван   Иванович  ',
    'Несуществующий Избиратель Петрович'
];

testNames.forEach(name => {
    const voter = EligibleVoter.checkEligibility(name);
    console.log(`  "${name}" -> ${voter ? '✓ Найден' : '✗ Не найден'}`);
});
console.log();

// Тест 4: Отметка о голосовании
console.log('Тест 4: Отметка о голосовании');
const marked = EligibleVoter.markAsVoted('Иванов Иван Иванович');
console.log(`  Иванов отмечен как проголосовавший: ${marked ? '✓' : '✗'}`);

const voter = EligibleVoter.checkEligibility('Иванов Иван Иванович');
console.log(`  Статус: ${voter.has_voted ? 'Проголосовал' : 'Не голосовал'}`);
console.log();

// Тест 5: Проверка дубликата голосования
console.log('Тест 5: Попытка повторного голосования');
const voter2 = EligibleVoter.checkEligibility('Иванов Иван Иванович');
if (voter2 && voter2.has_voted) {
    console.log('  ✓ Правильно: избиратель уже проголосовал');
} else {
    console.log('  ✗ Ошибка: должен быть отмечен как проголосовавший');
}
console.log();

// Тест 6: Получение списка
console.log('Тест 6: Списки избирателей');
const allVoters = EligibleVoter.getAll();
console.log(`  Всего в списке: ${allVoters.length}`);

const voted = EligibleVoter.getVoted();
console.log(`  Проголосовали: ${voted.length}`);

const notVoted = EligibleVoter.getNotVoted();
console.log(`  Не проголосовали: ${notVoted.length}`);
console.log();

// Вывод статистики после теста
const finalStats = EligibleVoter.getStats();
console.log('=== Финальная статистика ===');
console.log(`Всего избирателей: ${finalStats.total}`);
console.log(`Проголосовало: ${finalStats.voted}`);
console.log(`Осталось: ${finalStats.remaining}`);
console.log();

console.log('✅ Все тесты выполнены!');
console.log('\nДля очистки тестовых данных используйте:');
console.log('DELETE FROM eligible_voters;');
