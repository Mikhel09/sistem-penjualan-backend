const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// Buat transaksi penjualan baru
// Body: { items: [{ product_id: 1, qty: 2 }, { product_id: 3, qty: 1 }] }
router.post('/', verifyToken, async (req, res) => {
  const { items, no_meja, catatan } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Keranjang kosong' });
  }

  const client = await pool.connect(); // ambil 1 koneksi khusus untuk transaksi DB
  try {
    await client.query('BEGIN'); // mulai transaksi database

    let total = 0;
    const itemDetails = [];

    // Ambil harga terbaru tiap produk dari database (jangan percaya harga dari frontend!)
    for (const item of items) {
      const productResult = await client.query(
        'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
        [item.product_id, req.tenant_id]
      );
      if (productResult.rows.length === 0) {
        throw new Error(`Produk id ${item.product_id} tidak ditemukan`);
      }
      const product = productResult.rows[0];

      if (product.stok < item.qty) {
        throw new Error(`Stok "${product.nama}" tidak cukup`);
      }

      const subtotal = Number(product.harga) * item.qty;
      total += subtotal;
      itemDetails.push({
        product_id: product.id,
        qty: item.qty,
        harga_saat_jual: product.harga,
      });
    }

    // Simpan transaksi utama
    const transResult = await client.query(
      'INSERT INTO transactions (tenant_id, user_id, total, no_meja, catatan) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [req.tenant_id, req.user_id, total, no_meja || null, catatan || null]
    );
    const transactionId = transResult.rows[0].id;

    // Simpan tiap item + kurangi stok
    for (const detail of itemDetails) {
      await client.query(
        'INSERT INTO transaction_items (transaction_id, product_id, qty, harga_saat_jual) VALUES ($1, $2, $3, $4)',
        [transactionId, detail.product_id, detail.qty, detail.harga_saat_jual]
      );
      await client.query(
        'UPDATE products SET stok = stok - $1 WHERE id = $2',
        [detail.qty, detail.product_id]
      );
    }

    await client.query('COMMIT'); // semua berhasil, simpan permanen
    res.status(201).json({ message: 'Transaksi berhasil', transaction_id: transactionId, total });
  } catch (err) {
    await client.query('ROLLBACK'); // ada yang gagal, batalkan semuanya
    console.error(err);
    res.status(400).json({ error: err.message || 'Transaksi gagal' });
  } finally {
    client.release(); // kembalikan koneksi ke pool
  }
});

// Riwayat transaksi tenant ini
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM transactions WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil riwayat transaksi' });
  }
});

module.exports = router;