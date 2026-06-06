import { settingDesignator } from '../psalm/labels.js';
import { formatVerseRanges } from './verses.js';
import { App } from '../main.js';

export function findRendition(psalm, version, part) {
    const sibs = App.byPsalm && App.byPsalm.get(psalm);
    if (!sibs) return null;
    let r = sibs.find(s =>
        (version == null || s.version === version) &&
        (part == null    || s.part === part)
    );
    if (!r) r = sibs[0];
    return r;
}

export function isWholePsalm(setting) {
    return !setting.verses || !setting.verses.length;
}

export function settingHasMultipleRenditions(setting) {
    const sibs = App.byPsalm && App.byPsalm.get(setting.psalm);
    return sibs && sibs.length > 1;
}

export function renditionLabel(rendition) {
    return settingDesignator(rendition) || '';
}

export function settingSummary(setting) {
    const r = findRendition(setting.psalm, setting.version, setting.part);
    const desigBits = [];
    if (r && settingHasMultipleRenditions(setting)) {
        const label = renditionLabel(r);
        if (label) desigBits.push(label);
    }
    const verseBits = setting.verses && setting.verses.length
        ? 'verses ' + formatVerseRanges(setting.verses)
        : 'all verses';
    return { desig: desigBits.join(' \u00b7 '), verseSummary: verseBits, rendition: r };
}
