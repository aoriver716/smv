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
// that they swamp meaningful entries. Includes modern function words
// and their archaic equivalents (thee/thou/hath/etc.).
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
    // Personal pronouns (modern)
    'i', 'me', 'my', 'mine',
    'we', 'us', 'our', 'ours',
    'you', 'your', 'yours',
    'he', 'him', 'his',
    'she', 'her', 'hers',
    'it', 'its',
    'they', 'them', 'their', 'theirs',
    // Personal pronouns (archaic)
    'thee', 'thou', 'thy', 'thine', 'ye',
    // Demonstratives / determiners
    'that', 'this', 'these', 'those',
    // Relative / interrogative
    'which', 'who', 'whom', 'whose', 'what',
    'when', 'where', 'why', 'how',
    // Subordinating conjunctions / adverbs
    'if', 'then', 'than', 'because', 'though', 'although',
    'while', 'until', 'since', 'whether',
    // Quantifiers / common adverbs
    'not', 'no', 'all', 'any', 'some', 'both', 'such', 'same', 'other',
    'more', 'most', 'less', 'much', 'many',
    'very', 'just', 'only', 'also', 'too', 'ever', 'never',
    'there', 'here', 'now',
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
        try {
            const head = route.tokens[0];
            if (!head)                    return this.renderHome();
            if (head === 'psalm')         return this.renderPsalmRoute(route.tokens.slice(1), route.params);
            if (head === 'meters')        return this.renderMeters();
            if (head === 'first-lines')   return this.renderFirstLines();
            if (head === 'concordance')   return this.renderConcordance(route.tokens.slice(1));
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

        mount(el('article', { class: 'stanza-view' },
            el('p', { class: 'crumbs' },
                el('a', { href: settingUrl(setting, null, params) }, crumbLabel)),
            el('p', { class: 'stanza-num' }, `Stanza ${stanzaNum} of ${setting.stanzas.length}`),
            el('div', null, el('div', { class: 'stanza-body' }, ...lineNodes)),
            el('nav', { class: 'stanza-nav' }, prevLink, nextLink),
            back,
        ));
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

// ---------- Boot ----------

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.boot());
} else {
    App.boot();
}
