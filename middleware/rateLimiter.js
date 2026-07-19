const rateLimit = require('express-rate-limit');

// Limiter ketat khusus untuk login/register (rawan dicoba berkali-kali oleh orang jahat)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10, // maksimal 10 percobaan per 15 menit per alamat IP
  message: { error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter lebih longgar untuk endpoint umum lainnya
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, // 300 request per 15 menit per IP, cukup longgar untuk pemakaian normal
  message: { error: 'Terlalu banyak request. Coba lagi sebentar lagi.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, apiLimiter };