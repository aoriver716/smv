import { el, mount } from '../dom.js';
import { ICONS } from '../icons.js';
import { App } from '../main.js';
import { firstLineOfSetting, settingDesignator } from '../psalm/labels.js';
import { stanzaLineNode } from '../views/setting.js';
import {
    parseVerseRanges, formatVerseRanges, versesSetFromRanges, setToRanges,
} from './verses.js';
import { computeVerseUnits, snapVersesToUnits } from './units.js';
import { findRendition, renditionLabel } from './renditions.js';

export function renderPickerView(pl, mode, params) {
    const editIdx = mode === 'edit' ? parseInt(params.get('i') || '0', 10) : -1;
    const existing = mode === 'edit' ? pl.settings[editIdx] : null;

    const psalmParam = params.get('psalm');
    const renditionCode = params.get('r');
    let psalmNum = null, version = null, part = null;
    if (existing) {
        psalmNum = existing.psalm;
        version = existing.version != null ? existing.version : null;
        part = existing.part != null ? existing.part : null;
    }
    if (psalmParam) psalmNum = parseInt(psalmParam, 10);
    if (renditionCode) {
        const m = renditionCode.match(/^(\d+)(?:v(\d+))?(?:p(\d+))?$/);
        if (m) {
            psalmNum = parseInt(m[1], 10);
            if (m[2]) version = parseInt(m[2], 10);
            if (m[3]) part = parseInt(m[3], 10);
        }
    }

    const baseHash = '#/playlists/' + pl.id;
    const stepBaseQS = (overrides) => {
        const u = new URLSearchParams();
        u.set('picker', mode);
        if (mode === 'edit') u.set('i', String(editIdx));
        if (overrides) {
            for (const [k, v] of Object.entries(overrides)) {
                if (v == null) continue;
                u.set(k, v);
            }
        }
        return '?' + u.toString();
    };

    if (psalmNum == null) {
        return renderPickerFindStep(pl, mode, baseHash, stepBaseQS);
    }

    if (!App.byPsalm.has(psalmNum)) {
        return mount(el('article', { class: 'pl-page' },
            el('h1', null, 'Psalm not found'),
            el('p', null, 'No psalm numbered ', String(psalmNum), '.'),
            el('a', { class: 'back-link', href: baseHash + stepBaseQS() }, '\u2190 Back'),
        ));
    }

    const sibs = App.byPsalm.get(psalmNum);

    if (sibs.length > 1 && version == null && part == null) {
        return renderPickerRenditionStep(pl, mode, psalmNum, sibs, baseHash, stepBaseQS);
    }

    const rendition = findRendition(psalmNum, version, part);
    const initialVerses = (existing && existing.verses) ? existing.verses : [];
    renderPickerVersesStep(pl, mode, editIdx, rendition, initialVerses, baseHash, stepBaseQS);
}

function renderPickerFindStep(pl, mode, baseHash, stepBaseQS) {
    document.title = 'Add setting \u2014 Scottish Metrical Psalter';

    const back = el('a', { class: 'pl-back', href: baseHash },
        el('span', { html: ICONS.arrowLeft }), el('span', null, 'Cancel'));

    const input = el('input', {
        type: 'search',
        class: 'pl-picker-search',
        placeholder: 'Psalm number or first words\u2026',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': 'Search psalms',
    });

    const resultsList = el('ul', { class: 'pl-picker-results' });

    function update() {
        const q = input.value.trim().toLowerCase();
        resultsList.replaceChildren();
        const psalms = [...App.byPsalm.keys()].sort((a, b) => a - b);
        const matches = [];
        for (const n of psalms) {
            const sibs = App.byPsalm.get(n);
            if (q && String(n) === q) {
                matches.unshift({ n, prefix: true });
                continue;
            }
            if (q && String(n).startsWith(q)) {
                matches.push({ n, prefix: true });
                continue;
            }
            if (!q) {
                matches.push({ n });
                continue;
            }
            for (const r of sibs) {
                const fl = firstLineOfSetting(r).toLowerCase();
                if (fl.includes(q)) {
                    matches.push({ n });
                    break;
                }
            }
            if (matches.length >= 50) break;
        }
        const top = matches.slice(0, 50);
        if (!top.length) {
            resultsList.appendChild(el('li', { class: 'pl-picker-empty' },
                el('em', null, 'No psalms match.')));
            return;
        }
        for (const { n } of top) {
            const sibs = App.byPsalm.get(n);
            const r = sibs[0];
            resultsList.appendChild(el('li', null,
                el('a', {
                    class: 'pl-picker-result',
                    href: baseHash + stepBaseQS({ psalm: String(n) }),
                },
                    el('span', { class: 'pl-picker-result-n' }, 'Psalm ' + n),
                    el('span', { class: 'pl-picker-result-fl' }, firstLineOfSetting(r)),
                ),
            ));
        }
    }

    input.addEventListener('input', update);

    mount(el('article', { class: 'pl-page pl-picker' },
        back,
        el('h1', null, mode === 'edit' ? 'Change setting' : 'Add setting'),
        el('p', { class: 'pl-picker-hint' }, 'Find a psalm by number or first words.'),
        input,
        resultsList,
    ));
    requestAnimationFrame(() => input.focus());
    update();
}

