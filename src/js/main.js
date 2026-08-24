import { initClock } from './core/clock.js';
import { initAuth, wireLoginForm, wireLogoutButton } from './core/auth.js';
import { initTabs } from './core/tabs.js';
import { initMultiselect } from './user/multiselect.js';
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

  const multiselect = await initMultiselect();
  const records = initRecords(multiselect);
  const reportes = initReportes();

  if (session.rol === 'administrador') {
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
