const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

const router = express.Router();

router.post('/', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  const { nama, telepon, alamat } = req.body;
  if (!nama) {
    return res.status(400).json({ error: 'Nama supplier wajib diisi' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO suppliers (tenant_id, nama, telepon, alamat) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.tenant_id, nama, telepon || null, alamat || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah supplier' });
  }
});

router.get('/', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM suppliers WHERE tenant_id = $1 ORDER BY nama',
      [req.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data supplier' });
  }
});

module.exports = router;