import { el, mount } from '../dom.js';
import { BOOKS } from '../constants.js';
import { settingUrl } from '../psalm/labels.js';

export function renderHomeView(app) {
    document.title = 'Scottish Metrical Psalter';
    const children = [
        el('h1', null, 'The Psalter'),
        el('p', { class: 'subtitle' }, '1650 Scottish Metrical Psalter'),
    ];
    for (const book of BOOKS) {
        const links = [];
        for (let n = book.first; n <= book.last; n++) {
            if (!app.byPsalm.has(n)) continue;
            links.push(el('a', { href: settingUrl(app.byPsalm.get(n)[0]) }, String(n)));
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
}
