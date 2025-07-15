const NotificationSchedule = require('../models/NotificationSchedule');
const { query } = require('../config/database');
const Obat = require('../models/medication');
const Patient = require('../models/Patient'); // Import model Patient yang baru
const Keluarga = require('../models/Family');
// Fungsi helper dari medicationController (diulang di sini agar notificationController mandiri)
async function getPatientGlobalIdFromUniqueId(patientUniqueId) {
    const result = await query('SELECT id FROM pasien WHERE id_pasien = ?', [patientUniqueId]);
    if (result.length > 0) {
        return result[0].id;
    }
    return null;
}

async function getDoctorIdByUserId(userId) {
    const result = await query('SELECT id FROM dokter WHERE id_user = ?', [userId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

async function getFamilyIdByUserId(userId) {
    const result = await query('SELECT id FROM keluarga WHERE id_user = ?', [userId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

//notifikasi
async function getPatientIdByUserId(userId) {
    const patient = await Patient.findByUserId(userId);
    return patient ? patient.id : null;
}

async function getFamilyIdByUserId(userId) {
    const family = await Keluarga.findByUserId(userId); // Menggunakan fungsi findByUserId dari model Keluarga
    return family ? family.id : null;
}

// Untuk mengambil semua keluarga yang terhubung dengan pasien
async function getConnectedFamilyIdsToPatient(patientGlobalId) {
    const relations = await query('SELECT id_keluarga FROM relasi_pasien_keluarga WHERE id_pasien = ?', [patientGlobalId]);
    return relations.map(r => r.id_keluarga);
}


// Fungsi untuk Menambah Jadwal Notifikasi (Hanya Dokter)
// route POST /api/notifications/schedules
exports.addNotificationSchedule = async (req, res) => {
    try {
        const { medicationId, patientGlobalId, scheduleTime, startDate, endDate, isActive } = req.body;

        // Validasi input dasar
        if (!medicationId || !patientGlobalId || !scheduleTime || !startDate || typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'medicationId, patientGlobalId, scheduleTime, startDate, dan isActive wajib diisi.' });
        }

        // Dapatkan ID dokter dari token (req.user.id adalah user_id dari tabel users)
        const doctorUserId = req.user.id;
        const doctorGlobalId = await getDoctorIdByUserId(doctorUserId);

        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        // Verifikasi relasi dokter-pasien
        const relation = await query(
            'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
            [doctorGlobalId, patientGlobalId]
        );
        if (relation.length === 0) {
            return res.status(403).json({ message: 'Dokter tidak diotorisasi untuk mengatur pengingat bagi pasien ini.' });
        }

        // Dapatkan daftar ID keluarga yang terhubung dengan pasien ini
        const recipientFamilyIds = await getConnectedFamilyIdsToPatient(patientGlobalId);

        const newSchedule = await NotificationSchedule.create(
            medicationId,
            patientGlobalId,
            doctorGlobalId,
            scheduleTime,
            startDate,
            endDate || null, // Pastikan endDate null jika tidak ada
            isActive,
            recipientFamilyIds // Simpan ID keluarga penerima
        );

        res.status(201).json({
            message: 'Jadwal notifikasi berhasil ditambahkan.',
            data: newSchedule
        });

    } catch (error) {
        console.error('Error saat menambah jadwal notifikasi:', error);
        res.status(500).json({ message: 'Kesalahan server saat menambah jadwal notifikasi.' });
    }
};

// Fungsi untuk Memperbarui Jadwal Notifikasi (Hanya Dokter)
// route PUT /api/notifications/schedules/:id
exports.updateNotificationSchedule = async (req, res) => {
    try {
        const { id } = req.params; // ID jadwal notifikasi
        const updates = req.body; // Objek berisi kolom yang akan diperbarui

        // Dapatkan ID dokter dari token
        const doctorUserId = req.user.id;
        const doctorGlobalId = await getDoctorIdByUserId(doctorUserId);

        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        // Periksa apakah jadwal notifikasi ada dan dimiliki oleh dokter ini
        const existingSchedule = await NotificationSchedule.findById(parseInt(id));
        if (!existingSchedule) {
            return res.status(404).json({ message: 'Jadwal notifikasi tidak ditemukan.' });
        }
        console.warn(`[DEBUG_AUTH] Update: Comparing existingSchedule.id_dokter (${existingSchedule.id_dokter}, type: ${typeof existingSchedule.id_dokter}) with doctorGlobalId (${doctorGlobalId}, type: ${typeof doctorGlobalId})`);
        if (Number(existingSchedule.id_dokter) !== Number(doctorGlobalId)) {
            return res.status(403).json({ message: 'Tidak diotorisasi: Anda hanya dapat memperbarui jadwal pengingat Anda sendiri.' });
        }

        // Jika ada perubahan pada patient_id atau medication_id, perbarui recipient_family_ids
        if (updates.patientGlobalId || updates.medicationId) {
            const currentPatientId = updates.patientGlobalId || existingSchedule.patient_id;
            updates.recipientFamilyIds = await getConnectedFamilyIdsToPatient(currentPatientId);
        }

        const success = await NotificationSchedule.update(parseInt(id), updates);

        if (success) {
            const updatedSchedule = await NotificationSchedule.findById(parseInt(id)); // Ambil data terbaru
            res.status(200).json({
                message: 'Jadwal notifikasi berhasil diperbarui.',
                data: updatedSchedule
            });
        } else {
            res.status(404).json({ message: 'Jadwal notifikasi tidak ditemukan atau tidak ada perubahan yang dilakukan.' });
        }

    } catch (error) {
        console.error('Error saat memperbarui jadwal notifikasi:', error);
        res.status(500).json({ message: 'Kesalahan server saat memperbarui jadwal notifikasi.' });
    }
};

// Fungsi untuk Mengambil Jadwal Notifikasi Berdasarkan Obat dan Pasien (Hanya Dokter)
// route GET /api/notifications/schedules/medication/:medicationGlobalId/patient/:patientGlobalId
exports.getNotificationSchedulesForMedicationAndPatient = async (req, res) => {
    try {
        const { medicationGlobalId, patientGlobalId } = req.params;

        // Dapatkan ID dokter dari token
        const doctorUserId = req.user.id;
        const doctorGlobalId = await getDoctorIdByUserId(doctorUserId);

        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        // Verifikasi relasi dokter-pasien
        const relation = await query(
            'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
            [doctorGlobalId, parseInt(patientGlobalId)]
        );
        if (relation.length === 0) {
            return res.status(403).json({ message: 'Dokter tidak diotorisasi untuk melihat pengingat bagi pasien ini.' });
        }

        const schedules = await NotificationSchedule.findByMedicationAndPatient(
            parseInt(medicationGlobalId),
            parseInt(patientGlobalId)
        );

        res.status(200).json({
            message: 'Jadwal notifikasi berhasil dimuat.',
            data: schedules
        });

    } catch (error) {
        console.error('Error saat mengambil jadwal notifikasi:', error);
        res.status(500).json({ message: 'Kesalahan server saat mengambil jadwal notifikasi.' });
    }
};

// Fungsi untuk Mengambil Semua Jadwal Notifikasi yang Relevan untuk Pengguna (Pasien/Keluarga)
// route GET /api/notifications/schedules/user
exports.getNotificationSchedulesForUser = async (req, res) => {
    try {
        const loggedInUser = req.user; // Berisi id_user dan role

        let globalId;
        if (loggedInUser.role === 'pasien') {
            globalId = await getPatientIdByUserId(loggedInUser.id);
        } else if (loggedInUser.role === 'keluarga') {
            globalId = await getFamilyIdByUserId(loggedInUser.id);
        } else {
            return res.status(403).json({ message: 'Akses ditolak: Hanya pasien atau keluarga yang dapat melihat jadwal notifikasi mereka.' });
        }

        if (!globalId) {
            return res.status(404).json({ message: `ID ${loggedInUser.role} tidak ditemukan.` });
        }

        const schedules = await NotificationSchedule.findAllRelevantToUser(globalId, loggedInUser.role);

        res.status(200).json({
            message: 'Jadwal notifikasi relevan berhasil dimuat.',
            data: schedules
        });

    } catch (error) {
        console.error('Error saat mengambil jadwal notifikasi untuk pengguna:', error);
        res.status(500).json({ message: 'Kesalahan server saat mengambil jadwal notifikasi.' });
    }
};

// Fungsi untuk Menghapus Jadwal Notifikasi (Hanya Dokter)
// route DELETE /api/notifications/schedules/:id
exports.deleteNotificationSchedule = async (req, res) => {
    try {
        const { id } = req.params;

        const doctorUserId = req.user.id;
        const doctorGlobalId = await getDoctorIdByUserId(doctorUserId);

        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const existingSchedule = await NotificationSchedule.findById(parseInt(id));
        if (!existingSchedule) {
            return res.status(404).json({ message: 'Jadwal notifikasi tidak ditemukan.' });
        }
        console.warn(`[DEBUG_AUTH] Delete: Comparing existingSchedule.id_dokter (${existingSchedule.id_dokter}, type: ${typeof existingSchedule.id_dokter}) with doctorGlobalId (${doctorGlobalId}, type: ${typeof doctorGlobalId})`);
        if (Number(existingSchedule.id_dokter) !== Number(doctorGlobalId)) {
            return res.status(403).json({ message: 'Tidak diotorisasi: Anda hanya dapat menghapus jadwal pengingat Anda sendiri.' });
        }

        const success = await NotificationSchedule.delete(parseInt(id));

        if (success) {
            res.status(200).json({ message: 'Jadwal notifikasi berhasil dihapus.' });
        } else {
            res.status(404).json({ message: 'Jadwal notifikasi tidak ditemukan.' });
        }

    } catch (error) {
        console.error('Error saat menghapus jadwal notifikasi:', error);
        res.status(500).json({ message: 'Kesalahan server saat menghapus jadwal notifikasi.' });
    }
};

