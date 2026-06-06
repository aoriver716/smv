// Scottish Metrical Psalter — single-page client.
// All views are rendered from psalter.json on demand. No build step.

const BOOKS = [
    { title: 'Book I',   first: 1,   last: 41  },
    { title: 'Book II',  first: 42,  last: 72  },
    { title: 'Book III', first: 73,  last: 89  },
    { title: 'Book IV',  first: 90,  last: 106 },
    { title: 'Book V',   first: 107, last: 150 },
];

const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Words excluded from the concordance because they appear so often
// that they swamp meaningful entries. Currently: articles, basic
// conjunctions, prepositions, and auxiliary verbs (modern + archaic).
const STOPWORDS = new Set([
    // Articles
    'a', 'an', 'the',
    // Coordinating conjunctions
    'and', 'but', 'or', 'nor', 'so', 'yet', 'for',
    // Prepositions
    'of', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'as',
    'into', 'unto', 'upon', 'against', 'before', 'after', 'through',
    'throughout', 'between', 'among', 'about', 'without', 'within',
    // Copula / auxiliaries (modern)
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
    'have', 'has', 'had', 'having',
    'do', 'does', 'did',
    'will', 'would', 'shall', 'should', 'may', 'might',
    'can', 'could', 'must',
    // Copula / auxiliaries (archaic)
    'hath', 'hast',
    'doth', 'dost',
    'wilt', 'wert', 'art',
    // Demonstratives / determiners
    'that', 'this', 'these', 'those',
    // Relative / interrogative
    'which', 'who', 'whom', 'whose', 'what',
    'when', 'where', 'why', 'how',
    // Subordinating conjunctions / adverbs
    'if', 'then', 'than', 'because', 'though', 'although',
    'while', 'until', 'since', 'whether',
]);

// ------ DOM helpers ------

function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v == null || v === false) continue;
            if (k === 'class') node.className = v;
            else if (k === 'html') node.innerHTML = v;
            else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v);
        }
    }
    for (const c of children.flat()) {
        if (c == null || c === false) continue;
        node.appendChild(typeof c === 'string' || typeof c === 'number'
            ? document.createTextNode(String(c))
            : c);
    }
    return node;
}

function mount(...nodes) {
    const app = document.getElementById('app');
    app.replaceChildren(...nodes);
    window.scrollTo(0, 0);
}

// ------ Routing ------

function parseRoute() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const [path, query] = raw.split('?');
    const tokens = path.split('/').filter(Boolean);
    const params = new URLSearchParams(query || '');
    return { tokens, params };
}

function parseVerses(spec) {
    if (!spec) return null;
    const out = new Set();
    for (const chunk of spec.split(',')) {
        const m = chunk.match(/^(\d+)(?:-(\d+))?$/);
        if (!m) continue;
        const a = parseInt(m[1], 10);
        const b = m[2] ? parseInt(m[2], 10) : a;
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
    }
    return out.size ? out : null;
}

function ordinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ------ App state ------

