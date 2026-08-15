export function initClock() {
  function tick(){
    const now = new Date();
    const opts = { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false };
    const clockElement = document.getElementById('liveClock');
    if (clockElement) {
      clockElement.textContent =
        now.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }) + '  ' +
        now.toLocaleTimeString('es-MX', opts);
    }
  }
  tick();
  setInterval(tick, 1000);
}