import { el, mount } from '../dom.js';
import { settingUrl } from '../psalm/labels.js';
import { citation } from '../main.js';

export function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

export function highlightMatches(text, q) {
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

export function renderSearchView(app, params) {
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
    for (const s of app.data.renditions) {
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
}
