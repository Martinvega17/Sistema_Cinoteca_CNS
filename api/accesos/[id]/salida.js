import { query } from '../../_db.js';
import { requireAuth, logAudit } from '../../_auth.js';
import { isExitAfterEntry, formatHM } from '../../../src/js/validation.js';

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { id } = req.query;

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
    `UPDATE accesos SET hora_salida = $1 WHERE id = $2
     RETURNING id, folio_grupo, fecha, hora_entrada, hora_salida, motivo, persona_id`,
    [horaSalida, id]
  );

  await logAudit(req.user.sub, 'accesos.salida', `accesos:${id}`, { horaSalida });

  res.status(200).json(rows[0]);
}

export default requireAuth(handler);
