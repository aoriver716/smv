# Modularisation plan

## Current state

```
app.js     2635 LOC   112 KB   single ES module, all logic
style.css  1847 LOC    47 KB   single stylesheet
sw.js        49 LOC     2 KB   fine as-is
index.html  103 LOC     7 KB   fine as-is
```

`app.js` already loads as `type="module"`, so we can `import` / `export` natively
with no build step. No bundler is needed. Plain ESM keeps the deploy story
identical (just publish files to GitHub Pages).

`style.css` is large but second-priority. The browser pays for the whole file
either way, so splitting it is a *maintainability* win, not a perf win, and the
cost of plumbing it (more `<link>` tags + cache busting) is real. Recommendation
is below but it's optional.

`psalter.json`, `psalter.schema.json`, `sw.js`, `index.html`, `manifest.webmanifest`,
and `icon.svg` are all already at the right size and should be left alone.

---

## What's actually in app.js right now

Reading top-to-bottom, the file is doing nine separable jobs:

| Job | Lines | Notes |
| --- | --- | --- |
| Constants (`BOOKS`, `ALPHA`, `STOPWORDS`) | 4–46 | Reused by concordance + home |
| DOM/router primitives (`el`, `mount`, `parseRoute`, `parseVerses`, `ordinalSuffix`) | 48–103 | Used by every view |
| `App` controller (state, `boot`, `render`, route dispatch, all `render*` methods) | 105–799 | The actual application |
| URL & label helpers (`settingUrl`, `settingDesignator`, `citation`, etc.) | 801–851 | Used by indexes, search, playlists |
| Stanza line rendering (`stanzaLineNode`) + alt-settings nav | 853–890 | Used by setting + stanza + playlist-present views |
| Concordance/search text helpers (`escapeHtml`, `escapeRe`, `highlightMatches`, `abbreviateInContext`) | 892–931 | Pure functions |
| Header chrome (`initMobileMenu`, `initSearchForm`, `liveSearchResults`, `syncSearchInput`, `registerServiceWorker`) | 933–1221 | Wires the persistent UI in `index.html` |
| Share + adjacent-psalm nav + theme (`shareButton`, `adjacentPsalmNav`, `initTheme`, SVG glyphs) | 1223–1392 | UI building blocks |
| Present mode (tutorial modal, controls, fullscreen, font scale) | 1394–1554 | Self-contained |
| Playlists (icons, storage, draft state, URL codec, verse-range math, verse-unit grouping, index row, editor, picker, present queue, shared preview, import dialog) | 1556–2937 | ~1400 LOC, by far the biggest single subsystem |
| Boot | 2939–end | Two lines |

Three concrete pieces of duplication that the split should also clean up:

1. **Share-to-OS-or-clipboard** logic exists in both `shareButton()` (line ~1234)
   and `playlistIndexRow()`'s shareBtn (line ~1908). They flash a "Copied" /
   "Failed" state with timer cleanup that's been re-typed.
2. **Modal-backdrop scaffolding** is hand-rolled three times: present-mode
   tutorial (1524), playlist name-collision (2825), and Import-from-URL (2876).
   Same `<div class="modal-backdrop"><div class="modal">` shape, same
   click-on-backdrop-to-close, same Esc-to-close pattern (or missing it).
3. **Two-tap-to-confirm** delete buttons (playlist row trash, editor delete,
   per-setting trash) all hand-roll the same `confirming` flag + 2 s timer +
   class toggle.

---

## Proposed file layout

Plain ESM, one directory:

