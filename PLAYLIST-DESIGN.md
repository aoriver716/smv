# Playlist editor — design

Working design for a new feature that lets a worship leader assemble an ordered
sequence of psalm selections, optionally interleaved with title slides, and
present the whole thing end-to-end through the existing presentation mode.

> Status: design only. No code yet. Decisions and remaining questions are
> in §11.

> **UI direction.** Every surface described below should follow the look and
> feel the app already has: clean, crisp, mobile-first, and using icons in
> place of words wherever a recognisable icon exists (trash, drag handle,
> share, present, back, etc.). Don't introduce a new visual language —
> extend the existing one (typography, spacing scale, accent colour, the
> hover/focus and tap-target conventions already in `style.css`). The ASCII
> mockups in §7 sketch *layout and information density*, not pixel-exact
> visuals.

---

## 1. Goal

Today, the app presents one stanza at a time within one psalm setting. A
worship leader who wants to present three psalms (or selected verses from
three psalms) in order has to memorise three URLs and navigate between them by
hand mid-service.

The playlist feature replaces that with a saved, sharable, projectable order
of service made of psalm material.

## 2. Vocabulary

**User-facing term: setting.** A *setting* is one performable selection — it
may be a whole psalm, a specific metrical version or part of a psalm, or any
portion of those narrowed to a verse range. "Sing the second setting" in a
playlist means "sing this psalm, with this verse selection." The word reads
naturally in worship-leader contexts and covers both the whole-psalm and
portion-of-psalm cases without qualification.

- **Setting** *(new, user-facing)*: one entry in a playlist. Targets one
  psalm, optionally narrows to a specific metrical version / part of that
  psalm, optionally narrows to a verse range, and optionally has a title
  slide.
- **Playlist** *(new)*: an ordered list of settings, with a name and an id.
  Optionally fronted by a main title slide for the whole playlist.

### Renaming the JSON-level "setting"

The `settings` array in `psalter.json` currently means "the metrical
renditions of a psalm available in this edition" — distinct from a
user-assembled playlist entry. To free up the word, that array should be
renamed. Recommended: **`renditions`** (each entry is a metrical rendition
of a psalm; some psalms have multiple renditions or are split across
several). This is a one-time rename touching `psalter.json`,
`psalter.schema.json`, and the few `app.js` references; the URL grammar
(`#/psalm/{n}/p{P}`) does not change. Captured as a prerequisite task in
§13.

## 3. User stories

1. **Worship leader, Saturday night.** I assemble Sunday's three psalms into
   one playlist so I can present them in order without fumbling URLs.
2. **Family worship.** I select verses 1–7 of Psalm 84 followed by all of
   Psalm 121, and walk through them with my children one stanza at a time.
3. **Sharing with elders.** I send a single playlist link in a group chat so
   the elders can preview it on their own devices before the service.
4. **Title slides for paper-psalter users.** Between psalms I show a title
   slide announcing "Psalm 84 · verses 1–7" before launching into the
   stanzas, so congregants on paper psalters can find their place.
5. **Updating a shared playlist.** I sent Sunday's playlist to the elders on
   Friday and changed verse selections on Saturday. I resend the link; when
   they open it, the app sees the same playlist name already exists locally
   and asks them whether to **replace** their copy or **import as a copy**.

## 4. Data model

A playlist:

```json
{
  "id": "p_2qzx8c",
  "name": "Lord's Day morning · 2026-06-07",
  "createdAt": "2026-06-05T22:00:00Z",
  "updatedAt": "2026-06-05T22:30:00Z",
  "mainTitleSlide": true,
  "perSettingTitles": true,
  "settings": [
    { "psalm": 23,                  "verses": null                 },
    { "psalm": 6,   "version": 1,   "verses": null                 },
    { "psalm": 119, "part": 3,      "verses": [[17, 20], [22, 24]] }
  ]
}
```

A playlist's top-level fields:

