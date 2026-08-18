import { api } from './api.js';
import { isWithinMargin, formatHM, todayYMD } from './validation.js';
import { showToast } from './ui.js';

const ENTRY_MARGIN_MINUTES = 3;

export function initRecords(multiselect) {
  const form = document.getElementById('accessForm');
  const logList = document.getElementById('logList');
  const emptyState = document.getElementById('emptyState');
  const recordCount = document.getElementById('recordCount');
  const exportBtn = document.getElementById('exportBtn');
  const horaEntradaInput = document.querySelector('input[name="horaEntrada"]');
  const msTrigger = document.getElementById('msTrigger');

  function flashError(el) {
    el.classList.add('ring-2', 'ring-[var(--danger)]');
    setTimeout(() => el.classList.remove('ring-2', 'ring-[var(--danger)]'), 1200);
  }

  function todayStr() {
    // OJO: no usar `new Date().toISOString()` — eso siempre da la fecha en
    // UTC, y cerca de la medianoche en México (UTC-6) ya es "mañana" en
    // UTC, por lo que los registros de la tarde/noche se veían con la
    // fecha equivocada. `todayYMD` calcula la fecha explícitamente en hora
    // de México.
    return todayYMD();
  }

  // Cada persona que entra es un renglón independiente en la BD (accesos),
  // pero varias personas que entraron juntas comparten folio_grupo — aquí
  // las volvemos a agrupar para pintar UNA tarjeta por folio.
  function groupByFolio(rows) {
    const order = [];
    const groups = new Map();
    rows.forEach(row => {
      if (!groups.has(row.folio_grupo)) {
        groups.set(row.folio_grupo, { folio_grupo: row.folio_grupo, motivo: row.motivo, personas: [] });
        order.push(row.folio_grupo);
      }
      groups.get(row.folio_grupo).personas.push(row);
    });
    return order.map(f => groups.get(f));
  }

  function personRowHtml(row) {
    const salida = row.hora_salida ? row.hora_salida.slice(0, 5) : null;
    return `
      <div class="lc-person-row" data-acceso-id="${row.id}">
        <div>
          <div class="lc-person"><span class="font-semibold">${row.nombre}</span> <span class="lc-person-puesto">· ${row.puesto}</span></div>
          <div class="lc-person-times font-mono">Entrada ${row.hora_entrada ? row.hora_entrada.slice(0, 5) : '—'} · Salida <span class="salida-cell">${salida || '—'}</span></div>
        </div>
        <div class="estado-cell">
          ${salida
            ? `<span class="status-chip status-fuera">SALIDA · ${salida}</span>`
            : `<span class="status-chip status-dentro">EN CINOTECA</span>
               <button type="button" class="btn-outline text-[11px] px-3 py-1.5 registrar-salida-btn">Registrar salida</button>`
          }
        </div>
      </div>
    `;
  }

  function renderGroupCard(group) {
    const card = document.createElement('div');
    card.className = 'log-card';
    card.dataset.folio = group.folio_grupo;
    card.innerHTML = `
      <div class="no-badge text-sm pt-0.5">${group.folio_grupo}</div>
      <div>
        <div class="lc-people-list">${group.personas.map(personRowHtml).join('')}</div>
        <div class="lc-motivo">
          <span class="lc-field-label">Motivo de acceso</span>
          <span class="lc-field-value">${group.motivo}</span>
        </div>
      </div>
    `;
    return card;
  }

  function updateCount() {
    const total = logList.querySelectorAll('.lc-person-row').length;
    recordCount.textContent = total + (total === 1 ? ' persona registrada hoy' : ' personas registradas hoy');
    emptyState.style.display = total ? 'none' : 'flex';
  }

  async function loadToday() {
    logList.innerHTML = '';
    try {
      const rows = await api.get(`/api/accesos?desde=${todayStr()}&hasta=${todayStr()}`);
      groupByFolio(rows).forEach(g => logList.appendChild(renderGroupCard(g)));
      updateCount();
    } catch (err) {
      showToast(`No se pudieron cargar los registros de hoy: ${err.message}`);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const personas = multiselect.getSelected();
    if (personas.length === 0) {
      flashError(msTrigger);
      showToast('Selecciona al menos una persona que ingresa.');
      return;
    }

    const formData = Object.fromEntries(new FormData(form).entries());
    const horaEntrada = formData.horaEntrada || '';

    // Validación instantánea en el cliente (el servidor vuelve a validar
    // esto mismo por seguridad, usando el mismo módulo validation.js).
    if (!isWithinMargin(horaEntrada, ENTRY_MARGIN_MINUTES)) {
      flashError(horaEntradaInput);
      const ahora = formatHM(new Date());
      showToast(`La hora de entrada (${horaEntrada}) debe estar dentro de ±${ENTRY_MARGIN_MINUTES} minutos de la hora actual (${ahora}).`);
      return;
    }

    try {
      const resultado = await api.post('/api/accesos', {
        personas: personas.map(p => Number(p.id)),
        horaEntrada,
        motivo: formData.motivo
      });

      const rows = resultado.registros.map(r => {
        const persona = personas.find(p => Number(p.id) === r.persona_id);
        return { ...r, nombre: persona?.nombre, puesto: persona?.puesto };
      });
      logList.prepend(renderGroupCard({ folio_grupo: resultado.folio_grupo, motivo: formData.motivo, personas: rows }));
      updateCount();
      showToast(`Folio ${resultado.folio_grupo} registrado.`, 'warning');

      form.reset();
      document.querySelectorAll('#msPanel input[type="checkbox"]').forEach(c => c.checked = false);
      multiselect.refreshSelection();
      horaEntradaInput.value = new Date().toTimeString().slice(0, 5);
    } catch (err) {
      showToast(err.message);
    }
  });

  logList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.registrar-salida-btn');
    if (!btn) return;
    const row = btn.closest('.lc-person-row');
    const accesoId = row.dataset.accesoId;

    try {
      const actualizado = await api.patch(`/api/accesos/${accesoId}/salida`);
      const horaSalida = actualizado.hora_salida.slice(0, 5);
      row.querySelector('.salida-cell').textContent = horaSalida;
      row.querySelector('.estado-cell').innerHTML =
        `<span class="status-chip status-fuera">SALIDA · ${horaSalida}</span>`;
    } catch (err) {
      showToast(err.message);
    }
  });

  exportBtn.addEventListener('click', () => {
    window.location.href = `/api/exportar/json?desde=${todayStr()}&hasta=${todayStr()}`;
  });

  horaEntradaInput.value = new Date().toTimeString().slice(0, 5);
  loadToday();

  return { loadToday };
}
