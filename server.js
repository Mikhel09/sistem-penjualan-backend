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
const stockAdjustmentRoutes = require('./routes/stockAdjustments');
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
app.use('/api/stock-adjustments', stockAdjustmentRoutes);



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

    const products = result.rows;
    const productIds = products.map((p) => p.id);
    let variantsResult = { rows: [] };
    if (productIds.length > 0) {
      variantsResult = await pool.query(
        'SELECT * FROM product_variants WHERE product_id = ANY($1) ORDER BY id',
        [productIds]
      );
    }
    const variantsByProduct = {};
    for (const v of variantsResult.rows) {
      if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
      variantsByProduct[v.product_id].push(v);
    }

    const hasil = products.map((p) => ({ ...p, variants: variantsByProduct[p.id] || [] }));
    res.json(hasil);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data produk' });
  }
});

app.post('/api/products', verifyToken, checkRole('owner', 'admin'), validate(produkSchema), async (req, res) => {
  const { nama, harga, stok, stok_minimum, attributes, varian } = req.body;
  const storeId = req.store_id || req.body.store_id;
  if (!storeId) {
    return res.status(400).json({ error: 'Cabang wajib dipilih' });
  }

  const isVarianMode = Array.isArray(varian) && varian.length > 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productResult = await client.query(
      'INSERT INTO products (tenant_id, store_id, nama, harga, stok, stok_minimum, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.tenant_id, storeId, nama, harga, isVarianMode ? 0 : (stok ?? 0), stok_minimum ?? 5, attributes || {}]
    );
    let product = productResult.rows[0];

    const skuUpdate = await client.query('UPDATE products SET sku = $1 WHERE id = $2 RETURNING *', [`P${product.id}`, product.id]);
    product = skuUpdate.rows[0];

    const savedVariants = [];
    if (isVarianMode) {
      for (const v of varian) {
        const vResult = await client.query(
          'INSERT INTO product_variants (product_id, ukuran, warna, stok, harga) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [product.id, v.ukuran || null, v.warna || null, v.stok, v.harga || null]
        );
        const variant = vResult.rows[0];
        const vSkuUpdate = await client.query(
          'UPDATE product_variants SET sku = $1 WHERE id = $2 RETURNING *',
          [`P${product.id}V${variant.id}`, variant.id]
        );
        savedVariants.push(vSkuUpdate.rows[0]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ ...product, variants: savedVariants });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah produk' });
  } finally {
    client.release();
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
      `UPDATE products SET nama = $1, harga = $2, stok = COALESCE($3, stok), stok_minimum = $4, attributes = $5
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

// Tambah varian baru ke produk yang sudah ada (misal nambah 1 warna baru)
app.post('/api/products/:id/variants', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { ukuran, warna, stok, harga } = req.body;
  try {
    const productCheck = await pool.query('SELECT id FROM products WHERE id = $1 AND tenant_id = $2', [id, req.tenant_id]);
    if (productCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }
    const result = await pool.query(
      'INSERT INTO product_variants (product_id, ukuran, warna, stok, harga) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, ukuran || null, warna || null, Number(stok) || 0, harga ? Number(harga) : null]
    );
    const variant = result.rows[0];
    const skuUpdate = await pool.query(
      'UPDATE product_variants SET sku = $1 WHERE id = $2 RETURNING *',
      [`P${id}V${variant.id}`, variant.id]
    );
    res.status(201).json(skuUpdate.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah varian' });
  }
});

// Ubah stok/ukuran/warna satu varian
app.put('/api/products/:id/variants/:variantId', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  const { id, variantId } = req.params;
  const { ukuran, warna, stok, harga } = req.body;
  try {
    const result = await pool.query(
      `UPDATE product_variants SET ukuran = $1, warna = $2, stok = $3, harga = $4
       WHERE id = $5 AND product_id = $6 RETURNING *`,
      [ukuran || null, warna || null, Number(stok) || 0, harga ? Number(harga) : null, variantId, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Varian tidak ditemukan' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengubah varian' });
  }
});

// Hapus varian (hanya boleh kalau belum pernah terjual)
app.delete('/api/products/:id/variants/:variantId', verifyToken, checkRole('owner', 'admin'), async (req, res) => {
  const { id, variantId } = req.params;
  try {
    const used = await pool.query('SELECT id FROM transaction_items WHERE variant_id = $1 LIMIT 1', [variantId]);
    if (used.rows.length > 0) {
      return res.status(400).json({ error: 'Varian ini sudah pernah terjual, tidak bisa dihapus' });
    }
    const result = await pool.query('DELETE FROM product_variants WHERE id = $1 AND product_id = $2 RETURNING id', [variantId, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Varian tidak ditemukan' });
    }
    res.json({ message: 'Varian berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus varian' });
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
    const filterStore = req.role === 'owner' ? null : req.store_id;

    const queryProdukBiasa = filterStore
      ? `SELECT products.*, stores.nama_toko, NULL AS ukuran, NULL AS warna FROM products
         JOIN stores ON products.store_id = stores.id
         WHERE products.tenant_id = $1 AND products.store_id = $2 AND products.stok <= products.stok_minimum
         AND NOT EXISTS (SELECT 1 FROM product_variants WHERE product_variants.product_id = products.id)`
      : `SELECT products.*, stores.nama_toko, NULL AS ukuran, NULL AS warna FROM products
         JOIN stores ON products.store_id = stores.id
         WHERE products.tenant_id = $1 AND products.stok <= products.stok_minimum
         AND NOT EXISTS (SELECT 1 FROM product_variants WHERE product_variants.product_id = products.id)`;

    const queryVarian = filterStore
      ? `SELECT products.*, stores.nama_toko, product_variants.ukuran, product_variants.warna, product_variants.stok AS stok
         FROM product_variants
         JOIN products ON product_variants.product_id = products.id
         JOIN stores ON products.store_id = stores.id
         WHERE products.tenant_id = $1 AND products.store_id = $2 AND product_variants.stok <= products.stok_minimum`
      : `SELECT products.*, stores.nama_toko, product_variants.ukuran, product_variants.warna, product_variants.stok AS stok
         FROM product_variants
         JOIN products ON product_variants.product_id = products.id
         JOIN stores ON products.store_id = stores.id
         WHERE products.tenant_id = $1 AND product_variants.stok <= products.stok_minimum`;

    const params = filterStore ? [req.tenant_id, filterStore] : [req.tenant_id];
    const [hasilBiasa, hasilVarian] = await Promise.all([
      pool.query(queryProdukBiasa, params),
      pool.query(queryVarian, params),
    ]);

    res.json([...hasilBiasa.rows, ...hasilVarian.rows]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data stok menipis' });
  }
});

app.get('/api/products/cari-kode', verifyToken, async (req, res) => {
  const { kode } = req.query;
  if (!kode) {
    return res.status(400).json({ error: 'Kode wajib diisi' });
  }
  try {
    const storeFilter = req.role === 'owner' ? null : req.store_id;

    const variantQuery = storeFilter
      ? `SELECT product_variants.*, products.nama, products.harga AS harga_produk
         FROM product_variants
         JOIN products ON product_variants.product_id = products.id
         WHERE products.tenant_id = $1 AND products.store_id = $2 AND product_variants.sku = $3`
      : `SELECT product_variants.*, products.nama, products.harga AS harga_produk
         FROM product_variants
         JOIN products ON product_variants.product_id = products.id
         WHERE products.tenant_id = $1 AND product_variants.sku = $2`;
    const variantParams = storeFilter ? [req.tenant_id, storeFilter, kode] : [req.tenant_id, kode];
    const variantResult = await pool.query(variantQuery, variantParams);

    if (variantResult.rows.length > 0) {
      return res.json({ tipe: 'varian', data: variantResult.rows[0] });
    }

    const productQuery = storeFilter
      ? `SELECT * FROM products WHERE tenant_id = $1 AND store_id = $2 AND (sku = $3 OR attributes->>'barcode' = $3)`
      : `SELECT * FROM products WHERE tenant_id = $1 AND (sku = $2 OR attributes->>'barcode' = $2)`;
    const productParams = storeFilter ? [req.tenant_id, storeFilter, kode] : [req.tenant_id, kode];
    const productResult = await pool.query(productQuery, productParams);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produk dengan kode ini tidak ditemukan' });
    }

    res.json({ tipe: 'produk', data: productResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mencari produk' });
  }
});