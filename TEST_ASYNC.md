# Тестирование асинхронной работы бота

## Быстрый тест

### 1. Запустите бота и сервер:
```bash
npm start
```

### 2. Проверьте логи при старте:

Вы должны увидеть:
```
VK Бот запущен (polling)!
Обработчик очереди сообщений запущен (каждую минуту)
Bot API сервер запущен на порту 3001
```

### 3. Тест с одним пользователем:

1. Напишите боту `/vote`
2. Введите ФИО
3. Проголосуйте за кандидата
4. Должно работать без ошибок ✅

### 4. Тест с несколькими пользователями ОДНОВРЕМЕННО:

**Попросите 3-5 человек одновременно (в течение 1-2 секунд) написать боту `/vote`**

#### Без фикса (до исправлений):
```
Пользователь 1: ✅ Работает
Пользователь 2: ❌ SQLite3 can only bind...
Пользователь 3: ❌ undefined
Пользователь 4: ❌ SQLITE_BUSY
```

#### С фиксом (после исправлений):
```
Пользователь 1: ✅ Работает (~30ms)
Пользователь 2: ✅ Работает (~50ms)
Пользователь 3: ✅ Работает (~70ms)
Пользователь 4: ✅ Работает (~90ms)
Пользователь 5: ✅ Работает (~110ms)
```

## Мониторинг логов

### Смотрите логи в реальном времени:

```bash
# Windows PowerShell
Get-Content logs\combined.log -Wait

# Linux/Mac
tail -f logs/combined.log
```

### Что искать в логах:

✅ **Правильная работа:**
```
[DEBUG] Processing task for user 123456789
[DEBUG] Executing: Create vote: vkId=123456789, shift=1 (pending: 1)
[DEBUG] Completed: Create vote: vkId=123456789, shift=1 in 45ms
[INFO] Vote created: { vkId: '123456789', nickname: 'Сияющий Дракон', ... }
```

❌ **Ошибки (если что-то не работает):**
```
[ERROR] Task error for user 123456789: SQLite3 can only bind...
[ERROR] Error in Create vote: SQLITE_BUSY
```

## Нагрузочный тест (опционально)

Если хотите протестировать с большим количеством одновременных запросов, можно использовать скрипт:

```javascript
// test-concurrent.js
const axios = require('axios');

const API_URL = 'http://localhost:3000/api';
const API_SECRET = process.env.VK_SECRET;

async function simulateVote(userId, shiftId) {
    try {
        const response = await axios.post(`${API_URL}/vote`, {
            vkId: userId,
            fullName: `Тестовый Пользователь ${userId}`,
            nickname: `Тест${userId}`,
            shiftId: shiftId,
            candidateId: 1,
            voteType: 'candidate'
        }, {
            headers: { 'x-bot-secret': API_SECRET }
        });

        console.log(`✅ User ${userId}: ${response.data.message}`);
    } catch (error) {
        console.error(`❌ User ${userId}: ${error.response?.data?.error || error.message}`);
    }
}

// Симулируем 10 одновременных голосов
async function runTest() {
    console.log('Запуск нагрузочного теста...\n');

    const promises = [];
    for (let i = 1; i <= 10; i++) {
        promises.push(simulateVote(900000000 + i, 1));
    }

    await Promise.all(promises);
    console.log('\nТест завершён!');
}

runTest();
```

Запуск:
```bash
node test-concurrent.js
```

## Проверка результатов

### 1. Проверьте базу данных:

```bash
# Подключитесь к БД
sqlite3 src/database/voting.db

# Посмотрите голоса
SELECT COUNT(*) as total_votes FROM votes;

# Посмотрите пользователей
SELECT COUNT(*) as total_users FROM users;
```

### 2. Проверьте через админ-панель:

Откройте: http://localhost:3000/admin-dashboard.html

- Перейдите в "Журнал голосов"
- Все голоса должны быть записаны
- Не должно быть дубликатов

## Что делать при ошибках

### Ошибка: "Cannot find module './utils/messageQueue'"

**Решение:**
```bash
# Убедитесь что файлы созданы
ls src/utils/messageQueue.js
ls src/utils/dbQueue.js

# Если файлов нет, создайте их заново
```

### Ошибка: "SQLITE_BUSY" всё ещё появляется

**Проверьте:**
1. База данных в режиме WAL:
```bash
sqlite3 src/database/voting.db "PRAGMA journal_mode;"
# Должно вывести: wal
```

2. Нет ли заблокированных процессов:
```bash
# Остановите все процессы
# Удалите -wal и -shm файлы
rm src/database/voting.db-wal
rm src/database/voting.db-shm

# Перезапустите
npm start
```

### Ошибка: "SQLite3 can only bind..."

Это значит где-то ещё остался вызов асинхронной функции как синхронной.

**Найдите:**
```bash
# Поищите где вызывается Vote.create или User.create без await
grep -n "Vote.create" src/**/*.js
grep -n "User.create" src/**/*.js
```

## Успешный результат

✅ Бот работает без ошибок
✅ Несколько пользователей могут одновременно голосовать
✅ Все голоса сохраняются в БД
✅ В логах нет ошибок SQLITE_BUSY
✅ Время обработки: 30-100ms на пользователя

## Вопросы?

Если что-то не работает:
1. Проверьте логи (`logs/combined.log`)
2. Проверьте версию Node.js (должна быть >= 14)
3. Убедитесь что все зависимости установлены (`npm install`)
4. Проверьте `.env` файл (все переменные заполнены)
