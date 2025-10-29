@echo off
:: Скрипт запускает два окна: npm start и node src/bot.js

:: Запуск первого окна: npm start
start "npm start" cmd /k "npm start"

:: Запуск второго окна: node src/bot.js
start "Bot" cmd /k "node src/bot.js"

:: Опционально: вывести сообщение в текущее окно
echo Два окна запущены: npm start и node src/bot.js
