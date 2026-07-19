function validate(schema) {
  return (req, res, next) => {
    const hasil = schema.safeParse(req.body);
    if (!hasil.success) {
      const pesanError = hasil.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      return res.status(400).json({ error: pesanError });
    }
    req.body = hasil.data; // pakai data yang sudah divalidasi
    next();
  };
}

module.exports = validate;