const pool = require('../db');

function checkPermission(key) {
  return async (req, res, next) => {
    if (req.role === 'owner') return next(); // owner selalu boleh
    try {
      const result = await pool.query('SELECT permissions FROM users WHERE id = $1', [req.user_id]);
      const perms = result.rows[0]?.permissions || {};
      if (perms[key]) return next();
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk melakukan ini' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memeriksa izin' });
    }
  };
}

module.exports = checkPermission;