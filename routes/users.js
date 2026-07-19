const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');
const validate = require('../middleware/validate');
const { staffSchema } = require('../schemas');

const router = express.Router();

router.post('/', verifyToken, checkRole('owner'), validate(staffSchema), async (req, res) => {
  const { nama, email, password, role } = req.body;
  const { store_id } = req.body;

  if (!store_id) {
    return res.status(400).json({ error: 'Cabang wajib dipilih untuk staff' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (tenant_id, store_id, nama, email, password, role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nama, email, role, store_id`,
      [req.tenant_id, store_id, nama, email, hashedPassword, role || 'kasir']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah staff' });
  }
});

router.get('/', verifyToken, checkRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT users.id, users.nama, users.email, users.role, stores.nama_toko
       FROM users LEFT JOIN stores ON users.store_id = stores.id
       WHERE users.tenant_id = $1 ORDER BY users.id`,
      [req.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data staff' });
  }
});

module.exports = router;