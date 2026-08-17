import { query } from '../_db.js';
import { requireAuth } from '../_auth.js';

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
    `SELECT a.id, a.folio_grupo, a.fecha, a.hora_entrada, a.hora_salida, a.motivo,
            p.nombre, p.puesto
     FROM accesos a JOIN personas p ON p.id = a.persona_id
     ${where}
     ORDER BY a.fecha DESC, a.hora_entrada DESC`,
    params
  );

  const payload = {
    instituto: 'CNS · IPICYT — Cinoteca',
    exportadoEn: new Date().toISOString(),
    filtros: { desde: desde || null, hasta: hasta || null, persona_id: persona_id || null, motivo: motivo || null },
    totalRegistros: rows.length,
    registros: rows
  };

  const fecha = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="bitacora_cinoteca_${fecha}.json"`);
  res.status(200).send(JSON.stringify(payload, null, 2));
}

export default requireAuth(handler);
