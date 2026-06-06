// Scottish Metrical Psalter — single-page client.
// All views are rendered from psalter.json on demand. No build step.

import { BOOKS } from './js/constants.js';
import { el, mount } from './js/dom.js';
import { parseRoute, ordinalSuffix } from './js/router.js';
import { ICONS } from './js/icons.js';
import { settingUrl, settingDesignator, firstLineOfSetting } from './js/psalm/labels.js';
import { initMobileMenu, initSearchForm, syncSearchInput } from './js/ui/chrome.js';
import { initTheme } from './js/ui/theme.js';
import { registerServiceWorker } from './js/ui/serviceWorker.js';
import { openModal } from './js/ui/modal.js';
import { shareUrl } from './js/ui/share.js';
import { wireConfirmButton } from './js/ui/confirmButton.js';
import { enterPresent, exitPresent } from './js/present/mode.js';
import {
    loadPlaylists,
    getPlaylist,
    upsertPlaylist,
} from './js/playlists/store.js';
import { clearEditorDraft } from './js/playlists/draft.js';
import {
    formatVerseRanges,
    versesSetFromRanges,
} from './js/playlists/verses.js';
import { decodePlaylistFromParams } from './js/playlists/urlCodec.js';
import {
    findRendition,
    settingHasMultipleRenditions,
    renditionLabel,
} from './js/playlists/renditions.js';
import { renderPlaylistsIndexView } from './js/playlists/index.js';
import { renderPlaylistEditorView } from './js/playlists/editor.js';
import { renderHomeView } from './js/views/home.js';
import { renderMetersView } from './js/views/meters.js';
import { renderFirstLinesView } from './js/views/firstLines.js';
import { renderNotFoundView } from './js/views/notFound.js';
import { renderConcordanceView } from './js/views/concordance.js';
import { renderSearchView } from './js/views/search.js';
import {
    renderPsalmRouteView,
    stanzaLineNode,
} from './js/views/setting.js';

// ------ App state ------

