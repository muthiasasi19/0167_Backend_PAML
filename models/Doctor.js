const { query } = require('../config/database');

class Dokter {
    /**
     * Membuat entri dokter baru di tabel 'dokter'.
     * Digunakan setelah user di tabel 'users' dibuat.
     * @param {number} idUser - ID user dari tabel 'users' yang terkait.
     * @param {string} idDokterUnik - ID unik dokter (misal DKR...).
     * @param {string} nama - Nama dokter.
     * @param {string} spesialisasi - Spesialisasi dokter.
     * @param {string} nomorTelepon - Nomor telepon dokter.
     * @param {string} alamat - Alamat dokter.
     * @returns {Promise<Object>} Data dokter yang baru dibuat (id_dokter dari tabel dokter, bukan id_user).
     */
    static async create(idUser, idDokterUnik, nama, spesialisasi, nomorTelepon, alamat) {
        const sql = `
            INSERT INTO dokter (id_user, id_dokter, nama, spesialisasi, nomor_telepon, alamat) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = [idUser, idDokterUnik, nama, spesialisasi, nomorTelepon, alamat];
        try {
            const result = await query(sql, params);
            return { id: result.insertId, idDokterUnik, nama, spesialisasi, nomorTelepon, alamat };
        } catch (error) {
            console.error('Error creating dokter:', error.message);
            throw error;
        }
    }

    /**
     * Mencari data dokter berdasarkan ID unik dokter (misal DKR...).
     * @param {string} idDokterUnik - ID unik dokter (misal DKR...).
     * @returns {Promise<Object|null>} Data dokter jika ditemukan, null jika tidak.
     */
    static async findByIdDokterUnik(idDokterUnik) {
        const sql = `SELECT * FROM dokter WHERE id_dokter = ?`;
        try {
            const result = await query(sql, [idDokterUnik]);
            return result[0];
        } catch (error) {
            console.error('Error finding dokter by unique ID:', error.message);
            throw error;
        }
    }

    /**
     * @param {number} idGlobal - ID global dokter dari tabel 'dokter'.
     * @returns {Promise<Object|null>} Data dokter jika ditemukan, null jika tidak.
     */
    static async findByIdGlobal(idGlobal) {
        const sql = `SELECT * FROM dokter WHERE id = ?`;
        try {
            const result = await query(sql, [idGlobal]);
            return result[0];
        } catch (error) {
            console.error('Error finding dokter by global ID:', error.message);
            throw error;
        }
    }

}

module.exports = Dokter;