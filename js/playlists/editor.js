import { el, mount } from '../dom.js';
import { ICONS } from '../icons.js';
import { wireConfirmButton } from '../ui/confirmButton.js';
import { App } from '../main.js';
import { upsertPlaylist, deletePlaylist, getPlaylist } from './store.js';
import { setEditorDraft, getEditorDraft, clearEditorDraft } from './draft.js';
import { settingSummary } from './renditions.js';
import { renderPickerView } from './picker.js';

export function renderPlaylistEditorView(id, params) {
    let draft = getEditorDraft(id);
    if (!draft) {
        const stored = getPlaylist(id);
        if (!stored) {
            mount(el('article', { class: 'pl-page' },
                el('h1', null, 'Playlist not found'),
                el('p', null, 'No local playlist with id ', el('code', null, id), '.'),
                el('a', { class: 'back-link', href: '#/playlists' }, '\u2190 Back to playlists'),
            ));
            return;
        }
        setEditorDraft(stored, { isNew: false });
        draft = getEditorDraft(id);
    }
    const pl = draft.working;
    document.title = (pl.name || 'Untitled playlist') + ' \u2014 Scottish Metrical Psalter';

    const picker = params.get('picker');
    if (picker === 'add' || picker === 'edit') {
        return renderPickerView(pl, picker, params);
    }

    mountPlaylistEditor(pl, draft);
}

function mountPlaylistEditor(pl, draft) {
    const back = el('a', { class: 'pl-back', href: '#/playlists' },
        el('span', { html: ICONS.arrowLeft }), el('span', null, 'Playlists'));

    const nameInput = el('input', {
        type: 'text',
        class: 'pl-name-input',
        value: pl.name || '',
        placeholder: 'Untitled playlist',
        'aria-label': 'Playlist name',
        spellcheck: 'false',
    });
    const syncName = () => { pl.name = nameInput.value.trim() || 'Untitled playlist'; };
    nameInput.addEventListener('input', syncName);
    nameInput.addEventListener('change', syncName);
    nameInput.addEventListener('blur', syncName);

    const saveBtn = el('button', {
        type: 'button',
        class: 'pl-btn pl-btn-primary',
        title: 'Save changes and return to playlists',
        'aria-label': 'Save and close',
    }, el('span', { html: ICONS.check }), el('span', { class: 'pl-btn-label' }, 'Save and close'));
    saveBtn.addEventListener('click', () => {
        syncName();
        upsertPlaylist(pl);
        clearEditorDraft();
        location.hash = '#/playlists';
    });

    const cancelBtn = el('button', {
        type: 'button',
        class: 'pl-btn',
        title: 'Discard changes and return to playlists',
        'aria-label': 'Cancel',
    }, el('span', { html: ICONS.close }), el('span', { class: 'pl-btn-label' }, 'Cancel'));
    cancelBtn.addEventListener('click', () => {
        clearEditorDraft();
        location.hash = '#/playlists';
    });

    const deleteBtn = el('button', {
        type: 'button',
        class: 'pl-btn pl-btn-danger',
        title: 'Delete playlist',
        'aria-label': 'Delete playlist',
        html: ICONS.trash,
    });
    const deleteLabel = el('span', { class: 'pl-btn-label' }, 'Delete');
    deleteBtn.appendChild(deleteLabel);
    wireConfirmButton(deleteBtn, {
        onArm: () => { deleteLabel.textContent = 'Tap again'; },
        onDisarm: () => { deleteLabel.textContent = 'Delete'; },
        onConfirm: () => {
            if (!(draft && draft.isNew)) deletePlaylist(pl.id);
            clearEditorDraft();
            location.hash = '#/playlists';
        },
    });

    const mainTitleToggle = el('label', { class: 'pl-toggle' },
        el('input', {
            type: 'checkbox',
            checked: pl.mainTitleSlide ? 'checked' : null,
            onchange: e => { pl.mainTitleSlide = e.target.checked; },
        }),
        el('span', null, 'Main title slide'),
    );
    const perSettingToggle = el('label', { class: 'pl-toggle' },
        el('input', {
            type: 'checkbox',
            checked: pl.perSettingTitles ? 'checked' : null,
            onchange: e => { pl.perSettingTitles = e.target.checked; },
        }),
        el('span', null, 'Per-setting titles'),
    );

    const list = el('ol', { class: 'pl-settings' });
    if (!pl.settings.length) {
        list.appendChild(el('li', { class: 'pl-empty-row' },
            el('p', null, 'No settings yet. Click ', el('strong', null, 'Add setting'), ' below to begin.'),
        ));
    } else {
        pl.settings.forEach((s, i) => list.appendChild(playlistSettingRow(pl, s, i)));
    }

    const addBtn = el('a', {
        class: 'pl-btn pl-btn-add',
        href: '#/playlists/' + pl.id + '?picker=add',
    }, el('span', { html: ICONS.plus }), el('span', null, 'Add setting'));

    mount(el('article', { class: 'pl-page pl-editor' },
        back,
        el('div', { class: 'pl-name-row' }, nameInput),
        el('div', { class: 'pl-actions' }, saveBtn, cancelBtn, deleteBtn),
        el('div', { class: 'pl-title-toggles' },
            el('span', { class: 'pl-title-toggles-label' }, 'Title slides:'),
            mainTitleToggle, perSettingToggle),
        list,
        el('div', { class: 'pl-add-row' }, addBtn),
    ));
}

