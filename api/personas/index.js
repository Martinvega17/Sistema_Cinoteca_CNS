import { query } from '../_db.js';
import { requireAuth, logAudit } from '../_auth.js';

async function handleGet(req, res) {
  const soloActivos = req.query.activos !== 'false';
  const { rows } = await query(
    `SELECT id, nombre, area, puesto, activo, fecha_alta, fecha_baja, es_visita
     FROM personas
     ${soloActivos ? 'WHERE activo = true' : ''}
     ORDER BY nombre ASC`
  );
  res.status(200).json(rows);
}

async function handlePost(req, res) {
  const { nombre, area, puesto } = req.body || {};
  if (!nombre) {
    res.status(400).json({ error: 'El nombre es obligatorio.' });
    return;
  }

  // Un administrador da de alta personal fijo desde la pestaña "Personal".
  // Cualquier usuario autenticado puede dar de alta una VISITA ocasional
  // directamente desde "Personas que ingresan" (p. ej. alguien que no es
  // del área pero necesita acceso puntual) — se marca como `es_visita`
  // para distinguirla del padrón fijo en el directorio del administrador.
  const esAdmin = req.user.rol === 'administrador';
  const esVisita = !esAdmin;
  const puestoFinal = puesto || (esVisita ? 'Visita' : null);
  if (!puestoFinal) {
    res.status(400).json({ error: 'El puesto es obligatorio.' });
    return;
  }

  const { rows } = await query(
    `INSERT INTO personas (nombre, area, puesto, es_visita)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nombre, area, puesto, activo, fecha_alta, es_visita`,
    [nombre, area || null, puestoFinal, esVisita]
  );
  const persona = rows[0];

  await logAudit(
    req.user.sub,
    esVisita ? 'personas.visita_creada' : 'personas.creada',
    `personas:${persona.id}`,
    { nombre, area, puesto: puestoFinal }
  );

  res.status(201).json(persona);
}

async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.status(405).json({ error: 'Método no permitido.' });
}

// Listar y registrar visitas requiere solo estar autenticado; dar de alta
// personal fijo "no-visita" en realidad también pasa por aquí, pero queda
// determinado por el rol del usuario (ver handlePost), no por un wrapper
// requireAdmin externo.
export default requireAuth(handler);
