const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database'); 

//  untuk membuat ID unik spesifik role
const generateRoleId = (rolePrefix) => {
    // Menghasilkan ID unik berdasarkan prefix role dan timestamp
    return `${rolePrefix}${Date.now()}`;
};

// REGISTER
exports.register = async (req, res) => {
    const { 
        username, 
        password, 
        role, 
        // Data untuk pasien
        patientName, patientDob, patientGender, patientPhone, patientAddress,
        // Data untuk dokter
        doctorName, doctorSpecialization, doctorPhone, doctorAddress,
        // Data untuk keluarga
        familyName, familyPhone, familyAddress
    } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ message: 'Username, password, dan role wajib diisi.' });
    }

    let newUserGlobalId; // Variabel untuk menyimpan ID user baru dari tabel 'users'

    try {
        // Untuk mengecek apakah username sudah ada di tabel users
        const existingUser = await query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser.length > 0) {
            return res.status(409).json({ message: 'Username sudah digunakan.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);        
        let userQueryResult;
        try {
            // 1. Masukkan ke tabel users
            const sqlInsertUser = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
            userQueryResult = await query(sqlInsertUser, [username, hashedPassword, role]);
            newUserGlobalId = userQueryResult.insertId;
        } catch (error) {
            console.error('Error saat insert ke users:', error);
            // untuk menangani error jika terjadi saat insert ke users
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: 'Username sudah digunakan.' });
            }
            return res.status(500).json({ message: 'Terjadi kesalahan saat registrasi user.' });
        }
        
        let sqlInsertProfile;
        let paramsProfile;
        let uniqueRoleId; // Untuk menyimpan id_pasien, id_dokter, atau id_keluarga yang di-generate

        switch (role) {
            case 'pasien':
                uniqueRoleId = generateRoleId('PSN'); //  ID unik pasien
                sqlInsertProfile = `INSERT INTO pasien (id_user, id_pasien, nama, tanggal_lahir, jenis_kelamin, nomor_telepon, alamat) VALUES (?, ?, ?, ?, ?, ?, ?)`;
                paramsProfile = [
                    newUserGlobalId,
                    uniqueRoleId,
                    patientName || username, 
                    patientDob || null,
                    patientGender || null,
                    patientPhone || null,
                    patientAddress || null
                ];
                break;
            case 'dokter':
                uniqueRoleId = generateRoleId('DKTR'); // ID unik dokter
                sqlInsertProfile = `INSERT INTO dokter (id_user, id_dokter, nama, spesialisasi, nomor_telepon, alamat) VALUES (?, ?, ?, ?, ?, ?)`;
                paramsProfile = [
                    newUserGlobalId,
                    uniqueRoleId,
                    doctorName || username,
                    doctorSpecialization || null,
                    doctorPhone || null,
                    doctorAddress || null
                ];
                break;
            case 'keluarga':
                uniqueRoleId = generateRoleId('KLG'); //  ID unik keluarga
                sqlInsertProfile = `INSERT INTO keluarga (id_user, id_keluarga, nama, nomor_telepon, alamat) VALUES (?, ?, ?, ?, ?)`;
                paramsProfile = [
                    newUserGlobalId,
                    uniqueRoleId,
                    familyName || username,
                    familyPhone || null,
                    familyAddress || null
                ];
                break;
            default:
                await query('DELETE FROM users WHERE id = ?', [newUserGlobalId]);
                return res.status(400).json({ message: 'Role tidak valid.' });
        }

        try {
            // 2. Masukkan ke tabel profil spesifik sesuai role
            await query(sqlInsertProfile, paramsProfile);
           
            res.status(201).json({ message: 'Registrasi berhasil.', userId: newUserGlobalId, uniqueRoleId: uniqueRoleId, role: role });
        } catch (profileError) {
            console.error(`Error saat insert ke tabel ${role}:`, profileError);
            await query('DELETE FROM users WHERE id = ?', [newUserGlobalId]);
            return res.status(500).json({ message: `Terjadi kesalahan saat menyimpan data profil ${role}.` });
        }

    } catch (err) {
        console.error('Error umum registrasi:', err);
        res.status(500).json({ message: 'Terjadi kesalahan saat registrasi.' });
    }
};

