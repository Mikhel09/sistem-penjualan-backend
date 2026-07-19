const express = require('express');
const cors = require('cors');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const verifyToken = require('./middleware/auth');
const transactionRoutes = require('./routes/transactions');
const checkRole = require('./middleware/checkRole');
const userRoutes = require('./routes/users');
const laporanRoutes = require('./routes/laporan');
require('dotenv').config();

const app = express();
app.use(cors({
     origin: ['http://localhost:5173', 'https://sistem-penjualan-frontend.vercel.app'],
   }));
app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/api/laporan', laporanRoutes);


app.get('/', (req, res) => {
  res.send('Server berjalan!');
});

// Route auth TIDAK perlu login (justru untuk login/register)
app.use('/api/auth', authRoutes);

// Endpoint produk SEKARANG wajib login (pakai verifyToken)
// dan otomatis terfilter sesuai tenant yang login
app.get('/api/products', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE tenant_id = $1 ORDER BY id',
      [req.tenant_id] // <-- diambil dari token, bukan dari frontend
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data produk' });
  }
});

app.post('/api/products', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  try {
    const { nama, harga, stok, attributes } = req.body;
    const result = await pool.query(
      'INSERT INTO products (tenant_id, nama, harga, stok, attributes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.tenant_id, nama, harga, stok, attributes || {}] // tenant_id dari token
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah produk' });
  }
});

app.use('/api/transactions', transactionRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});

// Edit produk (hanya owner/admin, hanya produk milik tenant sendiri)
app.put('/api/products/:id', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { nama, harga, stok, attributes } = req.body;

  try {
    const result = await pool.query(
      `UPDATE products
       SET nama = $1, harga = $2, stok = $3, attributes = $4
       WHERE id = $5 AND tenant_id = $6
       RETURNING *`,
      [nama, harga, stok, attributes || {}, id, req.tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengubah produk' });
  }
});

// Hapus produk (hanya owner/admin, hanya produk milik tenant sendiri)
app.delete('/api/products/:id', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [id, req.tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }

    res.json({ message: 'Produk berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus produk' });
  }
});