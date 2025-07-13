const { query } = require('../config/database');
const Obat = require('../models/medication'); // Untuk getPatientMedicationsForFamily
const MedicationHistory = require('../models/MedicationHistory'); // Untuk getPatientMedicationHistoryForFamily
const PatientLocation = require('../models/PatientLocation'); // Untuk getPatientLastLocationForFamily

// Helper functions (salin dari patientController/medicationController jika belum ada)
// Fungsi pembantu untuk mendapatkan ID internal pasien dari ID user
async function getPatientIdByUserId(userId) {
    const result = await query('SELECT id FROM pasien WHERE id_user = ?', [userId]);
    return result.length > 0 ? result[0].id : null;
}

// Fungsi pembantu untuk mendapatkan ID internal keluarga dari ID user
async function getFamilyIdByUserId(userId) {
    const result = await query('SELECT id FROM keluarga WHERE id_user = ?', [userId]);
    return result.length > 0 ? result[0].id : null;
}

// Fungsi pembantu untuk mendapatkan ID internal pasien dari ID unik (VARCHAR)
async function getPatientGlobalIdFromUniqueId(patientUniqueId) {
    const result = await query('SELECT id FROM pasien WHERE id_pasien = ?', [patientUniqueId]);
    return result.length > 0 ? result[0].id : null;
}

//Profil
exports.getFamilyProfile = async (req, res) => {
    try {
        const familyUserId = req.user.id; // ID user dari token JWT
        
        // Dapatkan ID global keluarga dari ID user
        // Mengambil id, id_keluarga, nama, nomor_telepon, alamat dari tabel keluarga
        const familyGlobalData = await query('SELECT id, id_keluarga, nama, nomor_telepon, alamat FROM keluarga WHERE id_user = ?', [familyUserId]);
        
        if (familyGlobalData.length === 0) {
            return res.status(404).json({ message: 'Data profil keluarga tidak ditemukan.', status: 'fail' });
        }

        const familyProfile = familyGlobalData[0];

        // Ambil data username dan role dari tabel users (ini penting untuk profil lengkap)
        const userData = await query('SELECT username, role FROM users WHERE id = ?', [familyUserId]);
        const userDetails = userData.length > 0 ? userData[0] : {};

        res.status(200).json({
            message: 'Profil keluarga berhasil dimuat.',
            status: 'success',
            data: {
                id: familyProfile.id, // ID global dari tabel keluarga
                id_keluarga: familyProfile.id_keluarga, // ID unik keluarga
                username: userDetails.username, // Dari tabel users
                role: userDetails.role, // Dari tabel users
                nama: familyProfile.nama, // Dari tabel keluarga
                nomor_telepon: familyProfile.nomor_telepon, // Dari tabel keluarga
                alamat: familyProfile.alamat, // Dari tabel keluarga
                // Tambahkan field lain dari tabel keluarga jika ada dan relevan untuk profil
            }
        });

    } catch (error) {
        console.error('Error getting family profile:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat memuat profil keluarga.', status: 'error' });
    }
};


