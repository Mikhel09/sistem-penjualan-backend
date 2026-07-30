const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');
const validate = require('../middleware/validate');
const { staffSchema } = require('../schemas');

const router = express.Router();

// Tambah staff baru
router.post('/', verifyToken, checkPermission('kelola_staff'), validate(staffSchema), async (req, res) => {
  const { nama, email, password, store_id } = req.body;
  let { role } = req.body;

  // Admin (bukan owner) hanya boleh membuat akun kasir, apapun yang dikirim frontend
  if (req.role !== 'owner') {
    role = 'kasir';
  }

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

// Daftar staff — owner lihat semua, admin cuma lihat kasir
router.get('/', verifyToken, checkPermission('kelola_staff'), async (req, res) => {
  try {
    let query = `SELECT users.id, users.nama, users.email, users.role, users.store_id, users.permissions, stores.nama_toko
       FROM users LEFT JOIN stores ON users.store_id = stores.id
       WHERE users.tenant_id = $1`;
    if (req.role !== 'owner') {
      query += ` AND users.role = 'kasir'`;
    }
    query += ' ORDER BY users.id';

    const result = await pool.query(query, [req.tenant_id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data staff' });
  }
});

// Pindah cabang
router.put('/:id/cabang', verifyToken, checkPermission('kelola_staff'), async (req, res) => {
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

    // Owner boleh pindahkan siapapun kecuali owner lain; admin cuma boleh pindahkan kasir
    const roleFilter = req.role === 'owner' ? `role != 'owner'` : `role = 'kasir'`;

    const result = await pool.query(
      `UPDATE users SET store_id = $1 WHERE id = $2 AND tenant_id = $3 AND ${roleFilter}
       RETURNING id, nama, email, role, store_id`,
      [store_id, id, req.tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Staff tidak ditemukan, atau Anda tidak berhak mengubah akun ini' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memindahkan cabang' });
  }
});

// Atur izin akses
router.put('/:id/permissions', verifyToken, checkPermission('kelola_staff'), async (req, res) => {
  const { id } = req.params;
  let { permissions } = req.body;

  if (typeof permissions !== 'object' || permissions === null) {
    return res.status(400).json({ error: 'Format izin tidak valid' });
  }

  const roleFilter = req.role === 'owner' ? `role != 'owner'` : `role = 'kasir'`;

  // Admin tidak boleh memberi izin "kelola_staff" ke siapapun — cegah eskalasi wewenang
  if (req.role !== 'owner') {
    permissions = { ...permissions, kelola_staff: false };
  }

  try {
    const result = await pool.query(
      `UPDATE users SET permissions = $1 WHERE id = $2 AND tenant_id = $3 AND ${roleFilter}
       RETURNING id, nama, email, role, permissions`,
      [JSON.stringify(permissions), id, req.tenant_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Staff tidak ditemukan, atau Anda tidak berhak mengubah akun ini' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyimpan izin' });
  }
});

module.exports = router;