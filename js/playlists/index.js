import { el, mount } from '../dom.js';
import { ICONS } from '../icons.js';
import { shareUrl } from '../ui/share.js';
import { wireConfirmButton } from '../ui/confirmButton.js';
import { App } from '../main.js';
import {
    loadPlaylists, createBlankPlaylist, deletePlaylist,
} from './store.js';
import { setEditorDraft } from './draft.js';
import { shareUrlForPlaylist } from './urlCodec.js';
import { promptImportFromUrl } from './shared.js';

function relativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const delta = Math.max(0, Date.now() - then);
    const min = 60 * 1000, hr = 60 * min, day = 24 * hr;
    if (delta < min) return 'just now';
    if (delta < hr)  return Math.floor(delta / min) + ' min ago';
    if (delta < day) return Math.floor(delta / hr)  + ' h ago';
    if (delta < 7 * day) return Math.floor(delta / day) + ' d ago';
    return new Date(iso).toLocaleDateString();
}

function playlistIndexRow(pl) {
    const { settings } = pl;
    const count = settings.length;
    const updatedAgo = relativeTime(pl.updatedAt);
    const row = el('li', { class: 'pl-row' });

    const link = el('a', {
        class: 'pl-row-link', href: '#/playlists/' + pl.id,
    },
        el('span', { class: 'pl-row-name' }, pl.name || 'Untitled playlist'),
        el('span', { class: 'pl-row-meta' },
            `${count} setting${count === 1 ? '' : 's'} \u00b7 ${updatedAgo}`),
    );

    const actions = el('div', { class: 'pl-row-actions' });

    const presentBtn = el('a', {
        class: 'pl-row-btn',
        href: '#/playlists/' + pl.id + '/present',
        title: 'Present playlist',
        'aria-label': 'Present playlist',
        html: ICONS.present,
    });
    presentBtn.addEventListener('click', e => e.stopPropagation());
    actions.appendChild(presentBtn);

    const shareBtn = el('button', {
        type: 'button',
        class: 'pl-row-btn',
        title: 'Share link',
        'aria-label': 'Share playlist link',
        html: ICONS.share,
    });
    let shareTimer = null;
    shareBtn.addEventListener('click', async e => {
        e.preventDefault();
        e.stopPropagation();
        const url = shareUrlForPlaylist(pl);
        const flash = (cls) => {
            shareBtn.classList.add(cls);
            if (shareTimer) clearTimeout(shareTimer);
            shareTimer = setTimeout(() => {
                shareBtn.classList.remove('copied', 'failed');
                shareTimer = null;
            }, 1500);
        };
        const result = await shareUrl({ url, title: pl.name || 'Playlist' });
        if (result === 'shared' || result === 'aborted') return;
        flash(result === 'copied' ? 'copied' : 'failed');
    });
    actions.appendChild(shareBtn);

    const trash = el('button', {
        type: 'button',
        class: 'pl-row-btn pl-row-trash',
        title: 'Delete playlist',
        'aria-label': 'Delete playlist',
        html: ICONS.trash,
    });
    const trashLabel = el('span', { class: 'pl-row-trash-label' });
    trash.appendChild(trashLabel);
    wireConfirmButton(trash, {
        stopEvents: true,
        onArm: () => { trashLabel.textContent = 'Tap again'; },
        onDisarm: () => { trashLabel.textContent = ''; },
        onConfirm: () => {
            deletePlaylist(pl.id);
            App.render();
        },
    });
    actions.appendChild(trash);

    row.appendChild(link);
    row.appendChild(actions);
    return row;
}

export function renderPlaylistsIndexView() {
    document.title = 'Playlists \u2014 Scottish Metrical Psalter';
    const lists = loadPlaylists();
    const header = el('div', { class: 'pl-index-head' },
        el('h1', null, 'Playlists'),
        el('div', { class: 'pl-toolbar' },
            el('button', {
                type: 'button', class: 'pl-btn pl-btn-primary',
                onclick: () => {
                    const pl = createBlankPlaylist();
                    setEditorDraft(pl, { isNew: true });
                    location.hash = '#/playlists/' + pl.id;
                },
            }, el('span', { html: ICONS.plus }), el('span', null, 'New playlist')),
            el('button', {
                type: 'button', class: 'pl-btn pl-btn-link',
                onclick: () => promptImportFromUrl(),
            }, 'Import from URL'),
        ),
    );

    const children = [header];

    if (!lists.length) {
        children.push(el('div', { class: 'pl-empty' },
            el('p', null,
                'A playlist is a saved order of psalm settings, ',
                'ready to present together end-to-end. Build one for a service, ',
                'family worship, or rehearsal; share the link with anyone.'),
            el('button', {
                type: 'button', class: 'pl-btn pl-btn-primary',
                onclick: () => {
                    const pl = createBlankPlaylist();
                    setEditorDraft(pl, { isNew: true });
                    location.hash = '#/playlists/' + pl.id;
                },
            }, el('span', { html: ICONS.plus }), el('span', null, 'Create your first playlist')),
        ));
    } else {
        const rows = lists
            .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
            .map(pl => playlistIndexRow(pl));
        children.push(el('ul', { class: 'pl-index' }, ...rows));
    }

    children.push(el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'));
    mount(el('article', { class: 'pl-page' }, ...children));
}