const App = {
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
        document.title = 'Scottish Metrical Psalter';
        const children = [
            el('h1', null, 'The Psalter'),
            el('p', { class: 'subtitle' }, '1650 Scottish Metrical Psalter'),
        ];
        for (const book of BOOKS) {
            const links = [];
            for (let n = book.first; n <= book.last; n++) {
                if (!this.byPsalm.has(n)) continue;
                links.push(el('a', { href: settingUrl(this.byPsalm.get(n)[0]) }, String(n)));
            }
            children.push(el('section', { class: 'book-block' },
                el('h2', null, `${book.title} (Psalms ${book.first}\u2013${book.last})`),
                el('div', { class: 'psalm-grid' }, ...links),
            ));
        }
        children.push(el('nav', { class: 'appendix-links' },
            el('a', { href: '#/meters' }, 'Index of meters'),
            el('a', { href: '#/first-lines' }, 'Index of first lines'),
            el('a', { href: '#/concordance' }, 'Concordance'),
        ));
        mount(el('div', { class: 'home' }, ...children));
    },

    // ---------- Psalm / setting / stanza ----------

    renderPsalmRoute(tokens, params) {
        const n = parseInt(tokens[0], 10);
        if (!n || !this.byPsalm.has(n)) return this.renderNotFound();

        let part = null, version = null, stanzaNum = null;
        for (const t of tokens.slice(1)) {
            let m;
            if ((m = t.match(/^p(\d+)$/))) part = parseInt(m[1], 10);
            else if ((m = t.match(/^v(\d+)$/))) version = parseInt(m[1], 10);
            else if ((m = t.match(/^s(\d+)$/))) stanzaNum = parseInt(m[1], 10);
        }

        const settings = this.byPsalm.get(n);
        let setting = settings.find(s =>
            (part == null    || s.part === part) &&
            (version == null || s.version === version)
        );
        if (!setting) setting = settings[0];

        const canonical = settingUrl(setting, stanzaNum, params);
        if (canonical !== location.hash && canonical !== '#' + decodeURIComponent(location.hash.slice(1))) {
            location.replace(canonical);
            return;
        }

        const verseFilter = parseVerses(params.get('verses'));

        if (stanzaNum != null) this.renderStanza(setting, stanzaNum, verseFilter, params);
        else                   this.renderSetting(setting, verseFilter, params);
    },

    renderSetting(setting, verseFilter, params) {
        document.title = `Psalm ${setting.psalm} — Scottish Metrical Psalter`;
        const settings = this.byPsalm.get(setting.psalm);

        const children = [
            el('h1', null, `Psalm ${setting.psalm}`),
        ];

        const desig = settingDesignator(setting);
        if (desig) children.push(el('p', { class: 'designator' }, desig));

        if (setting.inscription) {
            children.push(el('p', { class: 'inscription' }, setting.inscription));
        }
        if (setting.meter) {
            children.push(el('p', { class: 'meter' }, setting.meter));
        }

        // Sibling-settings nav.
        if (settings.length > 1) {
            children.push(altSettingsNav(setting, settings, params));
        }

        if (verseFilter) {
            const list = [...verseFilter].sort((a, b) => a - b).join(', ');
            children.push(el('p', { class: 'filter-note' }, `Showing verses ${list} only.`));
        }

        // Build stanza nodes.
        const stanzaNodes = [];
        for (let i = 0; i < setting.stanzas.length; i++) {
            const stanza = setting.stanzas[i];
            const visibleLines = verseFilter
                ? stanza.filter(line => line._verse != null && verseFilter.has(line._verse))
                : stanza;
            if (!visibleLines.length) continue;

            const lineNodes = visibleLines.map(line => stanzaLineNode(line, false));
            const stanzaNum = i + 1;
            stanzaNodes.push(el('a', {
                class: 'stanza',
                href: settingUrl(setting, stanzaNum, params),
                title: `Open stanza ${stanzaNum}`,
            }, ...lineNodes));
        }

        if (!stanzaNodes.length) {
            children.push(el('p', { class: 'filter-note' }, 'No stanzas match the verse filter.'));
        } else {
            children.push(el('div', { class: 'stanzas' }, ...stanzaNodes));
        }

        const presentBtn = el('button', {
            type: 'button',
            class: 'present-btn',
            onclick: () => {
                presentOnNextRender = true;
                const url = settingUrl(setting, 1, params);
                if (location.hash === url) App.render();
                else location.hash = url;
            },
        }, el('span', { html: ICONS.present }), el('span', { class: 'present-btn-label' }, 'Present'));
        children.push(el('div', { class: 'stanza-actions' }, presentBtn, shareButton()));

        children.push(adjacentPsalmNav(setting.psalm, this.byPsalm));

        children.push(el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'));

        mount(el('article', { class: 'setting' }, ...children));
    },

    renderStanza(setting, stanzaNum, verseFilter, params) {
        document.title = `Psalm ${setting.psalm}, stanza ${stanzaNum} — Scottish Metrical Psalter`;

        // Build list of visible stanza indices (1-based) for navigation.
        const visibleIdx = [];
        for (let i = 0; i < setting.stanzas.length; i++) {
            const stanza = setting.stanzas[i];
            const visible = verseFilter
                ? stanza.some(line => line._verse != null && verseFilter.has(line._verse))
                : stanza.length > 0;
            if (visible) visibleIdx.push(i + 1);
        }
        if (!visibleIdx.includes(stanzaNum)) {
            // Fall back to first available.
            if (!visibleIdx.length) return this.renderSetting(setting, verseFilter, params);
            location.replace(settingUrl(setting, visibleIdx[0], params));
            return;
        }

        const pos = visibleIdx.indexOf(stanzaNum);
        const prev = pos > 0 ? visibleIdx[pos - 1] : null;
        const next = pos < visibleIdx.length - 1 ? visibleIdx[pos + 1] : null;

        const stanza = setting.stanzas[stanzaNum - 1];
        const visibleLines = verseFilter
            ? stanza.filter(line => line._verse != null && verseFilter.has(line._verse))
            : stanza;

        const desig = settingDesignator(setting);
        const crumbLabel = desig ? `Psalm ${setting.psalm} (${desig})` : `Psalm ${setting.psalm}`;

        const lineNodes = visibleLines.map(line => stanzaLineNode(line, true));

        const prevLink = el('a', {
            class: 'prev-stanza' + (prev == null ? ' disabled' : ''),
            href: prev != null ? settingUrl(setting, prev, params) : '#',
            'aria-disabled': prev == null ? 'true' : null,
        }, '\u2190 Previous');

        const nextLink = el('a', {
            class: 'next-stanza' + (next == null ? ' disabled' : ''),
            href: next != null ? settingUrl(setting, next, params) : '#',
            'aria-disabled': next == null ? 'true' : null,
        }, 'Next \u2192');

        const back = el('a', {
            class: 'back-to-setting back-link',
            href: settingUrl(setting, null, params),
        }, '\u2191 Back to ' + crumbLabel);

        const presentBtn = el('button', {
            type: 'button',
            class: 'present-btn',
            onclick: () => enterPresent(),
        }, el('span', { html: ICONS.present }), el('span', { class: 'present-btn-label' }, 'Present'));

        mount(el('article', { class: 'stanza-view' },
            el('p', { class: 'crumbs' },
                el('a', { href: settingUrl(setting, null, params) }, crumbLabel)),
            el('p', { class: 'stanza-num' }, `Stanza ${stanzaNum} of ${setting.stanzas.length}`),
            el('div', { class: 'stanza-body-wrap' },
                el('div', { class: 'stanza-body' }, ...lineNodes)),
            el('nav', { class: 'stanza-nav' }, prevLink, nextLink),
            el('div', { class: 'stanza-actions' }, presentBtn, shareButton()),
            back,
        ));
        // The setting-page Present button navigates here and asks us to jump
        // straight into present mode on arrival.
        if (presentOnNextRender) {
            presentOnNextRender = false;
            enterPresent();
        }
    },

    // ---------- Indexes ----------

    renderMeters() {
        document.title = 'Meters — Scottish Metrical Psalter';

        // Group settings by meter, excluding C.M.
        const byMeter = new Map();
        for (const s of this.data.renditions) {
            const m = (s.meter || '').trim();
            if (!m || m === 'C.M.') continue;
            if (!byMeter.has(m)) byMeter.set(m, []);
            byMeter.get(m).push(s);
        }

        // Sort meters: alphabetical, but put numeric meters (8787, etc.) after letter meters.
        const meters = [...byMeter.keys()].sort((a, b) => {
            const an = /^\d/.test(a), bn = /^\d/.test(b);
            if (an !== bn) return an ? 1 : -1;
            return a.localeCompare(b, undefined, { numeric: true });
        });

        const blocks = meters.map(m => {
            const items = byMeter.get(m).map(s => el('li', null,
                el('a', { href: settingUrl(s) }, citation(s)),
                el('span', { class: 'first-line' }, firstLineOfSetting(s)),
            ));
            return el('section', { class: 'meter-block' },
                el('h2', null, m),
                el('ul', null, ...items),
            );
        });

        mount(el('article', { class: 'index-page' },
            el('h1', null, 'Index of Meters'),
            el('p', { class: 'subtitle' }, 'Excluding Common Meter (C.M.), in which every psalm has at least one setting.'),
            ...blocks,
            el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'),
        ));
    },

    renderFirstLines() {
        document.title = 'First lines — Scottish Metrical Psalter';

        const entries = [];
        for (const s of this.data.renditions) {
            const firstLine = firstLineOfSetting(s);
            if (!firstLine) continue;
            entries.push({
                first: firstLine,
                sortKey: stripLeadingArticle(firstLine).toLowerCase(),
                setting: s,
            });
        }
        entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

        const blocks = [];
        let curLetter = null;
        let curItems = [];
        const flush = () => {
            if (!curItems.length) return;
            blocks.push(el('h2', { class: 'letter-separator' }, curLetter));
            blocks.push(el('ul', null, ...curItems));
            curItems = [];
        };
        for (const e of entries) {
            const first = (e.sortKey[0] || '').toUpperCase();
            const letter = /[A-Z]/.test(first) ? first : '\u2014';
            if (letter !== curLetter) {
                flush();
                curLetter = letter;
            }
            curItems.push(el('li', null,
                el('a', { class: 'first-line-row', href: settingUrl(e.setting) },
                    el('span', { class: 'first-line' }, e.first),
                    el('span', { class: 'citation' }, citation(e.setting)),
                ),
            ));
        }
        flush();

        mount(el('article', { class: 'index-page first-lines' },
            el('h1', null, 'Index of First Lines'),
            ...blocks,
            el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'),
        ));
    },

    // ---------- Concordance ----------

    buildConcordance() {
        if (this.concordanceIndex) return this.concordanceIndex;

        const wordRe = /[A-Za-z][A-Za-z'\u2019]*/g;
        const map = new Map(); // word -> [{setting, stanzaIdx, lineIdx, position, original}]

        for (const s of this.data.renditions) {
            for (let si = 0; si < s.stanzas.length; si++) {
                const stanza = s.stanzas[si];
                for (let li = 0; li < stanza.length; li++) {
                    const line = stanza[li];
                    const text = String(line.text || '').replace(/^\t+/, '');
                    let m;
                    while ((m = wordRe.exec(text)) !== null) {
                        const original = m[0];
                        const norm = original.toLowerCase().replace(/\u2019/g, "'");
                        if (STOPWORDS.has(norm)) continue;
                        if (!map.has(norm)) map.set(norm, []);
                        map.get(norm).push({
                            setting: s,
                            stanzaIdx: si,
                            lineIdx: li,
                            start: m.index,
                            end: m.index + original.length,
                            original,
                            verse: line._verse,
                            text,
                        });
                    }
                }
            }
        }

        this.concordanceIndex = map;
        return map;
    },

    renderConcordance(tokens) {
        const letter = (tokens[0] || '').toLowerCase();
        if (!letter) return this.renderConcordanceHome();
        if (!ALPHA.includes(letter)) return this.renderNotFound();
        this.renderConcordanceLetter(letter);
    },

    renderConcordanceHome() {
        document.title = 'Concordance — Scottish Metrical Psalter';
        const map = this.buildConcordance();
        const counts = {};
        for (const w of map.keys()) {
            const ch = w[0];
            counts[ch] = (counts[ch] || 0) + 1;
        }
        const links = ALPHA.map(ch => {
            const cls = counts[ch] ? '' : 'disabled';
            return el('a', { class: cls, href: counts[ch] ? `#/concordance/${ch}` : '#' }, ch);
        });

        mount(el('article', { class: 'index-page' },
            el('h1', null, 'Concordance'),
            el('p', { class: 'subtitle' }, 'Every word in the psalter, with verse contexts. Common function words are excluded.'),
            el('div', { class: 'alphabet-grid' }, ...links),
            el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'),
        ));
    },

    renderConcordanceLetter(letter) {
        document.title = `Concordance: ${letter.toUpperCase()} — Scottish Metrical Psalter`;
        const map = this.buildConcordance();
        const words = [...map.keys()].filter(w => w[0] === letter).sort();

        const letterNav = ALPHA.map(ch => {
            const has = [...map.keys()].some(w => w[0] === ch);
            return el('a', {
                class: (ch === letter ? 'current ' : '') + (has ? '' : 'disabled'),
                href: has ? `#/concordance/${ch}` : '#',
            }, ch);
        });

        const entries = words.map(w => {
            const occurrences = map.get(w);
            const items = occurrences.map(o => {
                const abbr = abbreviateInContext(o);
                return el('li', null,
                    el('a', {
                        class: 'occurrence',
                        href: settingUrl(o.setting, o.stanzaIdx + 1, new URLSearchParams()),
                    },
                        el('span', { class: 'cite' }, citation(o.setting) + (o.verse ? ':' + o.verse : '')),
                        ' ',
                        el('span', { class: 'ctx', html: abbr.html }),
                    ),
                );
            });
            return el('section', { class: 'word-entry', id: 'w-' + w.replace(/[^a-z]/g, '-') },
                el('h2', { class: 'headword' }, w, el('span', { class: 'count' }, `(${occurrences.length})`)),
                el('ul', null, ...items),
            );
        });

        mount(el('article', { class: 'index-page concordance-page' },
            el('h1', null, `Concordance: ${letter.toUpperCase()}`),
            el('nav', { class: 'letter-nav' }, ...letterNav),
            ...entries,
            el('a', { class: 'back-link', href: '#/concordance' }, '\u2190 Back to alphabet'),
        ));
    },

    renderSearch(params) {
        const qRaw = (params.get('q') || '').trim();
        document.title = qRaw
            ? `\u201C${qRaw}\u201D \u2014 Search \u2014 Scottish Metrical Psalter`
            : 'Search \u2014 Scottish Metrical Psalter';

        const children = [el('h1', null, 'Search')];

        if (!qRaw) {
            children.push(el('p', { class: 'subtitle' },
                'Type a query in the search box above to find lines of the psalter.'));
            children.push(el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'));
            return mount(el('article', { class: 'index-page' }, ...children));
        }

        const re = new RegExp(escapeRe(qRaw), 'i');
        const results = [];
        for (const s of this.data.renditions) {
            for (let si = 0; si < s.stanzas.length; si++) {
                const stanza = s.stanzas[si];
                for (const line of stanza) {
                    const raw = String(line.text || '').replace(/^\t+/, '');
                    if (re.test(raw)) {
                        results.push({
                            setting: s,
                            stanzaIdx: si,
                            text: raw,
                            verse: line._verse,
                        });
                    }
                }
            }
        }

        children.push(el('p', { class: 'subtitle' },
            results.length === 0
                ? `No matches for \u201C${qRaw}\u201D.`
                : `${results.length} match${results.length === 1 ? '' : 'es'} for \u201C${qRaw}\u201D.`));

        if (results.length) {
            const list = el('ul', { class: 'search-results' });
            for (const r of results) {
                const cite = citation(r.setting) + (r.verse != null ? ', v.\u202F' + r.verse : '');
                list.appendChild(el('li', null,
                    el('a', {
                        class: 'search-result',
                        href: settingUrl(r.setting, r.stanzaIdx + 1),
                    },
                        el('span', { class: 'cite' }, cite),
                        el('span', { class: 'snippet', html: highlightMatches(r.text, qRaw) }),
                    ),
                ));
            }
            children.push(list);
        }

        children.push(el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'));
        mount(el('article', { class: 'index-page' }, ...children));
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
        mount(el('article', null,
            el('h1', null, 'Not found'),
            el('p', null, 'No page at that location.'),
            el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'),
        ));
    },
};

// ---------- URL & label helpers ----------

function settingUrl(setting, stanzaNum, params) {
    let url = `#/psalm/${setting.psalm}`;
    if (setting.part)    url += `/p${setting.part}`;
    if (setting.version) url += `/v${setting.version}`;
    if (stanzaNum != null) url += `/s${stanzaNum}`;
    const qs = params && params.toString();
    if (qs) url += '?' + qs;
    return url;
}

function settingDesignator(setting) {
    const parts = [];
    if (setting.part) {
        parts.push(setting.heading ? `Part ${setting.part}: ${setting.heading}` : `Part ${setting.part}`);
    }
    if (setting.version) {
        parts.push(`Version ${setting.version}`);
    }
    return parts.join(' \u00b7 ');
}

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

function firstLineOfSetting(s) {
    for (const stanza of s.stanzas) {
        for (const line of stanza) {
            const t = String(line.text || '').replace(/^\t+/, '').trim();
            if (t) return t;
        }
    }
    return '';
}

function stripLeadingArticle(s) {
    return s.replace(/^(?:the|a|an|o|oh)\s+/i, '');
}

// ---------- Stanza line rendering ----------

function stanzaLineNode(line, isZoom) {
    const raw = String(line.text || '');
    let stripped = raw;
    let indent = false;
    if (stripped.startsWith('\t')) {
        indent = true;
        stripped = stripped.replace(/^\t+/, '');
    }
    const cls = 'line' + (indent ? ' indent' : '');
    const span = el('span', { class: cls });
    if (line.verse) {
        span.appendChild(el('span', { class: 'verse' }, String(line.verse)));
    }
    span.appendChild(document.createTextNode(stripped));
    return span;
}

// ---------- Alt-settings nav (Other versions / parts) ----------

function altSettingsNav(current, all, params) {
    const sameKind = all.length > 1;
    if (!sameKind) return null;

    const links = [];
    for (let i = 0; i < all.length; i++) {
        const s = all[i];
        const desig = settingDesignator(s) || `Setting ${i + 1}`;
        if (i > 0) links.push(el('span', { class: 'sep' }, '\u00b7'));
        if (s === current) {
            links.push(el('span', { class: 'current' }, desig));
        } else {
            links.push(el('a', { href: settingUrl(s, null, params) }, desig));
        }
    }
    return el('nav', { class: 'alt-settings' }, ...links);
}

// ---------- Concordance helpers ----------

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

function abbreviateInContext(o) {
    // Replace occurrence [start..end) in o.text with "x.", italicised.
    const before = o.text.slice(0, o.start);
    const after  = o.text.slice(o.end);
    const firstChar = o.original.match(/[A-Za-z]/);
    const abbr = (firstChar ? firstChar[0] : o.original[0]) + '.';
    return {
        html: escapeHtml(before) + '<em>' + escapeHtml(abbr) + '</em>' + escapeHtml(after),
    };
}

// ---------- Search helpers ----------

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatches(text, q) {
    if (!q) return escapeHtml(text);
    const re = new RegExp(escapeRe(q), 'gi');
    let result = '';
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        result += escapeHtml(text.slice(last, m.index));
        result += '<mark>' + escapeHtml(m[0]) + '</mark>';
        last = m.index + m[0].length;
        if (m[0].length === 0) re.lastIndex++;
    }
    result += escapeHtml(text.slice(last));
    return result;
}

function initMobileMenu() {
    const toggle   = document.getElementById('menu-toggle');
    const menu     = document.getElementById('site-menu');
    const backdrop = document.querySelector('.menu-backdrop');
    if (!toggle || !menu || !backdrop) return;

    let lastFocus = null;

    function open() {
        if (menu.dataset.open === 'true') return;
        // Capture focus to restore on close; fall back to the toggle so the
        // user lands somewhere sensible even if the menu was opened by mouse.
        lastFocus = document.activeElement && document.activeElement !== document.body
            ? document.activeElement
            : toggle;
        menu.dataset.open = 'true';
        backdrop.dataset.open = 'true';
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Close menu');
        document.body.dataset.menuOpen = 'true';
        // Move focus to the first link inside the drawer. Defer past the
        // current click event so the browser's default focus-on-click for the
        // toggle button doesn't override us.
        const firstLink = menu.querySelector('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstLink) requestAnimationFrame(() => firstLink.focus({ preventScroll: true }));
    }

    function close() {
        if (menu.dataset.open !== 'true') return;
        menu.dataset.open = 'false';
        backdrop.dataset.open = 'false';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
        delete document.body.dataset.menuOpen;
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    }

    function toggleMenu() {
        if (menu.dataset.open === 'true') close();
        else open();
    }

    toggle.addEventListener('click', toggleMenu);
    backdrop.addEventListener('click', close);

    // Close when any link inside the drawer is followed.
    menu.addEventListener('click', e => {
        const a = e.target.closest('a');
        if (a) close();
    });

    // Close on hash change (covers programmatic navigation too).
    window.addEventListener('hashchange', () => close());

    // Esc closes the drawer; focus trap with Tab.
    document.addEventListener('keydown', e => {
        if (menu.dataset.open !== 'true') return;
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
            return;
        }
        if (e.key === 'Tab') {
            const focusables = [
                toggle,
                ...menu.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
            ].filter(el => !el.disabled && el.offsetParent !== null);
            if (!focusables.length) return;
            const first = focusables[0];
            const last  = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    // If the viewport grows past the breakpoint, force close.
    const mq = window.matchMedia('(min-width: 601px)');
    const onResize = () => { if (mq.matches) close(); };
    if (mq.addEventListener) mq.addEventListener('change', onResize);
    else mq.addListener(onResize);
}

function initSearchForm() {
    const form    = document.getElementById('search-form');
    const toggle  = document.getElementById('search-toggle');
    const input   = document.getElementById('search-input');
    const clear   = document.getElementById('search-clear');
    const suggest = document.getElementById('search-suggest');
    if (!form || !input || !suggest) return;

    function expand() {
        form.dataset.expanded = 'true';
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }
    function collapse() {
        // Keep open while typing or while suggestions are showing.
        if (input.value.length || !suggest.hidden) return;
        form.dataset.expanded = 'false';
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }

    if (toggle) {
        toggle.addEventListener('click', e => {
            e.stopPropagation();
            if (form.dataset.expanded === 'true') collapse();
            else expand();
        });
    }

    input.addEventListener('blur', () => {
        // Defer so a click on a suggestion still registers before we collapse.
        setTimeout(collapse, 150);
    });

    const MAX_SUGGEST = 8;
    let activeIdx = -1;
    let currentItems = [];

    function hideSuggest() {
        suggest.hidden = true;
        suggest.replaceChildren();
        input.setAttribute('aria-expanded', 'false');
        activeIdx = -1;
        currentItems = [];
    }

    function showSuggest(q) {
        currentItems = liveSearchResults(q, MAX_SUGGEST + 1);
        if (!currentItems.length) {
            suggest.replaceChildren(el('li', { class: 'no-match', 'aria-disabled': 'true' },
                `No matches for \u201C${q}\u201D`));
            suggest.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            activeIdx = -1;
            return;
        }
        const shown = currentItems.slice(0, MAX_SUGGEST);
        const nodes = shown.map((r, i) => {
            const cite = citation(r.setting) + (r.verse != null ? ', v.\u202F' + r.verse : '');
            return el('li', {
                role: 'option',
                id: 'suggest-' + i,
                'data-href': settingUrl(r.setting, r.stanzaIdx + 1),
            },
                el('span', { class: 'cite' }, cite),
                el('span', { class: 'snippet', html: highlightMatches(r.text, q) }),
            );
        });
        if (currentItems.length > MAX_SUGGEST) {
            nodes.push(el('li', {
                role: 'option',
                class: 'see-all',
                id: 'suggest-all',
                'data-href': '#/search?q=' + encodeURIComponent(q),
            }, `See all results for \u201C${q}\u201D \u2192`));
        }
        suggest.replaceChildren(...nodes);
        suggest.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        activeIdx = -1;
    }

    function setActive(i) {
        const items = [...suggest.querySelectorAll('li[role="option"]')];
        if (!items.length) return;
        if (i < 0) i = items.length - 1;
        if (i >= items.length) i = 0;
        items.forEach((li, j) => li.classList.toggle('active', j === i));
        activeIdx = i;
        const aid = items[i].id;
        if (aid) input.setAttribute('aria-activedescendant', aid);
    }

    function navigateTo(href) {
        hideSuggest();
        input.blur();
        if (location.hash === href) App.render();
        else location.hash = href;
    }

    input.addEventListener('input', () => {
        const q = input.value.trim();
        clear.hidden = !input.value.length;
        if (q.length < 2) { hideSuggest(); return; }
        if (!App.data) return;
        showSuggest(q);
    });

    input.addEventListener('focus', () => {
        const q = input.value.trim();
        clear.hidden = !input.value.length;
        if (q.length >= 2 && App.data) showSuggest(q);
    });

    input.addEventListener('keydown', e => {
        if (suggest.hidden) return;
        const items = [...suggest.querySelectorAll('li[role="option"]')];
        if (!items.length) return;
        if (e.key === 'ArrowDown')     { e.preventDefault(); setActive(activeIdx + 1); }
        else if (e.key === 'ArrowUp')  { e.preventDefault(); setActive(activeIdx - 1); }
        else if (e.key === 'Escape')   { e.preventDefault(); hideSuggest(); }
        else if (e.key === 'Enter' && activeIdx >= 0) {
            e.preventDefault();
            const href = items[activeIdx].getAttribute('data-href');
            if (href) navigateTo(href);
        }
    });

    suggest.addEventListener('mousedown', e => {
        // mousedown (not click) so it fires before input blur hides the panel
        const li = e.target.closest('li[role="option"]');
        if (!li) return;
        e.preventDefault();
        const href = li.getAttribute('data-href');
        if (href) navigateTo(href);
    });

    document.addEventListener('mousedown', e => {
        if (!form.contains(e.target)) hideSuggest();
    });

    form.addEventListener('submit', e => {
        e.preventDefault();
        const q = input.value.trim();
        hideSuggest();
        input.blur();
        location.hash = q ? '#/search?q=' + encodeURIComponent(q) : '#/';
    });

    clear.addEventListener('click', () => {
        input.value = '';
        clear.hidden = true;
        hideSuggest();
        input.focus();
    });
}

function liveSearchResults(q, limit) {
    if (!App.data || !q) return [];
    const re = new RegExp(escapeRe(q), 'i');
    const out = [];
    for (const s of App.data.renditions) {
        for (let si = 0; si < s.stanzas.length; si++) {
            const stanza = s.stanzas[si];
            for (const line of stanza) {
                const raw = String(line.text || '').replace(/^\t+/, '');
                if (re.test(raw)) {
                    out.push({ setting: s, stanzaIdx: si, text: raw, verse: line._verse });
                    if (out.length >= limit) return out;
                }
            }
        }
    }
    return out;
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Don't try to register on file:// or other non-secure contexts that aren't localhost.
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    const doRegister = () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    };
    if (document.readyState === 'complete') doRegister();
    else window.addEventListener('load', doRegister, { once: true });
}

function syncSearchInput(route) {
    const form  = document.getElementById('search-form');
    const input = document.getElementById('search-input');
    const clear = document.getElementById('search-clear');
    if (!input) return;
    if (route.tokens[0] === 'search') {
        const q = route.params.get('q') || '';
        if (document.activeElement !== input) input.value = q;
        if (form && q) form.dataset.expanded = 'true';
    } else if (document.activeElement !== input) {
        input.value = '';
    }
    if (clear) clear.hidden = !input.value.length;
}

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
        const data = { title: document.title, url };

        // Prefer the OS share sheet when available; fall back to clipboard.
        if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
            try {
                await navigator.share(data);
                return;
            } catch (e) {
                if (e && e.name === 'AbortError') return;
                // Other share errors fall through to clipboard.
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(url);
                flash('Link copied', 'copied');
            } catch {
                flash('Press Ctrl+C', 'failed');
            }
        } else {
            flash('Press Ctrl+C', 'failed');
        }
    });
    return btn;
}

