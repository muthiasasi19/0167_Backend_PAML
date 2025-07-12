// BECKEND_ASISTENOBAT/routes/doctorRoutes.js

const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Route untuk mendapatkan profil dokter yang sedang login.
router.get('/profile', verifyToken, authorizeRoles(['dokter']), doctorController.getDoctorProfile);

// Route untuk mendapatkan daftar pasien yang terhubung dengan dokter ini.
router.get('/my-connected-patients', verifyToken, authorizeRoles(['dokter']), doctorController.getConnectedPatientsForDoctor);

// Route untuk menghubungkan pasien dengan dokter.
router.post('/connect-patient', verifyToken, authorizeRoles(['dokter']), doctorController.connectPatient);

// Route untuk memutuskan koneksi pasien dari dokter.
router.delete('/disconnect-patient/:patientUniqueId', verifyToken, authorizeRoles(['dokter']), doctorController.disconnectPatient);

// PERUBAHAN UNTUK NOTIFIKASI: Route untuk mendapatkan ID global dokter dari ID uniknya (digunakan oleh frontend).
router.get('/global-id', verifyToken, authorizeRoles(['dokter']), doctorController.getDoctorGlobalIdFromUniqueId);
// SAMPAI SINIH

module.exports = router;