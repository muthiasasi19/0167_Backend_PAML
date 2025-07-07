const { query } = require('../config/database');

class Keluarga {
    /**
     * Membuat entri keluarga baru di tabel 'keluarga'.
     * Digunakan setelah user di tabel 'users' dibuat.
     * @param {number} idUser - ID user dari tabel 'users' yang terkait.
     * @param {string} idKeluargaUnik - ID unik keluarga (misal KLG...).
     * @param {string} nama - Nama keluarga.
     * @param {string} nomorTelepon - Nomor telepon keluarga.
     * @param {string} alamat - Alamat keluarga.
     * @returns {Promise<Object>} Data keluarga yang baru dibuat.
     */
    static async create(idUser, idKeluargaUnik, nama, nomorTelepon, alamat) {
        const sql = `
            INSERT INTO keluarga (id_user, id_keluarga, nama, nomor_telepon, alamat) 
            VALUES (?, ?, ?, ?, ?)
        `;
        const params = [idUser, idKeluargaUnik, nama, nomorTelepon, alamat];
        try {
            const result = await query(sql, params);
            return { id: result.insertId, idKeluargaUnik, nama, nomorTelepon, alamat };
        } catch (error) {
            console.error('Error creating keluarga:', error.message);
            throw error;
        }
    }

    /**
     * Mencari data keluarga berdasarkan ID unik keluarga (misal KLG...).
     * @param {string} idKeluargaUnik - ID unik keluarga (misal KLG...).
     * @returns {Promise<Object|null>} Data keluarga jika ditemukan, null jika tidak.
     */
    static async findByIdKeluargaUnik(idKeluargaUnik) {
        const sql = `SELECT * FROM keluarga WHERE id_keluarga = ?`;
        try {
            const result = await query(sql, [idKeluargaUnik]);
            return result[0];
        } catch (error) {
            console.error('Error finding keluarga by unique ID:', error.message);
            throw error;
        }
    }

    /**
     * Mencari data keluarga berdasarkan ID global (primary key tabel keluarga).
     * @param {number} idGlobal - ID global keluarga dari tabel 'keluarga'.
     * @returns {Promise<Object|null>} Data keluarga jika ditemukan, null jika tidak.
     */
    static async findByIdGlobal(idGlobal) {
        const sql = `SELECT * FROM keluarga WHERE id = ?`;
        try {
            const result = await query(sql, [idGlobal]);
            return result[0];
        } catch (error) {
            console.error('Error finding keluarga by global ID:', error.message);
            throw error;
        }
    }

}

module.exports = Keluarga;