export const App = {
    data: null,
    byPsalm: null,         // Map<number, settings[]>
    settingsOrdered: null, // sorted list with index
    concordanceIndex: null,

    async boot() {
        initTheme();
        initSearchForm();
        initMobileMenu();
        try {
            const resp = await fetch('./psalter.json');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            this.data = await resp.json();
        } catch (e) {
            mount(el('p', { class: 'error' }, 'Could not load psalter.json: ' + e.message));
            return;
        }
        this.preprocess();
        window.addEventListener('hashchange', () => this.render());
        window.addEventListener('keydown', e => this.onKey(e));
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) exitPresent();
        });
        registerServiceWorker();
        this.render();
    },

    preprocess() {
        this.byPsalm = new Map();
        for (const s of this.data.renditions) {
            if (!this.byPsalm.has(s.psalm)) this.byPsalm.set(s.psalm, []);
            this.byPsalm.get(s.psalm).push(s);
            // Annotate each line with its effective verse number.
            let cur = null;
            for (const stanza of s.stanzas) {
                for (const line of stanza) {
                    if (line.verse) cur = line.verse;
                    line._verse = cur;
                }
            }
        }
    },

    render() {
        const route = parseRoute();
        document.title = 'Scottish Metrical Psalter';
        syncSearchInput(route);
        // Present mode is preserved for stanza views and for the playlist-
        // present route (which renders one slide at a time); cleared otherwise.
        const inStanza = route.tokens[0] === 'psalm'
            && route.tokens.some(t => /^s\d+$/.test(t));
        const inPlaylistPresent = route.tokens[0] === 'playlists'
            && route.tokens[2] === 'present';
        if (!inStanza && !inPlaylistPresent && document.body.classList.contains('presenting')) {
            exitPresent();
        }
        try {
            const head = route.tokens[0];
            if (!head)                    return this.renderHome();
            if (head === 'psalm')         return this.renderPsalmRoute(route.tokens.slice(1), route.params);
            if (head === 'meters')        return this.renderMeters();
            if (head === 'first-lines')   return this.renderFirstLines();
            if (head === 'concordance')   return this.renderConcordance(route.tokens.slice(1));
            if (head === 'search')        return this.renderSearch(route.params);
            if (head === 'playlists')     return this.renderPlaylistsRoute(route.tokens.slice(1), route.params);
            this.renderNotFound();
        } catch (e) {
            console.error(e);
            mount(el('p', { class: 'error' }, 'Render error: ' + e.message));
        }
    },

    onKey(e) {
        if (e.defaultPrevented) return;
        const t = e.target;
        if (t && t.matches && t.matches('input,textarea,select,[contenteditable]')) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // Esc in present mode exits presentation, not back-to-setting.
        if (e.key === 'Escape' && document.body.classList.contains('presenting')) {
            e.preventDefault();
            exitPresent();
            return;
        }

        const route = parseRoute();
        // Arrow-key navigation works on any view that renders prev/next-stanza
        // links: the regular stanza zoom, and the playlist-present queue.
        const inStanza = route.tokens[0] === 'psalm'
            && route.tokens.some(t => /^s\d+$/.test(t));
        const inPlaylistPresent = route.tokens[0] === 'playlists'
            && route.tokens[2] === 'present';
        if (!inStanza && !inPlaylistPresent) return;

        let link;
        if (e.key === 'ArrowLeft')  link = document.querySelector('a.prev-stanza:not(.disabled)');
        else if (e.key === 'ArrowRight') link = document.querySelector('a.next-stanza:not(.disabled)');
        else if (e.key === 'Escape') link = document.querySelector('a.back-to-setting');
        if (link) {
            e.preventDefault();
            link.click();
        }
    },

    // ---------- Home ----------

    renderHome() {
        renderHomeView(this);
    },

    // ---------- Psalm / setting / stanza ----------

    renderPsalmRoute(tokens, params) {
        renderPsalmRouteView(this, tokens, params);
    },

    // ---------- Indexes ----------

    renderMeters() {
        renderMetersView(this);
    },

    renderFirstLines() {
        renderFirstLinesView(this);
    },

    // ---------- Concordance ----------

    renderConcordance(tokens) {
        renderConcordanceView(this, tokens);
    },

    renderSearch(params) {
        renderSearchView(this, params);
    },

    // ---------- Playlists ----------

    renderPlaylistsRoute(tokens, params) {
        // /playlists
        if (!tokens.length) { clearEditorDraft(); return this.renderPlaylistsIndex(); }
        // /playlists/shared
        if (tokens[0] === 'shared') { clearEditorDraft(); return this.renderSharedPlaylist(params); }
        // /playlists/{id}/present
        if (tokens[1] === 'present') { clearEditorDraft(); return this.renderPlaylistPresent(tokens[0], params); }
        // /playlists/{id}
        return this.renderPlaylistEditor(tokens[0], params);
    },

    renderPlaylistsIndex() { renderPlaylistsIndexView(); },

    renderPlaylistEditor(id, params) { renderPlaylistEditorView(id, params); },

    renderPlaylistPresent(id, params) {
        const pl = getPlaylist(id);
        if (!pl) return this.renderNotFound();
        const queue = buildPlaylistQueue(pl);
        if (!queue.length) {
            mount(el('article', { class: 'pl-page' },
                el('h1', null, 'Empty playlist'),
                el('p', null, 'Add at least one setting before presenting.'),
                el('a', { class: 'back-link', href: '#/playlists/' + id }, '\u2190 Back to editor'),
            ));
            return;
        }
        const k = Math.max(0, Math.min(queue.length - 1, parseInt(params.get('k') || '0', 10) || 0));
        renderPlaylistSlide(pl, queue, k);
    },

    renderSharedPlaylist(params) {
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
    },

    renderNotFound() {
        renderNotFoundView();
    },
};

