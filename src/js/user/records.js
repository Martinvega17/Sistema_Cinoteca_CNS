import { api } from '../core/api.js';
import { isWithinMargin, formatHM, todayYMD } from '../core/validation.js';
import { showToast } from '../core/ui.js';
import { pedirFirma, verFirma } from '../core/signature-pad.js';
import { exportarAccesosPDF } from '../core/pdf-export.js';

const ENTRY_MARGIN_MINUTES = 3;

export function initRecords(multiselect, quickVisits) {
  const form = document.getElementById('accessForm');
  const logList = document.getElementById('logList');
  const emptyState = document.getElementById('emptyState');
  const recordCount = document.getElementById('recordCount');
  const exportBtn = document.getElementById('exportBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const horaEntradaInput = document.querySelector('input[name="horaEntrada"]');
  const msTrigger = document.getElementById('msTrigger');

  // Cache local de los registros de hoy tal como los regresa la API (con
  // firmas incluidas), para poder generar el PDF sin volver a pedirlos.
  let registrosHoy = [];

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
        groups.set(row.folio_grupo, { folio_grupo: row.folio_grupo, motivo: row.motivo, acompanante: row.acompanante || null, personas: [] });
        order.push(row.folio_grupo);
      }
      groups.get(row.folio_grupo).personas.push(row);
    });
    return order.map(f => groups.get(f));
  }

  function firmaBadgeHtml(row, tipo) {
    // tipo: 'entrada' | 'salida'
    const tieneFirma = tipo === 'entrada' ? row.firma_entrada : row.firma_salida;
    if (tieneFirma) {
      return `<button type="button" class="sig-badge ver-firma-btn" data-tipo="${tipo}" title="Ver firma de ${tipo}">✎ Firmado</button>`;
    }
    // Solo aplica a "salida": una entrada siempre queda firmada al
    // guardarse (es obligatoria), así que no hace falta un estado
    // "pendiente" para entrada.
    if (tipo === 'salida' && row.hora_salida) {
      return `<span class="sig-badge sig-badge-pendiente">Sin firma</span>`;
    }
    return '';
  }

  function personRowHtml(row) {
    const salida = row.hora_salida ? row.hora_salida.slice(0, 5) : null;
    return `
      <div class="lc-person-row" data-acceso-id="${row.id}">
        <div>
          <div class="lc-person"><span class="font-semibold">${row.nombre}</span> <span class="lc-person-puesto">· ${row.puesto}</span></div>
          <div class="lc-person-times font-mono">Entrada ${row.hora_entrada ? row.hora_entrada.slice(0, 5) : '—'} · Salida <span class="salida-cell">${salida || '—'}</span></div>
          <div class="flex items-center gap-1.5 mt-1 firmas-cell">
            ${firmaBadgeHtml(row, 'entrada')}
            ${firmaBadgeHtml(row, 'salida')}
          </div>
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
        ${group.acompanante ? `
        <div class="lc-motivo">
          <span class="lc-field-label">Acompañado por</span>
          <span class="lc-field-value">${group.acompanante}</span>
        </div>` : ''}
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
      registrosHoy = rows;
      groupByFolio(rows).forEach(g => logList.appendChild(renderGroupCard(g)));
      updateCount();
    } catch (err) {
      showToast(`No se pudieron cargar los registros de hoy: ${err.message}`);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const personas = multiselect.getSelected();
    const visitas = quickVisits.getVisitas();
    if (personas.length === 0 && visitas.length === 0) {
      flashError(msTrigger);
      showToast('Selecciona o agrega al menos una persona que ingresa.');
      return;
    }

    // FA-PT-0002 (Alcance): toda visita/personal externo debe ingresar
    // acompañado por personal del área. Si ya hay al menos una persona del
    // directorio en el mismo folio, ESA persona es quien acompaña — no se
    // pide un campo aparte (ver quickvisits.js: requiereAcompanante). Solo
    // cuando la visita entra sola se exige elegir/escribir un acompañante.
    let { acompananteId, acompananteNombre, requiereAcompanante } = quickVisits.getAcompanante();
    const acompananteBlock = document.getElementById('acompananteBlock');
    if (requiereAcompanante && !acompananteId && !acompananteNombre) {
      if (acompananteBlock) flashError(acompananteBlock);
      showToast('Toda visita o personal externo debe ingresar acompañado por personal del área.');
      return;
    }
    // Visita + al menos una persona del directorio en el mismo folio: esa
    // persona queda registrada como acompañante automáticamente.
    if (visitas.length > 0 && !requiereAcompanante && !acompananteId && !acompananteNombre) {
      acompananteId = personas[0].id;
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

    // Firma digital obligatoria de CADA persona/visita que entra — una por
    // una, en el mismo orden en que el backend las va a insertar (primero
    // `personas`, luego `visitas`). Si alguien cancela su firma, se aborta
    // TODO el registro: nadie queda registrado a medias sin firmar.
    const entrantes = [
      ...personas.map(p => ({ nombre: `${p.nombre} · ${p.puesto}` })),
      ...visitas.map(v => ({ nombre: v.puesto ? `${v.nombre} · ${v.puesto}` : v.nombre }))
    ];

    const firmas = [];
    for (const entrante of entrantes) {
      const firma = await pedirFirma({
        titulo: 'Firma de entrada',
        subtitulo: entrante.nombre
      });
      if (!firma) {
        showToast('Registro cancelado: se requiere la firma digital de cada persona que ingresa.');
        return;
      }
      firmas.push(firma);
    }

    try {
      const resultado = await api.post('/api/accesos', {
        personas: personas.map(p => Number(p.id)),
        visitas,
        acompananteId,
        acompananteNombre,
        horaEntrada,
        motivo: formData.motivo,
        firmas
      });

      const rows = resultado.registros.map(r => {
        if (r.persona_id) {
          const persona = personas.find(p => Number(p.id) === r.persona_id);
          return { ...r, nombre: persona?.nombre, puesto: persona?.puesto };
        }
        // Visita suelta: el propio backend regresa el nombre/puesto que se
        // guardó en el renglón de accesos (nunca en la tabla personas).
        return { ...r, nombre: r.visita_nombre, puesto: r.visita_puesto || 'Visita' };
      });
      registrosHoy = [...rows, ...registrosHoy];
      logList.prepend(renderGroupCard({ folio_grupo: resultado.folio_grupo, motivo: formData.motivo, personas: rows }));
      updateCount();
      showToast(`Folio ${resultado.folio_grupo} registrado y firmado.`, 'warning');

      form.reset();
      document.querySelectorAll('#msPanel input[type="checkbox"]').forEach(c => c.checked = false);
      multiselect.refreshSelection();
      quickVisits.reset();
      autoHora = true; // el siguiente registro vuelve a autoactualizarse
      horaEntradaInput.value = new Date().toTimeString().slice(0, 5);
    } catch (err) {
      showToast(err.message);
    }
  });

  logList.addEventListener('click', async (e) => {
    const verFirmaBtn = e.target.closest('.ver-firma-btn');
    if (verFirmaBtn) {
      const row = verFirmaBtn.closest('.lc-person-row');
      const accesoId = Number(row.dataset.accesoId);
      const tipo = verFirmaBtn.dataset.tipo;
      const registro = registrosHoy.find(r => r.id === accesoId);
      const dataUrl = registro && (tipo === 'entrada' ? registro.firma_entrada : registro.firma_salida);
      if (!dataUrl) return;
      const fechaFirma = tipo === 'entrada' ? registro.firma_entrada_fecha : registro.firma_salida_fecha;
      verFirma({
        titulo: `Firma de ${tipo}`,
        dataUrl,
        meta: fechaFirma ? new Date(fechaFirma).toLocaleString('es-MX') : ''
      });
      return;
    }

    const btn = e.target.closest('.registrar-salida-btn');
    if (!btn) return;
    const row = btn.closest('.lc-person-row');
    const accesoId = row.dataset.accesoId;

    // Firma digital obligatoria también para cerrar el acceso.
    const firma = await pedirFirma({
      titulo: 'Firma de salida',
      subtitulo: 'Firma para confirmar el registro de salida de la cintoteca.'
    });
    if (!firma) {
      showToast('Debes registrar tu firma digital para guardar la salida.');
      return;
    }

    try {
      const actualizado = await api.patch(`/api/accesos/${accesoId}/salida`, { firma });
      const horaSalida = actualizado.hora_salida.slice(0, 5);
      row.querySelector('.salida-cell').textContent = horaSalida;
      row.querySelector('.estado-cell').innerHTML =
        `<span class="status-chip status-fuera">SALIDA · ${horaSalida}</span>`;
      const registro = registrosHoy.find(r => r.id === Number(accesoId));
      if (registro) {
        registro.hora_salida = actualizado.hora_salida;
        registro.firma_salida = actualizado.firma_salida;
        registro.firma_salida_fecha = actualizado.firma_salida_fecha;
      }
      if (registro) {
        row.querySelector('.firmas-cell').innerHTML =
          `${firmaBadgeHtml(registro, 'entrada')}${firmaBadgeHtml(registro, 'salida')}`;
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  exportBtn.addEventListener('click', () => {
    window.location.href = `/api/exportar/json?desde=${todayStr()}&hasta=${todayStr()}`;
  });

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', () => {
      if (!registrosHoy.length) {
        showToast('No hay registros de hoy que exportar.', 'warning');
        return;
      }
      exportarAccesosPDF(registrosHoy, {
        titulo: 'Bitácora de Acceso a Cintoteca',
        subtitulo: `Registros de hoy · ${todayStr()}`
      });
    });
  }

  horaEntradaInput.value = new Date().toTimeString().slice(0, 5);
  loadToday();

  // Auto-actualiza "Hora de entrada" cada pocos segundos, para que no haya
  // que recargar la página manualmente si el formulario lleva rato abierto
  // (típico con visitas externas, donde se tarda en llenar el resto de los
  // datos) y termine rechazándose por salirse del margen de ±3 minutos.
  // Se detiene sola en cuanto la persona la edita a mano (evento "input" —
  // los cambios que hace este mismo código con `.value =` no disparan ese
  // evento, así que no hay conflicto), y vuelve a activarse en automático
  // después de cada registro exitoso.
  let autoHora = true;
  horaEntradaInput.addEventListener('input', () => { autoHora = false; });
  setInterval(() => {
    if (!autoHora || document.activeElement === horaEntradaInput) return;
    horaEntradaInput.value = new Date().toTimeString().slice(0, 5);
  }, 15000);

  return { loadToday };
}
