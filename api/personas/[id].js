import { query } from '../_db.js';
import { requireAdmin, logAudit } from '../_auth.js';

async function handler(req, res) {
  if (req.method !== 'PUT') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { id } = req.query;
  const { nombre, area, puesto, activo } = req.body || {};

  const { rows: existentes } = await query('SELECT * FROM personas WHERE id = $1', [id]);
  if (!existentes[0]) {
    res.status(404).json({ error: 'Persona no encontrada.' });
    return;
  }
  const actual = existentes[0];

  const nuevoActivo = typeof activo === 'boolean' ? activo : actual.activo;
  const dandoDeBaja = actual.activo && nuevoActivo === false;
  const reactivando = !actual.activo && nuevoActivo === true;

  const { rows } = await query(
    `UPDATE personas
     SET nombre = $1,
         area = $2,
         puesto = $3,
         activo = $4,
         fecha_baja = CASE
           WHEN $4 = false AND activo = true THEN now()
           WHEN $4 = true THEN NULL
           ELSE fecha_baja
         END
     WHERE id = $5
     RETURNING id, nombre, area, puesto, activo, fecha_alta, fecha_baja, es_visita`,
    [nombre ?? actual.nombre, area ?? actual.area, puesto ?? actual.puesto, nuevoActivo, id]
  );

  const accion = dandoDeBaja
    ? 'personas.baja'
    : reactivando
      ? 'personas.reactivada'
      : 'personas.editada';

  await logAudit(req.user.sub, accion, `personas:${id}`, req.body);

  res.status(200).json(rows[0]);
}

export default requireAdmin(handler);
