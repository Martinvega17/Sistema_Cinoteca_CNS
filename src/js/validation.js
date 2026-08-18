/**
 * Utilidades de validación de horarios para la bitácora.
 *
 * IMPORTANTE — por qué esto usa Intl.DateTimeFormat con timeZone fijo:
 * Este mismo archivo se ejecuta tanto en el navegador (donde "la hora local"
 * siempre es la de quien está capturando) como en las funciones serverless
 * de Vercel (donde el proceso corre con TZ=UTC sin importar en qué región
 * esté desplegado). Antes, este módulo usaba `new Date()` + `setHours()` /
 * `toTimeString()`, que dependen de la zona horaria del *proceso* que los
 * ejecuta. En el navegador eso daba la hora de San Luis Potosí, pero en el
 * servidor daba la hora UTC — 6 horas adelantada. Resultado: cualquier
 * registro fallaba con el error de "±3 minutos" aunque la hora capturada
 * fuera exactamente la correcta, porque el servidor comparaba contra una
 * hora que no era la de México.
 *
 * La solución es no depender NUNCA de la zona horaria del proceso: todo se
 * calcula explícitamente en America/Mexico_City (CDMX no usa horario de
 * verano desde 2022, así que el offset es fijo, -06:00).
 */

const TZ = 'America/Mexico_City';

/** Componentes de fecha/hora de `date`, tal como se ven en `tz`. */
function tzParts(date = new Date(), tz = TZ) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return parts; // { year, month, day, hour, minute, second }
}

/** "YYYY-MM-DD" de hoy en `tz` — para filtrar/insertar registros del día. */
export function todayYMD(date = new Date(), tz = TZ) {
  const p = tzParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Minutos transcurridos desde medianoche, en `tz`. */
function nowMinutesOfDay(date = new Date(), tz = TZ) {
  const p = tzParts(date, tz);
  return p.hour * 60 + p.minute + p.second / 60;
}

/** Convierte "HH:MM" en minutos desde medianoche. */
function timeStrToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minutesDiff(a, b) {
  return Math.abs(a - b);
}

/**
 * ¿La hora capturada ("HH:MM") está dentro de un margen (en minutos)
 * respecto a la hora real actual en México? Evita registrar entradas muy
 * adelantadas o atrasadas respecto al reloj (por defecto, ±3 minutos).
 */
export function isWithinMargin(timeStr, marginMinutes = 3, now = new Date(), tz = TZ) {
  const target = timeStrToMinutes(timeStr);
  if (target === null) return false;
  return minutesDiff(nowMinutesOfDay(now, tz), target) <= marginMinutes;
}

/** ¿La hora de salida (Date real) es igual o posterior a la hora de entrada ("HH:MM")? */
export function isExitAfterEntry(exitDate, entryTimeStr, tz = TZ) {
  const entry = timeStrToMinutes(entryTimeStr);
  if (entry === null) return true;
  return nowMinutesOfDay(exitDate, tz) >= entry;
}

/** Formatea un Date como "HH:MM" (24 horas) en `tz`, para guardar/mostrar horas. */
export function formatHM(date = new Date(), tz = TZ) {
  const p = tzParts(date, tz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
