// BECKEND_ASISTENOBAT/models/NotificationSchedule.js

const { query } = require('../config/database'); // Import modul query.

class NotificationSchedule {
    /**
     * Membuat jadwal notifikasi baru di database.
     * @param {number} medicationGlobalId - ID global obat dari tabel `obat`.
     * @param {number} patientGlobalId - ID global pasien dari tabel `pasien`.
     * @param {number} doctorGlobalId - ID global dokter dari tabel `dokter`.
     * @param {number[]} familyGlobalIds - Array berisi ID global keluarga yang akan menerima notifikasi. Akan disimpan sebagai string JSON.
     * @param {string} scheduleTime - Waktu pengingat (format HH:MM).
     * @param {string} startDate - Tanggal mulai pengingat (format YYYY-MM-DD).
     * @param {string} [endDate] - Tanggal berakhir pengingat (format YYYY-MM-DD), opsional.
     * @param {boolean} [isActive=true] - Status aktif jadwal notifikasi. Defaultnya adalah true.
     */
    // PERUBAHAN UNTUK NOTIFIKASI: Method 'create' baru untuk model NotificationSchedule.
    // SAMPAI SINIH
    static async create(medicationGlobalId, patientGlobalId, doctorGlobalId, familyGlobalIds, scheduleTime, startDate, endDate, isActive = true) {
        const familyIdsJson = familyGlobalIds && familyGlobalIds.length > 0 ? JSON.stringify(familyGlobalIds) : null; 
        const sql = `
            INSERT INTO notification_schedules (medication_id, patient_global_id, doctor_global_id, family_global_ids, schedule_time, start_date, end_date, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            medicationGlobalId,
            patientGlobalId,
            doctorGlobalId,
            familyIdsJson,
            scheduleTime,
            startDate,
            endDate,
            isActive
        ];
        try {
            const result = await query(sql, params);
            return {
                id: result.insertId,
                medicationId: medicationGlobalId,
                patientGlobalId: patientGlobalId,
                doctorGlobalId: doctorGlobalId,
                familyGlobalIds: familyGlobalIds,
                scheduleTime,
                startDate,
                endDate,
                isActive,
                createdAt: new Date()
            };
        } catch (error) {
            console.error('Error in NotificationSchedule.create (SQL execution):', error);
            throw error;
        }
    }

    /**
     * Mengambil daftar jadwal notifikasi berdasarkan ID global pasien.
     * Metode ini melakukan JOIN dengan tabel 'obat', 'pasien', dan 'dokter' untuk mendapatkan detail tambahan.
     * @param {number} patientGlobalId - ID global pasien yang jadwalnya ingin diambil.
     * @returns {Promise<Object[]>} Array berisi objek-objek jadwal notifikasi.
     */
    // PERUBAHAN UNTUK NOTIFIKASI: Method 'findByPatientGlobalId' baru untuk model NotificationSchedule.
    // SAMPAI SINIH
    static async findByPatientGlobalId(patientGlobalId) {
        const sql = `
            SELECT
                ns.id,
                ns.medication_id AS medicationId,
                ns.patient_global_id AS patientGlobalId,
                ns.doctor_global_id AS doctorGlobalId,
                ns.family_global_ids AS familyGlobalIds,
                ns.schedule_time AS scheduleTime,
                ns.start_date AS startDate,
                ns.end_date AS endDate,
                ns.is_active AS isActive,
                ns.created_at AS createdAt,
                o.nama_obat AS medicationName,
                o.dosis AS medicationDosage, -- Dosis diambil langsung dari tabel obat
                p.nama AS patientName,
                d.nama AS doctorName
            FROM notification_schedules ns
            JOIN obat o ON ns.medication_id = o.id
            JOIN pasien p ON ns.patient_global_id = p.id
            JOIN dokter d ON ns.doctor_global_id = d.id
            WHERE ns.patient_global_id = ?
            ORDER BY ns.schedule_time ASC;
        `;
        const results = await query(sql, [patientGlobalId]);

        return results.map(row => {
            if (row.familyGlobalIds && typeof row.familyGlobalIds === 'string') {
                try {
                    row.familyGlobalIds = JSON.parse(row.familyGlobalIds);
                } catch (e) {
                    console.error('Error parsing family_global_ids for schedule ID:', row.id, e);
                    row.familyGlobalIds = []; 
                }
            } else {
                row.familyGlobalIds = []; 
            }
            return row;
        });
    }

    /**
     * Memperbarui informasi jadwal notifikasi berdasarkan ID.
     * Hanya kolom yang relevan dengan pengingat yang dapat diupdate (waktu, tanggal, status aktif).
     * @param {number} id - ID jadwal notifikasi yang akan diperbarui.
     * @param {Object} updates - Objek yang berisi kunci-nilai kolom yang akan diupdate.
     */
    // PERUBAHAN UNTUK NOTIFIKASI: Method 'update' baru untuk model NotificationSchedule.
    // SAMPAI SINIH
    static async update(id, updates) {
        let sqlParts = [];
        let params = [];
        for (const key in updates) {
            if (updates.hasOwnProperty(key)) {
                const dbColumnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
                if (['start_date', 'end_date'].includes(dbColumnName) && updates[key] instanceof Date) {
                    sqlParts.push(`${dbColumnName} = ?`);
                    params.push(updates[key].toISOString().split('T')[0]);
                }
                else if (dbColumnName !== 'medication_id' && dbColumnName !== 'patient_global_id' && dbColumnName !== 'doctor_global_id' && dbColumnName !== 'family_global_ids') { 
                    sqlParts.push(`${dbColumnName} = ?`);
                    params.push(updates[key]);
                }
            }
        }
        if (sqlParts.length === 0) return false;

        const sql = `UPDATE notification_schedules SET ${sqlParts.join(', ')} WHERE id = ?`;
        params.push(id);

        try {
            const result = await query(sql, params);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in NotificationSchedule.update (SQL execution):', error);
            throw error;
        }
    }

    /**
     * Menghapus jadwal notifikasi dari database.
     * @param {number} id - ID jadwal notifikasi yang akan dihapus.
     */
    // PERUBAHAN UNTUK NOTIFIKASI: Method 'delete' baru untuk model NotificationSchedule.
    // SAMPAI SINIH
    static async delete(id) {
        const sql = `DELETE FROM notification_schedules WHERE id = ?`;
        try {
            const result = await query(sql, [id]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in NotificationSchedule.delete (SQL execution):', error);
            throw error;
        }
    }

    /**
     * Mencari satu jadwal notifikasi berdasarkan ID-nya.
     * Melakukan JOIN untuk mendapatkan detail obat, pasien, dan dokter terkait.
     * @param {number} id - ID jadwal notifikasi yang akan dicari.
     * @returns {Promise<Object|null>} Objek jadwal notifikasi jika ditemukan, null jika tidak.
     */
    // PERUBAHAN UNTUK NOTIFIKASI: Method 'findById' baru untuk model NotificationSchedule.
    // SAMPAI SINIH
    static async findById(id) {
        const sql = `
            SELECT
                ns.id,
                ns.medication_id AS medicationId,
                ns.patient_global_id AS patientGlobalId,
                ns.doctor_global_id AS doctorGlobalId,
                ns.family_global_ids AS familyGlobalIds,
                ns.schedule_time AS scheduleTime,
                ns.start_date AS startDate,
                ns.end_date AS endDate,
                ns.is_active AS isActive,
                ns.created_at AS createdAt,
                o.nama_obat AS medicationName,
                o.dosis AS medicationDosage,
                p.nama AS patientName,
                d.nama AS doctorName
            FROM notification_schedules ns
            JOIN obat o ON ns.medication_id = o.id
            JOIN pasien p ON ns.patient_global_id = p.id
            JOIN dokter d ON ns.doctor_global_id = d.id
            WHERE ns.id = ?;
        `;
        const result = await query(sql, [id]);
        if (result.length > 0) {
            const row = result[0];
            if (row.familyGlobalIds && typeof row.familyGlobalIds === 'string') {
                try {
                    row.familyGlobalIds = JSON.parse(row.familyGlobalIds);
                } catch (e) {
                    console.error('Error parsing family_global_ids for schedule ID:', row.id, e);
                    row.familyGlobalIds = [];
                }
            } else {
                row.familyGlobalIds = [];
            }
            return row;
        }
        return null;
    }

    /**
     * Mencari semua jadwal notifikasi yang terkait dengan obat dan pasien tertentu.
     * Ini akan digunakan di halaman Pengaturan Notifikasi Obat (NotificationPage) untuk menampilkan pengingat spesifik.
     * @param {number} medicationId - ID global obat.
     * @param {number} patientGlobalId - ID global pasien.
     * @returns {Promise<Object[]>} Array berisi objek-objek jadwal notifikasi.
     */
    // PERUBAHAN UNTUK NOTIFIKASI: Method 'findByMedicationAndPatientGlobalId' baru untuk model NotificationSchedule.
    // SAMPAI SINIH
    static async findByMedicationAndPatientGlobalId(medicationId, patientGlobalId) {
        const sql = `
            SELECT
                ns.id,
                ns.medication_id AS medicationId,
                ns.patient_global_id AS patientGlobalId,
                ns.doctor_global_id AS doctorGlobalId,
                ns.family_global_ids AS familyGlobalIds,
                ns.schedule_time AS scheduleTime,
                ns.start_date AS startDate,
                ns.end_date AS endDate,
                ns.is_active AS isActive,
                ns.created_at AS createdAt,
                o.nama_obat AS medicationName,
                o.dosis AS medicationDosage,
                p.nama AS patientName,
                d.nama AS doctorName
            FROM notification_schedules ns
            JOIN obat o ON ns.medication_id = o.id
            JOIN pasien p ON ns.patient_global_id = p.id
            JOIN dokter d ON ns.doctor_global_id = d.id
            WHERE ns.medication_id = ? AND ns.patient_global_id = ?
            ORDER BY ns.schedule_time ASC;
        `;
        const results = await query(sql, [medicationId, patientGlobalId]);

        return results.map(row => {
            if (row.familyGlobalIds && typeof row.familyGlobalIds === 'string') {
                try {
                    row.familyGlobalIds = JSON.parse(row.familyGlobalIds);
                } catch (e) {
                    console.error('Error parsing family_global_ids for schedule ID:', row.id, e);
                    row.familyGlobalIds = [];
                }
            } else {
                row.familyGlobalIds = [];
            }
            return row;
        });
    }
}

module.exports = NotificationSchedule;