function adjacentPsalmNav(currentPsalm, byPsalm) {
    if (!byPsalm) return el('span');
    const nums = [...byPsalm.keys()].sort((a, b) => a - b);
    const i = nums.indexOf(currentPsalm);
    const prev = i > 0 ? nums[i - 1] : null;
    const next = i >= 0 && i < nums.length - 1 ? nums[i + 1] : null;

    const nav = el('nav', { class: 'psalm-nav', 'aria-label': 'Adjacent psalms' });
    if (prev != null) {
        const prevSetting = byPsalm.get(prev)[0];
        nav.appendChild(el('a', { href: settingUrl(prevSetting) }, '\u2190 Psalm ' + prev));
    } else {
        nav.appendChild(el('span', { class: 'spacer' }));
    }
    if (next != null) {
        const nextSetting = byPsalm.get(next)[0];
        nav.appendChild(el('a', { href: settingUrl(nextSetting) }, 'Psalm ' + next + ' \u2192'));
    } else {
        nav.appendChild(el('span', { class: 'spacer' }));
    }
    return nav;
}

// ---------- Theme ----------

const THEME_KEY = 'smv.theme';

const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function applyTheme(value) {
    const root = document.documentElement;
    if (value === 'light' || value === 'dark') {
        root.setAttribute('data-theme', value);
    } else {
        root.removeAttribute('data-theme');
    }
}

