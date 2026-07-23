const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');
const validate = require('../middleware/validate');
const { staffSchema } = require('../schemas');

const router = express.Router();

router.post('/', verifyToken, checkRole('owner'), validate(staffSchema), async (req, res) => {
  const { nama, email, password, role, store_id } = req.body;
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
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nama, email, role, store_id, permissions`,
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
      `SELECT users.id, users.nama, users.email, users.role, users.store_id, users.permissions, stores.nama_toko
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

router.put('/:id/cabang', verifyToken, checkRole('owner'), async (req, res) => {
  const { id } = req.params;
  const { store_id } = req.body;
  if (!store_id) {
    return res.status(400).json({ error: 'Cabang tujuan wajib dipilih' });
  }
  try {
    const storeCheck = await pool.query('SELECT id FROM stores WHERE id = $1 AND tenant_id = $2', [store_id, req.tenant_id]);
    if (storeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Cabang tujuan tidak ditemukan' });
    }
    const result = await pool.query(
      `UPDATE users SET store_id = $1 WHERE id = $2 AND tenant_id = $3 AND role != 'owner'
       RETURNING id, nama, email, role, store_id`,
      [store_id, id, req.tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Staff tidak ditemukan, atau tidak bisa memindahkan akun owner' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memindahkan cabang' });
  }
});

// BARU: owner mengatur izin staff
router.put('/:id/permissions', verifyToken, checkRole('owner'), async (req, res) => {
  const { id } = req.params;
  const { permissions } = req.body;

  if (typeof permissions !== 'object' || permissions === null) {
    return res.status(400).json({ error: 'Format izin tidak valid' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET permissions = $1 WHERE id = $2 AND tenant_id = $3 AND role != 'owner'
       RETURNING id, nama, email, role, permissions`,
      [JSON.stringify(permissions), id, req.tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Staff tidak ditemukan, atau tidak bisa mengatur izin akun owner' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyimpan izin' });
  }
});

module.exports = router;