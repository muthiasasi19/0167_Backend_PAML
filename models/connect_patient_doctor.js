const { query } = require('../config/database');

class RelasiDokterPasien {
    /**
     * Membuat relasi baru antara dokter dan pasien.
     * @param {number} idDokterGlobal - ID global dokter.
     * @param {number} idPasienGlobal - ID global pasien.
     * @returns {Promise<Object>} Data relasi yang baru dibuat.
     */
    static async create(idDokterGlobal, idPasienGlobal) {
        const sql = `INSERT INTO relasi_dokter_pasien (id_dokter, id_pasien, tanggal_terhubung) VALUES (?, ?, NOW())`;
        const params = [idDokterGlobal, idPasienGlobal];
        try {
            const result = await query(sql, params);
            return { id: result.insertId, idDokterGlobal, idPasienGlobal, tanggalTerhubung: new Date() };
        } catch (error) {
            // Menangkap error jika relasi sudah ada 
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Relasi dokter-pasien ini sudah ada.');
            }
            console.error('Error creating doctor-patient relationship:', error.message);
            throw error;
        }
    }

    /**
     * Mencari relasi berdasarkan ID dokter dan ID pasien.
     * @param {number} idDokterGlobal - ID global dokter.
     * @param {number} idPasienGlobal - ID global pasien.
     * @returns {Promise<Object|null>} Relasi jika ditemukan, null jika tidak.
     */
    static async findByDoctorAndPatientId(idDokterGlobal, idPasienGlobal) {
        const sql = `SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?`;
        try {
            const result = await query(sql, [idDokterGlobal, idPasienGlobal]);
            return result[0];
        } catch (error) {
            console.error('Error finding doctor-patient relationship:', error.message);
            throw error;
        }
    }

    /**
     * Mendapatkan daftar pasien yang terhubung dengan dokter tertentu.
     * Mengambil data lengkap pasien dari tabel `pasien`.
     * @param {number} idDokterGlobal - ID global dokter.
     * @returns {Promise<Array<Object>>} Daftar pasien yang terhubung.
     */
    static async findPatientsConnectedToDoctor(idDokterGlobal) {
        const sql = `
            SELECT 
                p.id AS patientGlobalId,
                p.id_pasien AS patientUniqueId,
                p.nama AS patientName,
                p.tanggal_lahir AS dateOfBirth,
                p.jenis_kelamin AS gender,
                p.nomor_telepon AS phoneNumber,
                p.alamat AS address
            FROM relasi_dokter_pasien rdp
            JOIN pasien p ON rdp.id_pasien = p.id
            WHERE rdp.id_dokter = ?;
        `;
        try {
            const result = await query(sql, [idDokterGlobal]);
            return result;
        } catch (error) {
            console.error('Error fetching patients connected to doctor:', error.message);
            throw error;
        }
    }

    /**
     * Mencari dokter yang terhubung dengan pasien tertentu.
     * @param {number} idPasienGlobal - ID global pasien.
     * @returns {Promise<Object|null>} Data dokter jika ditemukan, null jika tidak.
     */
    static async findDoctorConnectedToPatient(idPasienGlobal) {
        const sql = `
            SELECT 
                d.id AS idGlobal,
                d.id_dokter AS idDokter,
                d.nama AS nama,
                d.spesialisasi AS specialization,
                d.nomor_telepon AS phoneNumber,
                d.alamat AS address
            FROM relasi_dokter_pasien rdp
            JOIN dokter d ON rdp.id_dokter = d.id
            WHERE rdp.id_pasien = ?;
        `;
        try {
            const result = await query(sql, [idPasienGlobal]);
            return result[0]; // Hanya satu dokter yang dapat terhubung
        } catch (error) {
            console.error('Error fetching doctor connected to patient:', error.message);
            throw error;
        }
    }

    /**
     * Menghapus relasi dokter-pasien.
     * @param {number} idDokterGlobal - ID global dokter.
     * @param {number} idPasienGlobal - ID global pasien.
     * @returns {Promise<boolean>} True jika relasi berhasil dihapus, false jika tidak.
     */
    static async delete(idDokterGlobal, idPasienGlobal) {
        const sql = `DELETE FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?`;
        try {
            const result = await query(sql, [idDokterGlobal, idPasienGlobal]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error deleting doctor-patient relationship:', error.message);
            throw error;
        }
    }
}

module.exports = RelasiDokterPasien;