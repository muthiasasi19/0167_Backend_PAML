    const { query } = require('../config/database');

    class PatientLocation {
        // Mencatat lokasi terkini pasien
        static async create(idPasien, latitude, longitude) {
            const sql = `INSERT INTO lokasi_pasien (id_pasien, latitude, longitude, timestamp) VALUES (?, ?, ?, NOW())`;
            const params = [idPasien, latitude, longitude];
            const result = await query(sql, params);
            return { id: result.insertId, idPasien, latitude, longitude, timestamp: new Date() };
        }

        // Mendapatkan lokasi terakhir pasien
        static async findLastLocationByPatientId(idPasien) {
            const sql = `SELECT latitude, longitude, timestamp FROM lokasi_pasien WHERE id_pasien = ? ORDER BY timestamp DESC LIMIT 1`;
            const result = await query(sql, [idPasien]);
            return result[0];
        }
    }

    module.exports = PatientLocation;
    