// @desc    Keluarga menghubungkan diri dengan pasien menggunakan kode unik pasien (id_pasien VARCHAR)
// @route   POST /api/family/connect-to-patient
// @access  Private (Keluarga saja)
exports.connectPatientToFamily = async (req, res) => {
    const { patientUniqueId } = req.body; // Kode unik pasien (contoh: PSN123...)
    const familyUserId = req.user.id; // ID user dari token JWT (keluarga yang sedang login)

    // Validasi input
    if (!patientUniqueId) {
        return res.status(400).json({ message: 'Kode unik pasien wajib diisi.' });
    }

    try {
        // Dapatkan ID internal keluarga dari ID user keluarga
        const familyGlobalId = await getFamilyIdByUserId(familyUserId);
        if (!familyGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai keluarga.' });
        }

        // 1. Verifikasi Pasien berdasarkan ID Unik (VARCHAR)
        const patientExists = await query('SELECT id, nama FROM pasien WHERE id_pasien = ?', [patientUniqueId]);
        if (patientExists.length === 0) {
            return res.status(404).json({ message: 'Pasien dengan kode unik tersebut tidak ditemukan.' });
        }
        const patientGlobalId = patientExists[0].id; // Dapatkan ID internal pasien
        const patientName = patientExists[0].nama;

        // 2. Cek apakah relasi ini sudah ada di tabel 'relasi_pasien_keluarga'
        const existingRelation = await query(
            'SELECT * FROM relasi_pasien_keluarga WHERE id_keluarga = ? AND id_pasien = ?',
            [familyGlobalId, patientGlobalId]
        );

        if (existingRelation.length > 0) {
            return res.status(409).json({ message: 'Keluarga ini sudah terhubung dengan pasien tersebut.' });
        }

        // 3. Buat relasi baru di tabel 'relasi_pasien_keluarga'
        // Tabel relasi_pasien_keluarga hanya menyimpan ID internal, bukan kode_unik_pasien
        const insertResult = await query(
            'INSERT INTO relasi_pasien_keluarga (id_keluarga, id_pasien) VALUES (?, ?)',
            [familyGlobalId, patientGlobalId]
        );

        res.status(201).json({
            message: 'Pasien berhasil dihubungkan dengan keluarga.',
            data: {
                relationId: insertResult.insertId,
                patientIdGlobal: patientGlobalId, // ID internal pasien yang terhubung
                patientUniqueId: patientUniqueId, // ID unik (VARCHAR) pasien yang diinput keluarga
                patientName: patientName,
                familyId: familyGlobalId
            }
        });

    } catch (error) {
        console.error('Error connecting patient to family:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat menghubungkan pasien.' });
    }
};

// @desc    Mendapatkan daftar pasien yang terhubung dengan keluarga
// @route   GET /api/family/my-connected-patients
// @access  Private (Keluarga saja)
exports.getConnectedPatientsForFamily = async (req, res) => {
    const familyUserId = req.user.id; // ID user keluarga dari token JWT

    try {
        const familyGlobalId = await getFamilyIdByUserId(familyUserId);
        if (!familyGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai keluarga.' });
        }

        // Query untuk mendapatkan detail pasien yang terhubung dengan keluarga ini
        const patients = await query(
            `SELECT 
                p.id, p.id_pasien, p.nama AS patientName, 
                p.tanggal_lahir AS dateOfBirth, p.jenis_kelamin AS gender, 
                p.nomor_telepon AS phoneNumber, p.alamat AS address
            FROM relasi_pasien_keluarga rkp
            JOIN pasien p ON rkp.id_pasien = p.id
            WHERE rkp.id_keluarga = ?`,
            [familyGlobalId]
        );

        // Jika tidak ada pasien yang terhubung
        if (patients.length === 0) {
            return res.status(200).json({ message: 'Belum ada pasien yang terhubung dengan keluarga ini.', data: [] });
        }

        res.status(200).json({
            message: 'Daftar pasien terhubung berhasil dimuat.',
            data: patients.map(p => ({
                idGlobal: p.id,
                idUnik: p.id_pasien, // Mengembalikan ID unik (VARCHAR) untuk ditampilkan di frontend
                nama: p.patientName,
                tanggalLahir: p.dateOfBirth,
                jenisKelamin: p.gender,
                nomorTelepon: p.phoneNumber,
                alamat: p.address
            }))
        });

    } catch (error) {
        console.error('Error getting connected patients for family:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat memuat daftar pasien terhubung.' });
    }
};

