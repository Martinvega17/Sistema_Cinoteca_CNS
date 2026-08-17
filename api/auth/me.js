import { getSessionFromRequest } from '../_auth.js';

export default async function handler(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'No has iniciado sesión.' });
    return;
  }
  res.status(200).json({ usuario: session.usuario, rol: session.rol });
}