function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function initTheme() {
    // Default: follow the system until the user explicitly chooses.
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved || 'system');

    const hosts = [
        document.getElementById('theme-picker'),
        document.getElementById('theme-picker-mobile'),
    ].filter(Boolean);
    if (!hosts.length) return;

    // Source: 'system' until the user picks; then 'user'.
    // Active: 'light' | 'dark' — whichever theme is currently rendered.
    let source = saved ? 'user' : 'system';
    let active = saved || (systemPrefersDark() ? 'dark' : 'light');

    const widgets = hosts.map(buildWidget);

    function buildWidget(host) {
        host.innerHTML = '';
        const sun = el('span', { class: 'theme-picker-icon sun', html: SUN_SVG, 'aria-hidden': 'true' });
        const moon = el('span', { class: 'theme-picker-icon moon', html: MOON_SVG, 'aria-hidden': 'true' });
        const sw = el('button', {
            type: 'button',
            class: 'theme-switch',
            role: 'switch',
            'aria-checked': active === 'dark' ? 'true' : 'false',
            'aria-label': 'Toggle dark mode',
            title: 'Toggle theme',
        });
        sw.addEventListener('click', () => setActive(active === 'dark' ? 'light' : 'dark', 'user'));
        host.appendChild(sun);
        host.appendChild(sw);
        host.appendChild(moon);
        return { host, sw };
    }

    function setActive(next, src) {
        active = next;
        source = src;
        if (src === 'user') {
            localStorage.setItem(THEME_KEY, next);
            applyTheme(next);
        } else {
            // System change while no explicit choice — stay on 'system' mode.
            localStorage.removeItem(THEME_KEY);
            applyTheme('system');
        }
        sync();
    }

    function sync() {
        for (const { host, sw } of widgets) {
            host.dataset.active = active;
            host.dataset.source = source;
            sw.setAttribute('aria-checked', active === 'dark' ? 'true' : 'false');
        }
    }

    sync();

    // Follow OS theme changes while the user hasn't chosen.
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq) {
        const onChange = e => {
            if (source !== 'system') return;
            active = e.matches ? 'dark' : 'light';
            sync();
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
    }
}

