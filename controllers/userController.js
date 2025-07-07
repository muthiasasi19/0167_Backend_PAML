const { query } = require('../config/database');

exports.getProfile = async (req, res) => {
    const userId = req.user.id; 
    const userRole = req.user.role; 

    try {
        // Ambil data dasar user dari tabel users
        const basicUser = await query('SELECT id, username, role FROM users WHERE id = ?', [userId]);
        if (basicUser.length === 0) {
            return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
        }
        const user = basicUser[0];

        // Ambil detail profil spesifik berdasarkan role
        let profileDetails = {};
        let profileTableName;
        let uniqueIdColumnName;

        switch (userRole) {
            case 'dokter':
                profileTableName = 'dokter';
                uniqueIdColumnName = 'id_dokter';
                break;
            case 'pasien':
                profileTableName = 'pasien';
                uniqueIdColumnName = 'id_pasien';
                break;
            case 'keluarga':
                profileTableName = 'keluarga';
                uniqueIdColumnName = 'id_keluarga';
                break;
            default:
                console.warn('Role tidak dikenal saat mengambil profil:', userRole);
                return res.status(400).json({ message: 'Role pengguna tidak valid.' });
        }

        const profile = await query(`SELECT * FROM ${profileTableName} WHERE id_user = ?`, [userId]);

        if (profile.length > 0) {
            profileDetails = {
                [uniqueIdColumnName]: profile[0][uniqueIdColumnName],
                name: profile[0].nama, // Menggunakan 'name' di frontend
                ...(userRole === 'dokter' && { specialization: profile[0].spesialisasi, phoneNumber: profile[0].nomor_telepon, address: profile[0].alamat }),
                ...(userRole === 'pasien' && { dateOfBirth: profile[0].tanggal_lahir, gender: profile[0].jenis_kelamin, phoneNumber: profile[0].nomor_telepon, address: profile[0].alamat }),
                ...(userRole === 'keluarga' && { phoneNumber: profile[0].nomor_telepon, address: profile[0].alamat }),
            };
        }

        // Gabungkan data dasar user dengan detail profil
        const responseProfile = { ...user, ...profileDetails };

        res.status(200).json(responseProfile);

    } catch (err) {
        console.error('Error saat mengambil profil:', err);
        res.status(500).json({ message: 'Gagal mengambil data profil.' });
    }
};