import { el } from '../dom.js';
import { PRESENT_TUTORIAL_KEY, showPresentTutorial } from './tutorial.js';

const PRESENT_FONT_KEY = 'smv.presentFontScale';
const PRESENT_HIDE_DELAY = 2500;

let presentControls = null;
let presentTopbar = null;
let presentHideTimer = null;
// Set by the setting page when a click should auto-enter present mode
// on the next stanza render. Consumed in renderStanza after mount.
let presentOnNextRender = false;

export function requestPresentOnNextRender() { presentOnNextRender = true; }
export function consumePresentRequest() {
    const v = presentOnNextRender;
    presentOnNextRender = false;
    return v;
}

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

export function enterPresent() {
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

export function exitPresent() {
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
