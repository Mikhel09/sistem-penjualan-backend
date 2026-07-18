// Middleware ini menerima daftar role yang diizinkan, contoh: checkRole('owner', 'admin')
function checkRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses untuk melakukan ini' });
    }
    next();
  };
}

module.exports = checkRole;