const { z } = require('zod');

const registerSchema = z.object({
  nama_bisnis: z.string().min(2, 'Nama bisnis minimal 2 karakter'),
  jenis_usaha: z.enum(['pakaian', 'makanan_minuman', 'supermarket'], {
    errorMap: () => ({ message: 'Jenis usaha harus salah satu dari: pakaian, makanan_minuman, supermarket' }),
  }),
  nama_user: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
});

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

const produkSchema = z.object({
  nama: z.string().min(1, 'Nama produk wajib diisi'),
  harga: z.number().positive('Harga harus lebih dari 0'),
  stok: z.number().int('Stok harus bilangan bulat').nonnegative('Stok tidak boleh negatif'),
  stok_minimum: z.number().int().nonnegative().optional(),
  attributes: z.record(z.any()).optional(),
  store_id: z.number().optional(),
});

const staffSchema = z.object({
  nama: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  role: z.enum(['kasir', 'admin']).optional(),
  store_id: z.number(),
});

const transaksiSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.number(),
        qty: z.number().int().positive('Qty harus lebih dari 0'),
      })
    )
    .min(1, 'Keranjang tidak boleh kosong'),
  no_meja: z.string().optional(),
  catatan: z.string().optional(),
  store_id: z.number().optional(),
  payment_method: z.enum(['tunai', 'kartu', 'qris']).optional(),
  customer_id: z.number().optional(),
});

module.exports = { registerSchema, loginSchema, produkSchema, staffSchema, transaksiSchema };