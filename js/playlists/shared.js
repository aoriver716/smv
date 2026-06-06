import { el, mount } from '../dom.js';
import { ICONS } from '../icons.js';
import { openModal } from '../ui/modal.js';
import { loadPlaylists, upsertPlaylist, newPlaylistId } from './store.js';
import { findRendition, settingHasMultipleRenditions, renditionLabel } from './renditions.js';
import { formatVerseRanges } from './verses.js';
import { decodePlaylistFromParams } from './urlCodec.js';

export function renderSharedPlaylistView(params) {
    const draft = decodePlaylistFromParams(params);
    if (!draft) {
        mount(el('article', { class: 'pl-page' },
            el('h1', null, 'Invalid shared playlist link'),
            el('p', null, 'The link did not contain a valid playlist.'),
            el('a', { class: 'back-link', href: '#/playlists' }, '\u2190 Back to playlists'),
        ));
        return;
    }
    document.title = 'Shared: ' + (draft.name || 'Untitled') + ' \u2014 Scottish Metrical Psalter';
    renderSharedPlaylistPreview(draft);
}

export function renderSharedPlaylistPreview(draft) {
    const items = draft.settings.map((s, i) => {
        const r = findRendition(s.psalm, s.version, s.part);
        const bits = [String(i + 1) + '. ', `Psalm ${s.psalm}`];
        if (r && settingHasMultipleRenditions(s)) {
            const lbl = renditionLabel(r);
            if (lbl) bits.push(' (' + lbl + ')');
        }
        if (s.verses && s.verses.length) {
            bits.push(' \u00b7 verses ' + formatVerseRanges(s.verses));
        }
        return el('li', null, bits.join(''));
    });

    const saveBtn = el('button', {
        type: 'button',
        class: 'pl-btn pl-btn-primary',
    }, el('span', { html: ICONS.plus }), el('span', null, 'Save to my playlists'));
    saveBtn.addEventListener('click', () => importSharedPlaylist(draft));

    const presentBtn = el('button', {
        type: 'button',
        class: 'pl-btn',
    }, el('span', { html: ICONS.present }), el('span', null, 'Present without saving'));
    presentBtn.addEventListener('click', () => {
        const pl = { ...draft, id: newPlaylistId(), createdAt: new Date().toISOString() };
        pl.name = (pl.name || 'Shared playlist') + ' (preview)';
        upsertPlaylist(pl);
        location.hash = '#/playlists/' + pl.id + '/present';
    });

    mount(el('article', { class: 'pl-page pl-shared' },
        el('a', { class: 'pl-back', href: '#/playlists' },
            el('span', { html: ICONS.arrowLeft }), el('span', null, 'Playlists')),
        el('h1', null, draft.name || 'Shared playlist'),
        el('p', { class: 'pl-shared-meta' },
            `${draft.settings.length} setting${draft.settings.length === 1 ? '' : 's'} \u00b7 `,
            `main title ${draft.mainTitleSlide ? 'on' : 'off'} \u00b7 `,
            `per-setting titles ${draft.perSettingTitles ? 'on' : 'off'}`),
        el('ol', { class: 'pl-shared-list' }, ...items),
        el('div', { class: 'pl-shared-actions' }, saveBtn, presentBtn),
    ));
}

function importSharedPlaylist(draft) {
    const existing = loadPlaylists().find(p => (p.name || '') === (draft.name || ''));
    if (!existing) {
        const now = new Date().toISOString();
        const pl = {
            id: newPlaylistId(),
            name: draft.name || 'Shared playlist',
            createdAt: now,
            updatedAt: now,
            mainTitleSlide: draft.mainTitleSlide,
            perSettingTitles: draft.perSettingTitles,
            settings: draft.settings,
        };
        upsertPlaylist(pl);
        location.hash = '#/playlists/' + pl.id;
        return;
    }
    showNameCollisionDialog(draft, existing);
}

function showNameCollisionDialog(draft, existing) {
    const replaceBtn = el('button', { type: 'button', class: 'pl-btn pl-btn-danger' }, 'Replace existing');
    const copyBtn = el('button', { type: 'button', class: 'pl-btn pl-btn-primary' }, 'Import as a copy');
    const cancelBtn = el('button', { type: 'button', class: 'pl-btn pl-btn-link' }, 'Cancel');
    const body = [
        el('h2', null, 'Playlist exists'),
        el('p', null,
            'A playlist named ', el('strong', null, '"' + (draft.name || '') + '"'),
            ' already exists in your library. What would you like to do?'),
        el('div', { class: 'pl-collision-actions' }, replaceBtn, copyBtn, cancelBtn),
    ];
    const handle = openModal({ body });
    replaceBtn.addEventListener('click', () => {
        const updated = {
            ...existing,
            mainTitleSlide: draft.mainTitleSlide,
            perSettingTitles: draft.perSettingTitles,
            settings: draft.settings,
        };
        upsertPlaylist(updated);
        handle.close();
        location.hash = '#/playlists/' + existing.id;
    });
    copyBtn.addEventListener('click', () => {
        const names = new Set(loadPlaylists().map(p => p.name || ''));
        let n = 2, candidate;
        do {
            candidate = `${draft.name || 'Shared playlist'} (${n})`;
            n++;
        } while (names.has(candidate));
        const now = new Date().toISOString();
        const pl = {
            id: newPlaylistId(),
            name: candidate,
            createdAt: now,
            updatedAt: now,
            mainTitleSlide: draft.mainTitleSlide,
            perSettingTitles: draft.perSettingTitles,
            settings: draft.settings,
        };
        upsertPlaylist(pl);
        handle.close();
        location.hash = '#/playlists/' + pl.id;
    });
    cancelBtn.addEventListener('click', () => handle.close());
}

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
