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

    renderPlaylistsIndex() {
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
    },

    renderPlaylistEditor(id, params) {
        // Prefer the in-memory draft (covers brand-new playlists not yet
        // persisted, and ongoing edits to existing ones).
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

        // Picker open?
        const picker = params.get('picker');
        if (picker === 'add' || picker === 'edit') {
            return renderPickerView(pl, picker, params);
        }

        mountPlaylistEditor(pl, draft);
    },

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

// ---------- Playlists: store ----------

const PLAYLISTS_KEY = 'smv-playlists';

function loadPlaylists() {
    try {
        const raw = localStorage.getItem(PLAYLISTS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function savePlaylists(list) {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(list));
}

function getPlaylist(id) {
    return loadPlaylists().find(p => p.id === id) || null;
}

function upsertPlaylist(pl) {
    pl.updatedAt = new Date().toISOString();
    const list = loadPlaylists();
    const i = list.findIndex(p => p.id === pl.id);
    if (i >= 0) list[i] = pl;
    else list.push(pl);
    savePlaylists(list);
}

function deletePlaylist(id) {
    savePlaylists(loadPlaylists().filter(p => p.id !== id));
}

function newPlaylistId() {
    // ~6 base36 chars of randomness, prefixed for human readability.
    return 'p_' + Math.random().toString(36).slice(2, 8);
}

function createBlankPlaylist() {
    const now = new Date().toISOString();
    return {
        id: newPlaylistId(),
        name: 'New playlist',
        createdAt: now,
        updatedAt: now,
        mainTitleSlide: true,
        perSettingTitles: true,
        settings: [],
    };
}

// ---------- Playlists: editor draft (no autosave) ----------
//
// The editor and picker mutate an in-memory clone of a playlist. Changes are
// only written to storage when the user clicks "Save and close". "Cancel"
// (or navigating away to anywhere outside the editor / picker) discards the
// draft. New playlists are created as drafts only — they don't land in
// storage until Save.

let editorDraft = null; // { id, working, isNew }

function cloneForDraft(pl) {
    // structuredClone is fine in all current browsers we care about, but a
    // JSON round-trip is portable and the playlist shape is JSON-safe.
    return JSON.parse(JSON.stringify(pl));
}

function setEditorDraft(pl, { isNew = false } = {}) {
    editorDraft = { id: pl.id, working: cloneForDraft(pl), isNew };
    return editorDraft.working;
}

function clearEditorDraft() {
    editorDraft = null;
}

function getEditorDraft(id) {
    if (editorDraft && editorDraft.id === id) return editorDraft;
    return null;
}

// ---------- Playlists: URL codec ----------

// Encode setting -> "{psalm}[v{V}][p{P}][:{ranges}]"
function encodeSettingForUrl(s) {
    let out = String(s.psalm);
    if (s.version != null) out += 'v' + s.version;
    if (s.part != null)    out += 'p' + s.part;
    if (s.verses && s.verses.length) {
        out += ':' + formatVerseRangesAscii(s.verses);
    }
    return out;
}

function decodeSettingFromUrl(token) {
    const m = token.match(/^(\d+)(?:v(\d+))?(?:p(\d+))?(?::([\d,\-]+))?$/);
    if (!m) return null;
    const setting = { psalm: parseInt(m[1], 10) };
    if (m[2]) setting.version = parseInt(m[2], 10);
    if (m[3]) setting.part = parseInt(m[3], 10);
    if (m[4]) {
        const ranges = parseVerseRanges(m[4]);
        if (ranges && ranges.length) setting.verses = ranges;
    }
    return setting;
}

function encodePlaylistToParams(pl) {
    const params = new URLSearchParams();
    if (pl.name) params.set('n', pl.name);
    const tFlags =
        (pl.mainTitleSlide ? '1' : '0') +
        (pl.perSettingTitles ? '1' : '0');
    if (tFlags !== '11') params.set('t', tFlags);
    if (pl.settings.length) {
        params.set('d', pl.settings.map(encodeSettingForUrl).join(';'));
    }
    return params;
}

function decodePlaylistFromParams(params) {
    const d = params.get('d');
    if (!d) return null;
    const settings = d.split(';').map(decodeSettingFromUrl).filter(Boolean);
    if (!settings.length) return null;
    const t = params.get('t') || '11';
    return {
        // No id: it's a draft until imported.
        name: params.get('n') || 'Shared playlist',
        mainTitleSlide: t[0] !== '0',
        perSettingTitles: t[1] !== '0',
        settings,
    };
}

function shareUrlForPlaylist(pl) {
    const params = encodePlaylistToParams(pl);
    return location.origin + location.pathname + '#/playlists/shared?' + params.toString();
}

// ---------- Playlists: verse-range helpers ----------

function parseVerseRanges(spec) {
    if (!spec) return [];
    const out = [];
    for (const chunk of spec.split(',')) {
        const m = chunk.trim().match(/^(\d+)(?:\s*[-\u2013]\s*(\d+))?$/);
        if (!m) continue;
        const a = parseInt(m[1], 10);
        const b = m[2] ? parseInt(m[2], 10) : a;
        out.push([Math.min(a, b), Math.max(a, b)]);
    }
    return mergeRanges(out);
}

function mergeRanges(ranges) {
    if (!ranges.length) return [];
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
    const out = [sorted[0].slice()];
    for (let i = 1; i < sorted.length; i++) {
        const last = out[out.length - 1];
        const [a, b] = sorted[i];
        if (a <= last[1] + 1) last[1] = Math.max(last[1], b);
        else out.push([a, b]);
    }
    return out;
}

function formatVerseRanges(ranges) {
    // En-dash for display.
    return ranges.map(([a, b]) => a === b ? String(a) : `${a}\u2013${b}`).join(', ');
}

function formatVerseRangesAscii(ranges) {
    // Hyphen for URL-encoded data.
    return ranges.map(([a, b]) => a === b ? String(a) : `${a}-${b}`).join(',');
}

function versesSetFromRanges(ranges) {
    const set = new Set();
    for (const [a, b] of ranges) {
        for (let v = a; v <= b; v++) set.add(v);
    }
    return set;
}

function setToRanges(set) {
    const sorted = [...set].sort((a, b) => a - b);
    if (!sorted.length) return [];
    const out = [];
    let start = sorted[0], prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        const v = sorted[i];
        if (v === prev + 1) { prev = v; continue; }
        out.push([start, prev]);
        start = v;
        prev = v;
    }
    out.push([start, prev]);
    return out;
}

// ---------- Playlists: verse-unit grouping (no-partial-verse rule, §4.1) ----------

function computeVerseUnits(rendition) {
    const units = [];
    let cur = null;
    for (let i = 0; i < rendition.stanzas.length; i++) {
        const stanza = rendition.stanzas[i];
        const firstLine = stanza[0];
        const isVerseStart = firstLine && firstLine.verse != null;
        if (isVerseStart || !cur) {
            cur = {
                startVerse: firstLine && firstLine.verse != null
                    ? firstLine.verse
                    : firstVerseInStanza(stanza),
                endVerse: null,
                stanzaIdxs: [],
                startStanzaIdx: i,
            };
            units.push(cur);
        }
        // Track all verses present in this stanza.
        let maxV = cur.endVerse;
        let minV = cur.startVerse;
        for (const line of stanza) {
            const v = line._verse;
            if (v == null) continue;
            if (maxV == null || v > maxV) maxV = v;
            if (minV == null || v < minV) minV = v;
        }
        cur.endVerse = maxV != null ? maxV : cur.startVerse;
        if (cur.startVerse == null) cur.startVerse = minV;
        cur.stanzaIdxs.push(i);
    }
    return units;
}

function firstVerseInStanza(stanza) {
    for (const line of stanza) if (line._verse != null) return line._verse;
    return null;
}

function snapVersesToUnits(verseSet, units) {
    const out = new Set();
    for (const u of units) {
        let touches = false;
        if (u.startVerse != null && u.endVerse != null) {
            for (let v = u.startVerse; v <= u.endVerse; v++) {
                if (verseSet.has(v)) { touches = true; break; }
            }
        }
        if (touches) {
            for (let v = u.startVerse; v <= u.endVerse; v++) out.add(v);
        }
    }
    return out;
}

// ---------- Playlists: rendition lookup ----------

function findRendition(psalm, version, part) {
    const sibs = App.byPsalm && App.byPsalm.get(psalm);
    if (!sibs) return null;
    let r = sibs.find(s =>
        (version == null || s.version === version) &&
        (part == null    || s.part === part)
    );
    if (!r) r = sibs[0];
    return r;
}

function isWholePsalm(setting) {
    return !setting.verses || !setting.verses.length;
}

function settingHasMultipleRenditions(setting) {
    const sibs = App.byPsalm && App.byPsalm.get(setting.psalm);
    return sibs && sibs.length > 1;
}

function renditionLabel(rendition) {
    return settingDesignator(rendition) || '';
}

function settingSummary(setting) {
    const r = findRendition(setting.psalm, setting.version, setting.part);
    const desigBits = [];
    if (r && settingHasMultipleRenditions(setting)) {
        const label = renditionLabel(r);
        if (label) desigBits.push(label);
    }
    const verseBits = setting.verses && setting.verses.length
        ? 'verses ' + formatVerseRanges(setting.verses)
        : 'all verses';
    return { desig: desigBits.join(' \u00b7 '), verseSummary: verseBits, rendition: r };
}

// ---------- Playlists: index row ----------

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

// ---------- Playlists: editor view ----------

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
    // No autosave — just keep the draft in sync.
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
            // Drafts that were never saved have nothing to delete from storage.
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

    // Keyboard: Alt+Up / Alt+Down to reorder.
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
    // Restore focus to the moved row.
    requestAnimationFrame(() => {
        const moved = document.querySelector(`.pl-set-row[data-idx="${to}"]`);
        if (moved) moved.focus();
    });
}