- `id` — short opaque token, used in URLs and as the localStorage key.
- `name` — free text. May collide with other playlists (see §5 import flow).
- `mainTitleSlide` *(boolean, default `true`)* — show a single playlist-wide
  title slide as the first slide of present mode (see §8.1).
- `perSettingTitles` *(boolean, default `true`)* — show a title slide before
  every setting in the playlist (see §8.2). All-on or all-off; no
  per-setting override.
- `settings` — ordered list of settings.

Each setting:

- `psalm` *(required)* — psalm number.
- `version`, `part` *(optional)* — mirror the keys already on the
  `psalter.json` renditions; when absent, the canonical rendition for that
  psalm is used.
- `verses` — array of inclusive ranges, e.g. `[[1, 6], [9, 9]]` for
  "verses 1–6, 9". `null` means "all verses".

### Why verses, not stanza indices?

- Verses are the unit people communicate in ("we're singing verses 1 to 4").
  Stanza indices are an implementation detail of the meter.
- The existing `?verses=` URL filter is already verse-based. The same
  `parseVerses` / verse-set machinery in `app.js` can drive playlist
  presentation with no change.
- Verse references survive any future re-stanzaisation of the data; stored
  stanza indices would not.

The picker UI still uses **stanzas as the clickable unit** (because that's
what users see), but on save the selected stanzas are resolved to their
covering verse range. The picker shows the resolved range live so there are
no surprises. See §4.1 for the rule that prevents partial-verse selections.

### 4.1 No-partial-verse rule

In the data, some stanzas straddle a verse boundary: the first line
finishes the previous verse and the next line starts a new one. Congregations
generally don't begin or end singing on those joining stanzas. The picker
enforces this:

- A stanza is a **verse-start stanza** if its first line begins a new verse
  (in the data, the first line has a `verse` marker).
- Stanzas that are *not* verse-start stanzas ("continuation stanzas") are
  visually grouped with their preceding verse-start stanza into one
  **verse unit**, and the whole unit toggles together — there is no
  independent toggle on a continuation stanza.
- Selection is therefore guaranteed to start on a verse boundary and to
  extend through any continuation stanzas that follow it. The selection's
  end is similarly snapped: if the next stanza after a selected unit is a
  continuation, it is included; the selection only ends just before the
  next verse-start stanza.

The result: every saved selection is a contiguous range (or union of
ranges) of *whole* verses, which is exactly what congregants expect and
what the existing `?verses=` filter already speaks.

## 5. Storage and sharing

Two layers, intentionally redundant:

1. **Local-first.** Playlists live in `localStorage` under one key
   (`smv-playlists`) as a JSON array. No backend, no accounts, works offline,
   matches the no-build philosophy.
2. **URL-encoded.** Any playlist can also be expressed as a self-contained
   `#/playlists/shared?d=…` URL. Opening such a URL shows a preview screen
   that offers "Save to my playlists". This is how playlists are shared.

### URL encoding

A compact, URL-safe encoding that mirrors the existing route grammar:

- Settings separated by `;`
- One setting: `{psalm}[v{V}][p{P}][:{verseRanges}]`
- Title-slide flags carried as a single two-character `t=` param
  (e.g. `t=11` = main on, per-setting on; `t=10` = main on, per-setting
  off; `t=01`, `t=00`)
- Playlist name carried as `n=…`

Example:

```
#/playlists/shared?n=Lord%27s%20Day%20AM&t=11&d=23;6v1;119p3:17-20,22-24
```

A 10-setting playlist fits in a tweet. Base64-encoded JSON would also work
but isn't readable for debugging and is bulkier.

### Identity and import flow

- Local ids are client-generated (short base36 random, e.g. `p_2qzx8c`).
- The shared URL carries the playlist's `name` (and contents) but not the
  local id; on import the app generates a fresh local id.
