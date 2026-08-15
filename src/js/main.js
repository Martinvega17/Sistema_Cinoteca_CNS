import { initClock } from './clock.js';
import { initMultiselect } from './multiselect.js';
import { initRecords } from './records.js';
import { loadFromLocalStorage } from './storage.js';

// Reloj del encabezado
initClock();

// Selector de personas (checkboxes + agregar persona nueva)
const multiselect = initMultiselect();

// Registros guardados en este equipo (localStorage)
const { records, folio } = loadFromLocalStorage();

// Formulario + lista de tarjetas + exportar/limpiar
initRecords(records, folio, multiselect);

// Precarga la hora de entrada con la hora actual al abrir la página
document.querySelector('input[name="horaEntrada"]').value =
  new Date().toTimeString().slice(0, 5);