function playlistSettingRow(pl, setting, idx) {
    const { desig, verseSummary } = settingSummary(setting);

    const drag = el('span', { class: 'pl-drag', html: ICONS.drag, 'aria-hidden': 'true' });

    const titleBits = [`Psalm ${setting.psalm}`];
    if (desig) titleBits.push(`(${desig})`);
    const title = el('span', { class: 'pl-set-title' }, titleBits.join(' '));
    const summary = el('span', { class: 'pl-set-verses' }, verseSummary);

    const upBtn = el('button', {
        type: 'button',
        class: 'pl-set-mini',
        title: 'Move up',
        'aria-label': 'Move setting up',
        html: ICONS.arrowUp,
        disabled: idx === 0 ? 'disabled' : null,
    });
    upBtn.addEventListener('click', () => moveSetting(pl, idx, idx - 1));

    const downBtn = el('button', {
        type: 'button',
        class: 'pl-set-mini',
        title: 'Move down',
        'aria-label': 'Move setting down',
        html: ICONS.arrowDown,
        disabled: idx >= pl.settings.length - 1 ? 'disabled' : null,
    });
    downBtn.addEventListener('click', () => moveSetting(pl, idx, idx + 1));

    const editBtn = el('a', {
        class: 'pl-set-mini',
        title: 'Edit selection',
        'aria-label': 'Edit selection',
        href: '#/playlists/' + pl.id + '?picker=edit&i=' + idx,
        html: ICONS.edit,
    });

    const delBtn = el('button', {
        type: 'button',
        class: 'pl-set-mini pl-set-trash',
        title: 'Remove from playlist',
        'aria-label': 'Remove setting',
        html: ICONS.trash,
    });
    wireConfirmButton(delBtn, {
        onConfirm: () => {
            pl.settings.splice(idx, 1);
            App.render();
        },
    });

    const row = el('li', {
        class: 'pl-set-row',
        tabindex: '0',
        'data-idx': String(idx),
    },
        drag,
        el('span', { class: 'pl-set-num' }, String(idx + 1) + '.'),
        el('span', { class: 'pl-set-text' }, title, summary),
        el('div', { class: 'pl-set-controls' }, upBtn, downBtn, editBtn, delBtn),
    );

    row.addEventListener('keydown', e => {
        if (!e.altKey) return;
        if (e.key === 'ArrowUp' && idx > 0) {
            e.preventDefault();
            moveSetting(pl, idx, idx - 1);
        } else if (e.key === 'ArrowDown' && idx < pl.settings.length - 1) {
            e.preventDefault();
            moveSetting(pl, idx, idx + 1);
        }
    });

    return row;
}

function moveSetting(pl, from, to) {
    if (to < 0 || to >= pl.settings.length || from === to) return;
    const [s] = pl.settings.splice(from, 1);
    pl.settings.splice(to, 0, s);
    App.render();
    requestAnimationFrame(() => {
        const moved = document.querySelector(`.pl-set-row[data-idx="${to}"]`);
        if (moved) moved.focus();
    });
}