// ---------- Present mode ----------

const PRESENT_TUTORIAL_KEY = 'smv.presentTutorialDismissed';
const PRESENT_FONT_KEY = 'smv.presentFontScale';
const PRESENT_HIDE_DELAY = 2500;

let presentControls = null;
let presentTopbar = null;
let presentHideTimer = null;
// Set by the setting page when a click should auto-enter present mode
// on the next stanza render. Consumed in renderStanza after mount.
let presentOnNextRender = false;

function clickStanzaLink(selector) {
    const a = document.querySelector(selector);
    if (a) a.click();
}

function applyPresentFontScale(scale) {
    document.documentElement.style.setProperty('--present-font-scale', String(scale));
}

function readPresentFontScale() {
    const v = parseFloat(localStorage.getItem(PRESENT_FONT_KEY));
    return Number.isFinite(v) && v >= 0.5 && v <= 2 ? v : 1;
}

function showPresentTopbar() {
    if (!presentTopbar) return;
    presentTopbar.classList.add('visible');
    if (presentHideTimer) clearTimeout(presentHideTimer);
    presentHideTimer = setTimeout(hidePresentTopbar, PRESENT_HIDE_DELAY);
}

function hidePresentTopbar() {
    if (!presentTopbar) return;
    // Defer while the user is actively in the slider.
    if (presentTopbar.contains(document.activeElement)) {
        presentHideTimer = setTimeout(hidePresentTopbar, PRESENT_HIDE_DELAY);
        return;
    }
    presentTopbar.classList.remove('visible');
    presentHideTimer = null;
}

