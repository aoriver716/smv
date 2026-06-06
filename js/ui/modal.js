import { el } from '../dom.js';

export function openModal({
    body,
    className,
    onClose,
    initialFocus,
    closeOnBackdrop = true,
    closeOnEsc = false,
} = {}) {
    const backdrop = el('div', { class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true' });
    const modal = el('div', { class: className ? 'modal ' + className : 'modal' });
    if (body instanceof Node) modal.appendChild(body);
    else if (Array.isArray(body)) for (const n of body) if (n) modal.appendChild(n);
    backdrop.appendChild(modal);

    let closed = false;
    let onKey = null;
    const close = () => {
        if (closed) return;
        closed = true;
        if (onKey) document.removeEventListener('keydown', onKey);
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        if (typeof onClose === 'function') onClose();
    };

    if (closeOnBackdrop) {
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    }
    if (closeOnEsc) {
        onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        document.addEventListener('keydown', onKey);
    }
    document.body.appendChild(backdrop);

    if (initialFocus) {
        const target = typeof initialFocus === 'string'
            ? modal.querySelector(initialFocus)
            : (initialFocus instanceof HTMLElement ? initialFocus : null);
        if (target) target.focus();
    }

    return { close, backdrop, modal };
}
