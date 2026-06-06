export function computeVerseUnits(rendition) {
    const units = [];
    let cur = null;
    for (let i = 0; i < rendition.stanzas.length; i++) {
        const stanza = rendition.stanzas[i];
        const firstLine = stanza[0];
        const isVerseStart = firstLine && firstLine.verse != null;
        if (isVerseStart || !cur) {
            cur = {
                startVerse: firstLine && firstLine.verse != null
                    ? firstLine.verse
                    : firstVerseInStanza(stanza),
                endVerse: null,
                stanzaIdxs: [],
                startStanzaIdx: i,
            };
            units.push(cur);
        }
        // Track all verses present in this stanza.
        let maxV = cur.endVerse;
        let minV = cur.startVerse;
        for (const line of stanza) {
            const v = line._verse;
            if (v == null) continue;
            if (maxV == null || v > maxV) maxV = v;
            if (minV == null || v < minV) minV = v;
        }
        cur.endVerse = maxV != null ? maxV : cur.startVerse;
        if (cur.startVerse == null) cur.startVerse = minV;
        cur.stanzaIdxs.push(i);
    }
    return units;
}

function firstVerseInStanza(stanza) {
    for (const line of stanza) if (line._verse != null) return line._verse;
    return null;
}

export function snapVersesToUnits(verseSet, units) {
    const out = new Set();
    for (const u of units) {
        let touches = false;
        if (u.startVerse != null && u.endVerse != null) {
            for (let v = u.startVerse; v <= u.endVerse; v++) {
                if (verseSet.has(v)) { touches = true; break; }
            }
        }
        if (touches) {
            for (let v = u.startVerse; v <= u.endVerse; v++) out.add(v);
        }
    }
    return out;
}
