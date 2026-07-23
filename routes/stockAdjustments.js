const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');
const checkPermission = require('../middleware/checkPermission');
const router = express.Router();

router.post('/', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  const { product_id, variant_id, stok_baru, alasan } = req.body;

  if (!product_id || stok_baru === undefined || stok_baru === null || !alasan) {
    return res.status(400).json({ error: 'Produk, stok baru, dan alasan wajib diisi' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let stokLama;
    if (variant_id) {
      const variantCheck = await client.query(
        `SELECT product_variants.stok FROM product_variants
         JOIN products ON product_variants.product_id = products.id
         WHERE product_variants.id = $1 AND products.tenant_id = $2 AND product_variants.product_id = $3`,
        [variant_id, req.tenant_id, product_id]
      );
      if (variantCheck.rows.length === 0) {
        throw new Error('Varian tidak ditemukan');
      }
      stokLama = variantCheck.rows[0].stok;
      await client.query('UPDATE product_variants SET stok = $1 WHERE id = $2', [stok_baru, variant_id]);
    } else {
      const productCheck = await client.query(
        'SELECT stok FROM products WHERE id = $1 AND tenant_id = $2',
        [product_id, req.tenant_id]
      );
      if (productCheck.rows.length === 0) {
        throw new Error('Produk tidak ditemukan');
      }
      stokLama = productCheck.rows[0].stok;
      await client.query('UPDATE products SET stok = $1 WHERE id = $2', [stok_baru, product_id]);
    }

    const result = await client.query(
      `INSERT INTO stock_adjustments (tenant_id, product_id, variant_id, stok_lama, stok_baru, alasan, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.tenant_id, product_id, variant_id || null, stokLama, stok_baru, alasan, req.user_id]
    );

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Gagal menyimpan koreksi stok' });
  } finally {
    client.release();
  }
});

router.get('/', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT stock_adjustments.*, products.nama AS nama_produk, users.nama AS nama_user,
              product_variants.ukuran, product_variants.warna
       FROM stock_adjustments
       JOIN products ON stock_adjustments.product_id = products.id
       JOIN users ON stock_adjustments.user_id = users.id
       LEFT JOIN product_variants ON stock_adjustments.variant_id = product_variants.id
       WHERE stock_adjustments.tenant_id = $1
       ORDER BY stock_adjustments.created_at DESC`,
      [req.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil riwayat koreksi stok' });
  }
});

module.exports = router;