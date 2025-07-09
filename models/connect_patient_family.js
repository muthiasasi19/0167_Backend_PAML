const { query } = require('../config/database');

class RelasiPasienKeluarga {
    /**
     * Membuat relasi baru antara pasien dan keluarga.
     * @param {number} idPasienGlobal - ID global pasien.
     * @param {number} idKeluargaGlobal - ID global keluarga.
     * @returns {Promise<Object>} Data relasi yang baru dibuat.
     */
    static async create(idPasienGlobal, idKeluargaGlobal) {
        const sql = `INSERT INTO relasi_pasien_keluarga (id_pasien, id_keluarga, tanggal_terhubung) VALUES (?, ?, NOW())`;
        const params = [idPasienGlobal, idKeluargaGlobal];
        try {
            const result = await query(sql, params);
            return { id: result.insertId, idPasienGlobal, idKeluargaGlobal, tanggalTerhubung: new Date() };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Relasi pasien-keluarga ini sudah ada.');
            }
            console.error('Error creating patient-family relationship:', error.message);
            throw error;
        }
    }

    /**
     * Mencari relasi berdasarkan ID pasien dan ID keluarga.
     * @param {number} idPasienGlobal - ID global pasien.
     * @param {number} idKeluargaGlobal - ID global keluarga.
     * @returns {Promise<Object|null>} Relasi jika ditemukan, null jika tidak.
     */
    static async findByPatientAndFamilyId(idPasienGlobal, idKeluargaGlobal) {
        const sql = `SELECT * FROM relasi_pasien_keluarga WHERE id_pasien = ? AND id_keluarga = ?`;
        try {
            const result = await query(sql, [idPasienGlobal, idKeluargaGlobal]);
            return result[0];
        } catch (error) {
            console.error('Error finding patient-family relationship:', error.message);
            throw error;
        }
    }

    /**
     * Mendapatkan daftar pasien yang terhubung dengan keluarga tertentu.
     * Mengambil data lengkap pasien dari tabel `pasien`.
     * @param {number} idKeluargaGlobal - ID global keluarga.
     * @returns {Promise<Array<Object>>} Daftar pasien yang terhubung.
     */
    static async findPatientsConnectedToFamily(idKeluargaGlobal) {
        const sql = `
            SELECT 
                p.id AS idGlobal,
                p.id_pasien AS idUnik,
                p.nama AS nama,
                p.tanggal_lahir AS tanggalLahir,
                p.jenis_kelamin AS jenisKelamin,
                p.nomor_telepon AS nomorTelepon,
                p.alamat AS alamat
            FROM relasi_pasien_keluarga rpk
            JOIN pasien p ON rpk.id_pasien = p.id
            WHERE rpk.id_keluarga = ?;
        `;
        try {
            const result = await query(sql, [idKeluargaGlobal]);
            return result;
        } catch (error) {
            console.error('Error fetching patients connected to family:', error.message);
            throw error;
        }
    }

    /**
     * Menghapus relasi pasien-keluarga.
     * @param {number} idPasienGlobal - ID global pasien.
     * @param {number} idKeluargaGlobal - ID global keluarga.
     * @returns {Promise<boolean>} True jika relasi berhasil dihapus, false jika tidak.
     */
    static async delete(idPasienGlobal, idKeluargaGlobal) {
        const sql = `DELETE FROM relasi_pasien_keluarga WHERE id_pasien = ? AND id_keluarga = ?`;
        try {
            const result = await query(sql, [idPasienGlobal, idKeluargaGlobal]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error deleting patient-family relationship:', error.message);
            throw error;
        }
    }
}

module.exports = RelasiPasienKeluarga;