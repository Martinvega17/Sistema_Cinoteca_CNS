import { query } from '../_db.js';
import { requireAdmin, hashPassword, logAudit } from '../_auth.js';

async function handler(req, res) {
  if (req.method !== 'PUT') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { id } = req.query;
  const { rol, activo, password } = req.body || {};

  const { rows: existentes } = await query('SELECT * FROM usuarios WHERE id = $1', [id]);
  const actual = existentes[0];
  if (!actual) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return;
  }

  const nuevoHash = password ? await hashPassword(password) : actual.password_hash;
  const nuevoRol = rol && ['usuario', 'administrador'].includes(rol) ? rol : actual.rol;
  const nuevoActivo = typeof activo === 'boolean' ? activo : actual.activo;

  const { rows } = await query(
    `UPDATE usuarios SET password_hash = $1, rol = $2, activo = $3
     WHERE id = $4
     RETURNING id, usuario, rol, activo`,
    [nuevoHash, nuevoRol, nuevoActivo, id]
  );

  await logAudit(req.user.sub, 'usuarios.editado', `usuarios:${id}`, {
    rol: nuevoRol, activo: nuevoActivo, passwordCambiada: Boolean(password)
  });

  res.status(200).json(rows[0]);
}

export default requireAdmin(handler);
