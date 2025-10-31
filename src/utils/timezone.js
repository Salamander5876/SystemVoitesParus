/**
 * Конвертирует UTC время из базы данных в локальное время Asia/Chita
 * @param {string} utcTimeString - Время в формате 'YYYY-MM-DD HH:MM:SS' из SQLite
 * @returns {string} - Локальное время в формате 'YYYY-MM-DD HH:MM:SS'
 */
function convertToLocalTime(utcTimeString) {
    if (!utcTimeString) return null;

    // SQLite возвращает время в UTC как строку
    // Добавляем 'Z' чтобы явно указать, что это UTC
    const utcDate = new Date(utcTimeString + 'Z');

    // Конвертируем в Asia/Chita и форматируем
    const localTimeString = utcDate.toLocaleString('en-US', {
        timeZone: 'Asia/Chita',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    // Преобразуем формат из MM/DD/YYYY, HH:MM:SS в YYYY-MM-DD HH:MM:SS
    const parts = localTimeString.split(', ');
    const dateParts = parts[0].split('/');
    const timePart = parts[1];

    return `${dateParts[2]}-${dateParts[0]}-${dateParts[1]} ${timePart}`;
}

/**
 * Конвертирует массив объектов, заменяя UTC поля времени на локальное время
 * @param {Array} items - Массив объектов
 * @param {Array} timeFields - Имена полей с временем для конвертации
 * @returns {Array} - Массив с конвертированными временами
 */
function convertArrayToLocalTime(items, timeFields = ['created_at']) {
    if (!Array.isArray(items)) return items;

    return items.map(item => {
        const converted = { ...item };
        timeFields.forEach(field => {
            if (converted[field]) {
                converted[field] = convertToLocalTime(converted[field]);
            }
        });
        return converted;
    });
}

/**
 * Конвертирует объект, заменяя UTC поля времени на локальное время
 * @param {Object} item - Объект
 * @param {Array} timeFields - Имена полей с временем для конвертации
 * @returns {Object} - Объект с конвертированными временами
 */
function convertObjectToLocalTime(item, timeFields = ['created_at']) {
    if (!item || typeof item !== 'object') return item;

    const converted = { ...item };
    timeFields.forEach(field => {
        if (converted[field]) {
            converted[field] = convertToLocalTime(converted[field]);
        }
    });
    return converted;
}

module.exports = {
    convertToLocalTime,
    convertArrayToLocalTime,
    convertObjectToLocalTime
};
