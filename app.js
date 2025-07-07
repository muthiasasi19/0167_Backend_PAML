require('dotenv').config();

const express = require('express');
const app = express();
const { pool } = require('./config/database'); 
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/userRoutes'); 
const obatRoutes = require('./routes/medicationRoutes'); 
const cors = require('cors');
const patientRoutes = require('./routes/patientRoutes'); 
const familyRoutes = require('./routes/familyRoutes');

// Middleware
app.use(cors()); 
app.use(express.json()); // Untuk parsing JSON body
app.use(express.urlencoded({ extended: true })); 

// Fungsi asynchronous untuk menguji koneksi database dan memulai server
async function startServer() {
    try {
        // Coba mendapatkan koneksi dari pool untuk menguji database
        const connection = await pool.getConnection();
        console.log('✅ Berhasil konek ke database MySQL');
        connection.release(); // Lepaskan koneksi kembali ke pool setelah tes

        // Rute-rute aplikasi (akan di-load setelah koneksi database sukses)
        app.use('/api/auth', authRoutes); // Routing untuk auth (register, login, dll)
        app.use('/api/user', userRoutes); // Rute user umum (contoh: /api/user/profile)
        app.use('/api', obatRoutes); // Rute untuk manajemen obat dan riwayat konsumsi
        app.use('/api', patientRoutes); 
        app.use('/api/family', familyRoutes); 
        // Rute dasar
        app.get('/', (req, res) => {
            res.send('🚀 Backend Asisten Obat aktif');
        });

        // Jalankan server
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`📡 Server jalan di http://localhost:${PORT} `);
        });

    } catch (err) {
        console.error('❌ Gagal konek ke database atau memulai server:', err.message);
        process.exit(1);
    }
}

startServer();