import { query } from '../_db.js';
import { requireAdmin, hashPassword, logAudit } from '../_auth.js';

async function handleGet(req, res) {
  const { rows } = await query(
    `SELECT id, usuario, rol, activo, created_at FROM usuarios ORDER BY usuario ASC`
  );
  res.status(200).json(rows);
}

async function handlePost(req, res) {
  const { usuario, password, rol } = req.body || {};
  if (!usuario || !password) {
    res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
    return;
  }
  if (rol && !['usuario', 'administrador'].includes(rol)) {
    res.status(400).json({ error: 'Rol inválido.' });
    return;
  }

  const hash = await hashPassword(password);
  try {
    const { rows } = await query(
      `INSERT INTO usuarios (usuario, password_hash, rol)
       VALUES ($1, $2, $3)
       RETURNING id, usuario, rol, activo, created_at`,
      [usuario, hash, rol || 'usuario']
    );
    await logAudit(req.user.sub, 'usuarios.creado', `usuarios:${rows[0].id}`, { usuario, rol: rol || 'usuario' });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      res.status(409).json({ error: 'Ese nombre de usuario ya existe.' });
      return;
    }
    throw err;
  }
}

async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.status(405).json({ error: 'Método no permitido.' });
}

export default requireAdmin(handler);
