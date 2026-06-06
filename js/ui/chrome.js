// Header chrome: mobile drawer, search box with live suggestions, and the
// helper that keeps the header input synced with route changes.

import { el } from '../dom.js';
import { settingUrl } from '../psalm/labels.js';
import { App, citation } from '../main.js';
import { escapeRe, highlightMatches } from '../views/search.js';

export function initMobileMenu() {
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

export function initSearchForm() {
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

export function syncSearchInput(route) {
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
