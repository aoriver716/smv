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
        for (const s of this.data.settings) {
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
        // Present mode only applies to stanza views; leave it if so, clear otherwise.
        const inStanza = route.tokens[0] === 'psalm'
            && route.tokens.some(t => /^s\d+$/.test(t));
        if (!inStanza && document.body.classList.contains('presenting')) {
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
        if (route.tokens[0] !== 'psalm') return;
        const hasStanza = route.tokens.some(t => /^s\d+$/.test(t));
        if (!hasStanza) return;

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

        children.push(copyLinkButton());

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
            class: 'present-btn',
            type: 'button',
            onclick: () => enterPresent(),
        }, 'Present \u26F6');

        mount(el('article', { class: 'stanza-view' },
            el('p', { class: 'crumbs' },
                el('a', { href: settingUrl(setting, null, params) }, crumbLabel)),
            el('p', { class: 'stanza-num' }, `Stanza ${stanzaNum} of ${setting.stanzas.length}`),
            el('div', { class: 'stanza-body-wrap' },
                el('div', { class: 'stanza-body' }, ...lineNodes)),
            el('nav', { class: 'stanza-nav' }, prevLink, nextLink),
            el('div', { class: 'stanza-actions' }, presentBtn, copyLinkButton()),
            back,
        ));
        // Re-applying the same hash (e.g. navigating to the same stanza on
        // re-render) preserves present mode; nothing else to do here.
    },

    // ---------- Indexes ----------

    renderMeters() {
        document.title = 'Meters — Scottish Metrical Psalter';

        // Group settings by meter, excluding C.M.
        const byMeter = new Map();
        for (const s of this.data.settings) {
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
        for (const s of this.data.settings) {
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

        for (const s of this.data.settings) {
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
        for (const s of this.data.settings) {
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
        lastFocus = document.activeElement;
        menu.dataset.open = 'true';
        backdrop.hidden = false;
        // Force layout so the transition runs.
        // eslint-disable-next-line no-unused-expressions
        backdrop.offsetWidth;
        backdrop.dataset.open = 'true';
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Close menu');
        document.body.dataset.menuOpen = 'true';
        // Move focus to the first link inside the drawer.
        const firstLink = menu.querySelector('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstLink) firstLink.focus({ preventScroll: true });
    }

    function close() {
        if (menu.dataset.open !== 'true') return;
        menu.dataset.open = 'false';
        backdrop.dataset.open = 'false';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
        delete document.body.dataset.menuOpen;
        // Hide backdrop after the fade-out completes.
        const onEnd = () => {
            if (menu.dataset.open !== 'true') backdrop.hidden = true;
            backdrop.removeEventListener('transitionend', onEnd);
        };
        backdrop.addEventListener('transitionend', onEnd);
        // Fallback in case transitionend doesn't fire (reduced motion).
        setTimeout(() => { if (menu.dataset.open !== 'true') backdrop.hidden = true; }, 300);
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
    const input   = document.getElementById('search-input');
    const clear   = document.getElementById('search-clear');
    const suggest = document.getElementById('search-suggest');
    if (!form || !input || !suggest) return;

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
    for (const s of App.data.settings) {
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
    const input = document.getElementById('search-input');
    const clear = document.getElementById('search-clear');
    if (!input) return;
    if (route.tokens[0] === 'search') {
        const q = route.params.get('q') || '';
        if (document.activeElement !== input) input.value = q;
    } else if (document.activeElement !== input) {
        input.value = '';
    }
    if (clear) clear.hidden = !input.value.length;
}

// ---------- Copy link & psalm-nav helpers ----------

function copyLinkButton() {
    const btn = el('button', {
        type: 'button',
        class: 'copy-link-btn',
        title: 'Copy a link to this page',
    }, 'Copy link');
    btn.addEventListener('click', () => {
        const url = location.href;
        const restore = () => {
            btn.textContent = 'Copy link';
            btn.classList.remove('copied');
        };
        const ok = () => {
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(restore, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(ok).catch(() => {
                btn.textContent = 'Press Ctrl+C';
                setTimeout(restore, 2000);
            });
        } else {
            btn.textContent = 'Press Ctrl+C';
            setTimeout(restore, 2000);
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

const ICONS = {
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    light:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    dark:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
};

const THEME_OPTIONS = [
    { value: 'system', label: 'System' },
    { value: 'light',  label: 'Light'  },
    { value: 'dark',   label: 'Dark'   },
];

function applyTheme(value) {
    const root = document.documentElement;
    if (value === 'light' || value === 'dark') {
        root.setAttribute('data-theme', value);
    } else {
        root.removeAttribute('data-theme');
    }
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'system';
    applyTheme(saved);
    const host = document.getElementById('theme-picker');
    if (!host) return;

    host.innerHTML = '';
    const label = el('span', { class: 'theme-picker-label' }, 'Theme:');
    const toggle = el('button', {
        type: 'button',
        class: 'theme-picker-toggle',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
        'aria-label': 'Theme',
        title: 'Theme',
        html: ICONS[saved] || ICONS.system,
    });
    const menu = el('ul', {
        class: 'theme-picker-menu',
        role: 'listbox',
        hidden: 'hidden',
    });

    let current = saved;

    const setCurrent = (value) => {
        current = value;
        if (value === 'system') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, value);
        applyTheme(value);
        toggle.innerHTML = ICONS[value] || ICONS.system;
        menu.querySelectorAll('.theme-picker-option').forEach(btn => {
            btn.setAttribute('aria-selected', btn.dataset.value === value ? 'true' : 'false');
        });
    };

    const close = () => {
        host.removeAttribute('data-open');
        toggle.setAttribute('aria-expanded', 'false');
        menu.hidden = true;
    };
    const open = () => {
        host.setAttribute('data-open', 'true');
        toggle.setAttribute('aria-expanded', 'true');
        menu.hidden = false;
    };

    for (const opt of THEME_OPTIONS) {
        const btn = el('button', {
            type: 'button',
            class: 'theme-picker-option',
            role: 'option',
            'data-value': opt.value,
            'aria-selected': opt.value === current ? 'true' : 'false',
            html: ICONS[opt.value] + '<span>' + opt.label + '</span>',
            onclick: () => { setCurrent(opt.value); close(); },
        });
        menu.appendChild(el('li', null, btn));
    }

    toggle.addEventListener('click', e => {
        e.stopPropagation();
        if (menu.hidden) open(); else close();
    });
    document.addEventListener('click', e => {
        if (!host.contains(e.target)) close();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !menu.hidden) {
            e.preventDefault();
            close();
            toggle.focus();
        }
    });

    host.appendChild(label);
    host.appendChild(toggle);
    host.appendChild(menu);
}

// ---------- Present mode ----------

const PRESENT_TUTORIAL_KEY = 'smv.presentTutorialDismissed';

function enterPresent() {
    const start = () => {
        document.body.classList.add('presenting');
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
            el('kbd', null, '\u2190'), ' and ', el('kbd', null, '\u2192'),
            ' move between stanzas. ',
            el('kbd', null, 'Esc'), ' exits.'),
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

// ---------- Boot ----------

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.boot());
} else {
    App.boot();
}