// ---------- Playlists: picker ----------

function renderPickerView(pl, mode, params) {
    const editIdx = mode === 'edit' ? parseInt(params.get('i') || '0', 10) : -1;
    const existing = mode === 'edit' ? pl.settings[editIdx] : null;

    // Step inference: explicit ?psalm=... ?r=... advances steps.
    const psalmParam = params.get('psalm');
    const renditionCode = params.get('r'); // e.g. "119p3" / "6v1"
    let psalmNum = null, version = null, part = null;
    if (existing) {
        psalmNum = existing.psalm;
        version = existing.version != null ? existing.version : null;
        part = existing.part != null ? existing.part : null;
    }
    if (psalmParam) psalmNum = parseInt(psalmParam, 10);
    if (renditionCode) {
        const m = renditionCode.match(/^(\d+)(?:v(\d+))?(?:p(\d+))?$/);
        if (m) {
            psalmNum = parseInt(m[1], 10);
            if (m[2]) version = parseInt(m[2], 10);
            if (m[3]) part = parseInt(m[3], 10);
        }
    }

    const baseHash = '#/playlists/' + pl.id;
    const stepBaseQS = (overrides) => {
        const u = new URLSearchParams();
        u.set('picker', mode);
        if (mode === 'edit') u.set('i', String(editIdx));
        if (overrides) {
            for (const [k, v] of Object.entries(overrides)) {
                if (v == null) continue;
                u.set(k, v);
            }
        }
        return '?' + u.toString();
    };

    // Step 1: find (no psalmNum yet)
    if (psalmNum == null) {
        return renderPickerFindStep(pl, mode, baseHash, stepBaseQS);
    }

    if (!App.byPsalm.has(psalmNum)) {
        return mount(el('article', { class: 'pl-page' },
            el('h1', null, 'Psalm not found'),
            el('p', null, 'No psalm numbered ', String(psalmNum), '.'),
            el('a', { class: 'back-link', href: baseHash + stepBaseQS() }, '\u2190 Back'),
        ));
    }

    const sibs = App.byPsalm.get(psalmNum);

    // Step 2: rendition (only if 2+ renditions and none chosen yet).
    if (sibs.length > 1 && version == null && part == null) {
        return renderPickerRenditionStep(pl, mode, psalmNum, sibs, baseHash, stepBaseQS);
    }

    // Step 3: verses.
    const rendition = findRendition(psalmNum, version, part);
    const initialVerses = (existing && existing.verses) ? existing.verses : [];
    renderPickerVersesStep(pl, mode, editIdx, rendition, initialVerses, baseHash, stepBaseQS);
}

