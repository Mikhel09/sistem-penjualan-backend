const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../schemas');
require('dotenv').config();

const router = express.Router();

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
       FROM users
       JOIN tenants ON users.tenant_id = tenants.id
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
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        jenis_usaha: user.jenis_usaha,
        nama_bisnis: user.nama_bisnis,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal login' });
  }
});

module.exports = router;