export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function mount(rootId: string, content: HTMLElement) {
  const root = document.getElementById(rootId);
  if (!root) throw new Error(`Missing root ${rootId}`);
  root.innerHTML = '';
  root.appendChild(content);
}

export function button(label: string, className = 'btn', onClick?: () => void | Promise<void>) {
  const node = el('button', className, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', async () => {
    try {
      await onClick();
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'danger');
    }
  });
  return node;
}

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

export function showToast(message: string, tone: ToastTone = 'neutral') {
  let viewport = document.querySelector<HTMLElement>('.toast-viewport');
  if (!viewport) {
    viewport = el('div', 'toast-viewport');
    viewport.setAttribute('aria-live', 'polite');
    viewport.setAttribute('aria-atomic', 'true');
    document.body.appendChild(viewport);
  }
  const toast = el('div', `toast toast-${tone}`, message);
  viewport.replaceChildren(toast);
  window.setTimeout(() => toast.remove(), 2400);
}

export async function copyText(value: string, successMessage = 'Copied') {
  await navigator.clipboard.writeText(value);
  showToast(successMessage, 'success');
}

export function input(type: string, placeholder: string, value = '') {
  const node = el('input', 'field') as HTMLInputElement;
  node.type = type;
  node.placeholder = placeholder;
  node.value = value;
  return node;
}

export function textarea(placeholder: string) {
  const node = el('textarea', 'field field-area') as HTMLTextAreaElement;
  node.placeholder = placeholder;
  return node;
}

export function setTheme(theme: 'dark' | 'light') {
  document.documentElement.dataset.theme = theme;
}

export async function safeAction(
  target: HTMLButtonElement,
  action: () => Promise<void>,
  onError: (error: unknown) => void = (error) => showToast(
    error instanceof Error ? error.message : String(error),
    'danger'
  )
) {
  target.disabled = true;
  target.classList.add('is-loading');
  target.setAttribute('aria-busy', 'true');
  try {
    await action();
  } catch (error) {
    onError(error);
  } finally {
    target.disabled = false;
    target.classList.remove('is-loading');
    target.removeAttribute('aria-busy');
  }
}