// LOGIN
exports.login = async (req, res) => {
    const { username, password } = req.body;
    console.log('--- LOGIN REQUEST RECEIVED ---');
    if (!username || !password) {
        return res.status(400).json({ message: 'Username dan password wajib diisi.' });
    }

    try {
        const users = await query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(401).json({ message: 'Username tidak ditemukan.' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Password salah.' });
        }

        let profileGlobalId = null; 
        let profileUniqueId = null; 

        let profileTableName;
        let uniqueIdColumnName; 

        switch (user.role) {
            case 'dokter':
                profileTableName = 'dokter';
                uniqueIdColumnName = 'id_dokter'; // Nama kolom ID unik di tabel dokter
                break;
            case 'pasien':
                profileTableName = 'pasien';
                uniqueIdColumnName = 'id_pasien'; // Nama kolom ID unik di tabel pasien
                break;
            case 'keluarga':
                profileTableName = 'keluarga';
                uniqueIdColumnName = 'id_keluarga'; // Nama kolom ID unik di tabel keluarga
                break;
            default:
                console.warn('Role tidak dikenal saat login:', user.role);
                break;
        }

         if (profileTableName) {
            // Mengambil ID global (INT) dan ID unik (VARCHAR) dari tabel profil yang relevan
            const profile = await query(`SELECT id, ${uniqueIdColumnName} FROM ${profileTableName} WHERE id_user = ?`, [user.id]);
            if (profile.length > 0) {
                profileGlobalId = profile[0].id; 
                if (user.role === 'pasien' || user.role === 'dokter' || user.role === 'keluarga') { 
                    profileUniqueId = profile[0][uniqueIdColumnName]; 
                }
            }
        }

        // Buat payload JWT dengan menambahkan ID spesifik role
        const jwtPayload = {
            id: user.id, // ID dari tabel `users` (ini adalah user ID utama)
            username: user.username,
            role: user.role,
            ...(user.role === 'pasien' && { patientGlobalId: profileGlobalId, idPasien: profileUniqueId }), // `idPasien` di sini adalah ID unik VARCHAR
            ...(user.role === 'dokter' && { doctorGlobalId: profileGlobalId }),
            ...(user.role === 'keluarga' && { familyGlobalId: profileGlobalId }),
        };

        const token = jwt.sign(
            jwtPayload, 
            process.env.JWT_SECRET || 'rahasia_default',
            { expiresIn: '1h' }
        );

        // Ambil detail profil lengkap untuk response ke frontend
        // Ini  data yang akan dikirim ke aplikasi Flutter
        let profileDetails = {}; // Objek untuk menyimpan detail profil lengkap
        if (profileTableName) {
            const fullProfile = await query(`SELECT * FROM ${profileTableName} WHERE id_user = ?`, [user.id]);
            if (fullProfile.length > 0) {
                const profileData = fullProfile[0];
                profileDetails = {
                    ...(user.role === 'keluarga' && { familyGlobalId: profileGlobalId }), 
                    ...(user.role === 'pasien' && { patientGlobalId: profileGlobalId }),
                    ...(user.role === 'dokter' && { doctorGlobalId: profileGlobalId }),
                    
                    [uniqueIdColumnName]: profileData[uniqueIdColumnName], 
                    name: profileData.nama, 
                    ...(user.role === 'dokter' && { specialization: profileData.spesialisasi, phoneNumber: profileData.nomor_telepon, address: profileData.alamat }),
                    ...(user.role === 'pasien' && { dateOfBirth: profileData.tanggal_lahir, gender: profileData.jenis_kelamin, phoneNumber: profileData.nomor_telepon, address: profileData.alamat }),
                    ...(user.role === 'keluarga' && { phoneNumber: profileData.nomor_telepon, address: profileData.alamat }),
                };
            }
        }
        res.json({
            message: 'Login berhasil.',
            token,
            user: {
                id: user.id, // ID dari tabel users
                username: user.username,
                role: user.role,
                ...profileDetails 
            }
        });
    } catch (err) {
        console.error('Error saat login:', err);
        res.status(500).json({ message: 'Terjadi kesalahan saat login.' });
    }
};