import { initClock } from './clock.js';
import { initAuth, wireLoginForm, wireLogoutButton } from './auth.js';
import { initTabs } from './tabs.js';
import { initMultiselect } from './multiselect.js';
import { initRecords } from './records.js';
import { initReportes } from './reportes.js';
import { initPersonalAdmin } from './personal-admin.js';
import { initAdminPanel } from './admin.js';

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
