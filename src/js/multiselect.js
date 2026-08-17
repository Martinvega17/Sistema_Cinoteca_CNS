import { api } from './api.js';

/**
 * A diferencia de la versión anterior, el directorio de personas ya no es
 * un archivo estático: se carga desde GET /api/personas?activos=true.
 * Agregar o dar de baja personas se hace ahora en la pestaña "Personal"
 * (solo administrador), siguiendo el modelo de permisos: un usuario normal
 * puede registrar entradas/salidas, pero no dar de alta personal nuevo.
 */
export async function initMultiselect() {
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
      <span>${p.nombre} <span class="ms-option-puesto">· ${p.puesto}</span></span>
    `;
    return label;
  }

  async function loadPersonnel() {
    msPanel.innerHTML = '<p class="text-xs text-[var(--text-dim)] p-2">Cargando personal…</p>';
    try {
      const personas = await api.get('/api/personas?activos=true');
      msPanel.innerHTML = '';
      if (personas.length === 0) {
        msPanel.innerHTML = '<p class="text-xs text-[var(--text-dim)] p-2">No hay personal registrado todavía. Un administrador puede agregarlo en la pestaña "Personal".</p>';
        return;
      }
      personas.forEach(p => msPanel.appendChild(buildOption(p)));
    } catch (err) {
      msPanel.innerHTML = `<p class="text-xs text-[var(--danger)] p-2">No se pudo cargar el personal: ${err.message}</p>`;
    }
  }

  function getSelected() {
    return [...msPanel.querySelectorAll('input[type="checkbox"]:checked')]
      .map(c => ({ id: c.value, nombre: c.dataset.nombre, puesto: c.dataset.puesto }));
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
      chip.textContent = `${p.nombre} · ${p.puesto}`;
      msChips.appendChild(chip);
    });
  }

  msTrigger.addEventListener('click', () => msPanel.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!peopleSelect.contains(e.target)) msPanel.classList.add('hidden');
  });
  msPanel.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') refreshSelection();
  });

  await loadPersonnel();

  return { refreshSelection, getSelected, reload: loadPersonnel };
}
