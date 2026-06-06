import { el, mount } from '../dom.js';
import { stanzaLineNode } from '../views/setting.js';
import { renderNotFoundView } from '../views/notFound.js';
import { enterPresent } from '../present/mode.js';
import { getPlaylist } from './store.js';
import {
    findRendition,
    settingHasMultipleRenditions,
    renditionLabel,
} from './renditions.js';
import { formatVerseRanges, versesSetFromRanges } from './verses.js';

export function renderPlaylistPresentView(id, params) {
    const pl = getPlaylist(id);
    if (!pl) return renderNotFoundView();
    const queue = buildPlaylistQueue(pl);
    if (!queue.length) {
        mount(el('article', { class: 'pl-page' },
            el('h1', null, 'Empty playlist'),
            el('p', null, 'Add at least one setting before presenting.'),
            el('a', { class: 'back-link', href: '#/playlists/' + id }, '\u2190 Back to editor'),
        ));
        return;
    }
    const k = Math.max(0, Math.min(queue.length - 1, parseInt(params.get('k') || '0', 10) || 0));
    renderPlaylistSlide(pl, queue, k);
}

export function buildPlaylistQueue(pl) {
    const queue = [];
    if (pl.mainTitleSlide) queue.push({ kind: 'mainTitle' });
    pl.settings.forEach((s, i) => {
        if (pl.perSettingTitles) queue.push({ kind: 'settingTitle', settingIdx: i });
        const rendition = findRendition(s.psalm, s.version, s.part);
        if (!rendition) return;
        const verseSet = s.verses && s.verses.length ? versesSetFromRanges(s.verses) : null;
        for (let si = 0; si < rendition.stanzas.length; si++) {
            const stanza = rendition.stanzas[si];
            const visible = verseSet
                ? stanza.some(line => line._verse != null && verseSet.has(line._verse))
                : stanza.length > 0;
            if (visible) {
                queue.push({ kind: 'stanza', settingIdx: i, stanzaIdx: si, rendition, verseSet });
            }
        }
    });
    return queue;
}

export function renderPlaylistSlide(pl, queue, k) {
    const slide = queue[k];
    const prevK = k > 0 ? k - 1 : null;
    const nextK = k < queue.length - 1 ? k + 1 : null;
    const baseHref = '#/playlists/' + pl.id + '/present';
    const slideUrl = (j) => j == null ? '#' : (baseHref + '?k=' + j);

    // Re-use the existing stanza-nav link classes so the present-mode tap
    // zones and arrow-key handler work without modification.
    const prevLink = el('a', {
        class: 'prev-stanza' + (prevK == null ? ' disabled' : ''),
        href: slideUrl(prevK),
        'aria-disabled': prevK == null ? 'true' : null,
    }, '\u2190 Previous');
    const nextLink = el('a', {
        class: 'next-stanza' + (nextK == null ? ' disabled' : ''),
        href: slideUrl(nextK),
        'aria-disabled': nextK == null ? 'true' : null,
    }, 'Next \u2192');
    const back = el('a', {
        class: 'back-to-setting back-link',
        href: '#/playlists/' + pl.id,
    }, '\u2191 Back to playlist');

    let body;
    if (slide.kind === 'mainTitle') {
        body = renderMainTitleSlideBody(pl);
        document.title = (pl.name || 'Playlist') + ' \u2014 Scottish Metrical Psalter';
    } else if (slide.kind === 'settingTitle') {
        const s = pl.settings[slide.settingIdx];
        const r = findRendition(s.psalm, s.version, s.part);
        body = renderSettingTitleSlideBody(s, r);
        document.title = `Psalm ${s.psalm} \u2014 ${pl.name || 'Playlist'}`;
    } else {
        const s = pl.settings[slide.settingIdx];
        const r = slide.rendition;
        const stanza = r.stanzas[slide.stanzaIdx];
        const visibleLines = slide.verseSet
            ? stanza.filter(line => line._verse != null && slide.verseSet.has(line._verse))
            : stanza;
        const lineNodes = visibleLines.map(line => stanzaLineNode(line, true));
        body = el('div', { class: 'stanza-body-wrap' },
            el('div', { class: 'stanza-body' }, ...lineNodes));
        document.title = `Psalm ${s.psalm} \u2014 ${pl.name || 'Playlist'}`;
    }

    mount(el('article', { class: 'pl-present-slide pl-present-' + slide.kind },
        body,
        el('nav', { class: 'stanza-nav' }, prevLink, nextLink),
        back,
    ));

    if (!document.body.classList.contains('presenting')) {
        enterPresent();
    }
}

function renderMainTitleSlideBody(pl) {
    const items = pl.settings.map((s, i) => {
        const r = findRendition(s.psalm, s.version, s.part);
        const bits = [el('span', { class: 'pl-title-row-n' }, String(i + 1) + '.')];
        const labelBits = [`Psalm ${s.psalm}`];
        if (r && settingHasMultipleRenditions(s)) {
            const lbl = renditionLabel(r);
            if (lbl) labelBits.push(`(${lbl})`);
        }
        bits.push(el('span', { class: 'pl-title-row-psalm' }, labelBits.join(' ')));
        if (s.verses && s.verses.length) {
            bits.push(el('span', { class: 'pl-title-row-verses' },
                ' \u00b7 verses ' + formatVerseRanges(s.verses)));
        }
        return el('li', { class: 'pl-title-row' }, ...bits);
    });
    return el('div', { class: 'pl-title-main' },
        el('h1', { class: 'pl-title-main-name' }, pl.name || 'Playlist'),
        el('ol', { class: 'pl-title-main-list' }, ...items),
    );
}

function renderSettingTitleSlideBody(s, rendition) {
    const children = [];
    children.push(el('div', { class: 'pl-title-set-psalm' }, `Psalm ${s.psalm}`));
    if (rendition && settingHasMultipleRenditions(s)) {
        const lbl = renditionLabel(rendition);
        if (lbl) children.push(el('div', { class: 'pl-title-set-rendition' }, lbl));
    }
    if (s.verses && s.verses.length) {
        children.push(el('div', { class: 'pl-title-set-verses' },
            'Verses ' + formatVerseRanges(s.verses)));
    }
    if (rendition && rendition.inscription) {
        children.push(el('div', { class: 'pl-title-set-inscription' }, rendition.inscription));
    }
    if (rendition && rendition.meter) {
        children.push(el('div', { class: 'pl-title-set-meter' }, rendition.meter));
    }
    return el('div', { class: 'pl-title-setting' }, ...children);
}
