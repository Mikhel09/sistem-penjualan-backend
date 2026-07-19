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

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (tenant_id, nama, email, password, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nama, email, role`,
      [req.tenant_id, nama, email, hashedPassword, role || 'kasir']
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
      'SELECT id, nama, email, role FROM users WHERE tenant_id = $1 ORDER BY id',
      [req.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data staff' });
  }
});

module.exports = router;