function renderPickerRenditionStep(pl, mode, psalmNum, sibs, baseHash, stepBaseQS) {
    document.title = `Choose rendition (Psalm ${psalmNum}) \u2014 Scottish Metrical Psalter`;

    const back = el('a', { class: 'pl-back', href: baseHash + stepBaseQS() },
        el('span', { html: ICONS.arrowLeft }), el('span', null, 'Back'));

    const cards = sibs.map(r => {
        const code = String(psalmNum)
            + (r.version != null ? 'v' + r.version : '')
            + (r.part    != null ? 'p' + r.part    : '');
        const labelBits = [renditionLabel(r) || `Setting`];
        if (r.meter) labelBits.push(r.meter);
        return el('a', {
            class: 'pl-picker-rendition',
            href: baseHash + stepBaseQS({ r: code }),
        },
            el('span', { class: 'pl-picker-rendition-label' }, labelBits.join(' \u00b7 ')),
            el('span', { class: 'pl-picker-rendition-fl' }, firstLineOfSetting(r)),
        );
    });

    mount(el('article', { class: 'pl-page pl-picker' },
        back,
        el('h1', null, `Psalm ${psalmNum}`),
        el('p', { class: 'pl-picker-hint' }, 'Choose a metrical rendition.'),
        el('div', { class: 'pl-picker-renditions' }, ...cards),
    ));
}

