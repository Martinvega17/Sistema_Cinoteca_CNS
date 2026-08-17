import { query } from '../_db.js';
import { requireAuth, logAudit } from '../_auth.js';
import { isWithinMargin } from '../../src/js/validation.js';

const ENTRY_MARGIN_MINUTES = 3;

function pad(n) { return String(n).padStart(3, '0'); }

async function handleGet(req, res) {
  const { desde, hasta, persona_id, motivo } = req.query;
  const conditions = [];
  const params = [];

  if (desde) { params.push(desde); conditions.push(`a.fecha >= $${params.length}`); }
  if (hasta) { params.push(hasta); conditions.push(`a.fecha <= $${params.length}`); }
  if (persona_id) { params.push(persona_id); conditions.push(`a.persona_id = $${params.length}`); }
  if (motivo) { params.push(motivo); conditions.push(`a.motivo = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT a.id, a.folio_grupo, a.fecha, a.hora_entrada, a.hora_salida, a.motivo,
            p.id AS persona_id, p.nombre, p.puesto
     FROM accesos a
     JOIN personas p ON p.id = a.persona_id
     ${where}
     ORDER BY a.fecha DESC, a.hora_entrada DESC, a.id DESC
     LIMIT 500`,
    params
  );
  res.status(200).json(rows);
}

async function handlePost(req, res) {
  const { personas, horaEntrada, motivo } = req.body || {};

  if (!Array.isArray(personas) || personas.length === 0) {
    res.status(400).json({ error: 'Selecciona al menos una persona que ingresa.' });
    return;
  }
  if (!motivo) {
    res.status(400).json({ error: 'El motivo de acceso es obligatorio.' });
    return;
  }
  if (!isWithinMargin(horaEntrada, ENTRY_MARGIN_MINUTES)) {
    res.status(400).json({
      error: `La hora de entrada debe estar dentro de ±${ENTRY_MARGIN_MINUTES} minutos de la hora actual del servidor.`
    });
    return;
  }

  const { rows: folioRows } = await query("SELECT nextval('folio_seq') AS n");
  const folioGrupo = pad(folioRows[0].n);

  const inserted = [];
  for (const personaId of personas) {
    const { rows } = await query(
      `INSERT INTO accesos (folio_grupo, persona_id, hora_entrada, motivo, registrado_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, folio_grupo, fecha, hora_entrada, hora_salida, motivo, persona_id`,
      [folioGrupo, personaId, horaEntrada, motivo, req.user.sub]
    );
    inserted.push(rows[0]);
  }

  await logAudit(req.user.sub, 'accesos.entrada', `folio:${folioGrupo}`, { personas, horaEntrada, motivo });

  res.status(201).json({ folio_grupo: folioGrupo, registros: inserted });
}

async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.status(405).json({ error: 'Método no permitido.' });
}

export default requireAuth(handler);
