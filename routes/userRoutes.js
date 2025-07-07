const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware'); 
const userController = require('../controllers/userController');

router.get('/protected', verifyToken, (req, res) => {
    res.json({ message: `Halo, user ID ${req.user.id}, role ${req.user.role}` });
});

// Rute untuk mendapatkan profil lengkap user
router.get('/profile', verifyToken, userController.getProfile);

module.exports = router;