function renderPickerVersesStep(pl, mode, editIdx, rendition, initialVerses, baseHash, stepBaseQS) {
    document.title = `Choose verses (Psalm ${rendition.psalm}) \u2014 Scottish Metrical Psalter`;
    const units = computeVerseUnits(rendition);
    const desig = settingDesignator(rendition);
    const prefixText = desig ? `Psalm ${rendition.psalm}, ${desig}:` : `Psalm ${rendition.psalm}:`;

    let selected = versesSetFromRanges(initialVerses);
    let selectAll = !initialVerses.length;
    if (selectAll) {
        for (const u of units) {
            if (u.startVerse == null) continue;
            for (let v = u.startVerse; v <= u.endVerse; v++) selected.add(v);
        }
    }

    const back = el('a', { class: 'pl-back', href: baseHash + stepBaseQS() },
        el('span', { html: ICONS.arrowLeft }), el('span', null, 'Back'));

    const prefixSpan = el('span', { class: 'pl-picker-prefix' }, prefixText);
    const versesInput = el('input', {
        type: 'text',
        class: 'pl-picker-verses-input',
        value: initialVerses.length ? formatVerseRanges(initialVerses).replace(/\u2013/g, '-') : '',
        placeholder: 'all',
        spellcheck: 'false',
        'aria-label': 'Verse ranges',
    });
    const lockedField = el('div', { class: 'pl-picker-locked-field' }, prefixSpan, versesInput);

    const allCheckbox = el('input', {
        type: 'checkbox',
        checked: selectAll ? 'checked' : null,
    });
    const allToggle = el('label', { class: 'pl-toggle pl-picker-allwhole' },
        allCheckbox, el('span', null, 'Select whole psalm'));

    const unitsList = el('div', { class: 'pl-picker-units' });
    const summary = el('div', { class: 'pl-picker-summary' });
    const doneBtn = el('button', {
        type: 'button',
        class: 'pl-btn pl-btn-primary',
    }, el('span', { html: ICONS.check }), el('span', null, 'Done'));
    const cancelBtn = el('a', {
        class: 'pl-btn',
        href: baseHash,
    }, 'Cancel');

    function recomputeSummary() {
        const ranges = setToRanges(selected);
        const stanzaCount = countSelectedStanzas(units, selected);
        if (!ranges.length) {
            summary.textContent = 'No verses selected.';
            doneBtn.disabled = true;
            doneBtn.classList.add('disabled');
        } else if (selectAll) {
            summary.textContent = `Whole psalm \u00b7 ${stanzaCount} stanza${stanzaCount === 1 ? '' : 's'}`;
            doneBtn.disabled = false;
            doneBtn.classList.remove('disabled');
        } else {
            summary.textContent = `Verses ${formatVerseRanges(ranges)} \u00b7 ${stanzaCount} stanza${stanzaCount === 1 ? '' : 's'}`;
            doneBtn.disabled = false;
            doneBtn.classList.remove('disabled');
        }
    }

    function syncTextFromState() {
        if (selectAll) {
            versesInput.value = '';
        } else {
            const ranges = setToRanges(selected);
            versesInput.value = ranges.length ? formatVerseRanges(ranges).replace(/\u2013/g, '-') : '';
        }
    }

    function syncUnitsUI() {
        const cards = unitsList.querySelectorAll('.pl-picker-unit');
        cards.forEach(card => {
            const unitIdx = parseInt(card.getAttribute('data-unit'), 10);
            const u = units[unitIdx];
            const isOn = u.startVerse != null && selected.has(u.startVerse);
            card.classList.toggle('selected', isOn);
            const cb = card.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = isOn;
        });
    }

    function setUnitSelection(unitIdx, on) {
        const u = units[unitIdx];
        if (u.startVerse == null) return;
        if (selectAll) {
            selectAll = false;
            allCheckbox.checked = false;
        }
        if (on) {
            for (let v = u.startVerse; v <= u.endVerse; v++) selected.add(v);
        } else {
            for (let v = u.startVerse; v <= u.endVerse; v++) selected.delete(v);
        }
        syncTextFromState();
        syncUnitsUI();
        recomputeSummary();
    }

    function commitTextInput() {
        const raw = versesInput.value.trim().toLowerCase();
        if (!raw || raw === 'all') {
            selected = new Set();
            for (const u of units) {
                if (u.startVerse == null) continue;
                for (let v = u.startVerse; v <= u.endVerse; v++) selected.add(v);
            }
            selectAll = true;
            allCheckbox.checked = true;
            syncTextFromState();
            syncUnitsUI();
            recomputeSummary();
            return;
        }
        const parsed = parseVerseRanges(raw);
        const raw_set = versesSetFromRanges(parsed);
        const snapped = snapVersesToUnits(raw_set, units);
        const changed = snapped.size !== raw_set.size
            || [...snapped].some(v => !raw_set.has(v));
        selected = snapped;
        selectAll = false;
        allCheckbox.checked = false;
        syncTextFromState();
        syncUnitsUI();
        recomputeSummary();
        if (changed) {
            versesInput.classList.add('snapped');
            setTimeout(() => versesInput.classList.remove('snapped'), 700);
        }
    }

    versesInput.addEventListener('change', commitTextInput);
    versesInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commitTextInput(); }
    });

    allCheckbox.addEventListener('change', () => {
        if (allCheckbox.checked) {
            selected = new Set();
            for (const u of units) {
                if (u.startVerse == null) continue;
                for (let v = u.startVerse; v <= u.endVerse; v++) selected.add(v);
            }
            selectAll = true;
        } else {
            selected = new Set();
            selectAll = false;
        }
        syncTextFromState();
        syncUnitsUI();
        recomputeSummary();
    });

    units.forEach((u, ui) => {
        const verseLabel = u.startVerse === u.endVerse
            ? `verse ${u.startVerse}`
            : `verses ${u.startVerse}\u2013${u.endVerse}`;
        const cb = el('input', { type: 'checkbox' });
        const card = el('div', {
            class: 'pl-picker-unit',
            'data-unit': String(ui),
            tabindex: '0',
        },
            el('div', { class: 'pl-picker-unit-label' }, cb, el('span', null, verseLabel)),
        );
        u.stanzaIdxs.forEach((si, j) => {
            const stanzaNode = el('div', { class: 'pl-picker-stanza' + (j > 0 ? ' continuation' : '') });
            for (const line of rendition.stanzas[si]) {
                stanzaNode.appendChild(stanzaLineNode(line, false));
            }
            card.appendChild(stanzaNode);
        });
        card.addEventListener('click', e => {
            if (e.target.closest('a,button')) return;
            const isOn = u.startVerse != null && selected.has(u.startVerse);
            setUnitSelection(ui, !isOn);
        });
        card.addEventListener('keydown', e => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                const isOn = u.startVerse != null && selected.has(u.startVerse);
                setUnitSelection(ui, !isOn);
            }
        });
        unitsList.appendChild(card);
    });

    doneBtn.addEventListener('click', () => {
        if (doneBtn.disabled) return;
        const ranges = selectAll ? [] : setToRanges(selected);
        const newSetting = {
            psalm: rendition.psalm,
            ...(rendition.version != null ? { version: rendition.version } : {}),
            ...(rendition.part    != null ? { part:    rendition.part    } : {}),
            ...(ranges.length ? { verses: ranges } : {}),
        };
        if (mode === 'edit' && pl.settings[editIdx]) {
            pl.settings[editIdx] = newSetting;
        } else {
            pl.settings.push(newSetting);
        }
        location.hash = baseHash;
    });

    syncUnitsUI();
    recomputeSummary();

    mount(el('article', { class: 'pl-page pl-picker pl-picker-verses' },
        back,
        el('h1', null, `Psalm ${rendition.psalm}`),
        desig ? el('p', { class: 'designator' }, desig) : null,
        lockedField,
        allToggle,
        unitsList,
        el('div', { class: 'pl-picker-footer' }, summary, cancelBtn, doneBtn),
    ));
}

function countSelectedStanzas(units, selected) {
    let c = 0;
    for (const u of units) {
        if (u.startVerse != null && selected.has(u.startVerse)) c += u.stanzaIdxs.length;
    }
    return c;
}
