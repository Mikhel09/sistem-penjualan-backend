const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const validate = require('../middleware/validate');
const { transaksiSchema } = require('../schemas');

const router = express.Router();

router.post('/', verifyToken, validate(transaksiSchema), async (req, res) => {
  const { items, no_meja, catatan } = req.body;
  const storeId = req.store_id || req.body.store_id;
  if (!storeId) {
    return res.status(400).json({ error: 'Cabang wajib dipilih' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let total = 0;
    const itemDetails = [];

    for (const item of items) {
      const productResult = await client.query(
        'SELECT * FROM products WHERE id = $1 AND tenant_id = $2 AND store_id = $3',
        [item.product_id, req.tenant_id, storeId]
      );
      if (productResult.rows.length === 0) {
        throw new Error(`Produk id ${item.product_id} tidak ditemukan di cabang ini`);
      }
      const product = productResult.rows[0];
      if (product.stok < item.qty) {
        throw new Error(`Stok "${product.nama}" tidak cukup`);
      }
      total += Number(product.harga) * item.qty;
      itemDetails.push({ product_id: product.id, qty: item.qty, harga_saat_jual: product.harga });
    }

    const transResult = await client.query(
      'INSERT INTO transactions (tenant_id, store_id, user_id, total, no_meja, catatan) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [req.tenant_id, storeId, req.user_id, total, no_meja || null, catatan || null]
    );
    const transactionId = transResult.rows[0].id;

    for (const detail of itemDetails) {
      await client.query(
        'INSERT INTO transaction_items (transaction_id, product_id, qty, harga_saat_jual) VALUES ($1, $2, $3, $4)',
        [transactionId, detail.product_id, detail.qty, detail.harga_saat_jual]
      );
      await client.query('UPDATE products SET stok = stok - $1 WHERE id = $2', [detail.qty, detail.product_id]);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Transaksi berhasil', transaction_id: transactionId, total });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Transaksi gagal' });
  } finally {
    client.release();
  }
});

router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT transactions.*, users.nama AS nama_kasir, stores.nama_toko
       FROM transactions
       JOIN users ON transactions.user_id = users.id
       JOIN stores ON transactions.store_id = stores.id
       WHERE transactions.tenant_id = $1
       ORDER BY transactions.created_at DESC`,
      [req.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil riwayat transaksi' });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const transResult = await pool.query(
      `SELECT transactions.*, users.nama AS nama_kasir, stores.nama_toko
       FROM transactions
       JOIN users ON transactions.user_id = users.id
       JOIN stores ON transactions.store_id = stores.id
       WHERE transactions.id = $1 AND transactions.tenant_id = $2`,
      [id, req.tenant_id]
    );
    if (transResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    }
    const itemsResult = await pool.query(
      `SELECT transaction_items.*, products.nama AS nama_produk
       FROM transaction_items
       JOIN products ON transaction_items.product_id = products.id
       WHERE transaction_items.transaction_id = $1`,
      [id]
    );
    res.json({ transaksi: transResult.rows[0], items: itemsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil detail transaksi' });
  }
});

module.exports = router;