function ensurePresentControls() {
    if (presentControls) return presentControls;

    const prev = el('button', {
        type: 'button',
        class: 'present-tap-zone prev',
        'aria-label': 'Previous stanza',
        onclick: e => { e.preventDefault(); clickStanzaLink('a.prev-stanza:not(.disabled)'); },
    });
    const next = el('button', {
        type: 'button',
        class: 'present-tap-zone next',
        'aria-label': 'Next stanza',
        onclick: e => { e.preventDefault(); clickStanzaLink('a.next-stanza:not(.disabled)'); },
    });

    const initialScale = readPresentFontScale();
    applyPresentFontScale(initialScale);

    const slider = el('input', {
        type: 'range',
        class: 'present-font-slider',
        min: '0.5',
        max: '2',
        step: '0.05',
        value: String(initialScale),
        'aria-label': 'Stanza font size',
        title: 'Font size',
    });
    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        applyPresentFontScale(v);
        localStorage.setItem(PRESENT_FONT_KEY, String(v));
        showPresentTopbar();
    });

    presentTopbar = el('div', { class: 'present-topbar' }, slider);
    presentTopbar.addEventListener('pointerenter', showPresentTopbar);
    presentTopbar.addEventListener('pointermove', showPresentTopbar);

    const hotZone = el('div', { class: 'present-top-hot-zone', 'aria-hidden': 'true' });
    hotZone.addEventListener('pointerenter', showPresentTopbar);
    hotZone.addEventListener('pointerdown', e => {
        // Swallow the touch so it doesn't also trigger a prev/next nav.
        e.preventDefault();
        showPresentTopbar();
    });

    presentControls = el('div', { class: 'present-controls' },
        prev, next, hotZone, presentTopbar,
    );
    return presentControls;
}

