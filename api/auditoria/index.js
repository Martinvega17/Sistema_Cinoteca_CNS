import { query } from '../_db.js';
import { requireAdmin } from '../_auth.js';

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { rows } = await query(
    `SELECT au.id, au.accion, au.registro_afectado, au.detalles, au.fecha,
            u.usuario
     FROM auditoria au
     LEFT JOIN usuarios u ON u.id = au.usuario_id
     ORDER BY au.fecha DESC
     LIMIT 300`
  );
  res.status(200).json(rows);
}

export default requireAdmin(handler);
