// Scottish Metrical Psalter — single-page client.
// All views are rendered from psalter.json on demand. No build step.

import { el, mount } from './dom.js';
import { parseRoute, ordinalSuffix } from './router.js';
import { ICONS } from './icons.js';
import { initMobileMenu, initSearchForm, syncSearchInput } from './ui/chrome.js';
import { initTheme } from './ui/theme.js';
import { registerServiceWorker } from './ui/serviceWorker.js';
import { shareUrl } from './ui/share.js';
import { exitPresent } from './present/mode.js';
import { clearEditorDraft } from './playlists/draft.js';
import { renderPlaylistsIndexView } from './playlists/index.js';
import { renderPlaylistEditorView } from './playlists/editor.js';
import { renderPlaylistPresentView } from './playlists/present.js';
import { renderSharedPlaylistView } from './playlists/shared.js';
import { renderHomeView } from './views/home.js';
import { renderMetersView } from './views/meters.js';
import { renderFirstLinesView } from './views/firstLines.js';
import { renderNotFoundView } from './views/notFound.js';
import { renderConcordanceView } from './views/concordance.js';
import { renderSearchView } from './views/search.js';
import { renderPsalmRouteView } from './views/setting.js';

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

    renderPlaylistPresent(id, params) { renderPlaylistPresentView(id, params); },

    renderSharedPlaylist(params) { renderSharedPlaylistView(params); },

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

// ---------- Boot ----------

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.boot());
} else {
    App.boot();
}
