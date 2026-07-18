const jwt = require('jsonwebtoken');
require('dotenv').config();

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Token tidak ditemukan, silakan login' });
  }

  const token = authHeader.split(' ')[1]; // format: "Bearer <token>"
  if (!token) {
    return res.status(401).json({ error: 'Format token salah' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Simpan info tenant/user ke request, supaya bisa dipakai di endpoint manapun
    req.tenant_id = decoded.tenant_id;
    req.user_id = decoded.user_id;
    req.role = decoded.role;
    next(); // lanjut ke endpoint tujuan
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau kadaluarsa' });
  }
}

module.exports = verifyToken;