```
js/
  main.js                  # boot + the App controller, dispatches routes
  dom.js                   # el, mount  (pure DOM helpers)
  router.js                # parseRoute, parseVerses, ordinalSuffix
  icons.js                 # ICONS map, SUN_SVG, MOON_SVG (single source of truth)
  constants.js             # BOOKS, ALPHA, STOPWORDS

  ui/
    chrome.js              # initMobileMenu, initSearchForm, liveSearchResults,
                           # syncSearchInput  (everything that wires #site-menu,
                           # #search-form, etc. from index.html)
    theme.js               # applyTheme, systemPrefersDark, initTheme
    share.js               # shareButton(), shareViaOsOrClipboard()
                           # — the dedup target for points 1 above
    modal.js               # openModal({ title, body, actions }) returning a
                           # close handle; click-backdrop + Esc handled once
                           # — the dedup target for point 2
    confirmButton.js       # makeConfirmButton({ icon, label, onConfirm })
                           # — the dedup target for point 3
    serviceWorker.js       # registerServiceWorker

  views/
    home.js                # renderHome
    setting.js             # renderPsalmRoute, renderSetting, renderStanza,
                           # stanzaLineNode, altSettingsNav, adjacentPsalmNav
    meters.js              # renderMeters
    firstLines.js          # renderFirstLines
    concordance.js         # buildConcordance, renderConcordance*,
                           # escapeHtml, abbreviateInContext
    search.js              # renderSearch, escapeRe, highlightMatches
    notFound.js            # renderNotFound

  psalm/
    labels.js              # settingUrl, settingDesignator, citation,
                           # firstLineOfSetting, stripLeadingArticle
                           # — small, pure, used by 5+ callers

  present/
    mode.js                # enterPresent, exitPresent, ensurePresentControls,
                           # the font-scale slider, the top-bar visibility logic
    tutorial.js            # showPresentTutorial (its own modal)

  playlists/
    store.js               # loadPlaylists, savePlaylists, getPlaylist,
                           # upsertPlaylist, deletePlaylist, newPlaylistId,
                           # createBlankPlaylist
    draft.js               # editorDraft module-level state,
                           # setEditorDraft / clearEditorDraft / getEditorDraft,
                           # cloneForDraft
    urlCodec.js            # encodeSettingForUrl, decodeSettingFromUrl,
                           # encodePlaylistToParams, decodePlaylistFromParams,
                           # shareUrlForPlaylist
    verses.js              # parseVerseRanges, mergeRanges, formatVerseRanges,
                           # formatVerseRangesAscii, versesSetFromRanges,
                           # setToRanges
    units.js               # computeVerseUnits, firstVerseInStanza,
                           # snapVersesToUnits, countSelectedStanzas
                           # (the no-partial-verse §4.1 grouping)
    renditions.js          # findRendition, isWholePsalm,
                           # settingHasMultipleRenditions, renditionLabel,
                           # settingSummary
    index.js               # renderPlaylistsIndex, playlistIndexRow,
                           # relativeTime
    editor.js              # renderPlaylistEditor, mountPlaylistEditor,
                           # playlistSettingRow, moveSetting
    picker.js              # renderPickerView, renderPickerFindStep,
                           # renderPickerRenditionStep, renderPickerVersesStep
    present.js             # renderPlaylistPresent, renderPlaylistSlide,
                           # buildPlaylistQueue, renderMainTitleSlideBody,
                           # renderSettingTitleSlideBody
    shared.js              # renderSharedPlaylist, renderSharedPlaylistPreview,
                           # importSharedPlaylist, showNameCollisionDialog,
                           # promptImportFromUrl
```

`index.html` changes from `<script src="./app.js" type="module">` to
`<script src="./js/main.js" type="module">`. Everything else there stays.

Rough size targets after the split:

| File | Approx. LOC |
| --- | --- |
| `main.js` (App controller + boot + route table) | ~250 |
| Largest module (`playlists/picker.js`) | ~360 |
| Most modules | 50–250 |
| Total | unchanged (~2700, gains from dedup, loses from import boilerplate roughly cancel out) |

---

## Why this shape

- **Layers, not features only.** `dom.js`, `router.js`, `icons.js`, `constants.js`,
  and the small `psalm/labels.js` sit at the bottom and have *no* internal deps.
  `ui/` and `views/` and `playlists/` import down into them, never sideways.
  This keeps the dependency graph a DAG and prevents the cycles that bite
  unbundled ESM (`import` cycles silently see `undefined` exports during init).
- **Subsystems get their own folder.** Anything that grows to >250 LOC and has
  internal sub-pieces — `present/`, `playlists/`, `views/` — becomes a folder
  instead of a single file, so the next addition has an obvious home.
- **Three dedup targets are first-class modules.** `ui/share.js`,
  `ui/modal.js`, and `ui/confirmButton.js` exist specifically to remove the
  duplication catalogued above. The split would be hollow if it just moved
  three copies of the same logic into three different files.
- **App controller stays one file.** `App.render()` and the route table need
  to see every `render*` function. Splitting that across files just gives you
  an `import { renderHome } from '../views/home.js';` x12 at the top of
  `main.js`, which is fine — that's the whole point. But the dispatch logic
  itself stays in one place so the routing rules are readable at a glance.
- **No barrels (no `index.js` re-exports).** They make grep and "go to
  definition" worse and the dependency graph fuzzier. Each importer names the
  exact file it wants. Cost of explicitness is a couple more lines at the top
  of `main.js`; it's worth it.

---

## What this does *not* try to do

- No bundler, no TypeScript, no build step. Pages already serves the files
  straight; refactoring the deploy story is a separate question.
- No test framework. The codebase has zero tests today; adding modules makes
  unit tests *possible* (every pure helper in `verses.js`, `urlCodec.js`,
  `units.js`, `labels.js` is trivially testable) but actually writing them is
  out of scope.
