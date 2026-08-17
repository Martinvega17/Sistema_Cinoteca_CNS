import { query } from '../_db.js';
import { requireAuth, requireAdmin, logAudit } from '../_auth.js';

async function handleGet(req, res) {
  const soloActivos = req.query.activos !== 'false';
  const { rows } = await query(
    `SELECT id, nombre, area, puesto, activo, fecha_alta, fecha_baja
     FROM personas
     ${soloActivos ? 'WHERE activo = true' : ''}
     ORDER BY nombre ASC`
  );
  res.status(200).json(rows);
}

async function handlePost(req, res) {
  const { nombre, area, puesto } = req.body || {};
  if (!nombre || !puesto) {
    res.status(400).json({ error: 'Nombre y puesto son obligatorios.' });
    return;
  }

  const { rows } = await query(
    `INSERT INTO personas (nombre, area, puesto)
     VALUES ($1, $2, $3)
     RETURNING id, nombre, area, puesto, activo, fecha_alta`,
    [nombre, area || null, puesto]
  );
  const persona = rows[0];

  await logAudit(req.user.sub, 'personas.creada', `personas:${persona.id}`, { nombre, area, puesto });

  res.status(201).json(persona);
}

async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return requireAdmin(handlePost)(req, res);
  res.status(405).json({ error: 'Método no permitido.' });
}

// Listar personas requiere solo estar autenticado (usuario u administrador);
// crear personas se restringe a administrador dentro de handlePost.
export default requireAuth(handler);
