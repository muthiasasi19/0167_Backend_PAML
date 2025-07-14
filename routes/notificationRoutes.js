const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middlewares/authMiddleware');

// Rute untuk menambah jadwal notifikasi (hanya dokter)
router.post('/schedules', auth.verifyToken, auth.authorizeRoles(['dokter']), notificationController.addNotificationSchedule);

// Rute untuk memperbarui jadwal notifikasi (hanya dokter)
router.put('/schedules/:id', auth.verifyToken, auth.authorizeRoles(['dokter']), notificationController.updateNotificationSchedule);

// Rute untuk mengambil jadwal notifikasi berdasarkan obat dan pasien (hanya dokter)
router.get('/schedules/medication/:medicationGlobalId/patient/:patientGlobalId', auth.verifyToken, auth.authorizeRoles(['dokter']), notificationController.getNotificationSchedulesForMedicationAndPatient);

// Rute untuk mengambil semua jadwal notifikasi yang relevan untuk pengguna (pasien/keluarga)
router.get('/schedules/user', auth.verifyToken, auth.authorizeRoles(['pasien', 'keluarga']), notificationController.getNotificationSchedulesForUser);

// Rute untuk menghapus jadwal notifikasi (hanya dokter)
router.delete('/schedules/:id', auth.verifyToken, auth.authorizeRoles(['dokter']), notificationController.deleteNotificationSchedule);

module.exports = router;
