    const express = require('express');
    const router = express.Router();
    const familyController = require('../controllers/familyController');
    const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware'); 

    // Route untuk keluarga menghubungkan diri dengan pasien
    router.post(
        '/connect-to-patient', 
        verifyToken, 
        authorizeRoles(['keluarga']), 
        familyController.connectPatientToFamily
    );

    // Route untuk mendapatkan daftar pasien yang terhubung dengan keluarga
    router.get(
        '/my-connected-patients', 
        verifyToken, 
        authorizeRoles(['keluarga']), 
        familyController.getConnectedPatientsForFamily
    );

    // Route untuk mendapatkan daftar obat pasien tertentu yang terhubung
    router.get(
        '/patients/:patientGlobalId/medications', 
        verifyToken, 
        authorizeRoles(['keluarga']), 
        familyController.getPatientMedicationsForFamily
    );

    // Route untuk mendapatkan riwayat konsumsi obat pasien tertentu yang terhubung
    router.get(
        '/patients/:patientGlobalId/medication-history', 
        verifyToken, 
        authorizeRoles(['keluarga']), 
        familyController.getPatientMedicationHistoryForFamily
    );

    // Route untuk mendapatkan lokasi terakhir pasien tertentu yang terhubung
    router.get(
        '/patients/:patientGlobalId/location', 
        verifyToken, 
        authorizeRoles(['keluarga']), 
        familyController.getPatientLastLocationForFamily
    );

    module.exports = router;
    