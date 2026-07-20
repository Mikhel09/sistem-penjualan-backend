const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

const router = express.Router();

// Catat pembelian/restock baru — otomatis menambah stok produk
router.post('/', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  const { product_id, supplier_id, qty, harga_beli } = req.body;
  const storeId = req.store_id || req.body.store_id;

  if (!product_id || !qty || !harga_beli) {
    return res.status(400).json({ error: 'Produk, qty, dan harga beli wajib diisi' });
  }
  if (!storeId) {
    return res.status(400).json({ error: 'Cabang wajib dipilih' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productCheck = await client.query(
      'SELECT id FROM products WHERE id = $1 AND tenant_id = $2 AND store_id = $3',
      [product_id, req.tenant_id, storeId]
    );
    if (productCheck.rows.length === 0) {
      throw new Error('Produk tidak ditemukan di cabang ini');
    }

    const result = await client.query(
      `INSERT INTO purchases (tenant_id, store_id, supplier_id, product_id, qty, harga_beli)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.tenant_id, storeId, supplier_id || null, product_id, qty, harga_beli]
    );

    await client.query('UPDATE products SET stok = stok + $1 WHERE id = $2', [qty, product_id]);

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Gagal mencatat restock' });
  } finally {
    client.release();
  }
});

// Riwayat pembelian/restock
router.get('/', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT purchases.*, products.nama AS nama_produk, suppliers.nama AS nama_supplier, stores.nama_toko
       FROM purchases
       JOIN products ON purchases.product_id = products.id
       LEFT JOIN suppliers ON purchases.supplier_id = suppliers.id
       JOIN stores ON purchases.store_id = stores.id
       WHERE purchases.tenant_id = $1
       ORDER BY purchases.created_at DESC`,
      [req.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil riwayat pembelian' });
  }
});

module.exports = router;