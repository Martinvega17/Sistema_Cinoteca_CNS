import { api } from './api.js';
import { showToast } from './ui.js';

/**
 * El directorio de personas se carga desde GET /api/personas?activos=true.
 * Agregar personal FIJO se hace en la pestaña "Personal" (solo
 * administrador). Pero cualquier usuario puede dar de alta una VISITA
 * ocasional (alguien que no es del área) directamente desde aquí, con el
 * mini-formulario "+ Agregar persona nueva" al fondo de la lista — el
 * backend la marca automáticamente como `es_visita`.
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
      <span>${p.nombre} <span class="ms-option-puesto">· ${p.puesto}</span>${p.es_visita ? ' <span class="visita-badge">Visita</span>' : ''}</span>
    `;
    return label;
  }

  function buildAddNewRow() {
    const wrapper = document.createElement('div');
    wrapper.className = 'ms-add-row';
    wrapper.innerHTML = `
      <input type="text" id="msNuevoNombre" placeholder="Nombre completo de la visita">
      <input type="text" id="msNuevoPuesto" placeholder="Motivo / procedencia (opcional)">
      <button type="button" class="ms-add-btn" id="msNuevoGuardar">+ Agregar</button>
    `;
    return wrapper;
  }

  async function loadPersonnel() {
    msPanel.innerHTML = '<p class="text-xs text-[var(--text-dim)] p-2">Cargando personal…</p>';
    try {
      const personas = await api.get('/api/personas?activos=true');
      msPanel.innerHTML = '';
      if (personas.length === 0) {
        msPanel.innerHTML = '<p class="text-xs text-[var(--text-dim)] p-2">No hay personal registrado todavía. Agrega una persona abajo, o pide a un administrador que dé de alta al personal fijo en la pestaña "Personal".</p>';
      } else {
        personas.forEach(p => msPanel.appendChild(buildOption(p)));
      }
      msPanel.appendChild(buildAddNewRow());
      wireAddNewRow();
    } catch (err) {
      msPanel.innerHTML = `<p class="text-xs text-[var(--danger)] p-2">No se pudo cargar el personal: ${err.message}</p>`;
    }
  }

  function wireAddNewRow() {
    const nombreInput = document.getElementById('msNuevoNombre');
    const puestoInput = document.getElementById('msNuevoPuesto');
    const guardarBtn = document.getElementById('msNuevoGuardar');

    async function agregar() {
      const nombre = nombreInput.value.trim();
      const puesto = puestoInput.value.trim();
      if (!nombre) {
        nombreInput.focus();
        showToast('Escribe el nombre de la persona.');
        return;
      }

      guardarBtn.disabled = true;
      try {
        const nueva = await api.post('/api/personas', { nombre, puesto: puesto || undefined });
        await loadPersonnel(); // vuelve a pintar la lista con la nueva persona incluida

        // Selecciona automáticamente a la persona recién agregada.
        const nuevoCheckbox = msPanel.querySelector(`input[type="checkbox"][value="${nueva.id}"]`);
        if (nuevoCheckbox) {
          nuevoCheckbox.checked = true;
          refreshSelection();
        }
        showToast(`${nueva.nombre} agregada y seleccionada.`, 'warning');
      } catch (err) {
        showToast(err.message);
      } finally {
        guardarBtn.disabled = false;
      }
    }

    guardarBtn.addEventListener('click', agregar);
    [nombreInput, puestoInput].forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); agregar(); }
      });
      // Evita que un clic dentro del formulario cierre el panel del multiselect.
      input.addEventListener('click', (e) => e.stopPropagation());
    });
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
