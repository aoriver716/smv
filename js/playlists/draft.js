// The editor and picker mutate an in-memory clone of a playlist. Changes are
// only written to storage when the user clicks "Save and close". "Cancel"
// (or navigating away to anywhere outside the editor / picker) discards the
// draft. New playlists are created as drafts only — they don't land in
// storage until Save.

let editorDraft = null; // { id, working, isNew }

function cloneForDraft(pl) {
    // structuredClone is fine in all current browsers we care about, but a
    // JSON round-trip is portable and the playlist shape is JSON-safe.
    return JSON.parse(JSON.stringify(pl));
}

export function setEditorDraft(pl, { isNew = false } = {}) {
    editorDraft = { id: pl.id, working: cloneForDraft(pl), isNew };
    return editorDraft.working;
}

export function clearEditorDraft() {
    editorDraft = null;
}

export function getEditorDraft(id) {
    if (editorDraft && editorDraft.id === id) return editorDraft;
    return null;
}
