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

  let visitas = []; // [{ nombre, puesto }]

  function render() {
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
    render();
  }

  return { getVisitas, reset };
}
