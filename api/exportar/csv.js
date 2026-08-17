import { query } from '../_db.js';
import { requireAuth } from '../_auth.js';

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { desde, hasta, persona_id, motivo } = req.query;
  const conditions = [];
  const params = [];
  if (desde) { params.push(desde); conditions.push(`a.fecha >= $${params.length}`); }
  if (hasta) { params.push(hasta); conditions.push(`a.fecha <= $${params.length}`); }
  if (persona_id) { params.push(persona_id); conditions.push(`a.persona_id = $${params.length}`); }
  if (motivo) { params.push(motivo); conditions.push(`a.motivo = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT a.folio_grupo, p.nombre, p.puesto, a.fecha, a.hora_entrada, a.hora_salida, a.motivo
     FROM accesos a JOIN personas p ON p.id = a.persona_id
     ${where}
     ORDER BY a.fecha DESC, a.hora_entrada DESC`,
    params
  );

  const headers = ['Folio', 'Nombre', 'Puesto', 'Fecha', 'Hora entrada', 'Hora salida', 'Motivo'];
  const lines = [headers.join(',')];
  rows.forEach(r => {
    lines.push([
      csvEscape(r.folio_grupo),
      csvEscape(r.nombre),
      csvEscape(r.puesto),
      csvEscape(r.fecha.toISOString().slice(0, 10)),
      csvEscape(r.hora_entrada),
      csvEscape(r.hora_salida),
      csvEscape(r.motivo)
    ].join(','));
  });
  // BOM al inicio para que Excel detecte UTF-8 y no rompa los acentos/ñ
  const csv = '\uFEFF' + lines.join('\r\n');

  const fecha = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bitacora_cinoteca_${fecha}.csv"`);
  res.status(200).send(csv);
}

export default requireAuth(handler);
