const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController'); 
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Rute untuk mencari pasien terhubung berdasarkan nama
router.get(
    '/pasien/terhubung/cari',
    verifyToken,
    authorizeRoles(['dokter']),
    patientController.searchConnectedPatientsByName
);

//Profile pasien
router.get(
    '/profile', // Endpoint baru untuk profil pasien
    verifyToken,
    authorizeRoles(['pasien']), // Hanya role 'pasien' yang bisa mengakses
    patientController.getPatientProfile // Mengarahkan ke fungsi controller yang baru ditambahkan
);

// Rute untuk menghubungkan dokter dengan pasien
router.post(
    '/doctor/connect-patient',
    verifyToken,
    authorizeRoles(['dokter']),
    patientController.connectPatient
);

// Rute untuk mendapatkan daftar pasien yang terhubung dengan dokter
router.get(
    '/doctor/patients',
    verifyToken,
    authorizeRoles(['dokter']),
    patientController.getDoctorPatients
);

//  rute yang akan digunakan pasien  untuk memeriksa status koneksinya
router.get(
    '/patient/connected-doctor',
    verifyToken,
    authorizeRoles(['pasien']), 
    patientController.getConnectedDoctorForPatient
);

module.exports = router;