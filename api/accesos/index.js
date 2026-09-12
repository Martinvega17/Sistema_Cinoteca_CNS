import { query } from '../_db.js';
import { requireAuth, logAudit } from '../_auth.js';
import { isWithinMargin, todayYMD } from '../../src/js/core/validation.js';

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
            a.persona_id,
            COALESCE(p.nombre, a.visita_nombre) AS nombre,
            COALESCE(p.puesto, a.visita_puesto, 'Visita') AS puesto,
            (a.persona_id IS NULL) AS es_visita_suelta
     FROM accesos a
     LEFT JOIN personas p ON p.id = a.persona_id
     ${where}
     ORDER BY a.fecha DESC, a.hora_entrada DESC, a.id DESC
     LIMIT 500`,
    params
  );
  res.status(200).json(rows);
}

async function handlePost(req, res) {
  const { personas, visitas, horaEntrada, motivo } = req.body || {};

  const listaPersonas = Array.isArray(personas) ? personas : [];
  // `visitas`: personas externas/ocasionales capturadas al vuelo, que NO se
  // guardan en el directorio `personas` — solo su nombre queda en el propio
  // renglón de `accesos` (ver visita_nombre/visita_puesto en el schema).
  const listaVisitas = Array.isArray(visitas)
    ? visitas
        .map(v => ({ nombre: (v?.nombre || '').trim(), puesto: (v?.puesto || '').trim() }))
        .filter(v => v.nombre)
    : [];

  if (listaPersonas.length === 0 && listaVisitas.length === 0) {
    res.status(400).json({ error: 'Selecciona o agrega al menos una persona que ingresa.' });
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

  // Se manda `fecha` explícita (calculada en hora de México) en vez de
  // dejar que la columna use su DEFAULT CURRENT_DATE: ese default depende
  // de la zona horaria de la sesión de Postgres (Neon usa UTC), lo que
  // podía registrar el acceso con la fecha del día siguiente cerca de la
  // medianoche en México.
  const fecha = todayYMD();

  const inserted = [];
  for (const personaId of listaPersonas) {
    const { rows } = await query(
      `INSERT INTO accesos (folio_grupo, persona_id, fecha, hora_entrada, motivo, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, folio_grupo, fecha, hora_entrada, hora_salida, motivo, persona_id, visita_nombre, visita_puesto`,
      [folioGrupo, personaId, fecha, horaEntrada, motivo, req.user.sub]
    );
    inserted.push(rows[0]);
  }

  for (const visita of listaVisitas) {
    const { rows } = await query(
      `INSERT INTO accesos (folio_grupo, persona_id, visita_nombre, visita_puesto, fecha, hora_entrada, motivo, registrado_por)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)
       RETURNING id, folio_grupo, fecha, hora_entrada, hora_salida, motivo, persona_id, visita_nombre, visita_puesto`,
      [folioGrupo, visita.nombre, visita.puesto || null, fecha, horaEntrada, motivo, req.user.sub]
    );
    inserted.push(rows[0]);
  }

  await logAudit(req.user.sub, 'accesos.entrada', `folio:${folioGrupo}`, {
    personas: listaPersonas,
    visitas: listaVisitas,
    horaEntrada,
    motivo
  });

  res.status(201).json({ folio_grupo: folioGrupo, registros: inserted });
}

// Borra TODOS los accesos de hoy y reinicia el folio a 001. Es para poder
// limpiar registros de prueba sin dejar basura en la base de datos — no
// borra nada de días anteriores. Solo administrador.
async function handleDelete(req, res) {
  if (req.user.rol !== 'administrador') {
    res.status(403).json({ error: 'Esta acción requiere rol de administrador.' });
    return;
  }

  const borrarTodo = req.query.todo === 'true';

  if (borrarTodo) {
    const { rowCount } = await query('DELETE FROM accesos');
    await query("ALTER SEQUENCE folio_seq RESTART WITH 1");

    await logAudit(req.user.sub, 'accesos.borrar_todo', 'accesos:*', { eliminados: rowCount });

    res.status(200).json({ eliminados: rowCount, todo: true });
    return;
  }

  const fecha = todayYMD();
  const { rowCount } = await query('DELETE FROM accesos WHERE fecha = $1', [fecha]);
  await query("ALTER SEQUENCE folio_seq RESTART WITH 1");

  await logAudit(req.user.sub, 'accesos.limpiar_hoy', `fecha:${fecha}`, { eliminados: rowCount });

  res.status(200).json({ eliminados: rowCount, fecha });
}

async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.status(405).json({ error: 'Método no permitido.' });
}

export default requireAuth(handler);
