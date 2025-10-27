require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');
const Admin = require('../src/models/Admin');

console.log('Инициализация базы данных...');

try {
    // Читаем SQL файлы
    const initSQL = fs.readFileSync(
        path.join(__dirname, '../src/database/init.sql'),
        'utf8'
    );
    const seedsSQL = fs.readFileSync(
        path.join(__dirname, '../src/database/seeds.sql'),
        'utf8'
    );

    // Выполняем создание таблиц
    console.log('Создание таблиц...');
    db.exec(initSQL);
    console.log('✓ Таблицы созданы');

    // Выполняем seeds
    console.log('Добавление начальных данных...');
    db.exec(seedsSQL);
    console.log('✓ Начальные данные добавлены');

    // Создаём администратора
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

    const existingAdmin = Admin.getByUsername(adminUsername);
    if (!existingAdmin) {
        Admin.create(adminUsername, adminPassword).then(() => {
            console.log(`✓ Администратор создан (логин: ${adminUsername})`);
            console.log('\n=================================');
            console.log('База данных успешно инициализирована!');
            console.log('=================================');
            console.log(`Админ логин: ${adminUsername}`);
            console.log(`Админ пароль: ${adminPassword}`);
            console.log('=================================\n');
            console.log('ВАЖНО: Измените пароль администратора после первого входа!');
        }).catch(err => {
            console.error('Ошибка при создании администратора:', err);
            process.exit(1);
        });
    } else {
        console.log('✓ Администратор уже существует');
        console.log('\n=================================');
        console.log('База данных успешно инициализирована!');
        console.log('=================================\n');
    }

} catch (error) {
    console.error('Ошибка при инициализации базы данных:', error);
    process.exit(1);
}
