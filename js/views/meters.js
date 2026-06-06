import { el, mount } from '../dom.js';
import { settingUrl, firstLineOfSetting } from '../psalm/labels.js';
import { citation } from '../../app.js';

export function renderMetersView(app) {
    document.title = 'Meters \u2014 Scottish Metrical Psalter';

    // Group settings by meter, excluding C.M.
    const byMeter = new Map();
    for (const s of app.data.renditions) {
        const m = (s.meter || '').trim();
        if (!m || m === 'C.M.') continue;
        if (!byMeter.has(m)) byMeter.set(m, []);
        byMeter.get(m).push(s);
    }

    // Sort meters: alphabetical, but put numeric meters (8787, etc.) after letter meters.
    const meters = [...byMeter.keys()].sort((a, b) => {
        const an = /^\d/.test(a), bn = /^\d/.test(b);
        if (an !== bn) return an ? 1 : -1;
        return a.localeCompare(b, undefined, { numeric: true });
    });

    const blocks = meters.map(m => {
        const items = byMeter.get(m).map(s => el('li', null,
            el('a', { href: settingUrl(s) }, citation(s)),
            el('span', { class: 'first-line' }, firstLineOfSetting(s)),
        ));
        return el('section', { class: 'meter-block' },
            el('h2', null, m),
            el('ul', null, ...items),
        );
    });

    mount(el('article', { class: 'index-page' },
        el('h1', null, 'Index of Meters'),
        el('p', { class: 'subtitle' }, 'Excluding Common Meter (C.M.), in which every psalm has at least one setting.'),
        ...blocks,
        el('a', { class: 'back-link', href: '#/' }, '\u2190 Back to contents'),
    ));
}
