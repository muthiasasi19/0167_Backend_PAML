// BECKEND_ASISTENOBAT/controllers/notificationController.js

const NotificationSchedule = require('../models/NotificationSchedule');
const { query } = require('../config/database');
// Import model Obat untuk mendapatkan detail nama_obat dan dosis saat mengirim notifikasi
const Obat = require('../models/medication'); // PERUBAHAN UNTUK NOTIFIKASI


// PERUBAHAN UNTUK NOTIFIKASI: Helper functions untuk mendapatkan ID global dari ID user atau ID unik.
// Fungsi-fungsi ini penting untuk resolusi ID di backend.
async function getPatientGlobalIdFromUniqueId(patientUniqueId) {
    const result = await query('SELECT id FROM pasien WHERE id_pasien = ?', [patientUniqueId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

async function getDoctorGlobalIdByUserId(userId) {
    const result = await query('SELECT id FROM dokter WHERE id_user = ?', [userId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

async function getPatientGlobalIdByUserId(userId) {
    const result = await query('SELECT id FROM pasien WHERE id_user = ?', [userId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

async function getFamilyGlobalIdByUserId(userId) {
    const result = await query('SELECT id FROM keluarga WHERE id_user = ?', [userId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

// Fungsi pembantu untuk mendapatkan FCM token dari tabel users (yang JOIN dengan tabel role spesifik).
// Ini diekspor agar bisa digunakan oleh FCM scheduler.
exports.getFCMTokenByGlobalId = async (userGlobalId, role) => {
    let sql;
    let params;

    if (role === 'pasien') {
        sql = 'SELECT u.fcm_token FROM users u JOIN pasien p ON u.id = p.id_user WHERE p.id = ?';
        params = [userGlobalId];
    } else if (role === 'keluarga') {
        sql = 'SELECT u.fcm_token FROM users u JOIN keluarga k ON u.id = k.id_user WHERE k.id = ?';
        params = [userGlobalId];
    } else {
        return null; // Atau throw error jika role tidak didukung
    }

    try {
        const result = await query(sql, params);
        return result.length > 0 ? result[0].fcm_token : null;
    } catch (error) {
        console.error(`Error getting FCM token for ${role} global ID ${userGlobalId}:`, error);
        return null;
    }
};
// SAMPAI SINIH


// @desc    Dokter membuat jadwal notifikasi obat untuk pasien.
// @route   POST /api/notifications/schedules
// @access  Private (Hanya Dokter)
exports.createNotificationSchedule = async (req, res) => {
    // PERUBAHAN UNTUK NOTIFIKASI: Menerima parameter sesuai alur baru. 'dosage' dan 'familyUniqueIds' tidak lagi diterima.
    const { medicationGlobalId, patientGlobalId, scheduleTime, startDate, endDate, isActive } = req.body;
    const doctorUserId = req.user.id; // ID user dari token JWT (INT)

    // Validasi input dasar.
    if (!medicationGlobalId || !patientGlobalId || !scheduleTime || !startDate) {
        return res.status(400).json({ message: 'Medication ID, Patient ID, waktu jadwal, dan tanggal mulai wajib diisi.' });
    }

    try {
        // Dapatkan ID global dokter dari ID user yang login.
        const doctorGlobalId = await getDoctorGlobalIdByUserId(doctorUserId);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        // PERUBAHAN UNTUK NOTIFIKASI: Dapatkan semua ID global keluarga yang terhubung dengan pasien ini secara OTOMATIS.
        // Ini menghilangkan kebutuhan dokter memilih keluarga di frontend.
        const connectedFamiliesResult = await query(
            'SELECT id FROM keluarga k JOIN relasi_pasien_keluarga rpk ON k.id = rpk.id_keluarga WHERE rpk.id_pasien = ?',
            [patientGlobalId]
        );
        const familyGlobalIds = connectedFamiliesResult.map(row => row.id); // Ini adalah array of INTs

        // Buat jadwal notifikasi baru menggunakan model NotificationSchedule.
        // Parameter 'dosage' tidak lagi dilewatkan ke model.
        const newSchedule = await NotificationSchedule.create(
            medicationGlobalId,
            patientGlobalId,
            doctorGlobalId,
            familyGlobalIds, // Menggunakan array ID global keluarga yang otomatis terambil
            scheduleTime,
            startDate,
            endDate,
            isActive // Menggunakan status aktif dari frontend
        );

        res.status(201).json({ message: 'Jadwal notifikasi berhasil dibuat.', schedule: newSchedule });

    } catch (error) {
        console.error('Error creating notification schedule:', error);
        res.status(500).json({ message: 'Gagal membuat jadwal notifikasi.', error: error.message });
    }
};

// @desc    Mendapatkan jadwal notifikasi untuk user yang sedang login (pasien/keluarga/dokter).
// @route   GET /api/notifications/schedules/my-schedules
// @access  Private (Pasien, Keluarga, Dokter)
exports.getMyNotificationSchedules = async (req, res) => {
    // PERUBAHAN UNTUK NOTIFIKASI: Endpoint ini akan mengambil jadwal sesuai dengan peran user yang login.
    const loggedInUser = req.user; // Payload JWT: { id: userId, username: '...', role: '...' }
    let allRelevantSchedules = [];

    try {
        if (loggedInUser.role === 'pasien') {
            const patientGlobalId = await getPatientGlobalIdByUserId(loggedInUser.id);
            if (!patientGlobalId) {
                return res.status(404).json({ message: 'Data pasien tidak ditemukan.' });
            }
            // Mengambil semua jadwal notifikasi yang terkait langsung dengan pasien ini.
            allRelevantSchedules = await NotificationSchedule.findByPatientGlobalId(patientGlobalId);
        } else if (loggedInUser.role === 'keluarga') {
            const familyGlobalId = await getFamilyGlobalIdByUserId(loggedInUser.id);
            if (!familyGlobalId) {
                return res.status(404).json({ message: 'Data keluarga tidak ditemukan.' });
            }

            // Dapatkan semua pasien yang terhubung dengan keluarga ini.
            const connectedPatientsResult = await query(
                'SELECT id_pasien FROM relasi_pasien_keluarga WHERE id_keluarga = ?',
                [familyGlobalId]
            );
            
            // Iterasi melalui setiap pasien terhubung untuk mendapatkan jadwal notifikasi mereka.
            for (const patientRel of connectedPatientsResult) {
                const patientSchedules = await NotificationSchedule.findByPatientGlobalId(patientRel.id_pasien);
                // Filter jadwal notifikasi: hanya yang secara eksplisit ditujukan ke keluarga ini (ada di familyGlobalIds).
                allRelevantSchedules = allRelevantSchedules.concat(
                    patientSchedules.filter(s => s.familyGlobalIds && s.familyGlobalIds.includes(familyGlobalId))
                );
            }
        } else if (loggedInUser.role === 'dokter') {
            const doctorGlobalId = await getDoctorGlobalIdByUserId(loggedInUser.id);
            if (!doctorGlobalId) {
                return res.status(404).json({ message: 'Data dokter tidak ditemukan.' });
            }
            // Dokter melihat semua jadwal yang mereka buat.
            const schedules = await query(
                `SELECT
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
                WHERE ns.doctor_global_id = ?
                ORDER BY ns.created_at DESC;
                `, [doctorGlobalId]
            );

            // Memastikan familyGlobalIds di-parse untuk respons dokter juga.
            allRelevantSchedules = schedules.map(row => {
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
        } else {
            return res.status(403).json({ message: 'Peran pengguna tidak valid untuk melihat jadwal notifikasi.' });
        }

        res.status(200).json({ schedules: allRelevantSchedules });

    } catch (error) {
        console.error('Error fetching notification schedules:', error);
        res.status(500).json({ message: 'Gagal mengambil jadwal notifikasi.', error: error.message });
    }
};

// @desc    Mendapatkan jadwal notifikasi untuk obat dan pasien tertentu.
//          Digunakan oleh NotificationPage saat dibuka dari MedicationPage.
// @route   GET /api/notifications/schedules/medication/:medicationGlobalId/patient/:patientGlobalId
// @access  Private (Dokter yang meresepkan, pasien yang bersangkutan, keluarga terhubung)
exports.getNotificationSchedulesForMedicationAndPatient = async (req, res) => {
    // PERUBAHAN UNTUK NOTIFIKASI: Menambahkan endpoint baru untuk mengambil jadwal pengingat spesifik per obat dan pasien.
    const { medicationGlobalId, patientGlobalId } = req.params;
    const loggedInUser = req.user;

    try {
        let isAuthorized = false;
        // Otorisasi: Pastikan user yang request memiliki hak akses ke jadwal ini
        if (loggedInUser.role === 'dokter') {
            const doctorGlobalId = await getDoctorGlobalIdByUserId(loggedInUser.id);
            // Cek apakah dokter ini yang membuat resep obat atau terhubung dengan pasien ini
            const medication = await Obat.findById(medicationGlobalId);
            if (medication && medication.id_dokter === doctorGlobalId && medication.id_pasien === patientGlobalId) {
                isAuthorized = true;
            }
        } else if (loggedInUser.role === 'pasien') {
            const currentPatientGlobalId = await getPatientGlobalIdByUserId(loggedInUser.id);
            if (currentPatientGlobalId && currentPatientGlobalId === patientGlobalId) {
                isAuthorized = true;
            }
        } else if (loggedInUser.role === 'keluarga') {
            const familyGlobalId = await getFamilyGlobalIdByUserId(loggedInUser.id);
            if (familyGlobalId) {
                const relation = await query(
                    'SELECT * FROM relasi_pasien_keluarga WHERE id_pasien = ? AND id_keluarga = ?',
                    [patientGlobalId, familyGlobalId]
                );
                if (relation.length > 0) { isAuthorized = true; }
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: 'Akses ditolak: Anda tidak diotorisasi untuk melihat jadwal notifikasi ini.' });
        }

        // Ambil jadwal notifikasi menggunakan model NotificationSchedule.
        const schedules = await NotificationSchedule.findByMedicationAndPatientGlobalId(
            medicationGlobalId,
            patientGlobalId
        );
        res.status(200).json({ schedules });

    } catch (error) {
        console.error('Error fetching specific medication notification schedules:', error);
        res.status(500).json({ message: 'Gagal mengambil jadwal notifikasi obat spesifik.', error: error.message });
    }
};


// @desc    Mengupdate jadwal notifikasi.
// @route   PUT /api/notifications/schedules/:id
// @access  Private (Hanya Dokter yang membuat jadwal tersebut)
exports.updateNotificationSchedule = async (req, res) => {
    const { id } = req.params;
    // PERUBAHAN UNTUK NOTIFIKASI: Hanya menerima update untuk scheduleTime, startDate, endDate, isActive.
    const updates = req.body; 
    const doctorUserId = req.user.id;

    try {
        const doctorGlobalId = await getDoctorGlobalIdByUserId(doctorUserId);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const existingSchedule = await NotificationSchedule.findById(id);
        if (!existingSchedule) {
            return res.status(404).json({ message: 'Jadwal notifikasi tidak ditemukan.' });
        }
        // Pastikan hanya dokter pembuat jadwal yang bisa mengedit.
        if (existingSchedule.doctorGlobalId !== doctorGlobalId) {
            return res.status(403).json({ message: 'Tidak diotorisasi: Anda hanya dapat memperbarui jadwal yang Anda buat.' });
        }

        // PERUBAHAN UNTUK NOTIFIKASI: Hapus properti yang tidak boleh diupdate dari request body.
        delete updates.medicationGlobalId;
        delete updates.patientGlobalId;
        delete updates.doctorGlobalId;
        delete updates.familyGlobalIds; // Family IDs diatur otomatis di backend saat create, tidak diupdate dari frontend.
        delete updates.medicationName; // Ini derived data
        delete updates.medicationDosage; // Ini derived data
        delete updates.patientName; // Ini derived data
        delete updates.doctorName; // Ini derived data
        delete updates.createdAt; // Ini derived data


        // Convert date strings to Date objects if they exist in updates
        // Ini penting karena model NotificationSchedule.update mengharapkan objek Date untuk start_date/end_date.
        if (updates.startDate && typeof updates.startDate === 'string') {
            updates.startDate = new Date(updates.startDate);
        }
        if (updates.endDate && typeof updates.endDate === 'string') {
            updates.endDate = new Date(updates.endDate);
        }

        const success = await NotificationSchedule.update(id, updates);

        if (success) {
            const updatedSchedule = await NotificationSchedule.findById(id); // Ambil data terbaru setelah update.
            res.status(200).json({ message: 'Jadwal notifikasi berhasil diperbarui.', schedule: updatedSchedule });
        } else {
            res.status(500).json({ message: 'Gagal memperbarui jadwal notifikasi.' });
        }
    } catch (error) {
        console.error('Error updating notification schedule:', error);
        res.status(500).json({ message: 'Gagal memperbarui jadwal notifikasi.', error: error.message });
    }
};

// @desc    Menghapus jadwal notifikasi.
// @route   DELETE /api/notifications/schedules/:id
// @access  Private (Hanya Dokter yang membuat jadwal tersebut)
exports.deleteNotificationSchedule = async (req, res) => {
    const { id } = req.params;
    const doctorUserId = req.user.id;

    try {
        const doctorGlobalId = await getDoctorGlobalIdByUserId(doctorUserId);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const existingSchedule = await NotificationSchedule.findById(id);
        if (!existingSchedule) {
            return res.status(404).json({ message: 'Jadwal notifikasi tidak ditemukan.' });
        }
        // Pastikan hanya dokter pembuat jadwal yang bisa menghapus.
        if (existingSchedule.doctorGlobalId !== doctorGlobalId) {
            return res.status(403).json({ message: 'Tidak diotorisasi: Anda hanya dapat menghapus jadwal yang Anda buat.' });
        }

        const success = await NotificationSchedule.delete(id);

        if (success) {
            res.status(200).json({ message: 'Jadwal notifikasi berhasil dihapus.' });
        } else {
            res.status(500).json({ message: 'Gagal menghapus jadwal notifikasi.' });
        }
    } catch (error) {
        console.error('Error deleting notification schedule:', error);
        res.status(500).json({ message: 'Gagal menghapus jadwal notifikasi.', error: error.message });
    }
};

// @desc    Endpoint untuk menyimpan FCM token user.
// @route   POST /api/users/fcm-token
// @access  Private (Semua Role yang login)
exports.updateFCMToken = async (req, res) => {
    // PERUBAHAN UNTUK NOTIFIKASI: Endpoint untuk menyimpan FCM token perangkat.
    const { fcmToken } = req.body;
    const userId = req.user.id; // ID user dari tabel 'users' (INT)

    if (!fcmToken) {
        return res.status(400).json({ message: 'FCM Token wajib disertakan.' });
    }

    try {
        // Update kolom fcm_token di tabel users.
        const sql = 'UPDATE users SET fcm_token = ? WHERE id = ?';
        const result = await query(sql, [fcmToken, userId]);

        if (result.affectedRows > 0) {
            return res.status(200).json({ message: 'FCM Token berhasil diperbarui.' });
        } else {
            return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
        }
    } catch (error) {
        console.error('Error updating FCM token:', error);
        res.status(500).json({ message: 'Gagal memperbarui FCM Token.' });
    }
};
