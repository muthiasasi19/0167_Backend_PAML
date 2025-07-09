const Obat = require('../models/medication');
const { query } = require('../config/database');
const MedicationHistory = require('../models/MedicationHistory');

const TOLERANCE_MINUTES_BEFORE_MISSED = 60; // Toleransi waktu 60 menit (1 jam) setelah jadwal untuk dianggap pending/belum terlewat
const TOLERANCE_MINUTES_AFTER_SCHEDULED = 30; // Toleransi waktu 30 menit setelah jadwal untuk dianggap tepat waktu


// Fungsi untuk Mendapatkan ID Global (INT) Pasien dari ID Unik (VARCHAR)
async function getPatientGlobalIdFromUniqueId(patientUniqueId) {
    const result = await query('SELECT id FROM pasien WHERE id_pasien = ?', [patientUniqueId]);
    if (result.length > 0) {
        return result[0].id;
    }
    return null;
}

async function getDoctorIdByUserId(userId) {
    const result = await query('SELECT id FROM dokter WHERE id_user = ?', [userId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

async function getPatientIdByUserId(userId) {
    const result = await query('SELECT id FROM pasien WHERE id_user = ?', [userId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

async function getFamilyIdByUserId(userId) {
    const result = await query('SELECT id FROM keluarga WHERE id_user = ?', [userId]);
    if (result.length > 0) { return result[0].id; }
    return null;
}

// Tambah obat baru untuk pasien
// route   POST /api/obat/:patientUniqueId
exports.addMedication = async (req, res) => {
    try {
        const { patientUniqueId } = req.params;
        const { medicationName, dosage, schedule, description, photoUrl } = req.body;

        if (!patientUniqueId || !medicationName || !dosage || !schedule || typeof schedule !== 'object' || !schedule.type) {
            return res.status(400).json({ message: 'ID Pasien, nama obat, dosis, dan jadwal (object dengan type) diperlukan.' });
        }

        const patientGlobalId = await getPatientGlobalIdFromUniqueId(patientUniqueId);
        if (!patientGlobalId) {
            return res.status(404).json({ message: 'Pasien dengan ID unik tersebut tidak ditemukan.' });
        }

        const doctorUserId = req.user.id;
        const doctorGlobalId = await getDoctorIdByUserId(doctorUserId);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const relation = await query(
            'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
            [doctorGlobalId, patientGlobalId]
        );
        if (relation.length === 0) {
            return res.status(403).json({ message: 'Dokter tidak diotorisasi untuk menambah obat bagi pasien ini.' });
        }

        const newMedication = await Obat.create(
            patientGlobalId,
            doctorGlobalId,
            medicationName,
            dosage,
            schedule, 
            description,
            photoUrl
        );

        res.status(201).json({
            message: 'Obat berhasil ditambahkan',
            data: {
                id: newMedication.id,
                patientId: newMedication.idPasien,
                doctorId: newMedication.idDokter,
                medicationName: newMedication.namaObat,
                dosage: newMedication.dosis,
                schedule: newMedication.jadwal,
                description: newMedication.deskripsi,
                photoUrl: newMedication.fotoObatUrl,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
        });
    } catch (error) {
        console.error('Error saat menambah obat:', error);
        res.status(500).json({ message: 'Kesalahan server saat menambah obat.' });
    }
};

exports.getTodaysMedicationsForPatient = async (req, res) => {
    try {
        const loggedInUser = req.user;

        let targetPatientGlobalId = null;
        let isAuthorized = false;

        if (loggedInUser.role === 'pasien') {
            const currentPatientGlobalId = await getPatientIdByUserId(loggedInUser.id);
            if (currentPatientGlobalId) {
                targetPatientGlobalId = currentPatientGlobalId;
                isAuthorized = true;
            }
        } else if (loggedInUser.role === 'keluarga') {
            const familyGlobalId = await getFamilyIdByUserId(loggedInUser.id);
            if (familyGlobalId) {
                const relations = await query(
                    'SELECT id_pasien FROM relasi_pasien_keluarga WHERE id_keluarga = ?',
                    [familyGlobalId]
                );
                if (relations.length > 0) {
                    targetPatientGlobalId = relations[0].id_pasien;
                    isAuthorized = true;
                }
            }
        }

        if (!isAuthorized || !targetPatientGlobalId) {
            return res.status(403).json({ message: 'Akses ditolak: Anda tidak diotorisasi untuk melihat obat hari ini.' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const now = new Date(); // Waktu saat ini
        
        const prescribedMedications = await Obat.findAllByPatientId(targetPatientGlobalId);

        const scheduledSessions = [];

        for (const med of prescribedMedications) {
            let parsedJadwal = {};
            try {
                parsedJadwal = med.jadwal;
            } catch (e) {
                console.error('Error parsing jadwal for medication ID (getTodaysMedicationsForPatient loop):', med.id, e);
                parsedJadwal = { type: 'unknown', notes: String(med.jadwal) };
            }

            // Fungsi untuk mengambil semua riwayat untuk obat dan pasien untuk hari ini
            const allTodayConsumptionRecordsForMed = await MedicationHistory.findTodayByMedicationAndPatient(med.id, targetPatientGlobalId);

            
            if (parsedJadwal.type === 'daily_fixed_times' && parsedJadwal.times && parsedJadwal.times.length > 0) {
                for (const timeStr of parsedJadwal.times) {
                    const [hour, minute] = timeStr.split(':').map(Number);
                    const sessionDateTime = new Date(today);
                    sessionDateTime.setHours(hour, minute, 0, 0);

                    let status = 'pending';
                    let isTaken = false;
                    let consumptionRecordId = null;
                    let consumptionTime = null;
                    let consumptionNotes = null;

                    const takenRecord = allTodayConsumptionRecordsForMed.find(r => {
                        return r.status === 'taken' && 
                               r.scheduled_time === timeStr; 
                    });

                    if (takenRecord) {
                        status = 'Diminum'; 
                        isTaken = true; 
                        consumptionRecordId = takenRecord.id;
                        consumptionTime = takenRecord.waktu_konsumsi;
                        consumptionNotes = takenRecord.catatan;
                    } else {
                        const timeDifferenceMs = now.getTime() - sessionDateTime.getTime();
                        const timeDifferenceMinutes = Math.floor(timeDifferenceMs / (1000 * 60));

                        if (timeDifferenceMinutes > TOLERANCE_MINUTES_BEFORE_MISSED && timeDifferenceMs > 0) { 
                            status = 'Terlewat'; 
                            isTaken = false;
                        } else { 
                            status = 'Menunggu'; 
                            isTaken = false;
                        }
                    }
                    
                    scheduledSessions.push({
                        medicationId: med.id,
                        medicationName: med.nama_obat,
                        dosage: med.dosis,
                        description: med.deskripsi,
                        photoUrl: med.foto_obat_url,
                        scheduleType: parsedJadwal.type,
                        scheduledTime: timeStr,
                        consumptionRecordId: consumptionRecordId,
                        isTaken: isTaken,
                        status: status,
                        consumptionTime: consumptionTime,
                        consumptionNotes: consumptionNotes,
                    });
                }
            } else { 

                const takenPrnRecord = allTodayConsumptionRecordsForMed.find(r => r.status === 'taken' && r.id_obat === med.id);
                let currentStatus = takenPrnRecord ? 'Diminum' : 'Menunggu'; 
                let isTaken = takenPrnRecord ? true : false;
                let consumptionRecordId = takenPrnRecord ? takenPrnRecord.id : null;
                let consumptionTime = takenPrnRecord ? takenPrnRecord.waktu_konsumsi : null;
                let consumptionNotes = takenPrnRecord ? takenPrnRecord.catatan : null;
                
                const todayDayOfWeek = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][today.getDay()];
                if (parsedJadwal.type === 'specific_days_of_week' && parsedJadwal.daysOfWeek && !parsedJadwal.daysOfWeek.includes(todayDayOfWeek)) { // Menambahkan null check untuk daysOfWeek
                    continue;
                }


                scheduledSessions.push({
                    medicationId: med.id,
                    medicationName: med.nama_obat,
                    dosage: med.dosis,
                    description: med.deskripsi,
                    photoUrl: med.foto_obat_url,
                    scheduleType: parsedJadwal.type, 
                    scheduledTime: null, 
                    consumptionRecordId: consumptionRecordId, 
                    isTaken: isTaken,
                    status: currentStatus,
                    consumptionTime: consumptionTime,
                    consumptionNotes: consumptionNotes, 
                });
            }
        }

        scheduledSessions.sort((a, b) => {
            if (a.scheduledTime && b.scheduledTime) {
                return a.scheduledTime.localeCompare(b.scheduledTime);
            }
            if (a.scheduledTime && !b.scheduledTime) return -1; 
            if (!a.scheduledTime && b.scheduledTime) return 1;
            return a.medicationName.localeCompare(b.medicationName); 
        });

        res.status(200).json({ message: 'Jadwal obat hari ini berhasil dimuat.', data: scheduledSessions });
    } catch (error) {
        console.error('Error saat mengambil obat hari ini untuk pasien:', error);
        res.status(500).json({ message: 'Kesalahan server saat memuat obat hari ini.' });
    }
};

//Tandai konsumsi obat 
exports.markConsumption = async (req, res) => {
    try {
        const { medicationGlobalId } = req.params;
        const { status, notes, scheduledTime } = req.body; 
        if (!status || !['taken', 'missed', 'pending'].includes(status)) { 
            return res.status(400).json({ message: 'Status (taken/missed/pending) diperlukan.' });
        }

        const medication = await Obat.findById(medicationGlobalId);

        if (!medication) {
            return res.status(404).json({ message: 'Obat tidak ditemukan.' });
        }
        const patientGlobalId = medication.id_pasien;

        const loggedInUser = req.user; 

        let isAuthorized = false;
        if (loggedInUser.role === 'pasien') {
            const currentPatientGlobalId = await getPatientIdByUserId(loggedInUser.id);
            if (currentPatientGlobalId && currentPatientGlobalId === patientGlobalId) {
                isAuthorized = true;
            }
        } else if (loggedInUser.role === 'dokter') {
            const doctorGlobalId = await getDoctorIdByUserId(loggedInUser.id);
            if (doctorGlobalId) {
                const relation = await query(
                    'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
                    [doctorGlobalId, patientGlobalId]
                );
                if (relation.length > 0) { isAuthorized = true; }
            }
        } else if (loggedInUser.role === 'keluarga') {
            const familyUserId = loggedInUser.id;
            const familyGlobalId = await getFamilyIdByUserId(familyUserId);
            if (familyGlobalId) {
                const relation = await query(
                    'SELECT * FROM relasi_pasien_keluarga WHERE id_pasien = ? AND id_keluarga = ?',
                    [patientGlobalId, familyGlobalId]
                );
                if (relation.length > 0) { isAuthorized = true; }
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: 'Tidak diotorisasi untuk menandai konsumsi untuk pasien ini.' });
        }

        let consumptionDateTime = new Date();
        let finalNotes = notes || null;

        // Logika untuk scheduledTime, notes keterlambatan, dan penanganan undo (status 'pending')
        if (medication.jadwal.type === 'daily_fixed_times' && scheduledTime) { 
            const [hour, minute] = scheduledTime.split(':').map(Number);
            const scheduledDate = new Date(); 
            scheduledDate.setHours(hour, minute, 0, 0); // Set jam dan menit sesuai jadwal

            const existingRecord = await MedicationHistory.findByMedicationPatientAndDateTime(
                medicationGlobalId, patientGlobalId, scheduledDate, scheduledTime 
            );

            if (status === 'taken') {
                const timeDifferenceMs = consumptionDateTime.getTime() - scheduledDate.getTime();
                const timeDifferenceMinutes = Math.floor(timeDifferenceMs / (1000 * 60));

                if (timeDifferenceMinutes > TOLERANCE_MINUTES_AFTER_SCHEDULED) {
                    const hoursLate = Math.floor(timeDifferenceMinutes / 60);
                    const minutesLate = timeDifferenceMinutes % 60;
                    let lateMessage = "";
                    if (hoursLate > 0) {
                        lateMessage += `${hoursLate} jam `;
                    }
                    if (minutesLate > 0) {
                        lateMessage += `${minutesLate} menit`;
                    }
                    if (lateMessage) {
                        finalNotes = (notes ? `${notes} - ` : '') + `Diminum terlambat ${lateMessage.trim()}`;
                    } else {
                        finalNotes = (notes ? `${notes} - ` : '') + `Diminum tepat waktu`;
                    }
                } else if (timeDifferenceMinutes < -TOLERANCE_MINUTES_AFTER_SCHEDULED) {
                     const hoursEarly = Math.floor(Math.abs(timeDifferenceMinutes) / 60);
                     const minutesEarly = Math.abs(timeDifferenceMinutes) % 60;
                     let earlyMessage = "";
                     if (hoursEarly > 0) {
                         earlyMessage += `${hoursEarly} jam `;
                     }
                     if (minutesEarly > 0) {
                         earlyMessage += `${minutesEarly} menit`;
                     }
                     if (earlyMessage) {
                         finalNotes = (notes ? `${notes} - ` : '') + `Diminum lebih awal ${earlyMessage.trim()}`;
                     } else {
                        finalNotes = (notes ? `${notes} - ` : '') + `Diminum tepat waktu`;
                     }
                } else {
                    finalNotes = (notes ? `${notes} - ` : '') + `Diminum tepat waktu`;
                }
                
                if (existingRecord) {
                    const updateSuccess = await MedicationHistory.update(
                        existingRecord.id, 
                        status,
                        finalNotes,
                        consumptionDateTime,
                        scheduledTime 
                    );
                    if (!updateSuccess) {
                        console.error('Failed to update existing consumption record.');
                        return res.status(500).json({ message: 'Gagal memperbarui status konsumsi obat.' });
                    }
                    return res.status(200).json({ message: 'Konsumsi berhasil diperbarui.', id: existingRecord.id, consumptionRecord: { ...existingRecord, status, catatan: finalNotes, waktu_konsumsi: consumptionDateTime, scheduled_time: scheduledTime } });
                } else {
                    const result = await MedicationHistory.create(
                        medicationGlobalId,
                        patientGlobalId,
                        status,
                        finalNotes,
                        consumptionDateTime,
                        scheduledTime 
                    );
                    return res.status(201).json({ message: 'Konsumsi berhasil ditandai.', id: result.id, consumptionRecord: result });
                }

            } else if (status === 'missed') {
                if (existingRecord) {
                    const updateSuccess = await MedicationHistory.update(
                        existingRecord.id,
                        status, 
                        finalNotes, 
                        consumptionDateTime,
                        scheduledTime 
                    );
                    if (!updateSuccess) {
                        console.error('Failed to update existing consumption record to missed.');
                        return res.status(500).json({ message: 'Gagal memperbarui status konsumsi obat.' });
                    }
                    return res.status(200).json({ message: 'Konsumsi berhasil diperbarui menjadi terlewat.', id: existingRecord.id, consumptionRecord: { ...existingRecord, status, catatan: finalNotes, waktu_konsumsi: consumptionDateTime, scheduled_time: scheduledTime } });
                } else {
                    return res.status(200).json({ message: 'Status obat diperbarui.', consumptionRecord: null }); 
                }
            } else if (status === 'pending') {
                if (existingRecord) {
                    const deleteSuccess = await MedicationHistory.delete(existingRecord.id);
                    if (!deleteSuccess) {
                        console.error('Failed to delete consumption record on undo.');
                        return res.status(500).json({ message: 'Gagal membatalkan status konsumsi obat.' });
                    }
                    return res.status(200).json({ message: 'Status konsumsi dibatalkan.', id: existingRecord.id, consumptionRecord: null });
                } else {
                    return res.status(200).json({ message: 'Status sudah pending atau tidak ada record untuk dibatalkan.', consumptionRecord: null });
                }
            }

        } else { 
            const todayStart = new Date();
            todayStart.setHours(0,0,0,0);
            const todayEnd = new Date();
            todayEnd.setHours(23,59,59,999);

            const existingPrnRecords = await MedicationHistory.findBetweenDatesByMedicationAndPatient(
                medicationGlobalId, patientGlobalId, todayStart, todayEnd
            );
            const existingPrnRecord = existingPrnRecords.find(r => r.id_obat === medicationGlobalId);


            if (status === 'taken') {
                if (existingPrnRecord) {
                    const updateSuccess = await MedicationHistory.update(
                        existingPrnRecord.id,
                        status,
                        finalNotes,
                        consumptionDateTime,
                        null 
                    );
                    if (!updateSuccess) {
                        console.error('Failed to update existing PRN consumption record.');
                        return res.status(500).json({ message: 'Gagal memperbarui status konsumsi obat PRN.' });
                    }
                    return res.status(200).json({ message: 'Konsumsi PRN berhasil diperbarui.', id: existingPrnRecord.id, consumptionRecord: { ...existingPrnRecord, status, catatan: finalNotes, waktu_konsumsi: consumptionDateTime, scheduled_time: null } });
                } else {
                    const result = await MedicationHistory.create(
                        medicationGlobalId,
                        patientGlobalId,
                        status,
                        finalNotes,
                        consumptionDateTime,
                        null 
                    );
                    return res.status(201).json({ message: 'Konsumsi PRN berhasil ditandai.', id: result.id, consumptionRecord: result });
                }
            } else if (status === 'missed' || status === 'pending') { 
                if (existingPrnRecord && existingPrnRecord.status === 'taken') {
                    const deleteSuccess = await MedicationHistory.delete(existingPrnRecord.id);
                    if (!deleteSuccess) {
                        console.error('Failed to delete PRN consumption record on undo/missed.');
                        return res.status(500).json({ message: 'Gagal membatalkan/menandai terlewat status konsumsi obat PRN.' });
                    }
                    return res.status(200).json({ message: 'Status konsumsi PRN dibatalkan/diubah.', id: existingPrnRecord.id, consumptionRecord: null });
                } else {
                    return res.status(200).json({ message: 'Status PRN sudah pending/missed atau tidak ada record untuk dibatalkan/diubah.', consumptionRecord: null });
                }
            }
        }

    } catch (error) {
        console.error('Error saat menandai konsumsi:', error);
        res.status(500).json({ message: 'Kesalahan server saat menandai konsumsi.' });
    }
};

exports.getScheduledMedicationsForPatientByDoctor = async (req, res) => {
    try {
        const { patientUniqueId } = req.params;
        const loggedInUser = req.user;

        if (loggedInUser.role !== 'dokter') {
            return res.status(403).json({ message: 'Akses ditolak: Hanya dokter yang dapat melihat jadwal obat pasien.' });
        }

        const patientGlobalId = await getPatientGlobalIdFromUniqueId(patientUniqueId);
        if (!patientGlobalId) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan.' });
        }

        const doctorGlobalId = await getDoctorIdByUserId(loggedInUser.id);
        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const relation = await query(
            'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
            [doctorGlobalId, patientGlobalId]
        );
        if (relation.length === 0) {
            return res.status(403).json({ message: 'Anda tidak diotorisasi untuk melihat obat pasien ini.' });
        }

        // Panggil findAllByPatientId dari model Obat
        const medications = await Obat.findAllByPatientId(patientGlobalId);

        const formattedMedications = medications.map(med => ({
            id: med.id,
            patientId: med.id_pasien,
            medicationName: med.nama_obat,
            dosage: med.dosis,
            schedule: med.jadwal, 
            description: med.deskripsi,
            photoUrl: med.foto_obat_url,
        }));

        res.status(200).json({ message: 'Obat terjadwal berhasil dimuat.', data: formattedMedications });
    } catch (error) {
        console.error('Error saat mengambil obat terjadwal untuk dokter:', error);
        res.status(500).json({ message: 'Kesalahan server saat memuat obat terjadwal.' });
    }
};

exports.getMedicationHistoryForPatient = async (req, res) => {
    try {
        const { patientUniqueId } = req.params;
        const loggedInUser = req.user;

        const patientGlobalId = await getPatientGlobalIdFromUniqueId(patientUniqueId);
        if (!patientGlobalId) {
            return res.status(404).json({ message: 'Pasien dengan ID unik tersebut tidak ditemukan.' });
        }

        let isAuthorized = false;
        if (loggedInUser.role === 'dokter') {
            const doctorGlobalId = await getDoctorIdByUserId(loggedInUser.id);
            if (doctorGlobalId) {
                const relation = await query(
                    'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
                    [doctorGlobalId, patientGlobalId]
                );
                if (relation.length > 0) { isAuthorized = true; }
            }
        } else if (loggedInUser.role === 'pasien') {
            const currentPatientGlobalId = await getPatientIdByUserId(loggedInUser.id);
            if (currentPatientGlobalId && currentPatientGlobalId === patientGlobalId) {
                isAuthorized = true;
            }
        } else if (loggedInUser.role === 'keluarga') {
            const familyGlobalId = await getFamilyIdByUserId(loggedInUser.id);
            if (familyGlobalId) {
                const relation = await query(
                    'SELECT * FROM relasi_pasien_keluarga WHERE id_pasien = ? AND id_keluarga = ?',
                    [patientGlobalId, familyGlobalId]
                );
                if (relation.length > 0) { isAuthorized = true; }
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: 'Tidak diotorisasi untuk melihat riwayat konsumsi pasien ini.' });
        }
        const sql = `
            SELECT rk.*, o.nama_obat, o.dosis, o.jadwal
            FROM riwayat_konsumsi rk
            JOIN obat o ON rk.id_obat = o.id
            WHERE rk.id_pasien = ?
            ORDER BY rk.waktu_konsumsi DESC
        `;
        const history = await query(sql, [patientGlobalId]);

        const formattedHistory = history.map(item => {
            let parsedJadwal = {};
            try {
                if (typeof item.jadwal === 'string' && item.jadwal.trim().startsWith('{')) {
                    parsedJadwal = JSON.parse(item.jadwal);
                } else {
                    parsedJadwal = { type: 'unknown', notes: String(item.jadwal) };
                }
            } catch (e) {
                console.error('Error parsing jadwal in history for medication ID:', item.id_obat, e);
                parsedJadwal = { type: 'unknown', notes: item.jadwal }; 
            }

            return {
                id: item.id,
                medicationId: item.id_obat,
                patientId: item.id_pasien,
                status: item.status,
                notes: item.catatan,
                consumptionTime: item.waktu_konsumsi,
                medicationName: item.nama_obat,
                dosage: item.dosis,
                schedule: parsedJadwal,
                scheduledTime: item.scheduled_time,
            };
        });

        res.status(200).json({ message: 'Riwayat konsumsi berhasil dimuat.', data: formattedHistory });
    } catch (error) {
        console.error('Error saat mengambil riwayat konsumsi:', error);
        res.status(500).json({ message: 'Kesalahan server saat mengambil riwayat konsumsi.' });
    }
};

exports.getMedicationsByPatient = async (req, res) => {
    try {
        const { patientUniqueId } = req.params;
        const loggedInUser = req.user;
        const patientGlobalId = await getPatientGlobalIdFromUniqueId(patientUniqueId);
        if (!patientGlobalId) {
            return res.status(404).json({ message: 'Pasien dengan ID unik tersebut tidak ditemukan.' });
        }
        console.log('\n--- DEBUG LOGS FROM medicationController.js (getMedicationsByPatient) ---');
        console.log('  loggedInUser ID (from token):', loggedInUser.id, 'Role:', loggedInUser.role);
        console.log('  patientUniqueId (requested):', patientUniqueId);
        console.log('  patientGlobalId (resolved):', patientGlobalId);
        console.log('--- END DEBUG LOGS ---');

        let isAuthorized = false;
        if (loggedInUser.role === 'dokter') {
            const doctorGlobalId = await getDoctorIdByUserId(loggedInUser.id);
            console.log('  Doctor Global ID (for auth check):', doctorGlobalId);

            if (doctorGlobalId) {
                const relation = await query(
                    'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
                    [doctorGlobalId, patientGlobalId]
                );
                if (relation.length > 0) { isAuthorized = true; }
            }
        } else if (loggedInUser.role === 'pasien') {

            const currentPatientGlobalId = await getPatientIdByUserId(loggedInUser.id);

            if (currentPatientGlobalId && currentPatientGlobalId === patientGlobalId) {
                isAuthorized = true;
            }
        } else if (loggedInUser.role === 'keluarga') {
            const familyUserId = loggedInUser.id;
            const familyGlobalId = await getFamilyIdByUserId(familyUserId);
            if (familyGlobalId) {
                const relation = await query(
                    'SELECT * FROM relasi_pasien_keluarga WHERE id_pasien = ? AND id_keluarga = ?',
                    [patientGlobalId, familyGlobalId]
                );
                if (relation.length > 0) { isAuthorized = true; }
            }
        }
        if (!isAuthorized) {
            console.log('  Otorisasi GAGAL untuk melihat obat pasien ini.');
            return res.status(403).json({ message: 'Tidak diotorisasi untuk melihat obat pasien ini.' });

        }
        // Panggil findAllByPatientId dari model Obat
        const medications = await Obat.findAllByPatientId(patientGlobalId);

        const formattedMedications = medications.map(med => ({
            id: med.id,
            patientId: med.id_pasien,
            doctorId: med.id_dokter,
            medicationName: med.nama_obat,
            dosage: med.dosis,
            schedule: med.jadwal, 
            description: med.deskripsi,
            photoUrl: med.foto_obat_url,
            createdAt: med.created_at,
            updatedAt: med.updated_at,
        }));
        res.status(200).json({ message: 'Daftar obat berhasil dimuat.', data: formattedMedications });

    } catch (error) {
        console.error('Error saat mengambil obat:', error);
        res.status(500).json({ message: 'Kesalahan server saat mengambil obat.' });
    }
};


//  Perbarui obat berdasarkan ID
exports.updateMedication = async (req, res) => {
    try {
        const { medicationGlobalId } = req.params;
        const { medicationName, dosage, schedule, description, photoUrl } = req.body;

        if (!medicationGlobalId || !medicationName || !dosage || !schedule || typeof schedule !== 'object' || !schedule.type) {
            return res.status(400).json({ message: 'Nama obat, dosis, dan jadwal (object dengan type) diperlukan.' });
        }

        const doctorUserId = req.user.id;
        const doctorGlobalId = await getDoctorIdByUserId(doctorUserId);

        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const existingMedication = await Obat.findById(medicationGlobalId);

        if (!existingMedication) {
            return res.status(404).json({ message: 'Obat tidak ditemukan.' });
        }
        if (existingMedication.id_dokter !== doctorGlobalId) {
            return res.status(403).json({ message: 'Tidak diotorisasi: Anda hanya dapat memperbarui obat resep Anda sendiri.' });
        }
        const success = await Obat.update(
            medicationGlobalId,
            medicationName,
            dosage,
            schedule, 
            description,
            photoUrl
        );
        if (success) {
            res.status(200).json({
                message: 'Obat berhasil diperbarui.',
                data: {
                    id: medicationGlobalId,
                    medicationName: medicationName,
                    dosage: dosage,
                    schedule: schedule, 
                    description: description,
                    photoUrl: photoUrl,
                }
            });
        } else {
            res.status(404).json({ message: 'Obat tidak ditemukan atau tidak ada perubahan yang dilakukan.' });
        }

    } catch (error) {
        console.error('Error saat memperbarui obat:', error);
        res.status(500).json({ message: 'Kesalahan server saat memperbarui obat.' });
    }
};


// Hapus obat berdasarkan ID
// DELETE /api/obat/:medicationGlobalId
exports.deleteMedication = async (req, res) => {
    try {
        const { medicationGlobalId } = req.params;

        if (!medicationGlobalId) {
            return res.status(400).json({ message: 'ID Obat wajib diisi.' });
        }

        const doctorUserId = req.user.id;
        const doctorGlobalId = await getDoctorIdByUserId(doctorUserId);

        if (!doctorGlobalId) {
            return res.status(403).json({ message: 'Pengguna tidak dikenali sebagai dokter.' });
        }

        const existingMedication = await Obat.findById(medicationGlobalId);
        if (!existingMedication) {
            return res.status(404).json({ message: 'Obat tidak ditemukan.' });
        }
        if (existingMedication.id_dokter !== doctorGlobalId) {
            return res.status(403).json({ message: 'Tidak diotorisasi: Anda hanya dapat menghapus obat resep Anda sendiri.' });
        }

        const success = await Obat.delete(medicationGlobalId);

        if (success) {
            res.status(200).json({ message: 'Obat berhasil dihapus.' });
        } else {
            res.status(404).json({ message: 'Obat tidak ditemukan.' });
        }

    } catch (error) {
        console.error('Error saat menghapus obat:', error);
        res.status(500).json({ message: 'Kesalahan server saat menghapus obat.' });
    }
};

// riwayat konsumsi untuk pasien
//  GET /api/riwayat-konsumsi/:patientUniqueId
exports.getConsumptionHistory = async (req, res) => {
    try {
        const { patientUniqueId } = req.params;
        const loggedInUser = req.user;

        const patientGlobalId = await getPatientGlobalIdFromUniqueId(patientUniqueId);
        if (!patientGlobalId) {
            return res.status(404).json({ message: 'Pasien dengan ID unik tersebut tidak ditemukan.' });
        }

        console.log('\n--- DEBUG LOGS FROM medicationController.js (getConsumptionHistory) ---');
        console.log('  loggedInUser ID (from token):', loggedInUser.id, 'Role:', loggedInUser.role);
        console.log('  patientUniqueId (requested):', patientUniqueId);
        console.log('  patientGlobalId (resolved):', patientGlobalId);
        console.log('--- END DEBUG LOGS ---');

        let isAuthorized = false;
        if (loggedInUser.role === 'dokter') {
            const doctorGlobalId = await getDoctorIdByUserId(loggedInUser.id);
            if (doctorGlobalId) {
                const relation = await query(
                    'SELECT * FROM relasi_dokter_pasien WHERE id_dokter = ? AND id_pasien = ?',
                    [doctorGlobalId, patientGlobalId]
                );
                if (relation.length > 0) { isAuthorized = true; }
            }
        } else if (loggedInUser.role === 'pasien') {
            const currentPatientGlobalId = await getPatientIdByUserId(loggedInUser.id);
            if (currentPatientGlobalId && currentPatientGlobalId === patientGlobalId) {
                isAuthorized = true;
            }
        } else if (loggedInUser.role === 'keluarga') {
            const familyUserId = loggedInUser.id;
            const familyGlobalId = await getFamilyIdByUserId(familyUserId);
            if (familyGlobalId) {
                const relation = await query(
                    'SELECT * FROM relasi_pasien_keluarga WHERE id_pasien = ? AND id_keluarga = ?',
                    [patientGlobalId, familyGlobalId]
                );
                if (relation.length > 0) { isAuthorized = true; }
            }
        }

        if (!isAuthorized) {
            console.log('  Otorisasi GAGAL untuk melihat riwayat konsumsi pasien ini.');
            return res.status(403).json({ message: 'Tidak diotorisasi untuk melihat riwayat konsumsi pasien ini.' });
        }
        const sql = `
            SELECT rk.*, o.nama_obat, o.dosis, o.jadwal
            FROM riwayat_konsumsi rk
            JOIN obat o ON rk.id_obat = o.id
            WHERE rk.id_pasien = ?
            ORDER BY rk.waktu_konsumsi DESC
        `;
        const history = await query(sql, [patientGlobalId]);

        const parsedHistory = history.map(item => {
            let parsedJadwal = {};
             try {
                if (typeof item.jadwal === 'string' && item.jadwal.trim().startsWith('{')) {
                    parsedJadwal = JSON.parse(item.jadwal);
                } else {
                    parsedJadwal = { type: 'unknown', notes: String(item.jadwal) };
                }
            } catch (e) {
                console.error('Error parsing jadwal in history for medication ID:', item.id_obat, e);
                parsedJadwal = { type: 'unknown', notes: item.jadwal };
            }

            return {
                id: item.id,
                medicationId: item.id_obat,
                patientId: item.id_pasien,
                status: item.status,
                notes: item.catatan,
                consumptionTime: item.waktu_konsumsi,
                medicationName: item.nama_obat,
                dosage: item.dosis,
                schedule: parsedJadwal, 
                scheduledTime: item.scheduled_time,
            };
        });

        res.status(200).json({ message: 'Riwayat konsumsi berhasil dimuat.', data: parsedHistory });
    } catch (error) {
        console.error('Error saat mengambil riwayat konsumsi:', error);
        res.status(500).json({ message: 'Kesalahan server saat mengambil riwayat konsumsi.' });
    }
};
