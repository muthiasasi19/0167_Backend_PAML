    const { query } = require('../config/database');
    const bcrypt = require('bcryptjs'); 

    class User {
        // Fungsi untuk membuat user baru (register)
        // Menyimpan username, password (hashed), dan role ke tabel `users`
        static async create(username, password, role) {
            const hashedPassword = await bcrypt.hash(password, 10);
            const sql = `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`;
            const params = [username, hashedPassword, role];
            const result = await query(sql, params);
            return { id: result.insertId, username, role };
        }

        // Fungsi untuk mencari user berdasarkan username (untuk login)
        static async findByUsername(username) {
            const sql = `SELECT * FROM users WHERE username = ?`;
            const result = await query(sql, [username]);
            return result[0];
        }

        // Fungsi untuk mencari user berdasarkan ID internal dari tabel `users`
        static async findById(id) {
            const sql = `SELECT * FROM users WHERE id = ?`;
            const result = await query(sql, [id]);
            return result[0];
        }

        // Fungsi untuk memverifikasi password
        static async comparePassword(plainPassword, hashedPassword) {
            return bcrypt.compare(plainPassword, hashedPassword);
        }

        static async createRoleSpecificUser(userId, role, details) {
            let sql, params, generatedUniqueId = '';

            // Generate ID unik untuk role spesifik (PSN, DKR, KLG)
            const timestampPart = Date.now().toString().slice(-10); 
            const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0'); 

            switch (role) {
                case 'pasien':
                    generatedUniqueId = 'PSN' + timestampPart + randomPart;
                    sql = `INSERT INTO pasien (id_user, id_pasien, nama, tanggal_lahir, jenis_kelamin, nomor_telepon, alamat) VALUES (?, ?, ?, ?, ?, ?, ?)`;
                    params = [
                        userId, generatedUniqueId, details.nama, details.tanggalLahir, 
                        details.jenisKelamin, details.nomorTelepon, details.alamat
                    ];
                    break;
                case 'dokter':
                    generatedUniqueId = 'DKR' + timestampPart + randomPart;
                    sql = `INSERT INTO dokter (id_user, id_dokter, nama, spesialisasi, nomor_telepon, alamat) VALUES (?, ?, ?, ?, ?, ?)`;
                    params = [
                        userId, generatedUniqueId, details.nama, details.spesialisasi, 
                        details.nomorTelepon, details.alamat
                    ];
                    break;
                case 'keluarga':
                    generatedUniqueId = 'KLG' + timestampPart + randomPart;
                    sql = `INSERT INTO keluarga (id_user, id_keluarga, nama, nomor_telepon, alamat) VALUES (?, ?, ?, ?, ?)`;
                    params = [
                        userId, generatedUniqueId, details.nama, details.nomorTelepon, details.alamat
                    ];
                    break;
                default:
                    throw new Error('Role tidak valid');
            }

            const result = await query(sql, params);
            return { id: result.insertId, uniqueId: generatedUniqueId };
        }
    }

    module.exports = User;
    