// ---------- URL & label helpers ----------

// Compact citation used by the concordance and first-lines index, e.g.
//   "Psalm 23"
//   "Psalm 6 (1st)"
//   "Psalm 119 (Aleph)"
function citation(setting) {
    const sibs = App.byPsalm.get(setting.psalm);
    let suffix = '';
    if (sibs.length > 1) {
        if (setting.heading)  suffix = `(${setting.heading})`;
        else if (setting.version) suffix = `(${ordinalSuffix(setting.version)})`;
        else if (setting.part)    suffix = `(Part ${setting.part})`;
    }
    return suffix ? `Psalm ${setting.psalm} ${suffix}` : `Psalm ${setting.psalm}`;
}
export { citation };


// ---------- Share & psalm-nav helpers ----------

function shareButton() {
    const label = el('span', { class: 'share-btn-label' }, 'Share');
    const btn = el('button', {
        type: 'button',
        class: 'share-btn',
        title: 'Share a link to this page',
        'aria-label': 'Share',
        html: ICONS.share,
    });
    btn.appendChild(label);

    let resetTimer = null;
    const flash = (text, cls) => {
        if (resetTimer) clearTimeout(resetTimer);
        label.textContent = text;
        btn.classList.remove('copied', 'failed');
        if (cls) btn.classList.add(cls);
        resetTimer = setTimeout(() => {
            label.textContent = 'Share';
            btn.classList.remove('copied', 'failed');
            resetTimer = null;
        }, 1800);
    };

    btn.addEventListener('click', async () => {
        const url = location.href;
        const result = await shareUrl({ url, title: document.title });
        if (result === 'shared' || result === 'aborted') return;
        if (result === 'copied') flash('Link copied', 'copied');
        else flash('Press Ctrl+C', 'failed');
    });
    return btn;
}
export { shareButton };

// ---------- Playlists: present queue ----------

function buildPlaylistQueue(pl) {
    const queue = [];
    if (pl.mainTitleSlide) queue.push({ kind: 'mainTitle' });
    pl.settings.forEach((s, i) => {
        if (pl.perSettingTitles) queue.push({ kind: 'settingTitle', settingIdx: i });
        const rendition = findRendition(s.psalm, s.version, s.part);
        if (!rendition) return;
        const verseSet = s.verses && s.verses.length ? versesSetFromRanges(s.verses) : null;
        for (let si = 0; si < rendition.stanzas.length; si++) {
            const stanza = rendition.stanzas[si];
            const visible = verseSet
                ? stanza.some(line => line._verse != null && verseSet.has(line._verse))
                : stanza.length > 0;
            if (visible) {
                queue.push({ kind: 'stanza', settingIdx: i, stanzaIdx: si, rendition, verseSet });
            }
        }
    });
    return queue;
}