function renderPickerFindStep(pl, mode, baseHash, stepBaseQS) {
    document.title = 'Add setting \u2014 Scottish Metrical Psalter';

    const back = el('a', { class: 'pl-back', href: baseHash },
        el('span', { html: ICONS.arrowLeft }), el('span', null, 'Cancel'));

    const input = el('input', {
        type: 'search',
        class: 'pl-picker-search',
        placeholder: 'Psalm number or first words\u2026',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': 'Search psalms',
    });

    const resultsList = el('ul', { class: 'pl-picker-results' });

    function update() {
        const q = input.value.trim().toLowerCase();
        resultsList.replaceChildren();
        const psalms = [...App.byPsalm.keys()].sort((a, b) => a - b);
        const matches = [];
        for (const n of psalms) {
            const sibs = App.byPsalm.get(n);
            // Number match.
            if (q && String(n) === q) {
                matches.unshift({ n, prefix: true });
                continue;
            }
            if (q && String(n).startsWith(q)) {
                matches.push({ n, prefix: true });
                continue;
            }
            if (!q) {
                matches.push({ n });
                continue;
            }
            // First-line text match across renditions.
            for (const r of sibs) {
                const fl = firstLineOfSetting(r).toLowerCase();
                if (fl.includes(q)) {
                    matches.push({ n });
                    break;
                }
            }
            if (matches.length >= 50) break;
        }
        const top = matches.slice(0, 50);
        if (!top.length) {
            resultsList.appendChild(el('li', { class: 'pl-picker-empty' },
                el('em', null, 'No psalms match.')));
            return;
        }
        for (const { n } of top) {
            const sibs = App.byPsalm.get(n);
            const r = sibs[0];
            resultsList.appendChild(el('li', null,
                el('a', {
                    class: 'pl-picker-result',
                    href: baseHash + stepBaseQS({ psalm: String(n) }),
                },
                    el('span', { class: 'pl-picker-result-n' }, 'Psalm ' + n),
                    el('span', { class: 'pl-picker-result-fl' }, firstLineOfSetting(r)),
                ),
            ));
        }
    }

    input.addEventListener('input', update);

    mount(el('article', { class: 'pl-page pl-picker' },
        back,
        el('h1', null, mode === 'edit' ? 'Change setting' : 'Add setting'),
        el('p', { class: 'pl-picker-hint' }, 'Find a psalm by number or first words.'),
        input,
        resultsList,
    ));
    requestAnimationFrame(() => input.focus());
    update();
}

