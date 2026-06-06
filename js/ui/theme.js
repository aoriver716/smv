// Theme switching: follows system by default, persists explicit user choice.

import { el } from '../dom.js';
import { SUN_SVG, MOON_SVG } from '../icons.js';

const THEME_KEY = 'smv.theme';

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

export function initTheme() {
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
