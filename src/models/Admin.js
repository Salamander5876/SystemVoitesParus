const db = require('../config/database');
const bcrypt = require('bcryptjs');

class Admin {
    static getAll() {
        const stmt = db.prepare('SELECT id, username, last_login, created_at FROM admins');
        return stmt.all();
    }

    static getById(id) {
        const stmt = db.prepare('SELECT id, username, last_login, created_at FROM admins WHERE id = ?');
        return stmt.get(id);
    }

    static getByUsername(username) {
        const stmt = db.prepare('SELECT * FROM admins WHERE username = ?');
        return stmt.get(username);
    }

    static async create(username, password) {
        const passwordHash = await bcrypt.hash(password, 10);
        const stmt = db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)');
        const result = stmt.run(username, passwordHash);
        return result.lastInsertRowid;
    }

    static async verify(username, password) {
        const admin = this.getByUsername(username);
        if (!admin) return null;

        const isValid = await bcrypt.compare(password, admin.password_hash);
        if (!isValid) return null;

        // Обновляем время последнего входа
        this.updateLastLogin(admin.id);

        return {
            id: admin.id,
            username: admin.username
        };
    }

    static updateLastLogin(id) {
        const stmt = db.prepare('UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
        stmt.run(id);
    }

    static async changePassword(id, newPassword) {
        const passwordHash = await bcrypt.hash(newPassword, 10);
        const stmt = db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?');
        const result = stmt.run(passwordHash, id);
        return result.changes > 0;
    }

    static delete(id) {
        const stmt = db.prepare('DELETE FROM admins WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    static logAction(adminId, action, details = null, ipAddress = null) {
        const stmt = db.prepare(
            'INSERT INTO audit_logs (admin_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
        );
        stmt.run(adminId, action, details, ipAddress);
    }

    static getAuditLogs(limit = 100) {
        const stmt = db.prepare(`
            SELECT
                al.*,
                a.username
            FROM audit_logs al
            LEFT JOIN admins a ON al.admin_id = a.id
            ORDER BY al.created_at DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    }
}

module.exports = Admin;
