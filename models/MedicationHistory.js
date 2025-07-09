const { query } = require('../config/database');

class MedicationHistory {
    // Mencatat bahwa pasien telah mengonsumsi obat
    static async create(idObat, idPasien, status, catatan = null, waktuKonsumsi = null, scheduledTime = null) { // DARI SINI YAH
        const sql = `INSERT INTO riwayat_konsumsi (id_obat, id_pasien, status, catatan, waktu_konsumsi, scheduled_time) VALUES (?, ?, ?, ?, ?, ?)`;
        const params = [idObat, idPasien, status, catatan, waktuKonsumsi || new Date(), scheduledTime];
        const result = await query(sql, params);
        return { id: result.insertId, idObat, idPasien, status, catatan, waktuKonsumsi: waktuKonsumsi || new Date(), scheduledTime };
    } 
    // Fungsi baru untuk mengupdate record yang sudah ada
    static async update(id, status, catatan = null, waktuKonsumsi = null, scheduledTime = null) { // DARI SINI YAH
        const sql = `UPDATE riwayat_konsumsi SET status = ?, catatan = ?, waktu_konsumsi = ?, scheduled_time = ? WHERE id = ?`;
        const params = [status, catatan, waktuKonsumsi || new Date(), scheduledTime, id];
        const result = await query(sql, params);
        return result.affectedRows > 0;
    } 

    // Fungsi baru untuk menghapus record
    static async delete(id) {
        const sql = `DELETE FROM riwayat_konsumsi WHERE id = ?`;
        const result = await query(sql, [id]);
        return result.affectedRows > 0;
    }

    // Mendapatkan riwayat konsumsi obat untuk pasien tertentu
    static async getHistoryByPatientId(idPasien) {
        const sql = `
            SELECT
                rko.id,
                rko.waktu_konsumsi,
                rko.status,
                rko.catatan,
                rko.scheduled_time, -- DARI SINI YAH: Ambil juga scheduled_time
                o.nama_obat,
                o.dosis,
                o.jadwal,
                o.deskripsi
            FROM riwayat_konsumsi rko
            JOIN obat o ON rko.id_obat = o.id
            WHERE rko.id_pasien = ?
            ORDER BY rko.waktu_konsumsi DESC;
        `; 
        return query(sql, [idPasien]);
    }

    // Mencari riwayat konsumsi untuk obat tertentu, pasien, pada tanggal dan scheduled_time spesifik
    static async findByMedicationPatientAndDateTime(medicationId, patientId, targetDate, scheduledTimeStr) {
        const mysqlDate = targetDate.toISOString().slice(0, 10); // Format YYYY-MM-DD
        const sql = `
            SELECT * FROM riwayat_konsumsi
            WHERE id_obat = ? AND id_pasien = ? AND DATE(waktu_konsumsi) = ? AND scheduled_time = ?;
        `;
        const result = await query(sql, [medicationId, patientId, mysqlDate, scheduledTimeStr]);
        return result[0] || null;
    } 

    // Mencari semua riwayat konsumsi untuk obat dan pasien tertentu pada hari ini
    static async findTodayByMedicationAndPatient(medicationId, patientId) {
        // Menggunakan CURDATE() untuk memastikan hanya data hari ini.
        const sql = `
            SELECT * FROM riwayat_konsumsi
            WHERE id_obat = ? AND id_pasien = ? AND DATE(waktu_konsumsi) = CURDATE()
            ORDER BY waktu_konsumsi ASC;
        `;
        const result = await query(sql, [medicationId, patientId]);
        return result;
    }

    static async findBetweenDatesByMedicationAndPatient(medicationId, patientId, startDate, endDate) {
        const sql = `
            SELECT * FROM riwayat_konsumsi
            WHERE id_obat = ? AND id_pasien = ? AND waktu_konsumsi BETWEEN ? AND ?
            ORDER BY waktu_konsumsi ASC;
        `;
        const result = await query(sql, [medicationId, patientId, startDate, endDate]);
        return result;
    }
}

module.exports = MedicationHistory;