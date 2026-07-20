const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');

const router = express.Router();

// Laporan penjualan dalam rentang tanggal tertentu (hanya owner/admin)
// Contoh pemanggilan: GET /api/laporan?dari=2026-07-01&sampai=2026-07-31
router.get('/', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  const { dari, sampai } = req.query;

  // Kalau tanggal tidak diisi, default-nya 30 hari terakhir
  const tanggalMulai = dari ? `${dari} 00:00:00` : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const tanggalSelesai = sampai ? `${sampai} 23:59:59` : new Date().toISOString();

  try {
    // Ringkasan: total omset & jumlah transaksi
    const ringkasan = await pool.query(
      `SELECT COALESCE(SUM(total), 0) AS total_omset, COUNT(*) AS jumlah_transaksi
       FROM transactions
       WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3`,
      [req.tenant_id, tanggalMulai, tanggalSelesai]
    );

    // Produk terlaris (top 5 berdasarkan jumlah terjual)
    const produkTerlaris = await pool.query(
      `SELECT products.nama, SUM(transaction_items.qty) AS total_terjual,
              SUM(transaction_items.qty * transaction_items.harga_saat_jual) AS total_omset_produk
       FROM transaction_items
       JOIN transactions ON transaction_items.transaction_id = transactions.id
       JOIN products ON transaction_items.product_id = products.id
       WHERE transactions.tenant_id = $1 AND transactions.created_at BETWEEN $2 AND $3
       GROUP BY products.nama
       ORDER BY total_terjual DESC
       LIMIT 5`,
      [req.tenant_id, tanggalMulai, tanggalSelesai]
    );

    res.json({
      periode: { dari: tanggalMulai, sampai: tanggalSelesai },
      total_omset: ringkasan.rows[0].total_omset,
      jumlah_transaksi: ringkasan.rows[0].jumlah_transaksi,
      produk_terlaris: produkTerlaris.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil laporan' });
  }
});

router.get('/grafik', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  const { dari, sampai } = req.query;

  const tanggalMulai = dari ? `${dari} 00:00:00` : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const tanggalSelesai = sampai ? `${sampai} 23:59:59` : new Date().toISOString();

  try {
    const result = await pool.query(
      `SELECT DATE(created_at) AS tanggal, SUM(total) AS total_harian
       FROM transactions
       WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
       GROUP BY DATE(created_at)
       ORDER BY tanggal ASC`,
      [req.tenant_id, tanggalMulai, tanggalSelesai]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data grafik' });
  }
});

module.exports = router;