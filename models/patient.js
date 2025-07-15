// models/Patient.js
const { query } = require('../config/database');

class Patient {
    /**
     * Mencari data pasien berdasarkan ID user (dari tabel 'users').
     * @param {number} userId - ID user dari tabel 'users'.
     * @returns {Promise<Object|null>} Data pasien jika ditemukan, null jika tidak.
     */
    static async findByUserId(userId) {
        const sql = `SELECT * FROM pasien WHERE id_user = ?`; // Sesuaikan nama kolom jika berbeda
        try {
            const result = await query(sql, [userId]);
            return result[0];
        } catch (error) {
            console.error('Error finding patient by user ID:', error.message);
            throw error;
        }
    }

    /**
     * Mencari data pasien berdasarkan ID global (primary key tabel pasien).
     * @param {number} idGlobal - ID global pasien dari tabel 'pasien'.
     * @returns {Promise<Object|null>} Data pasien jika ditemukan, null jika tidak.
     */
    static async findByIdGlobal(idGlobal) {
        const sql = `SELECT * FROM pasien WHERE id = ?`;
        try {
            const result = await query(sql, [idGlobal]);
            return result[0];
        } catch (error) {
            console.error('Error finding patient by global ID:', error.message);
            throw error;
        }
    }

}

module.exports = Patient;