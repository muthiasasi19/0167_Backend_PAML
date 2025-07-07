const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ message: 'Token tidak disediakan!' });
    }

    const token = authHeader.split(' ')[1]; 
    if (!token) {
        return res.status(403).json({ message: 'Token tidak disediakan!' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error('Error Verifikasi JWT:', err.message);
            return res.status(401).json({ message: 'Tidak sah! Token tidak valid.' });
        }
        req.user = decoded; // Menyimpan payload token ke req.user (id, username, role)
        next();
    });
};

exports.authorizeRoles = (roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ message: 'Akses ditolak: Role pengguna tidak ditemukan.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: `Akses ditolak: Membutuhkan salah satu role berikut: ${roles.join(', ')}.` });
        }
        next();
    };
};