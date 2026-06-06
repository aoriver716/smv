export async function shareUrl({ url, title }) {
    const data = { title, url };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        try {
            await navigator.share(data);
            return 'shared';
        } catch (e) {
            if (e && e.name === 'AbortError') return 'aborted';
            // Other share errors fall through to clipboard.
        }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(url);
            return 'copied';
        } catch {
            return 'failed';
        }
    }
    return 'failed';
}
