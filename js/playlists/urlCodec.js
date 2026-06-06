import { parseVerseRanges, formatVerseRangesAscii } from './verses.js';

// Encode setting -> "{psalm}[v{V}][p{P}][:{ranges}]"
export function encodeSettingForUrl(s) {
    let out = String(s.psalm);
    if (s.version != null) out += 'v' + s.version;
    if (s.part != null)    out += 'p' + s.part;
    if (s.verses && s.verses.length) {
        out += ':' + formatVerseRangesAscii(s.verses);
    }
    return out;
}

export function decodeSettingFromUrl(token) {
    const m = token.match(/^(\d+)(?:v(\d+))?(?:p(\d+))?(?::([\d,\-]+))?$/);
    if (!m) return null;
    const setting = { psalm: parseInt(m[1], 10) };
    if (m[2]) setting.version = parseInt(m[2], 10);
    if (m[3]) setting.part = parseInt(m[3], 10);
    if (m[4]) {
        const ranges = parseVerseRanges(m[4]);
        if (ranges && ranges.length) setting.verses = ranges;
    }
    return setting;
}

export function encodePlaylistToParams(pl) {
    const params = new URLSearchParams();
    if (pl.name) params.set('n', pl.name);
    const tFlags =
        (pl.mainTitleSlide ? '1' : '0') +
        (pl.perSettingTitles ? '1' : '0');
    if (tFlags !== '11') params.set('t', tFlags);
    if (pl.settings.length) {
        params.set('d', pl.settings.map(encodeSettingForUrl).join(';'));
    }
    return params;
}

export function decodePlaylistFromParams(params) {
    const d = params.get('d');
    if (!d) return null;
    const settings = d.split(';').map(decodeSettingFromUrl).filter(Boolean);
    if (!settings.length) return null;
    const t = params.get('t') || '11';
    return {
        // No id: it's a draft until imported.
        name: params.get('n') || 'Shared playlist',
        mainTitleSlide: t[0] !== '0',
        perSettingTitles: t[1] !== '0',
        settings,
    };
}

export function shareUrlForPlaylist(pl) {
    const params = encodePlaylistToParams(pl);
    return location.origin + location.pathname + '#/playlists/shared?' + params.toString();
}
