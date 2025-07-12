// BECKEND_ASISTENOBAT/routes/notificationRoutes.js

// Import Express router.
const express = require('express');
const router = express.Router();
// Import notificationController yang baru dibuat.
const notificationController = require('../controllers/notificationController'); 
// Import middleware autentikasi dan otorisasi.
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');

// PERUBAHAN UNTUK NOTIFIKASI: Rute untuk membuat jadwal notifikasi obat.
router.post('/schedules', verifyToken, authorizeRoles(['dokter']), notificationController.createNotificationSchedule);

// PERUBAHAN UNTUK NOTIFIKASI: Rute untuk mendapatkan jadwal notifikasi user yang sedang login.
// Ini adalah endpoint umum untuk pasien, keluarga, dan dokter untuk melihat jadwal mereka.
router.get('/schedules/my-schedules', verifyToken, authorizeRoles(['pasien', 'keluarga', 'dokter']), notificationController.getMyNotificationSchedules);

// PERUBAHAN UNTUK NOTIFIKASI: Rute untuk mendapatkan jadwal notifikasi spesifik per obat dan pasien.
// Ini akan digunakan saat dokter menekan ikon lonceng di MedicationPage.
router.get('/schedules/medication/:medicationGlobalId/patient/:patientGlobalId', verifyToken, authorizeRoles(['dokter', 'pasien', 'keluarga']), notificationController.getNotificationSchedulesForMedicationAndPatient);


// PERUBAHAN UNTUK NOTIFIKASI: Rute untuk mengupdate jadwal notifikasi.
router.put('/schedules/:id', verifyToken, authorizeRoles(['dokter']), notificationController.updateNotificationSchedule);

// PERUBAHAN UNTUK NOTIFIKASI: Rute untuk menghapus jadwal notifikasi.
router.delete('/schedules/:id', verifyToken, authorizeRoles(['dokter']), notificationController.deleteNotificationSchedule);

// PERUBAHAN UNTUK NOTIFIKASI: Rute untuk menyimpan FCM token user.
router.post('/users/fcm-token', verifyToken, notificationController.updateFCMToken);
// SAMPAI SINIH

// Export router.
module.exports = router;