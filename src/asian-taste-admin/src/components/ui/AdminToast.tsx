let timer: number | undefined;

/**
 * A console toast, as a DOM node rather than React state.
 *
 * The console raises toasts from mutation callbacks and WebSocket frames, both
 * of which sit outside the render tree. One element, one timer, one message —
 * a queue of "status updated" toasts is noise at a pass.
 */
export function showAdminToast(message: string) {
  let el = document.getElementById('admin-toast');

  if (!el) {
    el = document.createElement('div');
    el.id = 'admin-toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }

  el.textContent = message;
  el.classList.add('is-open');

  window.clearTimeout(timer);
  timer = window.setTimeout(() => el?.classList.remove('is-open'), 2400);
}