// @desc    Mendapatkan daftar obat untuk pasien tertentu yang terhubung (oleh keluarga)
// @route   GET /api/family/patients/:patientGlobalId/medications
// @access  Private (Keluarga saja)
exports.getPatientMedicationsForFamily = async (req, res) => {
    const { patientGlobalId } = req.params; // ID internal pasien dari URL
    const familyUserId = req.user.id; // ID user keluarga dari token JWT

    try {
        const familyGlobalId = await getFamilyIdByUserId(familyUserId);
        if (!familyGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai keluarga.' });
        }

        // Verifikasi relasi: Pastikan keluarga yang login memang terhubung dengan pasien ini
        const isConnected = await query(
            'SELECT * FROM relasi_pasien_keluarga WHERE id_keluarga = ? AND id_pasien = ?',
            [familyGlobalId, patientGlobalId]
        );
        if (isConnected.length === 0) {
            return res.status(403).json({ message: 'Anda tidak memiliki akses ke data pasien ini.' });
        }

        // Dapatkan daftar obat pasien menggunakan model Obat
        const medications = await Obat.findAllByPatientId(patientGlobalId);

        res.status(200).json({
            message: 'Daftar obat pasien berhasil dimuat.',
            data: medications
        });

    } catch (error) {
        console.error('Error getting patient medications for family:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat memuat daftar obat pasien.' });
    }
};

// @desc    Mendapatkan riwayat konsumsi obat untuk pasien tertentu yang terhubung (oleh keluarga)
// @route   GET /api/family/patients/:patientGlobalId/medication-history
// @access  Private (Keluarga saja)
exports.getPatientMedicationHistoryForFamily = async (req, res) => {
    const { patientGlobalId } = req.params; // ID internal pasien dari URL
    const familyUserId = req.user.id; // ID user keluarga dari token JWT

    try {
        const familyGlobalId = await getFamilyIdByUserId(familyUserId);
        if (!familyGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai keluarga.' });
        }

        // Verifikasi relasi: Pastikan keluarga yang login memang terhubung dengan pasien ini
        const isConnected = await query(
            'SELECT * FROM relasi_pasien_keluarga WHERE id_keluarga = ? AND id_pasien = ?',
            [familyGlobalId, patientGlobalId]
        );
        if (isConnected.length === 0) {
            return res.status(403).json({ message: 'Anda tidak memiliki akses ke data pasien ini.' });
        }

        // Dapatkan riwayat konsumsi obat menggunakan model MedicationHistory
        const history = await MedicationHistory.getHistoryByPatientId(patientGlobalId);

        res.status(200).json({
            message: 'Riwayat konsumsi obat pasien berhasil dimuat.',
            data: history
        });

    } catch (error) {
        console.error('Error getting patient medication history for family:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat memuat riwayat konsumsi obat pasien.' });
    }
};

// @desc    Mendapatkan lokasi terakhir pasien yang terhubung (oleh keluarga)
// @route   GET /api/family/patients/:patientGlobalId/location
// @access  Private (Keluarga saja)
exports.getPatientLastLocationForFamily = async (req, res) => {
    const { patientGlobalId } = req.params; // ID internal pasien dari URL
    const familyUserId = req.user.id; // ID user keluarga dari token JWT

    try {
        const familyGlobalId = await getFamilyIdByUserId(familyUserId);
        if (!familyGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai keluarga.' });
        }

        // Verifikasi relasi: Pastikan keluarga yang login memang terhubung dengan pasien ini
        const isConnected = await query(
            'SELECT * FROM relasi_pasien_keluarga WHERE id_keluarga = ? AND id_pasien = ?',
            [familyGlobalId, patientGlobalId]
        );
        if (isConnected.length === 0) {
            return res.status(403).json({ message: 'Anda tidak memiliki akses ke data pasien ini.' });
        }

        // Dapatkan lokasi terakhir pasien menggunakan model PatientLocation
        const location = await PatientLocation.findLastLocationByPatientId(patientGlobalId);

        // Jika lokasi tidak ditemukan
        if (!location) {
            return res.status(404).json({ message: 'Lokasi pasien belum tersedia atau tidak ditemukan.' });
        }

        res.status(200).json({
            message: 'Lokasi pasien berhasil dimuat.',
            data: location
        });

    } catch (error) {
        console.error('Error getting patient location for family:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat memuat lokasi pasien.' });
    }
};
