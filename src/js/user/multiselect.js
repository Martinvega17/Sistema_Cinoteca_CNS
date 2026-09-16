import { api } from '../core/api.js';

/**
 * El directorio de personas se carga desde GET /api/personas?activos=true.
 * Agregar personal FIJO se hace en la pestaña "Personal" (solo
 * administrador). Las visitas o personal externo ocasional YA NO se dan de
 * alta aquí ni se guardan en el directorio `personas` — se capturan aparte
 * con el cuadro "Visita o personal externo" (ver quickvisits.js), y solo
 * quedan registradas en la bitácora de accesos, nunca en `personas`.
 *
 * onChange (opcional): se invoca cada vez que cambia la selección, con la
 * lista actual de seleccionados. La usa records.js para decidir si el
 * bloque "Acompañado por" de quickvisits.js debe mostrarse o no (si ya hay
 * personal fijo en el mismo folio, no hace falta pedir acompañante aparte).
 */
export async function initMultiselect(onChange) {
  const msTrigger = document.getElementById('msTrigger');
  const msTriggerLabel = document.getElementById('msTriggerLabel');
  const msPanel = document.getElementById('msPanel');
  const msChips = document.getElementById('msChips');
  const peopleSelect = document.getElementById('peopleSelect');

  function buildOption(p) {
    const label = document.createElement('label');
    label.className = 'ms-option';
    label.innerHTML = `
      <input type="checkbox" value="${p.id}" data-nombre="${p.nombre}" data-puesto="${p.puesto}">
      <span>${p.nombre} <span class="ms-option-puesto">· ${p.puesto}</span>${p.es_visita ? ' <span class="visita-badge">Visita</span>' : ''}</span>
    `;
    return label;
  }

  async function loadPersonnel() {
    msPanel.innerHTML = '<p class="text-xs text-[var(--text-dim)] p-2">Cargando personal…</p>';
    try {
      const personas = await api.get('/api/personas?activos=true');
      msPanel.innerHTML = '';
      if (personas.length === 0) {
        msPanel.innerHTML = '<p class="text-xs text-[var(--text-dim)] p-2">No hay personal registrado todavía. Pide a un administrador que dé de alta al personal fijo en la pestaña "Personal", o usa el cuadro de "Visita o personal externo" de abajo si es alguien ocasional.</p>';
      } else {
        personas.forEach(p => msPanel.appendChild(buildOption(p)));
      }
    } catch (err) {
      msPanel.innerHTML = `<p class="text-xs text-[var(--danger)] p-2">No se pudo cargar el personal: ${err.message}</p>`;
    }
  }

  function getSelected() {
    return [...msPanel.querySelectorAll('input[type="checkbox"]:checked')]
      .map(c => ({ id: c.value, nombre: c.dataset.nombre, puesto: c.dataset.puesto }));
  }

  function uncheck(id) {
    const input = msPanel.querySelector(`input[type="checkbox"][value="${id}"]`);
    if (input) input.checked = false;
    refreshSelection();
  }

  function refreshSelection() {
    const selected = getSelected();
    msTriggerLabel.textContent = selected.length
      ? selected.length + (selected.length === 1 ? ' persona seleccionada' : ' personas seleccionadas')
      : 'Selecciona una o varias personas';
    msTriggerLabel.classList.toggle('ms-placeholder', selected.length === 0);

    msChips.innerHTML = '';
    selected.forEach(p => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `
        ${p.nombre} · ${p.puesto}
        <button type="button" class="chip-remove" data-id="${p.id}" aria-label="Quitar">×</button>
      `;
      msChips.appendChild(chip);
    });

    if (onChange) onChange(selected);
  }

  msTrigger.addEventListener('click', () => msPanel.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!peopleSelect.contains(e.target)) msPanel.classList.add('hidden');
  });
  msPanel.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') refreshSelection();
  });
  msChips.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-remove');
    if (btn) uncheck(btn.dataset.id);
  });

  await loadPersonnel();

  return { refreshSelection, getSelected, reload: loadPersonnel };
}