function renderPickerRenditionStep(pl, mode, psalmNum, sibs, baseHash, stepBaseQS) {
    document.title = `Choose rendition (Psalm ${psalmNum}) \u2014 Scottish Metrical Psalter`;

    const back = el('a', { class: 'pl-back', href: baseHash + stepBaseQS() },
        el('span', { html: ICONS.arrowLeft }), el('span', null, 'Back'));

    const cards = sibs.map(r => {
        const code = String(psalmNum)
            + (r.version != null ? 'v' + r.version : '')
            + (r.part    != null ? 'p' + r.part    : '');
        const labelBits = [renditionLabel(r) || `Setting`];
        if (r.meter) labelBits.push(r.meter);
        return el('a', {
            class: 'pl-picker-rendition',
            href: baseHash + stepBaseQS({ r: code }),
        },
            el('span', { class: 'pl-picker-rendition-label' }, labelBits.join(' \u00b7 ')),
            el('span', { class: 'pl-picker-rendition-fl' }, firstLineOfSetting(r)),
        );
    });

    mount(el('article', { class: 'pl-page pl-picker' },
        back,
        el('h1', null, `Psalm ${psalmNum}`),
        el('p', { class: 'pl-picker-hint' }, 'Choose a metrical rendition.'),
        el('div', { class: 'pl-picker-renditions' }, ...cards),
    ));
}

