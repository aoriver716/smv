export function parseVerseRanges(spec) {
    if (!spec) return [];
    const out = [];
    for (const chunk of spec.split(',')) {
        const m = chunk.trim().match(/^(\d+)(?:\s*[-\u2013]\s*(\d+))?$/);
        if (!m) continue;
        const a = parseInt(m[1], 10);
        const b = m[2] ? parseInt(m[2], 10) : a;
        out.push([Math.min(a, b), Math.max(a, b)]);
    }
    return mergeRanges(out);
}

export function mergeRanges(ranges) {
    if (!ranges.length) return [];
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
    const out = [sorted[0].slice()];
    for (let i = 1; i < sorted.length; i++) {
        const last = out[out.length - 1];
        const [a, b] = sorted[i];
        if (a <= last[1] + 1) last[1] = Math.max(last[1], b);
        else out.push([a, b]);
    }
    return out;
}

export function formatVerseRanges(ranges) {
    // En-dash for display.
    return ranges.map(([a, b]) => a === b ? String(a) : `${a}\u2013${b}`).join(', ');
}

export function formatVerseRangesAscii(ranges) {
    // Hyphen for URL-encoded data.
    return ranges.map(([a, b]) => a === b ? String(a) : `${a}-${b}`).join(',');
}

export function versesSetFromRanges(ranges) {
    const set = new Set();
    for (const [a, b] of ranges) {
        for (let v = a; v <= b; v++) set.add(v);
    }
    return set;
}

export function setToRanges(set) {
    const sorted = [...set].sort((a, b) => a - b);
    if (!sorted.length) return [];
    const out = [];
    let start = sorted[0], prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        const v = sorted[i];
        if (v === prev + 1) { prev = v; continue; }
        out.push([start, prev]);
        start = v;
        prev = v;
    }
    out.push([start, prev]);
    return out;
}
