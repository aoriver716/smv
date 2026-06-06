// Hash-based routing + small parsing helpers shared across views.

export function parseRoute() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const [path, query] = raw.split('?');
    const tokens = path.split('/').filter(Boolean);
    const params = new URLSearchParams(query || '');
    return { tokens, params };
}

export function parseVerses(spec) {
    if (!spec) return null;
    const out = new Set();
    for (const chunk of spec.split(',')) {
        const m = chunk.match(/^(\d+)(?:-(\d+))?$/);
        if (!m) continue;
        const a = parseInt(m[1], 10);
        const b = m[2] ? parseInt(m[2], 10) : a;
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
    }
    return out.size ? out : null;
}

export function ordinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
