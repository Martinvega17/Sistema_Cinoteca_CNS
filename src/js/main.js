import { initClock } from './core/clock.js';
import { initAuth, wireLoginForm, wireLogoutButton } from './core/auth.js';
import { initTabs } from './core/tabs.js';
import { initMultiselect } from './user/multiselect.js';
import { initQuickVisits } from './user/quickvisits.js';
import { initRecords } from './user/records.js';
import { initReportes } from './user/reportes.js';
import { initPersonalAdmin } from './admin/personal-admin.js';
import { initAdminPanel } from './admin/admin.js';

initClock();
initTabs();
wireLogoutButton();

let started = false;

async function start(session) {
  if (started) return; // evita inicializar dos veces si hay un doble login
  started = true;

  // quickVisits se crea primero para poder pasarle a initMultiselect un
  // callback: cada vez que cambia la selección de "Personas que ingresan",
  // quickVisits sabe cuántas hay y decide si todavía hace falta pedir
  // "Acompañado por" a mano (ver quickvisits.js).
  const quickVisits = initQuickVisits();
  const multiselect = await initMultiselect((seleccionadas) => {
    quickVisits.actualizarPersonasSeleccionadas(seleccionadas.length);
  });
  const records = initRecords(multiselect, quickVisits);
  const reportes = initReportes();

  if (session.rol === 'administrador' || session.rol === 'responsable_institucional') {
    initPersonalAdmin();
    initAdminPanel({
      onLimpiarHoy: () => {
        records.loadToday();
        reportes.buscar();
      },
      onBorrarTodo: () => {
        records.loadToday();
        reportes.buscar();
      }
    });
  }
}

const session = await initAuth();
if (session) {
  start(session);
} else {
  wireLoginForm(start);
}
