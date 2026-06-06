import { el, mount } from '../dom.js';
import { parseVerses } from '../router.js';
import { ICONS } from '../icons.js';
import { settingUrl, settingDesignator } from '../psalm/labels.js';
import { shareButton } from '../main.js';
import { enterPresent, requestPresentOnNextRender, consumePresentRequest } from '../present/mode.js';
import { renderNotFoundView } from './notFound.js';

export function stanzaLineNode(line, isZoom) {
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

export function altSettingsNav(current, all, params) {
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

export function adjacentPsalmNav(currentPsalm, byPsalm) {
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

export function renderPsalmRouteView(app, tokens, params) {
    const n = parseInt(tokens[0], 10);
    if (!n || !app.byPsalm.has(n)) return renderNotFoundView();

    let part = null, version = null, stanzaNum = null;
    for (const t of tokens.slice(1)) {
        let m;
        if ((m = t.match(/^p(\d+)$/))) part = parseInt(m[1], 10);
        else if ((m = t.match(/^v(\d+)$/))) version = parseInt(m[1], 10);
        else if ((m = t.match(/^s(\d+)$/))) stanzaNum = parseInt(m[1], 10);
    }

    const settings = app.byPsalm.get(n);
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

    if (stanzaNum != null) renderStanzaView(app, setting, stanzaNum, verseFilter, params);
    else                   renderSettingView(app, setting, verseFilter, params);
}

export function renderSettingView(app, setting, verseFilter, params) {
    document.title = `Psalm ${setting.psalm} \u2014 Scottish Metrical Psalter`;
    const settings = app.byPsalm.get(setting.psalm);

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

    const presentBtn = el('button', {
        type: 'button',
        class: 'present-btn',
        onclick: () => {
            requestPresentOnNextRender();
            const url = settingUrl(setting, 1, params);
            if (location.hash === url) app.render();
            else location.hash = url;
        },
    }, el('span', { html: ICONS.present }), el('span', { class: 'present-btn-label' }, 'Present'));
    children.push(el('div', { class: 'stanza-actions' }, presentBtn, shareButton()));

    children.push(adjacentPsalmNav(setting.psalm, app.byPsalm));

    children.push(el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'));

    mount(el('article', { class: 'setting' }, ...children));
}

export function renderStanzaView(app, setting, stanzaNum, verseFilter, params) {
    document.title = `Psalm ${setting.psalm}, stanza ${stanzaNum} \u2014 Scottish Metrical Psalter`;

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
        if (!visibleIdx.length) return renderSettingView(app, setting, verseFilter, params);
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
        type: 'button',
        class: 'present-btn',
        onclick: () => enterPresent(),
    }, el('span', { html: ICONS.present }), el('span', { class: 'present-btn-label' }, 'Present'));

    mount(el('article', { class: 'stanza-view' },
        el('p', { class: 'crumbs' },
            el('a', { href: settingUrl(setting, null, params) }, crumbLabel)),
        el('p', { class: 'stanza-num' }, `Stanza ${stanzaNum} of ${setting.stanzas.length}`),
        el('div', { class: 'stanza-body-wrap' },
            el('div', { class: 'stanza-body' }, ...lineNodes)),
        el('nav', { class: 'stanza-nav' }, prevLink, nextLink),
        el('div', { class: 'stanza-actions' }, presentBtn, shareButton()),
        back,
    ));
    // The setting-page Present button navigates here and asks us to jump
    // straight into present mode on arrival.
    if (consumePresentRequest()) enterPresent();
}