function renderPickerVersesStep(pl, mode, editIdx, rendition, initialVerses, baseHash, stepBaseQS) {
    document.title = `Choose verses (Psalm ${rendition.psalm}) \u2014 Scottish Metrical Psalter`;
    const units = computeVerseUnits(rendition);
    const desig = settingDesignator(rendition);
    const prefixText = desig ? `Psalm ${rendition.psalm}, ${desig}:` : `Psalm ${rendition.psalm}:`;

    // Working state.
    let selected = versesSetFromRanges(initialVerses);
    let selectAll = !initialVerses.length;
    if (selectAll) {
        // Implicit: when no verses specified, "all" is selected (whole psalm).
        for (const u of units) {
            if (u.startVerse == null) continue;
            for (let v = u.startVerse; v <= u.endVerse; v++) selected.add(v);
        }
    }

    const back = el('a', { class: 'pl-back', href: baseHash + stepBaseQS() },
        el('span', { html: ICONS.arrowLeft }), el('span', null, 'Back'));

    const prefixSpan = el('span', { class: 'pl-picker-prefix' }, prefixText);
    const versesInput = el('input', {
        type: 'text',
        class: 'pl-picker-verses-input',
        value: initialVerses.length ? formatVerseRanges(initialVerses).replace(/\u2013/g, '-') : '',
        placeholder: 'all',
        spellcheck: 'false',
        'aria-label': 'Verse ranges',
    });
    const lockedField = el('div', { class: 'pl-picker-locked-field' }, prefixSpan, versesInput);

    const allCheckbox = el('input', {
        type: 'checkbox',
        checked: selectAll ? 'checked' : null,
    });
    const allToggle = el('label', { class: 'pl-toggle pl-picker-allwhole' },
        allCheckbox, el('span', null, 'Select whole psalm'));

    const unitsList = el('div', { class: 'pl-picker-units' });
    const summary = el('div', { class: 'pl-picker-summary' });
    const doneBtn = el('button', {
        type: 'button',
        class: 'pl-btn pl-btn-primary',
    }, el('span', { html: ICONS.check }), el('span', null, 'Done'));
    const cancelBtn = el('a', {
        class: 'pl-btn',
        href: baseHash,
    }, 'Cancel');

    function recomputeSummary() {
        const ranges = setToRanges(selected);
        const stanzaCount = countSelectedStanzas(units, selected);
        if (!ranges.length) {
            summary.textContent = 'No verses selected.';
            doneBtn.disabled = true;
            doneBtn.classList.add('disabled');
        } else if (selectAll) {
            summary.textContent = `Whole psalm \u00b7 ${stanzaCount} stanza${stanzaCount === 1 ? '' : 's'}`;
            doneBtn.disabled = false;
            doneBtn.classList.remove('disabled');
        } else {
            summary.textContent = `Verses ${formatVerseRanges(ranges)} \u00b7 ${stanzaCount} stanza${stanzaCount === 1 ? '' : 's'}`;
            doneBtn.disabled = false;
            doneBtn.classList.remove('disabled');
        }
    }

    function syncTextFromState() {
        if (selectAll) {
            versesInput.value = '';
        } else {
            const ranges = setToRanges(selected);
            versesInput.value = ranges.length ? formatVerseRanges(ranges).replace(/\u2013/g, '-') : '';
        }
    }

    function syncUnitsUI() {
        const cards = unitsList.querySelectorAll('.pl-picker-unit');
        cards.forEach(card => {
            const unitIdx = parseInt(card.getAttribute('data-unit'), 10);
            const u = units[unitIdx];
            const isOn = u.startVerse != null && selected.has(u.startVerse);
            card.classList.toggle('selected', isOn);
            const cb = card.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = isOn;
        });
    }

    function setUnitSelection(unitIdx, on) {
        const u = units[unitIdx];
        if (u.startVerse == null) return;
        if (selectAll) {
            // User picked an individual unit; turn off whole-psalm.
            selectAll = false;
            allCheckbox.checked = false;
        }
        if (on) {
            for (let v = u.startVerse; v <= u.endVerse; v++) selected.add(v);
        } else {
            for (let v = u.startVerse; v <= u.endVerse; v++) selected.delete(v);
        }
        syncTextFromState();
        syncUnitsUI();
        recomputeSummary();
    }

    function commitTextInput() {
        const raw = versesInput.value.trim().toLowerCase();
        if (!raw || raw === 'all') {
            selected = new Set();
            for (const u of units) {
                if (u.startVerse == null) continue;
                for (let v = u.startVerse; v <= u.endVerse; v++) selected.add(v);
            }
            selectAll = true;
            allCheckbox.checked = true;
            syncTextFromState();
            syncUnitsUI();
            recomputeSummary();
            return;
        }
        const parsed = parseVerseRanges(raw);
        const raw_set = versesSetFromRanges(parsed);
        const snapped = snapVersesToUnits(raw_set, units);
        const changed = snapped.size !== raw_set.size
            || [...snapped].some(v => !raw_set.has(v));
        selected = snapped;
        selectAll = false;
        allCheckbox.checked = false;
        syncTextFromState();
        syncUnitsUI();
        recomputeSummary();
        if (changed) {
            versesInput.classList.add('snapped');
            setTimeout(() => versesInput.classList.remove('snapped'), 700);
        }
    }

    versesInput.addEventListener('change', commitTextInput);
    versesInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commitTextInput(); }
    });

    allCheckbox.addEventListener('change', () => {
        if (allCheckbox.checked) {
            selected = new Set();
            for (const u of units) {
                if (u.startVerse == null) continue;
                for (let v = u.startVerse; v <= u.endVerse; v++) selected.add(v);
            }
            selectAll = true;
        } else {
            selected = new Set();
            selectAll = false;
        }
        syncTextFromState();
        syncUnitsUI();
        recomputeSummary();
    });

    // Build unit cards.
    units.forEach((u, ui) => {
        const verseLabel = u.startVerse === u.endVerse
            ? `verse ${u.startVerse}`
            : `verses ${u.startVerse}\u2013${u.endVerse}`;
        const cb = el('input', { type: 'checkbox' });
        const card = el('div', {
            class: 'pl-picker-unit',
            'data-unit': String(ui),
            tabindex: '0',
        },
            el('div', { class: 'pl-picker-unit-label' }, cb, el('span', null, verseLabel)),
        );
        // Render the stanzas of this unit (first is verse-start, rest are continuations).
        u.stanzaIdxs.forEach((si, j) => {
            const stanzaNode = el('div', { class: 'pl-picker-stanza' + (j > 0 ? ' continuation' : '') });
            for (const line of rendition.stanzas[si]) {
                stanzaNode.appendChild(stanzaLineNode(line, false));
            }
            card.appendChild(stanzaNode);
        });
        card.addEventListener('click', e => {
            // Ignore clicks that originated from another interactive element (none here, but defensive).
            if (e.target.closest('a,button')) return;
            const isOn = u.startVerse != null && selected.has(u.startVerse);
            setUnitSelection(ui, !isOn);
        });
        card.addEventListener('keydown', e => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                const isOn = u.startVerse != null && selected.has(u.startVerse);
                setUnitSelection(ui, !isOn);
            }
        });
        unitsList.appendChild(card);
    });

    doneBtn.addEventListener('click', () => {
        if (doneBtn.disabled) return;
        const ranges = selectAll ? [] : setToRanges(selected);
        const newSetting = {
            psalm: rendition.psalm,
            ...(rendition.version != null ? { version: rendition.version } : {}),
            ...(rendition.part    != null ? { part:    rendition.part    } : {}),
            ...(ranges.length ? { verses: ranges } : {}),
        };
        if (mode === 'edit' && pl.settings[editIdx]) {
            pl.settings[editIdx] = newSetting;
        } else {
            pl.settings.push(newSetting);
        }
        location.hash = baseHash;
    });

    syncUnitsUI();
    recomputeSummary();

    mount(el('article', { class: 'pl-page pl-picker pl-picker-verses' },
        back,
        el('h1', null, `Psalm ${rendition.psalm}`),
        desig ? el('p', { class: 'designator' }, desig) : null,
        lockedField,
        allToggle,
        unitsList,
        el('div', { class: 'pl-picker-footer' }, summary, cancelBtn, doneBtn),
    ));
}

function countSelectedStanzas(units, selected) {
    let c = 0;
    for (const u of units) {
        if (u.startVerse != null && selected.has(u.startVerse)) c += u.stanzaIdxs.length;
    }
    return c;
}

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

function promptImportFromUrl() {
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

// ---------- Boot ----------

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.boot());
} else {
    App.boot();
}
