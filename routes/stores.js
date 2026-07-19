const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

const router = express.Router();

// Owner membuat cabang baru
router.post('/', verifyToken, checkRole('owner'), async (req, res) => {
  const { nama_toko, alamat } = req.body;
  if (!nama_toko) {
    return res.status(400).json({ error: 'Nama toko wajib diisi' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO stores (tenant_id, nama_toko, alamat) VALUES ($1, $2, $3) RETURNING *',
      [req.tenant_id, nama_toko, alamat || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membuat cabang' });
  }
});

// Daftar cabang milik tenant ini (owner & admin boleh lihat, buat pilihan dropdown)
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM stores WHERE tenant_id = $1 ORDER BY id',
      [req.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data cabang' });
  }
});

module.exports = router;