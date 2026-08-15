/**
 * Notificación flotante (toast) para mensajes de validación.
 * variant: 'error' (por defecto) | 'warning'
 */
export function showToast(message, variant = 'error') {
  document.querySelectorAll('.ui-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast-${variant}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 250);
  }, 3800);
}
