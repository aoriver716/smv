import { el, mount } from '../dom.js';
import { ALPHA, STOPWORDS } from '../constants.js';
import { settingUrl } from '../psalm/labels.js';
import { citation } from '../main.js';
import { renderNotFoundView } from './notFound.js';

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

export function buildConcordance(app) {
    if (app.concordanceIndex) return app.concordanceIndex;

    const wordRe = /[A-Za-z][A-Za-z'\u2019]*/g;
    const map = new Map(); // word -> [{setting, stanzaIdx, lineIdx, position, original}]

    for (const s of app.data.renditions) {
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

    app.concordanceIndex = map;
    return map;
}

export function renderConcordanceView(app, tokens) {
    const letter = (tokens[0] || '').toLowerCase();
    if (!letter) return renderConcordanceHomeView(app);
    if (!ALPHA.includes(letter)) return renderNotFoundView();
    renderConcordanceLetterView(app, letter);
}

export function renderConcordanceHomeView(app) {
    document.title = 'Concordance \u2014 Scottish Metrical Psalter';
    const map = buildConcordance(app);
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
}

export function renderConcordanceLetterView(app, letter) {
    document.title = `Concordance: ${letter.toUpperCase()} \u2014 Scottish Metrical Psalter`;
    const map = buildConcordance(app);
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
}