function renderPlaylistSlide(pl, queue, k) {
    const slide = queue[k];
    const prevK = k > 0 ? k - 1 : null;
    const nextK = k < queue.length - 1 ? k + 1 : null;
    const baseHref = '#/playlists/' + pl.id + '/present';
    const slideUrl = (j) => j == null ? '#' : (baseHref + '?k=' + j);

    // Re-use the existing stanza-nav link classes so the present-mode tap
    // zones and arrow-key handler work without modification.
    const prevLink = el('a', {
        class: 'prev-stanza' + (prevK == null ? ' disabled' : ''),
        href: slideUrl(prevK),
        'aria-disabled': prevK == null ? 'true' : null,
    }, '\u2190 Previous');
    const nextLink = el('a', {
        class: 'next-stanza' + (nextK == null ? ' disabled' : ''),
        href: slideUrl(nextK),
        'aria-disabled': nextK == null ? 'true' : null,
    }, 'Next \u2192');
    const back = el('a', {
        class: 'back-to-setting back-link',
        href: '#/playlists/' + pl.id,
    }, '\u2191 Back to playlist');

    let body;
    if (slide.kind === 'mainTitle') {
        body = renderMainTitleSlideBody(pl);
        document.title = (pl.name || 'Playlist') + ' \u2014 Scottish Metrical Psalter';
    } else if (slide.kind === 'settingTitle') {
        const s = pl.settings[slide.settingIdx];
        const r = findRendition(s.psalm, s.version, s.part);
        body = renderSettingTitleSlideBody(s, r);
        document.title = `Psalm ${s.psalm} \u2014 ${pl.name || 'Playlist'}`;
    } else {
        // Stanza slide. Render same structure as existing stanza-body so all
        // present-mode CSS just works.
        const s = pl.settings[slide.settingIdx];
        const r = slide.rendition;
        const stanza = r.stanzas[slide.stanzaIdx];
        const visibleLines = slide.verseSet
            ? stanza.filter(line => line._verse != null && slide.verseSet.has(line._verse))
            : stanza;
        const lineNodes = visibleLines.map(line => stanzaLineNode(line, true));
        body = el('div', { class: 'stanza-body-wrap' },
            el('div', { class: 'stanza-body' }, ...lineNodes));
        document.title = `Psalm ${s.psalm} \u2014 ${pl.name || 'Playlist'}`;
    }

    mount(el('article', { class: 'pl-present-slide pl-present-' + slide.kind },
        body,
        el('nav', { class: 'stanza-nav' }, prevLink, nextLink),
        back,
    ));

    // Enter present mode if we just landed here from the editor.
    if (!document.body.classList.contains('presenting')) {
        enterPresent();
    }
}

function renderMainTitleSlideBody(pl) {
    const items = pl.settings.map((s, i) => {
        const r = findRendition(s.psalm, s.version, s.part);
        const bits = [el('span', { class: 'pl-title-row-n' }, String(i + 1) + '.')];
        const labelBits = [`Psalm ${s.psalm}`];
        if (r && settingHasMultipleRenditions(s)) {
            const lbl = renditionLabel(r);
            if (lbl) labelBits.push(`(${lbl})`);
        }
        bits.push(el('span', { class: 'pl-title-row-psalm' }, labelBits.join(' ')));
        if (s.verses && s.verses.length) {
            bits.push(el('span', { class: 'pl-title-row-verses' },
                ' \u00b7 verses ' + formatVerseRanges(s.verses)));
        }
        return el('li', { class: 'pl-title-row' }, ...bits);
    });
    return el('div', { class: 'pl-title-main' },
        el('h1', { class: 'pl-title-main-name' }, pl.name || 'Playlist'),
        el('ol', { class: 'pl-title-main-list' }, ...items),
    );
}

function renderSettingTitleSlideBody(s, rendition) {
    const children = [];
    children.push(el('div', { class: 'pl-title-set-psalm' }, `Psalm ${s.psalm}`));
    if (rendition && settingHasMultipleRenditions(s)) {
        const lbl = renditionLabel(rendition);
        if (lbl) children.push(el('div', { class: 'pl-title-set-rendition' }, lbl));
    }
    if (s.verses && s.verses.length) {
        children.push(el('div', { class: 'pl-title-set-verses' },
            'Verses ' + formatVerseRanges(s.verses)));
    }
    if (rendition && rendition.inscription) {
        children.push(el('div', { class: 'pl-title-set-inscription' }, rendition.inscription));
    }
    if (rendition && rendition.meter) {
        children.push(el('div', { class: 'pl-title-set-meter' }, rendition.meter));
    }
    return el('div', { class: 'pl-title-setting' }, ...children);
}

// ---------- Playlists: shared preview & import ----------

function renderSharedPlaylistPreview(draft) {
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
        // Create an ephemeral playlist with a temp id, save, then go.
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
    // Name collision: ask user.
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

// ---------- Boot ----------

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.boot());
} else {
    App.boot();
}
