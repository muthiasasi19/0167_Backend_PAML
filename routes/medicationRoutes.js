const express = require('express');
const router = express.Router();
const medicationController = require('../controllers/medicationController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const multer = require('multer'); 
const path = require('path');



const storage = multer.diskStorage({ 
    destination: (req, file, cb) => { 
        cb(null, path.join(__dirname, '..', 'uploads')); 
    },
    filename: (req, file, cb) => { 
        cb(null, 'medication-' + Date.now() + path.extname(file.originalname)); // PERUBAHAN KAMERA
    }
});

//  fileFilter untuk validasi tipe file
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Hanya file gambar yang diizinkan!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter, 
   // limits: { fileSize: 5 * 1024 * 1024 } //ukuran file
});


// Rute untuk Manajemen Obat (CRUD) - Khusus Dokter
// Menambahkan obat baru untuk pasien tertentu
router.post(
    '/obat/:patientUniqueId',
    verifyToken,
    authorizeRoles(['dokter']),
    upload.single('photo'),
    medicationController.addMedication
);

// Endpoint untuk DOKTER melihat obat terjadwal pasien tertentu
router.get(
    '/medications/patient/:patientUniqueId/scheduled',
    verifyToken,
    authorizeRoles(['dokter']),
    medicationController.getScheduledMedicationsForPatientByDoctor
);

router.get(
    '/medications/patient/:patientUniqueId/all', 
    verifyToken,
    authorizeRoles(['dokter']),
    medicationController.getMedicationsByPatient 
);



// Endpoint untuk melihat RIWAYAT KONSUMSI (digunakan oleh pasien & dokter & keluarga)
router.get(
    '/medications/patient/:patientUniqueId/history',
    verifyToken,
    authorizeRoles(['pasien', 'dokter', 'keluarga']), 
    medicationController.getMedicationHistoryForPatient
);

// Endpoint untuk PASIEN DAN KELUARGA melihat obat hari ini
router.get(
    '/medications/today', 
    verifyToken,
    authorizeRoles(['pasien', 'keluarga']), 
    medicationController.getTodaysMedicationsForPatient
);


// Mengupdate obat berdasarkan ID global obat
router.put(
    '/obat/:medicationGlobalId',
    verifyToken,
    authorizeRoles(['dokter']),
    upload.single('photo'),
    medicationController.updateMedication
);

// Menghapus obat berdasarkan ID global obat
router.delete(
    '/obat/:medicationGlobalId',
    verifyToken,
    authorizeRoles(['dokter']),
    medicationController.deleteMedication
);

// Rute untuk Melihat Daftar Obat Pasien (Dokter, Pasien, Keluarga)
router.get(
    '/obat/:patientUniqueId',
    verifyToken,
    authorizeRoles(['dokter', 'pasien', 'keluarga']),
    medicationController.getMedicationsByPatient
);

// Rute untuk Riwayat Konsumsi Obat (Dokter, Pasien, Keluarga)
router.get(
    '/riwayat-konsumsi/:patientUniqueId',
    verifyToken,
    authorizeRoles(['dokter', 'pasien', 'keluarga']),
    medicationController.getConsumptionHistory
);

// Rute untuk Menandai Konsumsi Obat (Pasien, Dokter, Keluarga)

router.post(
    '/riwayat-konsumsi/:medicationGlobalId',
    verifyToken,
    authorizeRoles(['dokter', 'pasien', 'keluarga']),
    medicationController.markConsumption
);

module.exports = router;