function enterPresent() {
    const start = () => {
        document.body.classList.add('presenting');
        document.body.appendChild(ensurePresentControls());
        // Reveal the top bar briefly so the controls are discoverable.
        showPresentTopbar();
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    };
    if (localStorage.getItem(PRESENT_TUTORIAL_KEY) === '1') {
        start();
    } else {
        showPresentTutorial(start);
    }
}

function exitPresent() {
    document.body.classList.remove('presenting');
    if (presentHideTimer) {
        clearTimeout(presentHideTimer);
        presentHideTimer = null;
    }
    if (presentControls && presentControls.parentNode) {
        presentControls.parentNode.removeChild(presentControls);
    }
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
}

function showPresentTutorial(onClose) {
    const backdrop = el('div', { class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true' });
    const dontShow = el('input', { type: 'checkbox', id: 'dont-show-tutorial' });
    const dismiss = () => {
        if (dontShow.checked) localStorage.setItem(PRESENT_TUTORIAL_KEY, '1');
        document.body.removeChild(backdrop);
        if (typeof onClose === 'function') onClose();
    };
    const okBtn = el('button', { type: 'button', onclick: dismiss }, 'Got it');
    const modal = el('div', { class: 'modal' },
        el('h2', null, 'Presentation mode'),
        el('p', null, 'The stanza fills the screen for projection.'),
        el('p', null,
            'Keyboard: ',
            el('kbd', null, '\u2190'), ' and ', el('kbd', null, '\u2192'),
            ' move between stanzas, ',
            el('kbd', null, 'Esc'), ' exits.'),
        el('p', null,
            'Touch: tap the left or right side of the screen to move between stanzas. ',
            'Tap the top edge to slide the font-size slider into view; it slides back out after a moment. ',
            'Use your device\u2019s usual gesture to exit fullscreen when you\u2019re done.'),
        el('div', { class: 'modal-controls' },
            el('label', { for: 'dont-show-tutorial' }, dontShow, ' Don\u2019t show this again'),
            okBtn,
        ),
    );
    backdrop.appendChild(modal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) dismiss(); });
    document.body.appendChild(backdrop);
    okBtn.focus();
}

// ---------- Playlists: icons ----------

