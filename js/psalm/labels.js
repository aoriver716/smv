// URL builders and label helpers that are pure functions of a setting.
// `citation()` lives in main.js because it consults App.byPsalm.

export function settingUrl(setting, stanzaNum, params) {
    let url = `#/psalm/${setting.psalm}`;
    if (setting.part)    url += `/p${setting.part}`;
    if (setting.version) url += `/v${setting.version}`;
    if (stanzaNum != null) url += `/s${stanzaNum}`;
    const qs = params && params.toString();
    if (qs) url += '?' + qs;
    return url;
}

export function settingDesignator(setting) {
    const parts = [];
    if (setting.part) {
        parts.push(setting.heading ? `Part ${setting.part}: ${setting.heading}` : `Part ${setting.part}`);
    }
    if (setting.version) {
        parts.push(`Version ${setting.version}`);
    }
    return parts.join(' \u00b7 ');
}

export function firstLineOfSetting(s) {
    for (const stanza of s.stanzas) {
        for (const line of stanza) {
            const t = String(line.text || '').replace(/^\t+/, '').trim();
            if (t) return t;
        }
    }
    return '';
}

export function stripLeadingArticle(s) {
    return s.replace(/^(?:the|a|an|o|oh)\s+/i, '');
}
