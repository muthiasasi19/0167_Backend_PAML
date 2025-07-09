const { query } = require('../config/database');

class Obat {
    static async create(idPasien, idDokter, namaObat, dosis, jadwalObject, deskripsiString, fotoObatUrlString) { // Parameter renamed for clarity
        const jadwalString = JSON.stringify(jadwalObject); 

        const sql = `INSERT INTO obat (id_pasien, id_dokter, nama_obat, dosis, jadwal, deskripsi, foto_obat_url) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const params = [
            idPasien,
            idDokter,
            namaObat,
            dosis,
            jadwalString,      
            deskripsiString,
            fotoObatUrlString
        ];

        try {
            const result = await query(sql, params);
            return {
                id: result.insertId,
                idPasien,
                idDokter,
                namaObat,
                dosis,
                jadwal: jadwalObject, 
                deskripsi: deskripsiString,
                fotoObatUrl: fotoObatUrlString
            };
        } catch (error) {
            console.error('Error in Obat.create (SQL execution):', error);
            throw error;
        }
    }

    static async findById(id) {
        const sql = `SELECT * FROM obat WHERE id = ?`;
        const result = await query(sql, [id]);
        if (result.length > 0) {
            const medication = result[0];
         
            try {
                if (typeof medication.jadwal === 'string' && medication.jadwal.trim().startsWith('{')) {
                    medication.jadwal = JSON.parse(medication.jadwal);
                } else {
                    medication.jadwal = { type: 'unknown', notes: String(medication.jadwal) };
                }
            } catch (e) {
                console.error('Error parsing jadwal for medication ID:', medication.id, e);
                medication.jadwal = { type: 'unknown', notes: String(medication.jadwal) };
            }
            return medication;
        }
        return null;
    }

    static async findAllByPatientId(idPasien) {
        const sql = `SELECT * FROM obat WHERE id_pasien = ?`;
        const results = await query(sql, [idPasien]); 
        
        return results.map(medication => {
            try {
                if (typeof medication.jadwal === 'string' && medication.jadwal.trim().startsWith('{')) {
                    medication.jadwal = JSON.parse(medication.jadwal);
                } else {
                    medication.jadwal = { type: 'unknown', notes: String(medication.jadwal) };
                }
            } catch (e) {
                console.error('Error parsing jadwal for medication ID:', medication.id, e);
                medication.jadwal = { type: 'unknown', notes: String(medication.jadwal) };
            }
            return medication;
        });
    }

    // Untuk Edit  medication
    static async update(id, namaObat, dosis, jadwalObject, deskripsiString, fotoObatUrlString) { // Parameter renamed for clarity
        const jadwalString = JSON.stringify(jadwalObject); 
        const sql = `UPDATE obat SET nama_obat = ?, dosis = ?, jadwal = ?, deskripsi = ?, foto_obat_url = ? WHERE id = ?`;
        const params = [
            namaObat,
            dosis,
            jadwalString,       
            deskripsiString,
            fotoObatUrlString,
            id
        ];

        try {
            const result = await query(sql, params);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in Obat.update (SQL execution):', error);
            throw error;
        }
    }

    // Untuk Hapus medication
    static async delete(id) {
        const sql = `DELETE FROM obat WHERE id = ?`;
        const result = await query(sql, [id]);
        return result.affectedRows > 0;
    }
}

module.exports = Obat;