const ICONS = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
    drag: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    present: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="1"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>',
    arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    playlists: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

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
        const data = { title: pl.name || 'Playlist', url };
        const flash = (cls) => {
            shareBtn.classList.add(cls);
            if (shareTimer) clearTimeout(shareTimer);
            shareTimer = setTimeout(() => {
                shareBtn.classList.remove('copied', 'failed');
                shareTimer = null;
            }, 1500);
        };
        if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
            try { await navigator.share(data); return; }
            catch (err) { if (err && err.name === 'AbortError') return; }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try { await navigator.clipboard.writeText(url); flash('copied'); return; }
            catch { flash('failed'); }
        } else {
            flash('failed');
        }
    });
    actions.appendChild(shareBtn);

    let confirming = false;
    let confirmTimer = null;
    const trash = el('button', {
        type: 'button',
        class: 'pl-row-btn pl-row-trash',
        title: 'Delete playlist',
        'aria-label': 'Delete playlist',
        html: ICONS.trash,
    });
    const trashLabel = el('span', { class: 'pl-row-trash-label' });
    trash.appendChild(trashLabel);
    trash.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirming) {
            confirming = true;
            trash.classList.add('confirming');
            trashLabel.textContent = 'Tap again';
            confirmTimer = setTimeout(() => {
                confirming = false;
                trash.classList.remove('confirming');
                trashLabel.textContent = '';
            }, 2000);
            return;
        }
        if (confirmTimer) clearTimeout(confirmTimer);
        deletePlaylist(pl.id);
        App.render();
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

    let deleteConfirming = false;
    let deleteTimer = null;
    const deleteBtn = el('button', {
        type: 'button',
        class: 'pl-btn pl-btn-danger',
        title: 'Delete playlist',
        'aria-label': 'Delete playlist',
        html: ICONS.trash,
    });
    deleteBtn.appendChild(el('span', { class: 'pl-btn-label' }, 'Delete'));
    deleteBtn.addEventListener('click', () => {
        if (!deleteConfirming) {
            deleteConfirming = true;
            deleteBtn.classList.add('confirming');
            const label = deleteBtn.querySelector('.pl-btn-label');
            if (label) label.textContent = 'Tap again';
            deleteTimer = setTimeout(() => {
                deleteConfirming = false;
                deleteBtn.classList.remove('confirming');
                if (label) label.textContent = 'Delete';
            }, 2000);
            return;
        }
        if (deleteTimer) clearTimeout(deleteTimer);
        // Drafts that were never saved have nothing to delete from storage.
        if (!(draft && draft.isNew)) deletePlaylist(pl.id);
        clearEditorDraft();
        location.hash = '#/playlists';
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

    let confirming = false;
    let confirmTimer = null;
    const delBtn = el('button', {
        type: 'button',
        class: 'pl-set-mini pl-set-trash',
        title: 'Remove from playlist',
        'aria-label': 'Remove setting',
        html: ICONS.trash,
    });
    delBtn.addEventListener('click', () => {
        if (!confirming) {
            confirming = true;
            delBtn.classList.add('confirming');
            confirmTimer = setTimeout(() => {
                confirming = false;
                delBtn.classList.remove('confirming');
            }, 2000);
            return;
        }
        if (confirmTimer) clearTimeout(confirmTimer);
        pl.settings.splice(idx, 1);
        App.render();
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
    const backdrop = el('div', { class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true' });
    const replace = () => {
        const updated = {
            ...existing,
            mainTitleSlide: draft.mainTitleSlide,
            perSettingTitles: draft.perSettingTitles,
            settings: draft.settings,
        };
        upsertPlaylist(updated);
        document.body.removeChild(backdrop);
        location.hash = '#/playlists/' + existing.id;
    };
    const copy = () => {
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
        document.body.removeChild(backdrop);
        location.hash = '#/playlists/' + pl.id;
    };
    const cancel = () => document.body.removeChild(backdrop);
    const modal = el('div', { class: 'modal' },
        el('h2', null, 'Playlist exists'),
        el('p', null,
            'A playlist named ', el('strong', null, '"' + (draft.name || '') + '"'),
            ' already exists in your library. What would you like to do?'),
        el('div', { class: 'pl-collision-actions' },
            el('button', { type: 'button', class: 'pl-btn pl-btn-danger', onclick: replace }, 'Replace existing'),
            el('button', { type: 'button', class: 'pl-btn pl-btn-primary', onclick: copy }, 'Import as a copy'),
            el('button', { type: 'button', class: 'pl-btn pl-btn-link', onclick: cancel }, 'Cancel'),
        ),
    );
    backdrop.appendChild(modal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) cancel(); });
    document.body.appendChild(backdrop);
}

function promptImportFromUrl() {
    const backdrop = el('div', { class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true' });
    const close = () => { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); };

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

    const tryImport = () => {
        const raw = (textarea.value || '').trim();
        if (!raw) { showErr('Paste a playlist link first.'); return; }
        try {
            const u = new URL(raw, location.href);
            const hash = u.hash || '';
            const m = hash.match(/^#\/?playlists\/shared\??(.*)$/);
            if (!m) { showErr('That doesn\u2019t look like a playlist link.'); return; }
            close();
            location.hash = '#/playlists/shared?' + m[1];
        } catch {
            showErr('Could not read that URL.');
        }
    };
    const showErr = (msg) => {
        error.textContent = msg;
        error.style.display = '';
    };

    importBtn.addEventListener('click', tryImport);
    cancelBtn.addEventListener('click', close);
    textarea.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            tryImport();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    });

    const modal = el('div', { class: 'modal pl-import-modal' },
        el('h2', null, 'Import a playlist'),
        el('p', { class: 'modal-help' },
            'Paste a playlist link below. Importing creates a copy in your library; ',
            'the original isn\u2019t affected.'),
        textarea,
        error,
        el('div', { class: 'pl-collision-actions' }, importBtn, cancelBtn),
    );
    backdrop.appendChild(modal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    document.body.appendChild(backdrop);
    // Focus the textarea so the user can paste straight away.
    setTimeout(() => textarea.focus(), 0);
}

// ---------- Boot ----------

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.boot());
} else {
    App.boot();
}
