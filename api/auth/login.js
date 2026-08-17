import { query } from '../_db.js';
import { verifyPassword, createSessionCookie, withErrorHandling } from '../_auth.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { usuario, password } = req.body || {};
  if (!usuario || !password) {
    res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
    return;
  }

  const { rows } = await query(
    'SELECT id, usuario, password_hash, rol, activo FROM usuarios WHERE usuario = $1',
    [usuario]
  );
  const user = rows[0];

  // Mismo mensaje genérico si el usuario no existe o la contraseña es
  // incorrecta, para no revelar cuáles usuarios existen en el sistema.
  if (!user || !user.activo || !(await verifyPassword(password, user.password_hash))) {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  res.setHeader('Set-Cookie', createSessionCookie(user));
  res.status(200).json({
    usuario: user.usuario,
    rol: user.rol
  });
}

export default withErrorHandling(handler);
