const db = require('../config/database');

class Settings {
    static get(key) {
        const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
        const result = stmt.get(key);
        return result ? result.value : null;
    }

    static set(key, value) {
        const stmt = db.prepare(`
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(key, value, value);
    }

    static getAll() {
        const stmt = db.prepare('SELECT * FROM settings');
        const rows = stmt.all();
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        return settings;
    }

    static delete(key) {
        const stmt = db.prepare('DELETE FROM settings WHERE key = ?');
        const result = stmt.run(key);
        return result.changes > 0;
    }

    // Специфичные методы для настроек голосования
    static getVotingStatus() {
        return this.get('voting_status') || 'not_started';
    }

    static setVotingStatus(status) {
        this.set('voting_status', status);
    }

    static getStartTime() {
        return this.get('start_time');
    }

    static setStartTime(time) {
        this.set('start_time', time);
    }

    static getEndTime() {
        return this.get('end_time');
    }

    static setEndTime(time) {
        this.set('end_time', time);
    }

    static isVotingActive() {
        const status = this.getVotingStatus();
        return status === 'active';
    }

    static startVoting(startTime = null, endTime = null) {
        this.setVotingStatus('active');
        if (startTime) this.setStartTime(startTime);
        if (endTime) this.setEndTime(endTime);
    }

    static stopVoting() {
        this.setVotingStatus('finished');
    }

    static pauseVoting() {
        this.setVotingStatus('paused');
    }

    static resetVoting() {
        this.setVotingStatus('not_started');
        this.delete('start_time');
        this.delete('end_time');
    }

    // Методы для публикации результатов
    static getResultsPublished() {
        return this.get('results_published') === 'true';
    }

    static publishResults() {
        this.set('results_published', 'true');
        this.set('results_published_at', new Date().toISOString());
    }

    static unpublishResults() {
        this.set('results_published', 'false');
        this.delete('results_published_at');
    }

    static getResultsPublishedAt() {
        return this.get('results_published_at');
    }
}

module.exports = Settings;
