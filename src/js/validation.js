/**
 * Utilidades de validación de horarios para la bitácora.
 * Todas las comparaciones se hacen contra el día de HOY, ya que la
 * bitácora está pensada para operar registros de una sola jornada.
 */

/** Convierte "HH:MM" en un Date de hoy con esa hora. */
export function parseTimeToday(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function minutesDiff(dateA, dateB) {
  return Math.abs(dateA - dateB) / 60000;
}

/**
 * ¿La hora capturada está dentro de un margen (en minutos) respecto a la
 * hora real actual? Evita registrar entradas muy adelantadas o atrasadas
 * respecto al reloj del sistema (por defecto, ±3 minutos).
 */
export function isWithinMargin(timeStr, marginMinutes = 3, now = new Date()) {
  const target = parseTimeToday(timeStr);
  if (!target) return false;
  return minutesDiff(now, target) <= marginMinutes;
}

/** ¿La hora/fecha de salida es igual o posterior a la hora de entrada? */
export function isExitAfterEntry(exitDate, entryTimeStr) {
  const entry = parseTimeToday(entryTimeStr);
  if (!entry) return true;
  return exitDate >= entry;
}

/** Formatea un Date como "HH:MM" (24 horas), igual que los inputs type="time". */
export function formatHM(date) {
  return date.toTimeString().slice(0, 5);
}
