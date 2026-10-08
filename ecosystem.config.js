// PM2: запускаем node напрямую, а не через `npm start` → concurrently.
// Иначе SIGINT получает npm, а не node-процессы, и PM2 добивает всё через SIGKILL.
module.exports = {
    apps: [
        {
            name: 'voting-server',
            script: 'src/server.js',
            instances: 1,
            exec_mode: 'fork',
            kill_timeout: 10000, // > SHUTDOWN_TIMEOUT (8000 мс) в server.js
            max_memory_restart: '500M',
            env: { NODE_ENV: 'production' }
        },
        {
            name: 'voting-bot',
            script: 'src/bot.js',
            instances: 1,
            exec_mode: 'fork',
            kill_timeout: 10000,
            max_memory_restart: '300M',
            env: { NODE_ENV: 'production' }
        }
    ]
};
