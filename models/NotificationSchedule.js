const { query } = require('../config/database');

class NotificationSchedule {
    /**
     * Membuat jadwal notifikasi baru.
     * @param {number} medicationId - ID global obat.
     * @param {number} patientId - ID global pasien.
     * @param {number} doctorId - ID global dokter yang membuat jadwal.
     * @param {string} scheduleTime - Waktu pengingat (HH:MM).
     * @param {string} startDate - Tanggal mulai (YYYY-MM-DD).
     * @param {string|null} endDate - Tanggal berakhir (YYYY-MM-DD), bisa null.
     * @param {boolean} isActive - Status aktif/nonaktif.
     * @param {Array<number>} recipientFamilyIds - Array JSON ID keluarga penerima.
     * @returns {Promise<Object>} Data jadwal notifikasi yang baru dibuat.
     */
    static async create(medicationId, patientId, doctorId, scheduleTime, startDate, endDate, isActive, recipientFamilyIds) {
        const sql = `
            INSERT INTO notification_schedules 
            (id, id_pasien, id_dokter, schedule_time, start_date, end_date, is_active, recipient_family_ids) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            medicationId,
            patientId,
            doctorId,
            scheduleTime,
            startDate,
            endDate,
            isActive ? 1 : 0,
            JSON.stringify(recipientFamilyIds) // Simpan sebagai string JSON
        ];

        try {
            const result = await query(sql, params);
            return {
                id: result.insertId,
                medicationId,
                patientId,
                doctorId,
                scheduleTime,
                startDate,
                endDate,
                isActive,
                recipientFamilyIds,
                createdAt: new Date(),
                updatedAt: new Date()
            };
        } catch (error) {
            console.error('Error in NotificationSchedule.create (SQL execution):', error);
            throw error;
        }
    }

    /**
     * Mencari jadwal notifikasi berdasarkan ID.
     * @param {number} id - ID jadwal notifikasi.
     * @returns {Promise<Object|null>} Jadwal notifikasi jika ditemukan, null jika tidak.
     */
    static async findById(id) {
        const sql = `SELECT * FROM notification_schedules WHERE id_notifikasi = ?`; // Memperbaiki nama kolom
        const result = await query(sql, [id]);
        if (result.length > 0) {
            const schedule = result[0];
            // Parse recipient_family_ids kembali ke array
            if (schedule.recipient_family_ids) {
                try {
                    schedule.recipient_family_ids = JSON.parse(schedule.recipient_family_ids);
                } catch (e) {
                    console.error('Error parsing recipient_family_ids for schedule ID:', schedule.id_notifikasi, e); // Menggunakan id_notifikasi
                    schedule.recipient_family_ids = [];
                }
            } else {
                schedule.recipient_family_ids = [];
            }
            schedule.is_active = schedule.is_active === 1;
            return schedule;
        }
        return null;
    }

    /**
     * Mencari jadwal notifikasi untuk obat dan pasien tertentu.
     * Digunakan oleh dokter untuk melihat dan mengelola pengingat.
     * @param {number} medicationId - ID global obat.
     * @param {number} patientId - ID global pasien.
     * @returns {Promise<Array<Object>>} Daftar jadwal notifikasi.
     */
    static async findByMedicationAndPatient(medicationId, patientId) {
        const sql = `
            SELECT 
                ns.id_notifikasi AS id,          
                ns.id AS medication_id,   
                ns.id_pasien AS patient_id, 
                ns.id_dokter AS doctor_id,   
                ns.schedule_time, 
                ns.start_date, 
                ns.end_date, 
                ns.is_active, 
                ns.recipient_family_ids, 
                o.nama_obat, 
                o.dosis, 
                p.nama AS nama_pasien 
            FROM notification_schedules ns
            JOIN obat o ON ns.id = o.id 
            JOIN pasien p ON ns.id_pasien = p.id 
            WHERE ns.id = ? AND ns.id_pasien = ?
        `;
        const results = await query(sql, [medicationId, patientId]);
        
        return results.map(schedule => {
            if (schedule.recipient_family_ids) {
                try {
                    schedule.recipient_family_ids = JSON.parse(schedule.recipient_family_ids);
                } catch (e) {
                    console.error('Error parsing recipient_family_ids for schedule ID:', schedule.id, e);
                    schedule.recipient_family_ids = [];
                }
            } else {
                schedule.recipient_family_ids = [];
            }
            schedule.is_active = schedule.is_active === 1;
            return schedule;
        });
    }

    /**
     * Mencari semua jadwal notifikasi yang relevan untuk pengguna (pasien/keluarga).
     * @param {number} userId - ID global pengguna (pasien atau keluarga).
     * @param {string} userRole - Peran pengguna ('pasien' atau 'keluarga').
     * @returns {Promise<Array<Object>>} Daftar jadwal notifikasi.
     */
    static async findAllRelevantToUser(userId, userRole) {
        let sql;
        let params;

         if (userRole === 'pasien') {
            sql = `
                SELECT 
                    ns.id_notifikasi AS notification_id, -- PERBAIKAN: Aliaskan id_notifikasi ke 'notification_id'
                    ns.id AS medication_id,   
                    ns.id_pasien AS patient_id, 
                    ns.id_dokter AS doctor_id,   
                    ns.schedule_time, 
                    ns.start_date, 
                    ns.end_date, 
                    ns.is_active, 
                    ns.recipient_family_ids, 
                    o.nama_obat AS medication_name,
                    o.dosis AS medication_dosage,
                    o.foto_obat_url AS medication_photo_url,
                    p.nama AS patient_name,
                    p.id_pasien AS patient_unique_id
                FROM notification_schedules ns
                JOIN pasien pat ON ns.id_pasien = pat.id 
                JOIN obat o ON ns.id = o.id -- PERBAIKAN: Ubah 'ns.id_medication' menjadi 'ns.id'
                JOIN pasien p ON ns.id_pasien = p.id 
                WHERE pat.id_user = ? AND ns.is_active = TRUE
                AND CURDATE() BETWEEN ns.start_date AND COALESCE(ns.end_date, '2099-12-31')
                ORDER BY ns.schedule_time ASC;
            `;
            params = [globalId];
        } else if (userRole === 'keluarga') {
            sql = `
                SELECT 
                    ns.id_notifikasi AS notification_id, 
                    ns.id AS medication_id,
                    ns.patient_id,
                    ns.doctor_id,
                    ns.schedule_time,
                    ns.start_date,
                    ns.end_date,
                    ns.is_active,
                    ns.recipient_family_ids,
                    o.nama_obat AS medication_name,
                    o.dosis AS medication_dosage,
                    o.foto_obat_url AS medication_photo_url,
                    p.nama AS patient_name,
                    p.id_pasien AS patient_unique_id
                FROM notification_schedules ns
                JOIN keluarga k ON k.id_user = ?
                JOIN relasi_pasien_keluarga rpk ON rpk.id_keluarga = k.id
                JOIN pasien pat ON ns.id_pasien = pat.id 
                JOIN obat o ON ns.id = o.id 
                JOIN pasien p ON ns.id_pasien = p.id 
                WHERE rpk.id_pasien = ns.id_pasien AND ns.is_active = TRUE 
                AND JSON_CONTAINS(ns.recipient_family_ids, CAST(k.id AS JSON), '$')
                AND CURDATE() BETWEEN ns.start_date AND COALESCE(ns.end_date, '2099-12-31')
                ORDER BY ns.schedule_time ASC;
            `;
            params = [globalId, JSON.stringify(globalId)];
        } else {
            // Peran tidak diizinkan untuk melihat notifikasi
            return [];
        }

        try {
            const results = await query(sql, params);
            return results.map(schedule => {
                if (schedule.recipient_family_ids) {
                    try {
                        schedule.recipient_family_ids = JSON.parse(schedule.recipient_family_ids);
                    } catch (e) {
                        console.error('Error parsing recipient_family_ids for schedule ID:', schedule.notification_id, e);
                        schedule.recipient_family_ids = [];
                    }
                } else {
                schedule.is_active = schedule.is_active === 1;
                }
                schedule.is_active = schedule.is_active === 1;
                return schedule;
            });
        } catch (error) {
            console.error('Error in NotificationSchedule.findAllRelevantToUser (SQL execution):', error);
            throw error;
        }
    }

    /**
     * Memperbarui jadwal notifikasi.
     * @param {number} id - ID jadwal notifikasi.
     * @param {Object} updates - Objek berisi kolom yang akan diperbarui.
     * @returns {Promise<boolean>} True jika berhasil diperbarui, false jika tidak.
     */
    static async update(id, updates) {
    const setClauses = [];
    const params = [];

    for (const key in updates) {
        if (updates.hasOwnProperty(key)) {
            let dbColumnName = key;
            if (key === 'medicationId') {
                 dbColumnName = 'id'; 
            } else if (key === 'patientGlobalId') {
                 dbColumnName = 'id_pasien';
            } else if (key === 'doctorId') {
                 dbColumnName = 'id_dokter';
            } else if (key === 'scheduleTime') {
                 dbColumnName = 'schedule_time';
            } else if (key === 'startDate') {
                 dbColumnName = 'start_date';
            } else if (key === 'endDate') {
                 dbColumnName = 'end_date';
            } else if (key === 'isActive') {
                 dbColumnName = 'is_active';
            } else if (key === 'recipientFamilyIds') {
                 dbColumnName = 'recipient_family_ids';
            }

            setClauses.push(`${dbColumnName} = ?`);
            if (key === 'isActive' && typeof updates[key] === 'boolean') {
                params.push(updates[key] ? 1 : 0); // Konversi boolean ke 0/1
            } else if (key === 'recipientFamilyIds' && Array.isArray(updates[key])) {
                params.push(JSON.stringify(updates[key])); // Stringify array JSON
            } else {
                params.push(updates[key]);
            }
        }
    }
    // ID untuk klausa WHERE harus id_notifikasi
    params.push(id); 

    if (setClauses.length === 0) {
        return false; 
    }
    const sql = `UPDATE notification_schedules SET ${setClauses.join(', ')} WHERE id_notifikasi = ?`; // Ubah 'id' menjadi 'id_notifikasi'

    try {
        const result = await query(sql, params);
        return result.affectedRows > 0;
    } catch (error) {
        console.error('Error in NotificationSchedule.update (SQL execution):', error);
        throw error;
    }
}

    /**
     * Menghapus jadwal notifikasi.
     * @param {number} id - ID jadwal notifikasi.
     * @returns {Promise<boolean>} True jika berhasil dihapus, false jika tidak.
     */
    static async delete(id) {
        const sql = `DELETE FROM notification_schedules WHERE id_notifikasi  = ?`;
        const result = await query(sql, [id]);
        return result.affectedRows > 0;
    }
}

module.exports = NotificationSchedule;