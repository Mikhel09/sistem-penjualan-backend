const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const pool = require('../db');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../schemas');
require('dotenv').config();

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

router.post('/register', validate(registerSchema), async (req, res) => {
  const { nama_bisnis, jenis_usaha, nama_user, email, password } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email sudah terdaftar' });
    }
    const tenantResult = await pool.query(
      'INSERT INTO tenants (nama_bisnis, jenis_usaha) VALUES ($1, $2) RETURNING id',
      [nama_bisnis, jenis_usaha]
    );
    const tenantId = tenantResult.rows[0].id;
    const hashedPassword = await bcrypt.hash(password, 10);
    const userResult = await pool.query(
      `INSERT INTO users (tenant_id, nama, email, password, role)
       VALUES ($1, $2, $3, $4, 'owner') RETURNING id, nama, email, role, tenant_id`,
      [tenantId, nama_user, email, hashedPassword]
    );
    res.status(201).json({ message: 'Registrasi berhasil', user: userResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mendaftar' });
  }
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT users.*, tenants.jenis_usaha, tenants.nama_bisnis
       FROM users JOIN tenants ON users.tenant_id = tenants.id
       WHERE users.email = $1`,
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Email atau password salah' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Email atau password salah' });
    }
    const token = jwt.sign(
      { user_id: user.id, tenant_id: user.tenant_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id, nama: user.nama, email: user.email, role: user.role,
        jenis_usaha: user.jenis_usaha, nama_bisnis: user.nama_bisnis,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal login' });
  }
});

// BARU: minta link reset password
router.post('/lupa-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email wajib diisi' });
  }

  try {
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    // Sengaja beri pesan yang sama baik email ditemukan atau tidak,
    // supaya orang lain tidak bisa "menebak-nebak" email siapa saja yang terdaftar
    const pesanUmum = { message: 'Jika email terdaftar, link reset password sudah dikirim ke email tersebut' };

    if (result.rows.length === 0) {
      return res.json(pesanUmum);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // berlaku 15 menit

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
      [token, expires, email]
    );

    const resetUrl = `${process.env.FRONTEND_URL}/?token=${token}`;

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: email,
      subject: 'Reset Password - Sistem Penjualan',
      html: `<p>Klik link berikut untuk membuat password baru (berlaku 15 menit):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });

    res.json(pesanUmum);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memproses permintaan' });
  }
});

// BARU: submit password baru pakai token dari email
router.post('/reset-password', async (req, res) => {
  const { token, password_baru } = req.body;

  if (!token || !password_baru || password_baru.length < 6) {
    return res.status(400).json({ error: 'Data tidak valid, password minimal 6 karakter' });
  }

  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Token tidak valid atau sudah kadaluarsa, minta link baru' });
    }

    const hashedPassword = await bcrypt.hash(password_baru, 10);
    await pool.query(
      'UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hashedPassword, result.rows[0].id]
    );

    res.json({ message: 'Password berhasil diubah, silakan login dengan password baru' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal reset password' });
  }
});

module.exports = router;