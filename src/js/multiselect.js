import { personnelDirectory } from './personnel.js';

export function initMultiselect() {
  const msTrigger = document.getElementById('msTrigger');
  const msTriggerLabel = document.getElementById('msTriggerLabel');
  const msPanel = document.getElementById('msPanel');
  const msChips = document.getElementById('msChips');
  const msAddNombre = document.getElementById('msAddNombre');
  const msAddPuesto = document.getElementById('msAddPuesto');
  const msAddBtn = document.getElementById('msAddBtn');
  const msAddRow = document.getElementById('msAddRow');
  const peopleSelect = document.getElementById('peopleSelect');

  function buildOption(nombre, puesto) {
    const label = document.createElement('label');
    label.className = 'ms-option';
    label.innerHTML = `
      <input type="checkbox" value="${nombre}" data-puesto="${puesto}">
      <span>${nombre} <span class="ms-option-puesto">· ${puesto}</span></span>
    `;
    return label;
  }

  // Pinta el directorio inicial de personal (ver src/js/personnel.js)
  personnelDirectory.forEach(p => {
    msPanel.insertBefore(buildOption(p.nombre, p.puesto), msAddRow);
  });

  // Cada persona seleccionada trae su nombre Y su puesto ya vinculados,
  // así no hay que capturar el puesto por separado cuando entran varias
  // personas juntas.
  function getSelected() {
    return [...msPanel.querySelectorAll('input[type="checkbox"]:checked')]
      .map(c => ({ nombre: c.value, puesto: c.dataset.puesto || '—' }));
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

  function addPerson() {
    const nombre = msAddNombre.value.trim();
    const puesto = msAddPuesto.value.trim();
    if (!nombre || !puesto) return;

    const option = buildOption(nombre, puesto);
    option.querySelector('input').checked = true;
    msPanel.insertBefore(option, msAddRow);
    refreshSelection();

    msAddNombre.value = '';
    msAddPuesto.value = '';
    msAddNombre.focus();
  }

  msAddBtn.addEventListener('click', addPerson);
  [msAddNombre, msAddPuesto].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addPerson();
      }
    });
  });

  return { refreshSelection, getSelected };
}
