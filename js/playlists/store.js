const PLAYLISTS_KEY = 'smv-playlists';

export function loadPlaylists() {
    try {
        const raw = localStorage.getItem(PLAYLISTS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export function savePlaylists(list) {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(list));
}

export function getPlaylist(id) {
    return loadPlaylists().find(p => p.id === id) || null;
}

export function upsertPlaylist(pl) {
    pl.updatedAt = new Date().toISOString();
    const list = loadPlaylists();
    const i = list.findIndex(p => p.id === pl.id);
    if (i >= 0) list[i] = pl;
    else list.push(pl);
    savePlaylists(list);
}

export function deletePlaylist(id) {
    savePlaylists(loadPlaylists().filter(p => p.id !== id));
}

function newPlaylistId() {
    // ~6 base36 chars of randomness, prefixed for human readability.
    return 'p_' + Math.random().toString(36).slice(2, 8);
}
export { newPlaylistId };

export function createBlankPlaylist() {
    const now = new Date().toISOString();
    return {
        id: newPlaylistId(),
        name: 'New playlist',
        createdAt: now,
        updatedAt: now,
        mainTitleSlide: true,
        perSettingTitles: true,
        settings: [],
    };
}
