const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// Cari pelanggan berdasarkan nomor telepon (dipakai di Kasir)
router.get('/cari', verifyToken, async (req, res) => {
  const { telepon } = req.query;
  if (!telepon) {
    return res.status(400).json({ error: 'Nomor telepon wajib diisi' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE tenant_id = $1 AND telepon = $2',
      [req.tenant_id, telepon]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mencari pelanggan' });
  }
});

// Daftarkan pelanggan baru
router.post('/', verifyToken, async (req, res) => {
  const { nama, telepon } = req.body;
  if (!nama || !telepon) {
    return res.status(400).json({ error: 'Nama dan telepon wajib diisi' });
  }
  try {
    const existing = await pool.query(
      'SELECT id FROM customers WHERE tenant_id = $1 AND telepon = $2',
      [req.tenant_id, telepon]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Nomor telepon sudah terdaftar' });
    }
    const result = await pool.query(
      'INSERT INTO customers (tenant_id, nama, telepon) VALUES ($1, $2, $3) RETURNING *',
      [req.tenant_id, nama, telepon]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mendaftarkan pelanggan' });
  }
});

// Daftar semua pelanggan (untuk halaman Kelola Pelanggan)
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE tenant_id = $1 ORDER BY poin DESC',
      [req.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data pelanggan' });
  }
});

module.exports = router;