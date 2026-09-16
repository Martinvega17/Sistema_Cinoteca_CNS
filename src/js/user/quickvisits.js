import { api } from '../core/api.js';
import { showToast } from '../core/ui.js';

/**
 * "Visita o personal externo" — para alguien que va a entrar una sola vez
 * (o muy de vez en cuando) y que NO tiene caso dar de alta en el directorio
 * de personal (`personas`). A diferencia del multiselect (que sí lista y
 * consulta /api/personas), esto es solo texto libre que vive en memoria del
 * navegador: al enviar el formulario, records.js manda estos datos al
 * backend como `visitas`, que los guarda ÚNICAMENTE en el renglón de
 * `accesos` correspondiente (columnas visita_nombre / visita_puesto) — la
 * tabla `personas` nunca se toca.
 */
export function initQuickVisits() {
  const nombreInput = document.getElementById('qvNombre');
  const puestoInput = document.getElementById('qvPuesto');
  const addBtn = document.getElementById('qvAddBtn');
  const chipsBox = document.getElementById('qvChips');
  // FA-PT-0002 (Alcance): toda visita/personal externo debe ir acompañado
  // por personal del área — este bloque solo se muestra (y solo se exige
  // al guardar, ver records.js) cuando hay al menos una visita agregada.
  const acompananteBlock = document.getElementById('acompananteBlock');
  const acompananteSelect = document.getElementById('acompananteSelect');
  const acompananteNombreInput = document.getElementById('acompananteNombre');

  let visitas = []; // [{ nombre, puesto }]

  // Se carga una sola vez: mismo directorio que "Personas que ingresan"
  // (GET /api/personas?activos=true), para elegir quién acompaña a la
  // visita sin tener que escribir el nombre a mano.
  async function loadAcompanantes() {
    if (!acompananteSelect) return;
    try {
      const personas = await api.get('/api/personas?activos=true');
      personas.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.nombre} · ${p.puesto}`;
        acompananteSelect.appendChild(opt);
      });
    } catch {
      // Si falla la carga, queda disponible el campo de texto libre como
      // respaldo — no se bloquea el registro por esto.
    }
  }
  loadAcompanantes();

  function getAcompanante() {
    return {
      acompananteId: acompananteSelect && acompananteSelect.value ? acompananteSelect.value : null,
      acompananteNombre: acompananteNombreInput ? acompananteNombreInput.value.trim() : '',
      requiereAcompanante: necesitaAcompananteManual()
    };
  }

  function resetAcompanante() {
    if (acompananteSelect) acompananteSelect.value = '';
    if (acompananteNombreInput) acompananteNombreInput.value = '';
  }

  // Cuántas personas del directorio ("Personas que ingresan") vienen en el
  // mismo folio ahora mismo. records.js la actualiza con
  // actualizarPersonasSeleccionadas() cada vez que cambia esa selección.
  let personasSeleccionadas = 0;

  function necesitaAcompananteManual() {
    // Si ya viene al menos una persona del directorio en el mismo folio, esa
    // persona es quien acompaña a la visita — no hace falta pedirlo aparte.
    return visitas.length > 0 && personasSeleccionadas === 0;
  }

  function actualizarPersonasSeleccionadas(cantidad) {
    personasSeleccionadas = cantidad;
    render();
  }

  function render() {
    if (acompananteBlock) acompananteBlock.classList.toggle('hidden', !necesitaAcompananteManual());
    chipsBox.innerHTML = '';
    visitas.forEach((v, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `
        ${v.nombre}${v.puesto ? ` · ${v.puesto}` : ''}
        <button type="button" class="chip-remove" data-index="${i}" aria-label="Quitar">×</button>
      `;
      chipsBox.appendChild(chip);
    });
  }

  function agregar() {
    const nombre = nombreInput.value.trim();
    const puesto = puestoInput.value.trim();
    if (!nombre) {
      nombreInput.focus();
      showToast('Escribe el nombre de la visita.');
      return;
    }
    visitas.push({ nombre, puesto });
    render();
    nombreInput.value = '';
    puestoInput.value = '';
    nombreInput.focus();
  }

  addBtn.addEventListener('click', agregar);
  [nombreInput, puestoInput].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); agregar(); }
    });
  });

  chipsBox.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-remove');
    if (!btn) return;
    visitas.splice(Number(btn.dataset.index), 1);
    render();
  });

  function getVisitas() {
    return visitas;
  }

  function reset() {
    visitas = [];
    resetAcompanante();
    render();
  }

  return { getVisitas, reset, getAcompanante, actualizarPersonasSeleccionadas };
}
