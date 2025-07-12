// BECKEND_ASISTENOBAT/controllers/doctorController.js

const { query } = require('../config/database');
const Dokter = require('../models/Doctor'); 
// Menggunakan model Dokter yang sudah Anda berikan.

// PERUBAHAN UNTUK NOTIFIKASI: Helper functions untuk mendapatkan ID global/unik.
// Fungsi-fungsi ini penting untuk digunakan di controller ini dan diekspor untuk controller lain (misal notificationController).
async function getDoctorGlobalIdByUserId(userId) {
    const result = await query('SELECT id FROM dokter WHERE id_user = ?', [userId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

async function getPatientGlobalIdFromUniqueId(patientUniqueId) {
    const result = await query('SELECT id FROM pasien WHERE id_pasien = ?', [patientUniqueId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

async function getDoctorUniqueIdFromGlobalId(doctorGlobalId) {
    const result = await query('SELECT id_dokter FROM dokter WHERE id = ?', [doctorGlobalId]);
    if (result.length > 0) { return result[0].id_dokter; }
    return null;
}
// SAMPAI SINIH

// @desc    Mendapatkan profil dokter yang sedang login.
// @route   GET /api/doctor/profile
// @access  Private (Hanya Dokter yang sudah login)
exports.getDoctorProfile = async (req, res) => {
    try {
        const doctorUserId = req.user.id;
        const doctorGlobalId = await getDoctorGlobalIdByUserId(doctorUserId);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const doctorData = await Dokter.findByIdGlobal(doctorGlobalId);
        if (!doctorData) {
            return res.status(404).json({ message: 'Data profil dokter tidak ditemukan.' });
        }

        res.status(200).json({
            message: 'Profil dokter berhasil dimuat.',
            data: {
                id_dokter: doctorData.id_dokter, 
                nama: doctorData.nama,
                specialization: doctorData.spesialisasi,
                nomor_telepon: doctorData.nomor_telepon,
                alamat: doctorData.alamat,
            }
        });

    } catch (error) {
        console.error('Error getting doctor profile:', error);
        res.status(500).json({ message: 'Kesalahan server saat memuat profil dokter.' });
    }
};

// @desc    Mendapatkan daftar pasien yang terhubung dengan dokter ini.
// @route   GET /api/doctor/my-connected-patients
// @access  Private (Hanya Dokter)
exports.getConnectedPatientsForDoctor = async (req, res) => {
    try {
        const doctorUserId = req.user.id;
        const doctorGlobalId = await getDoctorGlobalIdByUserId(doctorUserId);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const patients = await query(
            `SELECT p.id AS patientGlobalId, p.id_pasien AS patientUniqueId, p.nama AS patientName, 
                    p.tanggal_lahir AS dateOfBirth, p.jenis_kelamin AS gender, 
                    p.nomor_telepon AS phoneNumber, p.alamat AS address
             FROM relasi_dokter_pasien rdp
             JOIN pasien p ON rdp.id_pasien = p.id
             WHERE rdp.id_dokter = ?
             ORDER BY p.nama ASC`, 
            [doctorGlobalId]
        );

        if (patients.length === 0) { 
            return res.status(200).json({ message: 'Tidak ada pasien terhubung dengan dokter ini.', data: [] });
        }

        res.status(200).json({
            message: 'Daftar pasien berhasil dimuat.',
            data: patients
        });

    } catch (error) {
        console.error('Error getting doctor\'s connected patients:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat memuat daftar pasien.' });
    }
};

// @desc    Menghubungkan Pasien dengan Dokter.
// @route   POST /api/doctor/connect-patient
// @access  Private (Hanya Dokter)
exports.connectPatient = async (req, res) => {
    const { patientUniqueId } = req.body;
    const doctorUserId = req.user.id;

    if (!patientUniqueId) {
        return res.status(400).json({ message: 'ID Unik Pasien wajib diisi.' });
    }

    try {
        const doctorGlobalId = await getDoctorGlobalIdByUserId(doctorUserId);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const patientExists = await query('SELECT id, id_pasien, nama FROM pasien WHERE id_pasien = ?', [patientUniqueId]);
        if (patientExists.length === 0) {
            return res.status(404).json({ message: 'Pasien dengan ID unik tersebut tidak ditemukan.' });
        }
        const patientGlobalId = patientExists[0].id;
        const patientName = patientExists[0].nama;

        const existingRelation = await query(
            'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
            [doctorGlobalId, patientGlobalId]
        );

        if (existingRelation.length > 0) {
            return res.status(409).json({ message: 'Dokter ini sudah terhubung dengan pasien tersebut.' });
        }

        const insertResult = await query(
            'INSERT INTO relasi_dokter_pasien (id_dokter, id_pasien) VALUES (?, ?)',
            [doctorGlobalId, patientGlobalId]
        );

        const doctorInfo = await query('SELECT nama FROM dokter WHERE id = ?', [doctorGlobalId]);
        const doctorName = doctorInfo.length > 0 ? doctorInfo[0].nama : null;

        await query(
            'UPDATE pasien SET is_connected_to_doctor = TRUE, connected_doctor_id_global = ?, connected_doctor_name = ? WHERE id = ?',
            [doctorGlobalId, doctorName, patientGlobalId]
        );
        
        res.status(201).json({
            message: 'Pasien berhasil dihubungkan dengan dokter.',
            data: {
                id: patientUniqueId, 
                name: patientName,
                doctorId: doctorGlobalId, 
                doctorName: doctorName, 
                relationId: insertResult.insertId 
            }
        });

    } catch (error) {
        console.error('Error connecting patient to doctor:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat menghubungkan pasien.' });
    }
};

// @desc    Memutuskan koneksi Pasien dari Dokter.
// @route   DELETE /api/doctor/disconnect-patient/:patientUniqueId
// @access  Private (Hanya Dokter)
exports.disconnectPatient = async (req, res) => {
    const { patientUniqueId } = req.params;
    const doctorUserId = req.user.id;

    if (!patientUniqueId) {
        return res.status(400).json({ message: 'ID Unik Pasien wajib diisi.' });
    }

    try {
        const doctorGlobalId = await getDoctorGlobalIdByUserId(doctorUserId);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const patientGlobalId = await getPatientGlobalIdFromUniqueId(patientUniqueId);
        if (!patientGlobalId) {
            return res.status(404).json({ message: 'Pasien dengan ID unik tersebut tidak ditemukan.' });
        }

        const existingRelation = await query(
            'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
            [doctorGlobalId, patientGlobalId]
        );

        if (existingRelation.length === 0) {
            return res.status(404).json({ message: 'Koneksi dokter-pasien tidak ditemukan.' });
        }

        await query(
            'DELETE FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
            [doctorGlobalId, patientGlobalId]
        );

        await query(
            'UPDATE pasien SET is_connected_to_doctor = FALSE, connected_doctor_id_global = NULL, connected_doctor_name = NULL WHERE id = ?',
            [patientGlobalId]
        );

        res.status(200).json({ message: 'Koneksi pasien berhasil diputuskan.' });

    } catch (error) {
        console.error('Error disconnecting patient:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat memutuskan koneksi pasien.' });
    }
};

// @desc    Mendapatkan Global ID dokter dari Unique ID dokter.
// @route   GET /api/doctor/global-id?uniqueId=:uniqueId
// @access  Private (Digunakan oleh frontend)
// PERUBAHAN UNTUK NOTIFIKASI: Menambahkan endpoint helper ini.
// SAMPAI SINIH
exports.getDoctorGlobalIdFromUniqueId = async (req, res) => {
    const { uniqueId } = req.query;
    if (!uniqueId) {
        return res.status(400).json({ message: 'Unique ID dokter diperlukan.' });
    }
    try {
        const result = await Dokter.findByIdDokterUnik(uniqueId);
        if (result) {
            res.status(200).json({ message: 'Global ID ditemukan.', data: { globalId: result.id } });
        } else {
            res.status(404).json({ message: 'Global ID dokter tidak ditemukan.' });
        }
    } catch (error) {
        console.error('Error getting doctor global ID by unique ID:', error);
        res.status(500).json({ message: 'Kesalahan server saat mendapatkan global ID dokter.' });
    }
};

// PERUBAHAN UNTUK NOTIFIKASI: Ekspor helper function agar bisa diakses oleh controller lain (misal notificationController).
exports.getDoctorGlobalIdByUserId = getDoctorGlobalIdByUserId;
// SAMPAI SINIH