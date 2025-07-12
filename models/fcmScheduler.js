// BECKEND_ASISTENOBAT/services/fcmScheduler.js

// Import library untuk menjadwalkan tugas.
const schedule = require('node-schedule');
// Import library untuk melakukan HTTP requests (untuk memanggil FCM API).
const axios = require('axios');
// Import model NotificationSchedule untuk mengambil data jadwal dari database.
const NotificationSchedule = require('../models/NotificationSchedule');
// Import modul query untuk interaksi database.
const { query } = require('../config/database');
// Import helper function untuk mendapatkan FCM token dari notificationController.
const { getFCMTokenByGlobalId } = require('../controllers/notificationController');
// Import MedicationHistory model untuk mengecek status konsumsi.
const MedicationHistory = require('../models/MedicationHistory'); // PERUBAHAN UNTUK NOTIFIKASI

// FCM Server Key (HARUS ada di .env Anda, misal: FCM_SERVER_KEY=YOUR_FCM_SERVER_KEY_FROM_FIREBASE)
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY; 

/**
 * Mengirim notifikasi push ke perangkat menggunakan Firebase Cloud Messaging.
 * @param {string} fcmToken - Token perangkat target.
 * @param {string} title - Judul notifikasi.
 * @param {string} body - Isi/pesan notifikasi.
 * @param {Object} data - Payload data tambahan untuk aplikasi.
 */
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
    // Validasi FCM_SERVER_KEY.
    if (!FCM_SERVER_KEY) {
        console.error('FCM_SERVER_KEY tidak ditemukan di .env. Notifikasi tidak dapat dikirim.');
        return;
    }
    // Pastikan fcmToken valid.
    if (!fcmToken) {
        console.warn('FCM token kosong, tidak dapat mengirim notifikasi.');
        return;
    }
    try {
        // Melakukan POST request ke endpoint FCM API.
        await axios.post('https://fcm.googleapis.com/fcm/send', {
            to: fcmToken, // Target FCM token
            notification: {
                title: title,
                body: body,
                sound: 'default' // Suara notifikasi default
            },
            data: data // Payload data tambahan
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${FCM_SERVER_KEY}` // Autentikasi dengan Server Key
            }
        });
        console.log('Notification sent successfully to:', fcmToken);
    } catch (error) {
        console.error('Error sending notification to', fcmToken, ':', error.message);
        if (error.response) {
            console.error('FCM Response:', error.response.data); // Log respons error dari FCM
        }
    }
};

/**
 * Menyiapkan semua jadwal notifikasi dari database.
 * Fungsi ini akan dipanggil saat server dimulai dan setiap kali ada perubahan jadwal.
 */
const setupNotificationSchedules = async () => {
    // Membatalkan semua jadwal node-schedule yang mungkin aktif dari sesi sebelumnya untuk menghindari duplikasi.
    schedule.cancelJob(); 
    console.log('Semua jadwal notifikasi lama dibatalkan.');

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Atur ke awal hari ini untuk perbandingan tanggal.

    // Ambil semua jadwal notifikasi yang aktif dan masih dalam periode tanggal.
    const activeSchedules = await query(
        `SELECT * FROM notification_schedules
         WHERE is_active = TRUE AND start_date <= CURDATE() AND (end_date IS NULL OR end_date >= CURDATE())`
    );

    activeSchedules.forEach(async (scheduleItem) => {
        const [hour, minute] = scheduleItem.schedule_time.split(':').map(Number);

        // Buat cron job untuk setiap jadwal notifikasi.
        // Job akan berjalan setiap hari pada jam dan menit yang ditentukan di timezone Asia/Jakarta.
        schedule.scheduleJob({ hour: hour, minute: minute, tz: 'Asia/Jakarta' }, async () => {
            console.log(`Memicu notifikasi untuk jadwal ID ${scheduleItem.id} (Obat ${scheduleItem.medication_id}) pada ${scheduleItem.schedule_time}`);

            // PERUBAHAN UNTUK NOTIFIKASI: Cek apakah obat sudah dicentang (taken) untuk sesi hari ini.
            // Jika sudah dicentang, notifikasi tidak akan dikirim untuk sesi ini.
            const todayDateString = new Date().toISOString().slice(0, 10); // Format YYYY-MM-DD
            const consumptionRecord = await MedicationHistory.findByMedicationPatientAndDateTime(
                scheduleItem.medication_id,
                scheduleItem.patient_global_id,
                new Date(), // Menggunakan objek Date hari ini
                scheduleItem.schedule_time
            );

            if (consumptionRecord && consumptionRecord.status === 'taken') {
                console.log(`Notifikasi untuk jadwal ID ${scheduleItem.id} di ${scheduleItem.schedule_time} tidak dikirim, karena sudah dicentang hari ini.`);
                return; // Jangan kirim notifikasi jika sudah dicentang
            }
            // SAMPAI SINIH

            // Dapatkan informasi obat (nama_obat dan dosis) dari tabel obat.
            const medicationResult = await query('SELECT nama_obat, dosis FROM obat WHERE id = ?', [scheduleItem.medication_id]);
            const medication = medicationResult[0];
            if (!medication) {
                console.error('Medication not found for schedule:', scheduleItem.id);
                return;
            }

            // Dapatkan informasi pasien (nama pasien) untuk notifikasi keluarga.
            const patientResult = await query('SELECT nama FROM pasien WHERE id = ?', [scheduleItem.patient_global_id]);
            const patientName = patientResult.length > 0 ? patientResult[0].nama : 'Pasien Anda';

            const title = 'Waktunya Minum Obat!';
            // PERUBAHAN UNTUK NOTIFIKASI: Isi notifikasi menggunakan nama obat dan dosis dari tabel obat.
            const body = `Sudah waktunya minum ${medication.nama_obat} (${medication.dosis}). Jangan lupa ya!`; 
            // SAMPAI SINIH
            
            // Payload data tambahan untuk aplikasi Flutter.
            const data = {
                type: 'medication_reminder',
                medicationId: scheduleItem.medication_id.toString(), // ID global obat
                scheduleId: scheduleItem.id.toString(), // ID jadwal notifikasi
                patientGlobalId: scheduleItem.patient_global_id.toString(), // ID global pasien
                // Tambahkan nama dan dosis ke data payload agar bisa diakses di Flutter jika diperlukan
                medicationName: medication.nama_obat, // PERUBAHAN UNTUK NOTIFIKASI
                medicationDosage: medication.dosis, // PERUBAHAN UNTUK NOTIFIKASI
                // SAMPAI SINIH
            };

            // Dapatkan FCM token pasien dan kirim notifikasi.
            const patientFCMToken = await getFCMTokenByGlobalId(scheduleItem.patient_global_id, 'pasien');
            if (patientFCMToken) {
                await sendPushNotification(patientFCMToken, title, body, data);
            } else {
                console.warn('FCM token tidak ada untuk pasien global ID:', scheduleItem.patient_global_id);
            }

            // Dapatkan FCM token keluarga (jika ada) dan kirim notifikasi.
            if (scheduleItem.family_global_ids && scheduleItem.family_global_ids.length > 0) {
                const familyReminderTitle = 'Pengingat Obat Pasien!';
                const familyReminderBody = `Pasien Anda (${patientName}) sudah waktunya minum ${medication.nama_obat} (${medication.dosis}). Mohon ingatkan!`;

                for (const familyGlobalId of scheduleItem.family_global_ids) {
                    const familyFCMToken = await getFCMTokenByGlobalId(familyGlobalId, 'keluarga');
                    if (familyFCMToken) {
                        await sendPushNotification(familyFCMToken, familyReminderTitle, familyReminderBody, data);
                    } else {
                        console.warn('FCM token tidak ada untuk keluarga global ID:', familyGlobalId);
                    }
                }
            }
        });
        console.log(`Jadwal notifikasi untuk ID Jadwal ${scheduleItem.id} (Obat ${medication.nama_obat}) pada ${scheduleItem.schedule_time} telah di-set.`);
    });
    console.log('Semua jadwal notifikasi aktif telah diinisialisasi ulang.');
};

// Export fungsi setupNotificationSchedules agar bisa dipanggil dari app.js.
module.exports = { setupNotificationSchedules, sendPushNotification };