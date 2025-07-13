const { query } = require('../config/database');
const isValidPatientId = (id) => {
    return typeof id === 'string' && id.startsWith('PSN') && id.length > 10;
};

async function getDoctorIdByUserId(userId) {
    const result = await query('SELECT id FROM dokter WHERE id_user = ?', [userId]);
    if (result.length > 0) {
        return result[0].id; 
    }
    return null;
}

async function getPatientIdByUserId(userId) {
    const result = await query('SELECT id FROM pasien WHERE id_user = ?', [userId]);
    if (result.length > 0) {
        return result[0].id; 
    }
    return null;
}

async function getFamilyIdByUserId(userId) {
    const result = await query('SELECT id FROM keluarga WHERE id_user = ?', [userId]);
    if (result.length > 0) {
        return result[0].id; 
    }
    return null;
}

//Profil
exports.getPatientProfile = async (req, res) => {
    try {
        const patientUserId = req.user.id; // ID user dari token JWT

        // Dapatkan ID global pasien dari ID user dan data profil dari tabel 'pasien'
        const patientGlobalData = await query('SELECT id, id_pasien, nama, tanggal_lahir, jenis_kelamin, nomor_telepon, alamat FROM pasien WHERE id_user = ?', [patientUserId]);

        if (patientGlobalData.length === 0) {
            return res.status(404).json({ message: 'Data profil pasien tidak ditemukan.', status: 'fail' });
        }

        const patientProfile = patientGlobalData[0];

        // Ambil data username dan role dari tabel 'users' untuk kelengkapan profil
        const userData = await query('SELECT username, role FROM users WHERE id = ?', [patientUserId]);
        const userDetails = userData.length > 0 ? userData[0] : {};

        res.status(200).json({
            message: 'Profil pasien berhasil dimuat.',
            status: 'success',
            data: {
                id: patientProfile.id, // ID global dari tabel pasien (misal: integer)
                patientId: patientProfile.id_pasien, // ID unik dari tabel pasien (misal: PSNxxxx)
                name: patientProfile.nama, // Dari tabel pasien
                dateOfBirth: patientProfile.tanggal_lahir, // Dari tabel pasien
                gender: patientProfile.jenis_kelamin, // Dari tabel pasien
                phoneNumber: patientProfile.nomor_telepon, // Dari tabel pasien
                address: patientProfile.alamat, // Dari tabel pasien
                username: userDetails.username, // Dari tabel users
                role: userDetails.role, // Dari tabel users
                // connectedDoctorName: (ini akan diambil dari tabel pasien jika sudah di-update saat koneksi dokter)
                // connectedDoctorId: (ini akan diambil dari tabel pasien jika sudah di-update saat koneksi dokter)
            }
        });

    } catch (error) {
        console.error('Error getting patient profile:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat memuat profil pasien.', status: 'error' });
    }
};


 //  Fungsi untuk mendapatkan ID Unik Pasien 
    // route   GET /api/patient/my-unique-code
    exports.getPatientUniqueCode = async (req, res) => {
        try {
            const patientUserId = req.user.id; // ID user dari token JWT
            const patientGlobalId = await getPatientIdByUserId(patientUserId);
            if (!patientGlobalId) {
                return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai pasien.' });
            }

            const patientInfo = await query('SELECT id_pasien FROM pasien WHERE id = ?', [patientGlobalId]);
            if (patientInfo.length === 0) {
                return res.status(404).json({ message: 'Data pasien tidak ditemukan.' });
            }

            res.status(200).json({
                message: 'Kode unik pasien berhasil dimuat.',
                data: { uniqueCode: patientInfo[0].id_pasien }
            });

        } catch (error) {
            console.error('Error getting patient unique code:', error);
            res.status(500).json({ message: 'Terjadi kesalahan server saat memuat kode unik pasien.' });
        }
    };

// Fungsi untuk mencari Pasien Terhubung berdasarkan Nama
// route   GET /api/pasien/terhubung/cari?nama=<nama_pasien>
exports.searchConnectedPatientsByName = async (req, res) => {
    try {
        const { nama } = req.query; 
        const doctorUserId = req.user.id; 

        if (!nama || nama.trim().length < 2) {
            return res.status(400).json({ message: 'Nama pasien minimal 2 karakter untuk pencarian.' });
        }

        const doctorGlobalId = await getDoctorIdByUserId(doctorUserId);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        // Query untuk mencari pasien yang terhubung DAN namanya cocok
        const sql = `
            SELECT p.id, p.id_pasien, p.nama
            FROM pasien p
            JOIN relasi_dokter_pasien rdp ON p.id = rdp.id_pasien
            WHERE rdp.id_dokter = ? AND p.nama LIKE ?
            ORDER BY p.nama ASC
        `;
        const searchTerm = `%${nama.trim()}%`;
        
        const patients = await query(sql, [doctorGlobalId, searchTerm]); 

        if (patients.length === 0) {
            return res.status(404).json({ message: 'Tidak ada pasien terhubung yang ditemukan dengan nama tersebut.' });
        }

        res.status(200).json({
            message: 'Pasien terhubung ditemukan.',
            data: patients.map(p => ({
                idGlobal: p.id,
                idUnik: p.id_pasien,
                nama: p.nama
            }))
        });

    } catch (error) {
        console.error('Error saat mencari pasien terhubung berdasarkan nama:', error);
        res.status(500).json({ message: 'Kesalahan server saat mencari pasien terhubung.' });
    }
};



