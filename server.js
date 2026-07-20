const express = require('express');
const cors = require('cors');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const verifyToken = require('./middleware/auth');
const transactionRoutes = require('./routes/transactions');
const checkRole = require('./middleware/checkRole');
const userRoutes = require('./routes/users');
const laporanRoutes = require('./routes/laporan');
const validate = require('./middleware/validate');
const { produkSchema } = require('./schemas');
const storeRoutes = require('./routes/stores');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');
const customerRoutes = require('./routes/customers');
const supplierRoutes = require('./routes/suppliers');
const purchaseRoutes = require('./routes/purchases');
require('dotenv').config();

const app = express();
app.use(cors({
     origin: ['http://localhost:5173', 'https://sistem-penjualan-frontend.vercel.app'],
   }));
app.use(express.json());
app.use(apiLimiter);
app.use('/api/users', userRoutes);
app.use('/api/laporan', laporanRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);


app.get('/', (req, res) => {
  res.send('Server berjalan!');
});

// Route auth TIDAK perlu login (justru untuk login/register)
app.use('/api/auth', authLimiter, authRoutes);

// Endpoint produk SEKARANG wajib login (pakai verifyToken)
// dan otomatis terfilter sesuai tenant yang login
app.get('/api/products', verifyToken, async (req, res) => {
  try {
    let result;
    if (req.role === 'owner') {
      const filterStore = req.query.store_id;
      if (filterStore) {
        result = await pool.query(
          `SELECT products.*, stores.nama_toko FROM products
           JOIN stores ON products.store_id = stores.id
           WHERE products.tenant_id = $1 AND products.store_id = $2 ORDER BY products.id`,
          [req.tenant_id, filterStore]
        );
      } else {
        result = await pool.query(
          `SELECT products.*, stores.nama_toko FROM products
           JOIN stores ON products.store_id = stores.id
           WHERE products.tenant_id = $1 ORDER BY products.id`,
          [req.tenant_id]
        );
      }
    } else {
      result = await pool.query(
        `SELECT products.*, stores.nama_toko FROM products
         JOIN stores ON products.store_id = stores.id
         WHERE products.tenant_id = $1 AND products.store_id = $2 ORDER BY products.id`,
        [req.tenant_id, req.store_id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data produk' });
  }
});

app.post('/api/products', verifyToken, checkRole('owner', 'admin'), validate(produkSchema), async (req, res) => {
  try {
    const { nama, harga, stok, stok_minimum, attributes } = req.body;
    const storeId = req.store_id || req.body.store_id;
    if (!storeId) {
      return res.status(400).json({ error: 'Cabang wajib dipilih' });
    }
    const result = await pool.query(
      'INSERT INTO products (tenant_id, store_id, nama, harga, stok, stok_minimum, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.tenant_id, storeId, nama, harga, stok, stok_minimum ?? 5, attributes || {}]
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
app.put('/api/products/:id', verifyToken, checkRole('owner', 'admin'), validate(produkSchema), async (req, res) => {
  const { id } = req.params;
  const { nama, harga, stok, stok_minimum, attributes } = req.body;
  try {
    const result = await pool.query(
      `UPDATE products SET nama = $1, harga = $2, stok = $3, stok_minimum = $4, attributes = $5
       WHERE id = $6 AND tenant_id = $7 RETURNING *`,
      [nama, harga, stok, stok_minimum ?? 5, attributes || {}, id, req.tenant_id]
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

app.get('/api/products/stok-menipis/list', verifyToken, async (req, res) => {
  try {
    let result;
    if (req.role === 'owner') {
      result = await pool.query(
        `SELECT products.*, stores.nama_toko FROM products
         JOIN stores ON products.store_id = stores.id
         WHERE products.tenant_id = $1 AND products.stok <= products.stok_minimum
         ORDER BY products.stok ASC`,
        [req.tenant_id]
      );
    } else {
      result = await pool.query(
        `SELECT products.*, stores.nama_toko FROM products
         JOIN stores ON products.store_id = stores.id
         WHERE products.tenant_id = $1 AND products.store_id = $2 AND products.stok <= products.stok_minimum
         ORDER BY products.stok ASC`,
        [req.tenant_id, req.store_id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data stok menipis' });
  }
});