- **Name-collision handling.** When the user clicks **Save to my playlists**
  on a shared playlist whose `name` already exists in their local library,
  show a small dialog:

  > A playlist named **"Lord's Day morning · 2026-06-07"** already exists in
  > your library. What would you like to do?
  >
  > [Replace existing]  [Import as a copy]  [Cancel]

  - **Replace existing** — overwrites the contents of the local playlist
    *in place* (keeps the existing local id, so any bookmarks to its editor
    URL still resolve). This is the path for "the worship leader updated
    the playlist and resent the link."
  - **Import as a copy** — appends `(2)` to the name (or `(3)`, `(4)`, …
    if `(2)` is also taken — Windows-style auto-numbering), assigns a fresh
    id, saves alongside the original.
  - **Cancel** — no change.
- When no name collision exists, the save is silent: fresh id, name as-is.

## 6. URL scheme additions

| Route | View |
|-------|------|
| `#/playlists` | Index of local playlists. |
| `#/playlists/{id}` | Editor for one local playlist. |
| `#/playlists/{id}/present` | Present the playlist from setting 1. |
| `#/playlists/{id}/present?at={i}` | Present starting at setting `i` (0-indexed), optionally `&slide={k}` for resuming. |
| `#/playlists/shared?d=…&n=…` | Preview of a shared playlist; offers to save locally. |

Existing routes (`#/psalm/{n}/…`, `#/meters`, etc.) are untouched.

Header nav gets a new **Playlists** entry, between **Concordance** and the
search box. The mobile drawer gets the same link.

## 7. Page surfaces

### 7.1 Playlists index — `#/playlists`

- One row per local playlist: name · setting count · last-edited (relative).
- Click to open the editor; trash icon to delete (confirm).
- **New playlist** button (top right).
- **Import from URL** link (small, secondary) — opens a paste-a-link prompt.
- Empty state: a short blurb explaining what playlists are for, with a
  prominent **New playlist** call to action.

### 7.2 Playlist editor — `#/playlists/{id}`

```
‹ Playlists

[Lord's Day morning · 2026-06-07          ]    (editable)

[Present]   [Share]   [Delete]

Title slides:   [☑ Main title]   [☑ Per-setting titles]

┌─────────────────────────────────────────────────────────────┐
│ ⋮⋮  1. Psalm 23                       all verses    [/] [x] │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ ⋮⋮  2. Psalm 6 (version 1)            all verses    [/] [x] │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ ⋮⋮  3. Psalm 119, part 3 (Gimel)   verses 17–20,    [/] [x] │
│                                     22–24                   │
└─────────────────────────────────────────────────────────────┘

                      [ + Add setting ]
```

`[/]` = edit-selection icon, `[x]` = delete icon, `⋮⋮` = drag handle.
In the real UI these are icons from the existing icon set, not text. The
toolbar buttons (Present, Share, Delete) are also icon-led on narrow
viewports, with labels collapsing to icons + tooltip below a breakpoint.

- Cards collapse to **one row per setting** in the common case, with a
  second line only when the verse summary wraps. That density matters on
  mobile.
- The two title-slide switches map directly to the playlist's
  `mainTitleSlide` and `perSettingTitles` fields (§4). They are the only
  title-slide controls; there is no per-setting override.
- **Auto-save** to localStorage on every mutation; no "Save" button. The
  Share button generates a URL on demand.
- **Reorder** via:
  - Mouse: drag the `⋮⋮` handle.
  - Keyboard: focus a setting card, `Alt+↑` / `Alt+↓` to move (VS Code
    idiom).
  - Mobile: each card also shows up/down arrow icon buttons that appear on
    tap-focus; drag is supported but not the only option (drag on touch is
    fiddly).
- **Delete** is two-tap: first tap on the trash icon turns the card into a
  confirm state ("Delete? Tap again" with a brief timer); second tap within
  ~2s confirms. Avoids a modal.

### 7.3 Setting picker

