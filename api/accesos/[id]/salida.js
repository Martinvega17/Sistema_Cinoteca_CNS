import { query } from '../../_db.js';
import { requireAuth, logAudit } from '../../_auth.js';
import { isExitAfterEntry, formatHM } from '../../../src/js/core/validation.js';

// Mismo formato/validación que en api/accesos/index.js: data URL PNG.
function esFirmaValida(firma) {
  return typeof firma === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(firma);
}

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { id } = req.query;
  const { firma } = req.body || {};

  if (!esFirmaValida(firma)) {
    res.status(400).json({ error: 'Debes registrar la firma digital para poder registrar la salida.' });
    return;
  }

  const { rows: existentes } = await query(
    'SELECT id, hora_entrada, hora_salida FROM accesos WHERE id = $1',
    [id]
  );
  const acceso = existentes[0];
  if (!acceso) {
    res.status(404).json({ error: 'Registro no encontrado.' });
    return;
  }
  if (acceso.hora_salida) {
    res.status(409).json({ error: 'Este registro ya tiene una salida capturada.' });
    return;
  }

  const now = new Date();
  const horaEntradaStr = acceso.hora_entrada.slice(0, 5); // "HH:MM:SS" -> "HH:MM"

  if (!isExitAfterEntry(now, horaEntradaStr)) {
    res.status(400).json({
      error: `La hora de salida no puede ser anterior a la hora de entrada registrada (${horaEntradaStr}).`
    });
    return;
  }

  const horaSalida = formatHM(now);
  const { rows } = await query(
    `UPDATE accesos SET hora_salida = $1, firma_salida = $2, firma_salida_fecha = now() WHERE id = $3
     RETURNING id, folio_grupo, fecha, hora_entrada, hora_salida, motivo, persona_id, firma_salida, firma_salida_fecha`,
    [horaSalida, firma, id]
  );

  await logAudit(req.user.sub, 'accesos.salida', `accesos:${id}`, { horaSalida, firmada: true });

  res.status(200).json(rows[0]);
}

export default requireAuth(handler);
