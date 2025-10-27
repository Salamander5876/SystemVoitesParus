@echo off
chcp 65001 >nul
echo ==========================================
echo   Система голосования - Лагерь "Парус"
echo ==========================================
echo.

REM Проверка наличия Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ ОШИБКА: Node.js не установлен!
    echo Скачайте с https://nodejs.org/
    pause
    exit /b 1
)

echo [1/3] ✓ Проверка зависимостей...
if not exist "node_modules" (
    echo    Установка зависимостей...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ ОШИБКА: Не удалось установить зависимости!
        pause
        exit /b 1
    )
) else (
    echo    Зависимости уже установлены
)

echo.
echo [2/3] ✓ Проверка базы данных...
if not exist "src\database\voting.db" (
    echo    Инициализация базы данных...
    call npm run init-db
    if %errorlevel% neq 0 (
        echo ❌ ОШИБКА: Не удалось создать базу данных!
        pause
        exit /b 1
    )
) else (
    echo    База данных существует
)

echo.
echo [3/3] ✓ Запуск системы...
echo.

echo    Запуск веб-сервера...
start "Сервер голосования" cmd /k "npm start"

timeout /t 3 >nul

echo    Запуск VK бота...
start "VK Бот" cmd /k "node src/bot.js"

echo.
echo ==========================================
echo   ✅ СИСТЕМА ЗАПУЩЕНА УСПЕШНО!
echo ==========================================
echo.
echo 🌐 Веб-интерфейс: http://localhost:3000
echo 🔐 Админ панель:  http://localhost:3000/admin
echo.
echo 📝 Логин:  admin
echo 🔑 Пароль: Admin123!
echo.
echo ⚠️  ВАЖНО: Измените пароль после первого входа!
echo.
echo 📖 Инструкция: откройте КАК_ЗАПУСТИТЬ.txt
echo.
pause