Opened by **Add setting** or **edit selection**.

Three steps:

1. **Find step** — reuses the header search box's behaviour: type a psalm
   number or first words, pick a result.
2. **Rendition step** *(skipped if the psalm has only one rendition)* —
   choose version / part. Renditions are presented as labelled cards
   ("Version 1 · C.M.", "Version 2 · L.M.", "Part 3 · Gimel").
3. **Verses step** — the rendition rendered the same way as the regular
   setting page, with stanza-level toggling.

#### Verses step — visual indicators

```
┌─────────────────────────────────────────────────────────┐
│ ‹ Back                                          [Done]  │
│                                                          │
│ Psalm 119, part 3 (Gimel)                                │
│                                                          │
│ [ Psalm 119, part 3: ][ 17-20, 22-24                  ]  │
│   ^read-only prefix    ^editable verse spec              │
│                                                          │
│  ☐ Select whole psalm                                    │
│ ──────────────────────────────────────────────────────── │
│                                                          │
│ ┌──── verse 17 ────┐                                     │
│ │ ☑  stanza 1      │  ◀ verse-start; click toggles unit  │
│ │    (lines 1-4)   │                                     │
│ └──────────────────┘                                     │
│ ┌──── verse 18 ────┐                                     │
│ │ ☑  stanza 2      │  ◀ verse-start; selected            │
│ │    (lines 1-4)   │                                     │
│ └──────────────────┘                                     │
│ ┌──── verses 19-20 ┐                                     │
│ │ ☑  stanza 3      │  ◀ verse-start (begins v19)         │
│ │    (lines 1-4)   │                                     │
│ │    stanza 4      │  ◀ continuation; greyed handle,     │
│ │    (lines 1-4)   │    no own toggle — grouped above    │
│ └──────────────────┘                                     │
│ ┌──── verse 21 ────┐                                     │
│ │ ☐  stanza 5      │  ◀ not selected                     │
│ │    (lines 1-4)   │                                     │
│ └──────────────────┘                                     │
│ ...                                                      │
└─────────────────────────────────────────────────────────┘
```

Visual cues, summarised:

