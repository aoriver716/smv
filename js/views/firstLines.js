import { el, mount } from '../dom.js';
import { settingUrl, firstLineOfSetting, stripLeadingArticle } from '../psalm/labels.js';
import { citation } from '../main.js';

export function renderFirstLinesView(app) {
    document.title = 'First lines \u2014 Scottish Metrical Psalter';

    const entries = [];
    for (const s of app.data.renditions) {
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
}
