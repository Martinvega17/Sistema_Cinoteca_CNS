import { saveToLocalStorage, STORAGE_KEY, FOLIO_KEY } from './storage.js';
import { isWithinMargin, isExitAfterEntry, formatHM } from './validation.js';
import { showToast } from './ui.js';

const ENTRY_MARGIN_MINUTES = 3;

/**
 * Controla el formulario de registro, la lista de tarjetas y la
 * exportación/limpieza del respaldo local.
 *
 * @param {Array} records   Arreglo de registros ya cargados (desde storage.js)
 * @param {number} initialFolio  Folio con el que continuar la numeración
 * @param {{refreshSelection:Function, getSelected:Function}} multiselect
 *        Controlador devuelto por initMultiselect().
 */
export function initRecords(records, initialFolio, multiselect) {
  let folio = initialFolio;

  const form = document.getElementById('accessForm');
  const logList = document.getElementById('logList');
  const emptyState = document.getElementById('emptyState');
  const recordCount = document.getElementById('recordCount');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const nextFolio = document.getElementById('nextFolio');
  const horaEntradaInput = document.querySelector('input[name="horaEntrada"]');
  const msTrigger = document.getElementById('msTrigger');

  function pad(n) { return String(n).padStart(3, '0'); }

  function updateNextFolioLabel() {
    nextFolio.textContent = 'FOLIO ' + pad(folio);
  }

  function updateCount() {
    const count = records.length;
    recordCount.textContent = count + (count === 1 ? ' registro' : ' registros');
    emptyState.style.display = count ? 'none' : 'flex';
  }

  function flashError(el) {
    el.classList.add('ring-2', 'ring-[var(--danger)]');
    setTimeout(() => el.classList.remove('ring-2', 'ring-[var(--danger)]'), 1200);
  }

  function renderCard(rec) {
    const card = document.createElement('div');
    card.className = 'log-card';
    card.dataset.folio = rec.folio;

    const peopleHtml = rec.personas.map(p => `
      <div class="lc-person">
        <span class="font-semibold">${p.nombre}</span>
        <span class="lc-person-puesto">· ${p.puesto}</span>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="no-badge text-sm pt-0.5">${rec.folio}</div>
      <div>
        <div class="lc-people-list">${peopleHtml}</div>
        <div class="lc-fields">
          <div>
            <div class="lc-field-label">Hora entrada</div>
            <div class="lc-field-value font-mono">${rec.horaEntrada || '—'}</div>
          </div>
          <div>
            <div class="lc-field-label">Hora salida</div>
            <div class="lc-field-value font-mono salida-cell">${rec.horaSalida || '—'}</div>
          </div>
          <div>
            <div class="lc-field-label">Motivo de acceso</div>
            <div class="lc-field-value">${rec.motivo}</div>
          </div>
        </div>
        <div class="lc-actions estado-cell">
          ${rec.horaSalida
            ? `<span class="status-chip status-fuera">SALIDA REGISTRADA · ${rec.horaSalida}</span>`
            : `<span class="status-chip status-dentro">EN BÓVEDA</span>
               <button type="button" class="btn-outline text-[11px] px-3 py-1.5 registrar-salida-btn">Registrar salida</button>`
          }
        </div>
      </div>
    `;
    return card;
  }

  // Pinta los registros restaurados de localStorage al cargar la página.
  function renderExisting() {
    records.forEach(rec => logList.appendChild(renderCard(rec)));
    updateCount();
    updateNextFolioLabel();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const personas = multiselect.getSelected();
    if (personas.length === 0) {
      flashError(msTrigger);
      showToast('Selecciona al menos una persona que ingresa.');
      return;
    }

    const formData = Object.fromEntries(new FormData(form).entries());
    const horaEntrada = formData.horaEntrada || '';

    // Validación: la hora de entrada debe estar dentro de un margen de
    // ±3 minutos respecto a la hora real del sistema (evita capturar
    // entradas muy adelantadas o atrasadas frente al reloj en vivo).
    if (!isWithinMargin(horaEntrada, ENTRY_MARGIN_MINUTES)) {
      flashError(horaEntradaInput);
      const ahora = formatHM(new Date());
      showToast(`La hora de entrada (${horaEntrada}) es incorrecta favor de introducir hora de entrada correcta.`);
      return;
    }

    const rec = {
      folio: pad(folio),
      personas,
      horaEntrada,
      horaSalida: '',
      motivo: formData.motivo,
      fecha: new Date().toISOString().slice(0, 10),
      registradoEn: new Date().toISOString()
    };
    records.unshift(rec);
    logList.prepend(renderCard(rec));
    updateCount();
    saveToLocalStorage(records, folio);

    /* ------------------------------------------------------------------
       INTEGRACIÓN CON SERVIDOR / BASE DE DATOS
       fetch('/api/bitacora/entrada', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(rec)
       });
    ------------------------------------------------------------------- */

    folio++;
    form.reset();

    document.querySelectorAll('#msPanel input[type="checkbox"]').forEach(c => c.checked = false);
    multiselect.refreshSelection();

    horaEntradaInput.value = new Date().toTimeString().slice(0, 5);
    updateNextFolioLabel();
  });

  logList.addEventListener('click', (e) => {
    const btn = e.target.closest('.registrar-salida-btn');
    if (!btn) return;
    const card = btn.closest('.log-card');
    const rec = records.find(r => r.folio === card.dataset.folio && !r.horaSalida);
    if (!rec) return;

    const now = new Date();

    // Validación: no se puede registrar una salida anterior a la hora de
    // entrada de ese mismo registro (por ejemplo, si la entrada se
    // capturó manualmente a las 15:00 y aún son las 13:00).
    if (!isExitAfterEntry(now, rec.horaEntrada)) {
      showToast(`La hora de salida no puede ser anterior a la hora de entrada registrada (${rec.horaEntrada}).`);
      return;
    }

    const horaSalida = formatHM(now);
    rec.horaSalida = horaSalida;

    card.querySelector('.salida-cell').textContent = horaSalida;
    card.querySelector('.estado-cell').innerHTML =
      `<span class="status-chip status-fuera">SALIDA REGISTRADA · ${horaSalida}</span>`;
    saveToLocalStorage(records, folio);

    /* ------------------------------------------------------------------
       INTEGRACIÓN CON SERVIDOR
       fetch('/api/bitacora/salida', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ folio: rec.folio, horaSalida })
       });
    ------------------------------------------------------------------- */
  });

  exportBtn.addEventListener('click', () => {
    const payload = {
      instituto: 'IPICYT · Bóveda de Resguardo Digital',
      exportadoEn: new Date().toISOString(),
      totalRegistros: records.length,
      registros: records
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fecha = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `bitacora_acceso_ipicyt_${fecha}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  clearBtn.addEventListener('click', () => {
    if (!records.length) return;
    const ok = confirm('Esto borrará los registros guardados en este equipo (no afecta a un servidor/base de datos si ya está conectado). ¿Continuar?');
    if (!ok) return;
    records.length = 0;
    logList.innerHTML = '';
    folio = 1;
    updateNextFolioLabel();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(FOLIO_KEY);
    updateCount();
  });

  renderExisting();

  return { updateCount };
}
