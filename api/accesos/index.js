import { query, getClient } from '../_db.js';
import { requireAuth, logAudit, verifyPassword } from '../_auth.js';
import { isWithinMargin, todayYMD } from '../../src/js/core/validation.js';

const ENTRY_MARGIN_MINUTES = 3;

// La firma llega como data URL PNG (ver src/js/core/signature-pad.js).
// Se valida el formato aquí mismo, además de en el cliente, porque el
// cliente nunca es de confianza.
function esFirmaValida(firma) {
  return typeof firma === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(firma);
}

// Roles que pueden ejecutar CUALQUIER borrado sobre `accesos`. Dentro de
// handleDelete se aplica una restricción adicional: "borrar todo" solo la
// puede ejecutar "responsable_institucional" (ver esa función).
const ROLES_BORRADO = ['administrador', 'responsable_institucional'];

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
            (a.persona_id IS NULL) AS es_visita_suelta,
            a.acompanante_id,
            COALESCE(ac.nombre, a.acompanante_nombre) AS acompanante,
            a.firma_entrada, a.firma_entrada_fecha,
            a.firma_salida, a.firma_salida_fecha
     FROM accesos a
     LEFT JOIN personas p ON p.id = a.persona_id
     LEFT JOIN personas ac ON ac.id = a.acompanante_id
     ${where}
     ORDER BY a.fecha DESC, a.hora_entrada DESC, a.id DESC
     LIMIT 500`,
    params
  );
  res.status(200).json(rows);
}

async function handlePost(req, res) {
  const {
    personas, visitas, horaEntrada, motivo,
    acompananteId, acompananteNombre, firmas
  } = req.body || {};

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

  // Firma digital obligatoria de CADA persona/visita: debe llegar
  // exactamente una firma por cada renglón que se va a insertar, EN EL
  // MISMO ORDEN en que se insertan abajo (primero `listaPersonas`, luego
  // `listaVisitas`) — ese orden lo arma el frontend en records.js. Antes
  // se guardaba una sola firma compartida para todo el folio; ahora cada
  // persona firma su propio renglón, igual que ya pasaba con la salida.
  const listaFirmas = Array.isArray(firmas) ? firmas : [];
  const totalEntrantes = listaPersonas.length + listaVisitas.length;
  if (listaFirmas.length !== totalEntrantes || !listaFirmas.every(esFirmaValida)) {
    res.status(400).json({ error: 'Debes registrar la firma digital de cada persona que ingresa para poder guardar la entrada.' });
    return;
  }
  if (!isWithinMargin(horaEntrada, ENTRY_MARGIN_MINUTES)) {
    res.status(400).json({
      error: `La hora de entrada debe estar dentro de ±${ENTRY_MARGIN_MINUTES} minutos de la hora actual del servidor.`
    });
    return;
  }

  // FA-PT-0002 (Alcance): todo personal externo o de otra área debe ingresar
  // acompañado por personal de almacenamiento y respaldos. Si en el mismo
  // folio ya viene al menos una persona del directorio, ESA persona cuenta
  // como acompañante y se usa automáticamente (no se le vuelve a pedir al
  // usuario — ver records.js). El acompañante explícito solo es
  // obligatorio cuando la visita entra sola, sin nadie del directorio en
  // el mismo folio.
  let acompananteIdNum = acompananteId ? Number(acompananteId) : null;
  const acompananteNombreLimpio = (acompananteNombre || '').trim() || null;
  if (listaVisitas.length > 0 && !acompananteIdNum && !acompananteNombreLimpio) {
    if (listaPersonas.length > 0) {
      acompananteIdNum = Number(listaPersonas[0]);
    } else {
      res.status(400).json({
        error: 'Toda visita o personal externo debe ingresar acompañado por personal del área. Selecciona o captura quién la acompaña.'
      });
      return;
    }
  }

  const { rows: folioRows } = await query("SELECT nextval('folio_seq') AS n");
  const folioGrupo = pad(folioRows[0].n);

  // Se manda `fecha` explícita (calculada en hora de México) en vez de
  // dejar que la columna use su DEFAULT CURRENT_DATE: ese default depende
  // de la zona horaria de la sesión de Postgres (Neon usa UTC), lo que
  // podía registrar el acceso con la fecha del día siguiente cerca de la
  // medianoche en México.
  const fecha = todayYMD();

  // Cada persona/visita trae su propia firma, en el mismo orden en que se
  // insertan aquí (primero personas, luego visitas) — ver validación arriba.
  const inserted = [];
  let firmaIdx = 0;
  for (const personaId of listaPersonas) {
    const firmaPersona = listaFirmas[firmaIdx++];
    const { rows } = await query(
      `INSERT INTO accesos (folio_grupo, persona_id, fecha, hora_entrada, motivo, registrado_por, firma_entrada, firma_entrada_fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       RETURNING id, folio_grupo, fecha, hora_entrada, hora_salida, motivo, persona_id, visita_nombre, visita_puesto, acompanante_id, acompanante_nombre, firma_entrada, firma_entrada_fecha`,
      [folioGrupo, personaId, fecha, horaEntrada, motivo, req.user.sub, firmaPersona]
    );
    inserted.push(rows[0]);
  }

  for (const visita of listaVisitas) {
    const firmaVisita = listaFirmas[firmaIdx++];
    const { rows } = await query(
      `INSERT INTO accesos (folio_grupo, persona_id, visita_nombre, visita_puesto, acompanante_id, acompanante_nombre, fecha, hora_entrada, motivo, registrado_por, firma_entrada, firma_entrada_fecha)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       RETURNING id, folio_grupo, fecha, hora_entrada, hora_salida, motivo, persona_id, visita_nombre, visita_puesto, acompanante_id, acompanante_nombre, firma_entrada, firma_entrada_fecha`,
      [folioGrupo, visita.nombre, visita.puesto || null, acompananteIdNum, acompananteIdNum ? null : acompananteNombreLimpio, fecha, horaEntrada, motivo, req.user.sub, firmaVisita]
    );
    inserted.push(rows[0]);
  }

  await logAudit(req.user.sub, 'accesos.entrada', `folio:${folioGrupo}`, {
    personas: listaPersonas,
    visitas: listaVisitas,
    acompananteId: acompananteIdNum,
    acompananteNombre: acompananteNombreLimpio,
    horaEntrada,
    motivo,
    firmasCapturadas: listaFirmas.length
  });

  res.status(201).json({ folio_grupo: folioGrupo, registros: inserted });
}

// ---------------------------------------------------------------------------
// Verifica la segunda autorización requerida para "Borrar todo el
// historial": debe ser una cuenta activa, con rol Administrador o
// Responsable institucional, DISTINTA de quien solicita la acción, y con
// contraseña correcta. Es un control de doble autorización (cuatro ojos),
// no una simple confirmación de interfaz.
// ---------------------------------------------------------------------------
async function verificarSegundoResponsable(usuarioIdSolicitante, segundoUsuario, segundoPassword) {
  if (!segundoUsuario || !segundoPassword) {
    return { ok: false, error: 'Se requiere usuario y contraseña de un segundo responsable para autorizar esta acción.' };
  }

  const { rows } = await query(
    `SELECT id, password_hash, rol, activo FROM usuarios WHERE usuario = $1`,
    [segundoUsuario]
  );
  const cuenta = rows[0];

  if (!cuenta || !cuenta.activo) {
    return { ok: false, error: 'El segundo responsable no existe o está inactivo.' };
  }
  if (cuenta.id === usuarioIdSolicitante) {
    return { ok: false, error: 'El segundo responsable debe ser una cuenta distinta a la que solicita la acción (doble autorización).' };
  }
  if (!['administrador', 'responsable_institucional'].includes(cuenta.rol)) {
    return { ok: false, error: 'El segundo responsable debe tener rol de Administrador o Responsable institucional.' };
  }
  const passwordOk = await verifyPassword(segundoPassword, cuenta.password_hash);
  if (!passwordOk) {
    return { ok: false, error: 'La contraseña del segundo responsable es incorrecta.' };
  }

  return { ok: true, id: cuenta.id };
}

// Ejecuta, dentro de UNA transacción, el respaldo (snapshot completo en
// `respaldos_eliminacion`) y el borrado, para que nunca pueda perderse el
// respaldo por un borrado exitoso ni quedar un respaldo huérfano de un
// borrado que falló.
async function respaldarYBorrar({ tipo, whereSql, whereParams, usuarioId, segundoUsuarioId }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: registros } = await client.query(
      `SELECT * FROM accesos ${whereSql} ORDER BY id`,
      whereParams
    );

    await client.query(
      `INSERT INTO respaldos_eliminacion (tipo, usuario_id, segundo_usuario_id, registros)
       VALUES ($1, $2, $3, $4)`,
      [tipo, usuarioId, segundoUsuarioId || null, JSON.stringify(registros)]
    );

    const { rowCount } = await client.query(`DELETE FROM accesos ${whereSql}`, whereParams);
    await client.query("ALTER SEQUENCE folio_seq RESTART WITH 1");

    await client.query('COMMIT');
    return rowCount;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function handleDelete(req, res) {
  if (!ROLES_BORRADO.includes(req.user.rol)) {
    res.status(403).json({ error: 'Esta acción requiere rol de administrador o responsable institucional.' });
    return;
  }

  const borrarTodo = req.query.todo === 'true';

  // -------------------------------------------------------------------
  // Borrar TODO el historial: la operación más destructiva del sistema.
  // Controles exigidos (FA-PT-0002 §8 y Manual de Administrador §3.6):
  //   1. Solo el rol "responsable_institucional" puede solicitarla — un
  //      Administrador ya NO puede ejecutarla por sí solo.
  //   2. Doble autorización: una segunda cuenta (Administrador o
  //      Responsable institucional, distinta de quien la solicita) debe
  //      confirmar con su propio usuario y contraseña.
  //   3. Respaldo automático e íntegro de los renglones afectados en
  //      `respaldos_eliminacion` (tabla de solo escritura) ANTES de borrar,
  //      dentro de la misma transacción.
  // -------------------------------------------------------------------
  if (borrarTodo) {
    if (req.user.rol !== 'responsable_institucional') {
      res.status(403).json({
        error: 'Borrar TODO el historial requiere el rol "Responsable institucional". Un Administrador no puede ejecutar esta acción por sí solo.'
      });
      return;
    }

    const { segundoUsuario, segundoPassword } = req.body || {};
    const verificacion = await verificarSegundoResponsable(req.user.sub, segundoUsuario, segundoPassword);
    if (!verificacion.ok) {
      res.status(403).json({ error: verificacion.error });
      return;
    }

    const rowCount = await respaldarYBorrar({
      tipo: 'borrar_todo',
      whereSql: '',
      whereParams: [],
      usuarioId: req.user.sub,
      segundoUsuarioId: verificacion.id
    });

    await logAudit(req.user.sub, 'accesos.borrar_todo', 'accesos:*', {
      eliminados: rowCount,
      autorizadoPor: verificacion.id
    });

    res.status(200).json({ eliminados: rowCount, todo: true });
    return;
  }

  // -------------------------------------------------------------------
  // Limpiar registros de hoy: menor riesgo (solo el día en curso, pensado
  // para depurar pruebas), pero igual queda respaldada automáticamente
  // antes de borrarse.
  // -------------------------------------------------------------------
  const fecha = todayYMD();
  const rowCount = await respaldarYBorrar({
    tipo: 'limpiar_hoy',
    whereSql: 'WHERE fecha = $1',
    whereParams: [fecha],
    usuarioId: req.user.sub
  });

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