// API untuk Menghubungkan Dokter dengan Pasien 
exports.connectPatient = async (req, res) => {
    // req.user.id datang dari token JWT (middleware verifyToken)
    const { patientUniqueId } = req.body; // Pasien yang mau dihubungkan
    const doctorUserId = req.user.id; 

    if (!patientUniqueId) {
        return res.status(400).json({ message: 'ID Unik Pasien wajib diisi.' });
    }

    try {
        // 1. Dapatkan ID internal dokter dari ID user dokter
        const doctorGlobalId = await getDoctorIdByUserId(doctorUserId);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        // 2. Verifikasi Pasien berdasarkan ID Unik
        const patientExists = await query('SELECT id, id_pasien, nama FROM pasien WHERE id_pasien = ?', [patientUniqueId]);
        if (patientExists.length === 0) {
            return res.status(404).json({ message: 'Pasien dengan ID unik tersebut tidak ditemukan.' });
        }
        const patientGlobalId = patientExists[0].id;
        const patientName = patientExists[0].nama;

        // Debug log
        console.log('--- DEBUG LOGS FROM patientController.js (connectPatient) ---');
        console.log('  1. Request Body Received:', req.body);
        console.log('  2. patientUniqueId (from req.body):', patientUniqueId, 'Type:', typeof patientUniqueId);
        console.log('  3. doctorUserId (from req.user.id):', doctorUserId, 'Type:', typeof doctorUserId);
        console.log('  4. doctorGlobalId (from dokter.id):', doctorGlobalId, 'Type:', typeof doctorGlobalId);
        console.log('  5. patientGlobalId (from pasien.id):', patientGlobalId, 'Type:', typeof patientGlobalId);
        console.log('--- END DEBUG LOGS ---');

        // 3. Cek apakah relasi ini sudah ada di tabel 'relasi_dokter_pasien'
        const existingRelation = await query(
            'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
            [doctorGlobalId, patientGlobalId]
        );

        if (existingRelation.length > 0) {
            return res.status(409).json({ message: 'Dokter ini sudah terhubung dengan pasien tersebut.' });
        }

        // 4. Buat relasi baru di tabel 'relasi_dokter_pasien'
        await query(
            'INSERT INTO relasi_dokter_pasien (id_dokter, id_pasien) VALUES (?, ?)',
            [doctorGlobalId, patientGlobalId]
        );

        // Ambil nama dokter dari tabel dokter untuk disimpan di tabel pasien )
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


//  API untuk Mengambil Daftar Pasien yang Terhubung dengan Dokter 

exports.getDoctorPatients = async (req, res) => {
    try {
        const doctorUserId = req.user.id; 
        const doctorGlobalId = await getDoctorIdByUserId(doctorUserId);
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
        console.error('Error getting doctor\'s patients:', error);
        res.status(500).json({ message: 'Terjadi kesalahan server saat memuat daftar pasien.' });
    }
};

// Fungsi  untuk mendapatkan Dokter Terhubung untuk Pasien 
// route   GET /api/patient/connected-doctor
exports.getConnectedDoctorForPatient = async (req, res) => {
    try {
        const patientUserId = req.user.id; 
        const patientGlobalId = await getPatientIdByUserId(patientUserId);
        if (!patientGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai pasien.' });
        }

        const relationResult = await query(
            `SELECT id_dokter FROM relasi_dokter_pasien WHERE id_pasien = ?`,
            [patientGlobalId]
        );

        if (relationResult.length === 0) {
            return res.status(200).json({ message: 'Pasien belum terhubung dengan dokter manapun.', data: null });
        }

        const doctorGlobalId = relationResult[0].id_dokter;

        const doctorData = await query(
            `SELECT id_dokter, nama, spesialisasi, nomor_telepon, alamat 
             FROM dokter 
             WHERE id = ?`,
            [doctorGlobalId]
        );

        if (doctorData.length === 0) {
            return res.status(404).json({ message: 'Data dokter terhubung tidak ditemukan.' });
        }

        res.status(200).json({
            message: 'Dokter terhubung ditemukan.',
            data: {
                id_dokter: doctorData[0].id_dokter, 
                nama: doctorData[0].nama,
                specialization: doctorData[0].spesialisasi,
                nomor_telepon: doctorData[0].nomor_telepon,
                alamat: doctorData[0].alamat,
            }
        });

    } catch (error) {
        console.error('Error saat mendapatkan dokter terhubung untuk pasien:', error);
        res.status(500).json({ message: 'Kesalahan server saat memuat dokter terhubung.' });
    }
};



async function getDoctorIdByUserId(userId) {
    const result = await query('SELECT id FROM dokter WHERE id_user = ?', [userId]);
    if (result.length > 0) {
        return result[0].id; 
    }
    return null;
}

async function getPatientIdByUserId(userId) {
    const result = await query('SELECT id FROM pasien WHERE id_user = ?', [userId]);
    if (result.length > 0) {
        return result[0].id; 
    }
    return null;
}