- No CSS-in-JS, no Web Components, no rewriting `el()` / `mount()`. The
  existing primitives are fine; we're just moving them.
- No renames. The plan keeps every public name (`renderHome`, `upsertPlaylist`,
  `ICONS`, etc.) so each commit's diff is "moved this block + added import",
  not "renamed everything at once".
- No protocol or storage changes. localStorage key, share-URL format, JSON
  schema are all untouched.

---

## Execution order

Each step ends with the app working in the browser. Commit after each.

1. **Bottom of the graph.** Create `js/dom.js`, `js/router.js`,
   `js/icons.js`, `js/constants.js`, `js/psalm/labels.js`. Move the code from
   `app.js` into them as bare `export function` declarations. Add the imports
   at the top of `app.js`. Bump SW cache, smoke-test all routes. (~1 commit.)
2. **UI primitives.** Pull out `ui/chrome.js`, `ui/theme.js`,
   `ui/serviceWorker.js`. These are init-time hookups that `App.boot` calls
   once. Verify menu, search, dark mode, SW registration. (~1 commit.)
3. **Dedup targets.** Add `ui/modal.js`, `ui/share.js`, `ui/confirmButton.js`
   with the unified API. Replace each existing duplicate one at a time
   (present tutorial → name collision → import dialog for modal; both share
   call sites for share; three trash buttons for confirmButton). Each
   replacement is its own commit so any regression is bisectable. (~3 commits.)
4. **Views.** Move each `App.render*` body into `js/views/*.js` as exported
   functions. Replace the bodies in the `App` controller with one-line
   delegations: `renderHome() { renderHomeView(this); }`. Once they're all
   delegating, decide whether to keep `App` as a thin dispatcher or inline
   the dispatch in `main.js`. (~1–2 commits.)
5. **Present mode.** Move into `js/present/`. The module owns the
   `presentControls`, `presentTopbar`, `presentHideTimer` state — these become
   module-scoped instead of file-scoped, no API change. (~1 commit.)
6. **Playlists, bottom-up.** Move in the dependency order from the table:
   `store` → `draft` → `urlCodec` → `verses` → `units` → `renditions` →
   `index` → `editor` → `picker` → `present` → `shared`. Each step compiles
   and runs because everything above it already imports from the new
   locations. (~3–4 commits, one per cluster.)
7. **Final pass.** Delete the now-empty `app.js`. Update `index.html`'s
   script tag. Bump SW cache list (the precache list needs the new entry
   points — easiest answer is to keep precaching just `./` and `./index.html`
   and let the network-first SW fetch the rest on demand).

---

## Style.css — optional second pass

The CSS file is already commented into sensible sections. The cleanest split
would mirror the JS:

```
css/
  base.css        # tokens (custom props), reset, body, typography
  chrome.css      # site header, nav, mobile menu, theme switch
  home.css        # TOC / home grid
  setting.css     # setting + stanza views (incl. share/present buttons,
                  # adjacent-psalm nav)
  indexes.css     # meters + first lines
  concordance.css # concordance + search results
  search.css      # search box in header
  modal.css       # .modal-backdrop, .modal, .modal-controls
  present.css     # present mode + tap zones + top bar + tutorial
  playlists.css   # everything .pl-*
  print.css       # @media print
  mobile.css      # @media (max-width: 600px) chunks (or inline per file)
```

`index.html` then loads one `<link rel="stylesheet" href="./css/base.css">` and
the others, or — simpler and arguably better — keep a single `style.css` that
just `@import`s each file. Either way, this is purely organisational; recommend
deferring until *after* the JS split lands, because the JS split is where the
actual maintainability pain is today.

---

## Risks and answers

- **ESM cycle bugs.** Mitigated by the strict layering (lower layers never
  import from upper layers). Easy to verify: `grep -r "import .* from" js/`
  and inspect the graph manually.
- **SW serving stale modules during the switchover.** Already addressed —
  `sw.js` is now network-first as of `8fac29b`. Bumping `VERSION` on each
  commit is still recommended for the offline fallback.
- **`App` is a god object today.** The plan keeps it, but reduced to a route
  table + state holder. If even that feels heavy after step 4, it can be
  flattened into module-scope state in `main.js` — but that's a judgement
  call to make after seeing the smaller file, not now.
- **`document.title` is set from inside many `render*` functions.** Left
  in place; moving it to a route-table data definition would be a real
  improvement but is a separate refactor.
- **Tests still don't exist.** Splitting doesn't add tests, but it removes
  the main blocker to writing them (every pure helper becomes importable
  in isolation). A future `tests/` folder with a tiny `node --test` runner
  on the pure modules would be a high-value follow-up.