- **Verse label** above each verse-unit card (e.g. "verse 17", "verses
  19–20" when a verse-start stanza spans multiple verses).
- **Checkbox** appears only on the verse-start stanza of each unit; the
  whole unit toggles together when clicked anywhere on the card.
- **Continuation stanzas** render inside the same card as their verse-start
  stanza, indented or with a thin connector line on the left, and have no
  own checkbox. A tooltip on hover explains "part of verse N".
- **Selected** units use the app's standard accent colour for the card
  border / background tint. **Unselected** units are muted but still fully
  readable.
- **Hover state** previews "will select this verse unit" with a subtle
  highlight.

#### Locked-prefix verse text box

Above the stanza list, a single input field offers a power-user shortcut:

- The **left, non-editable prefix** shows the current rendition label, e.g.
  `Psalm 119, part 3:`. It's styled like inline disabled text and is
  visually fused with the input on the right.
- The **right, editable portion** is a verse-range spec, identical in
  grammar to the existing `?verses=` URL parameter: `17-20, 22-24`.
- **Two-way binding**: clicking stanzas updates the text; editing the text
  updates checked stanzas, with the no-partial-verse rule (§4.1) applied —
  if the user types `18-21` and verse 21 lives inside a stanza that also
  contains the start of verse 22, the input snaps to `18-22` on commit and
  briefly flashes to signal the snap.
- Empty string = no selection (Done is disabled until at least one verse is
  picked). The word "all" or an empty string with the "Select whole psalm"
  toggle ticked = all verses.

Footer: live summary ("verses 17–20, 22–24 · 8 stanzas") and `[Cancel]`
`[Done]`. `Done` writes the resolved verse ranges to the playlist setting.

### 7.4 Shared-playlist preview — `#/playlists/shared?d=…`

- Read-only render of the playlist (name + numbered list of settings, with
  each setting's psalm / rendition / verse selection visible).
- **Save to my playlists** primary button — saves the playlist locally. If
  the name is unused, save silently and redirect to the editor for it. If
  the name already exists, run the name-collision dialog from §5 (Replace /
  Import as a copy / Cancel).
- **Present** secondary button — presents the ephemeral playlist without
  saving. Useful if a precentor just wants to drive someone else's order
  this once without keeping it in their library.

## 8. Title slides

There are **two distinct kinds**: a single playlist-wide title slide (§8.1)
and per-setting title slides (§8.2). Both are real present-mode pages —
same typography, theme, and topbar behaviour as a stanza slide — and both
participate in `←` / `→` navigation.

### 8.1 Playlist main title slide

Shown once, at position 0 of the queue, when the playlist's `mainTitleSlide`
flag is on. Functions as the "order of service" slide before any singing
begins.

Layout:

- **Playlist name** at the top (large).
- **Numbered list of settings, in playlist order** (not psalm-number order).
  One row per setting:
  - **Psalm {n}** (prominent)
  - **Rendition label** — version or part — *only when the psalm has more
    than one rendition in the data*; suppressed for unambiguous psalms.
  - **Verse selection** — e.g. "verses 1–6, 9"; suppressed for whole-psalm
    settings.

Example:

```
Lord's Day morning · 2026-06-07

  1.  Psalm 23
  2.  Psalm 6
  3.  Psalm 119, part 3 (Gimel)  ·  verses 17–20, 22–24
```

### 8.2 Per-setting title slide

Shown before each setting in the playlist, all-on or all-off, governed by
the playlist's `perSettingTitles` flag. There is no per-setting override:
either every setting gets a title slide, or none do. This keeps the data
model and the editor UI uncluttered; the use cases for "title slides on
some settings but not others" within a single playlist are thin.

Content, in order of visual prominence:

1. **Psalm {n}** (largest).
2. **Rendition label** — version or part — *only when the psalm has more
   than one rendition in the data*.
3. **Verses {range}** — omitted if the setting is the whole psalm.
4. *Inscription* (italic) — e.g. *"A Psalm of David"*.
5. **Meter** — e.g. C.M. — small, in a corner.

## 9. Present-mode flow

The existing present mode stays unaware of playlists. A thin "queue" layer
wraps it.

- The queue is a flat list of slide tuples computed at navigation time:
  `(kind, settingIndex?, stanzaIndex?)` where `kind ∈ {mainTitle,
  settingTitle, stanza}`.
- Queue assembly:
  - If `mainTitleSlide`, prepend one `(mainTitle)` tuple.
  - For each setting `i`:
    - If `perSettingTitles`, append `(settingTitle, i)`.
    - For each stanza whose verses intersect the setting's verse range,
      append `(stanza, i, stanzaIndex)`.
- `→` advances one step in the queue; `←` reverses; `Esc` exits the entire
  playlist and returns to the editor.
- The topbar (already auto-hiding) shows a small position chip:
  `Setting 2 / 3 · Stanza 3 / 5` (the chip is hidden on the main title
  slide and shows just `Setting 2 / 3` on a setting title slide).

Out-of-the-box behaviour we get for free:

- Per-stanza URL sharing already exists, so resuming a playlist mid-service
  ("we got stopped at the third stanza of the second psalm") is just an
  `?at=1&slide=3` query.
- The font slider, theme, tap zones, and exit gesture all work unmodified.

## 10. Header / nav placement

The other nav items (Contents, Meters, First lines, Concordance) are all
*reference* — different indexes into the same fixed corpus. Playlists is a
different kind of thing: a user *tool* that creates and manages user-owned
content. The nav should make that distinction visible.

| Position | Today | After |
|----------|-------|-------|
| 1 | Contents | Contents |
| 2 | Meters | Meters |
| 3 | First lines | First lines |
| 4 | Concordance | Concordance |
| 5 | *(search box)* | *vertical separator* · **Playlists** · *vertical separator* |
| 6 | | *(search box)* |

The separator treatment in CSS — exact choice to be refined during
implementation, but the intent is one of:

- A thin vertical rule (1px, muted accent colour) on both sides of the
  Playlists link.
- Or: a slightly tinted pill background behind the Playlists link, with no
  rules.
- Or: extra horizontal padding plus a left/right rule, with a small icon
  (e.g. a stacked-cards or queue glyph) preceding the label.

Whichever cue is chosen, it must survive the mobile drawer layout — there,
render Playlists in its own grouped section with a section header (e.g.
"Tools") above it, separated from the index links above (which sit under an
implicit or labelled "Browse" group).

## 11. Decisions and remaining questions

### Decided

1. **Title slides.** Two playlist-wide flags, no per-setting overrides:
   `mainTitleSlide` for the playlist's single main title, `perSettingTitles`
   for whether every setting gets a title slide. All-on or all-off keeps
   the editor clean.
2. **Selection granularity.** Pick by whole stanza in the UI; store as
   verse ranges. No partial-verse selections are reachable, per §4.1.
3. **Picker interaction.** Click a stanza (or its verse-unit card) to
   toggle. Plus a locked-prefix text box for direct verse-range entry, with
   two-way binding (§7.3).
4. **Vocabulary.** User-facing word is **setting**; JSON-level array
   renamed to **renditions** (see §2, §13).
5. **Update-by-resend.** Handled in the import flow with a Replace /
   Import as a copy / Cancel dialog (§5).

### Deferred to a follow-up after v1

- **Print view for a playlist.** Looping the existing print stylesheet per
  setting, with main and per-setting title slides becoming printable header
  pages. Worth a small design pass once v1 is shipped and we know how
  people actually use playlists.

### Still open

- **Non-contiguous stanza range shortcuts** (shift-click to select a range,
  ctrl-click to toggle individuals) — nice-to-have on desktop; can ship
  v1 without them and add later.
- **Mobile drawer layout** of the Playlists section — confirm with a quick
  prototype during implementation.
- **Storage cap.** localStorage gives ~5 MB; a single playlist is a few
  hundred bytes. Effectively unlimited for this use case; no quota logic
  needed. (Noted in case usage ever changes.)
- **PWA cache.** Playlists are user state, not cached assets. No `sw.js`
  changes required; the cache version doesn't need to bump when a playlist
  is added/edited. (Routes and assets do trigger a bump.)

## 12. Out of scope for v1

- Cross-device sync (would require a backend, breaks the static-site
  philosophy).
- Editing a shared playlist URL in place — sharing is one-way; recipients
  always save their own copy and edit it locally.
- Per-setting custom titles or notes ("Sermon text:", "Sung after the
  reading").
- Non-psalter content in playlists (hymns, scripture readings, prayers).
- Bulk operations (duplicate playlist, merge playlists, export all).

## 13. Surface impact summary

| Area | Change |
|------|--------|
| `psalter.json`, `psalter.schema.json`, `app.js` | **Prerequisite:** rename the JSON `settings` array to `renditions` (and the validator + reader). Frees "setting" for user-facing copy. |
| Header nav | Add **Playlists** link with visual separator treatment |
| Router (`app.js`) | Four new routes under `#/playlists/...` |
| New JS modules | Playlist store (localStorage), URL codec, editor view, picker, present-queue, title-slide renderer (main + per-setting), name-collision import dialog |
| `style.css` | Editor list styles, picker styles (verse-unit cards, locked-prefix input), main and per-setting title-slide layouts, position chip in topbar, nav-separator treatment |
| `manifest.webmanifest` / `sw.js` | VERSION bump because `app.js` / `style.css` change; no other changes |
| Issue templates | Optional follow-up: a "playlist" label on the bug template |
