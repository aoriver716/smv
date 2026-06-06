import { el, mount } from '../dom.js';

export function renderNotFoundView() {
    mount(el('article', null,
        el('h1', null, 'Not found'),
        el('p', null, 'No page at that location.'),
        el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'),
    ));
}
