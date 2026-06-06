import { el } from '../dom.js';
import { ICONS } from '../icons.js';
import { openModal } from '../ui/modal.js';

export function promptImportFromUrl() {
    const error = el('p', { class: 'pl-import-error', style: 'display: none;' });
    const textarea = el('textarea', {
        class: 'pl-import-input',
        rows: '3',
        placeholder: 'https://\u2026/#/playlists/shared?\u2026',
        spellcheck: 'false',
        'aria-label': 'Playlist link',
    });

    const importBtn = el('button', { type: 'button', class: 'pl-btn pl-btn-primary' },
        el('span', { html: ICONS.plus }), el('span', null, 'Import'));
    const cancelBtn = el('button', { type: 'button', class: 'pl-btn pl-btn-link' }, 'Cancel');

    const body = [
        el('h2', null, 'Import a playlist'),
        el('p', { class: 'modal-help' },
            'Paste a playlist link below. Importing creates a copy in your library; ',
            'the original isn\u2019t affected.'),
        textarea,
        error,
        el('div', { class: 'pl-collision-actions' }, importBtn, cancelBtn),
    ];
    const handle = openModal({
        body,
        className: 'pl-import-modal',
        closeOnEsc: true,
        initialFocus: textarea,
    });

    const showErr = (msg) => {
        error.textContent = msg;
        error.style.display = '';
    };
    const tryImport = () => {
        const raw = (textarea.value || '').trim();
        if (!raw) { showErr('Paste a playlist link first.'); return; }
        try {
            const u = new URL(raw, location.href);
            const hash = u.hash || '';
            const m = hash.match(/^#\/?playlists\/shared\??(.*)$/);
            if (!m) { showErr('That doesn\u2019t look like a playlist link.'); return; }
            handle.close();
            location.hash = '#/playlists/shared?' + m[1];
        } catch {
            showErr('Could not read that URL.');
        }
    };

    importBtn.addEventListener('click', tryImport);
    cancelBtn.addEventListener('click', () => handle.close());
    textarea.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            tryImport();
        }
    });
}
