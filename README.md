# Scottish Metrical Psalter (1650)

A web edition of the complete 1650 Scottish Metrical
Psalter, built primarily for **presenting psalm lyrics on a screen**
for congregational singing.

Alternatively, it doubles as a reader, with indexes by meter and
first line, a full-text search, and a full concordance (completely unnecessary on a digital app, but it's a fun idea).

## Browse online

**[aoriver716.github.io/smv](https://aoriver716.github.io/smv/)**

## Features

### Presentation mode

The primary use case is to present psalm lyrics on a screen. From any psalm setting, click the **Present** button to enter full-screen presentation.

- **Navigation.** `←` / `→` on the keyboard, or tap the left / right
  side of the screen.
- **Font size.** A slider lives at the top of the screen. Move your mouse
  there (or tap the top edge on touch) to reveal it (if hidden).
- **Exit.** Press `Esc`. On mobile, use your usual gesture for exiting
  fullscreen.

### Sharing

Every psalm setting and every individual stanza has its own URL. Click the
**Share** button to share or copy the link. Clicking a stanza on the setting
page zooms in on it, from where you can also share or present that single
stanza.

### Offline Use
Users may download the psalter as a standalone app for offline use. Most browsers will offer an install prompt automatically; if yours doesn't, see
[MDN's instructions for installing a PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing#installing_pwas)
or look up how to install a PWA for your specific device and browser. Once installed, it
works fully offline.

## Contents

| File | What it is |
|------|------------|
| [`psalter.json`](psalter.json) | The complete psalter as JSON &mdash; the source of truth. One entry per *setting* (a psalm has one or more settings to accommodate alternate versions or parts). |
| [`psalter.schema.json`](psalter.schema.json) | JSON Schema for `psalter.json`. Editors that respect `$schema` will lint and complete the data automatically. |
| [`index.html`](index.html), [`app.js`](app.js), [`style.css`](style.css) | The browser app. Static files, no build step, no framework. |
| [`manifest.webmanifest`](manifest.webmanifest), [`sw.js`](sw.js), [`icon.svg`](icon.svg) | PWA manifest, service worker (offline cache), and app icon. |

## Data shape

```json
{
  "settings": [
    {
      "psalm": 3,
      "meter": "C.M.",
      "inscription": "A Psalm of David, when he fled from Absalom his son.",
      "stanzas": [
        [
          { "verse": 1, "text": "O LORD, how are my foes increased?" },
          { "text": "\tagainst me many rise." }
        ]
      ]
    }
  ]
}
```

A **setting** is one renderable version of a psalm:

- `psalm` *(int)* &mdash; the psalm number (1&ndash;150).
- `meter` *(string)* &mdash; metrical pattern (e.g. `C.M.`, `L.M.`, `S.M.`).
- `inscription` *(string, optional)* &mdash; the biblical superscription where one is present.
- `stanzas` *(array of arrays)* &mdash; each inner array is one stanza; each element is one line.
- Line objects have a `text` field (a leading tab `\t` marks an indented line) and an optional `verse` field giving the verse number this line starts.
- Multi-version psalms (e.g. Psalm 6) appear as multiple settings with a `version` field.
- Psalm 119's 22 parts each appear as their own setting with `part` and `heading` (Aleph, Beth, &hellip;, Tau) fields.

## Run the web app locally

The web app uses ES modules, so opening `index.html` directly via `file://`
will not work in most browsers. Serve the folder over HTTP:

```powershell
# Python (any recent version)
python -m http.server 8080
# or, with Node
npx serve .
```

Then open <http://localhost:8080/> in your browser.

## URL scheme

All routes are hash-based, so the page never reloads:

| Route | View |
|-------|------|
| `#/` | Title and table of contents (Books I&ndash;V). |
| `#/psalm/{n}` | A psalm. Multi-setting psalms canonicalise to the first version or part. |
| `#/psalm/{n}/v{V}` | A specific version of a multi-version psalm. |
| `#/psalm/{n}/p{P}` | A specific part (Psalm 119 only at present). |
| `#/psalm/{n}/p{P}/v{V}` | A specific part *and* version (supported, even though no current setting uses both). |
| `#/psalm/{n}/&hellip;/s{S}` | Single-stanza view. Click the stanza (or press the **Present** button) to enter full-screen presentation. Arrow keys / left- and right-edge taps move between stanzas; `Esc` exits. |
| `#/psalm/{n}/&hellip;?verses=1-3,5` | Filter to the given verses on either of the views above. |
| `#/meters` | Index of meters (excluding Common Meter, which appears in every psalm). |
| `#/first-lines` | Alphabetical index of first lines. |
| `#/concordance` | Letter selector (A&ndash;Z). |
| `#/concordance/{letter}` | Every word starting with that letter, each occurrence cited and shown in its line with the headword abbreviated. Articles, basic conjunctions/prepositions, and auxiliary verbs (incl. archaic forms) are excluded. |
| `#/search?q=&hellip;` | Full-text search results for the given query, with matches highlighted. The search box in the header opens a live suggestions panel as you type; Enter (or clicking "See all") goes to the full results page. |

A theme selector (System / Light / Dark) is in the top-right of the header.
The choice is remembered in `localStorage`; System (the default) follows
your OS preference.

## Sources

- Base text taken from: [Scottish Psalter &mdash; Words Only, Digital Edition (Free Church of Scotland, PDF)](https://freechurch.org/wp-content/uploads/2026/05/Scottish-Psalter-Words-Only-Digital-Edition.pdf)
- Also referenced: [1650 Scottish Metrical Psalter (The Westminster Standard)](https://thewestminsterstandard.org/1650-scottish-metrical-psalter/)

## License

[MIT](LICENSE)


### URL scheme

All routes are hash-based, so the page never reloads:

| Route | View |
|-------|------|
| `#/` | Title and table of contents (Books I&ndash;V). |
| `#/psalm/{n}` | A psalm. Multi-setting psalms canonicalise to the first version or part. |
| `#/psalm/{n}/v{V}` | A specific version of a multi-version psalm. |
| `#/psalm/{n}/p{P}` | A specific part (Psalm 119 only at present). |
| `#/psalm/{n}/p{P}/v{V}` | A specific part *and* version (supported, even though no current setting uses both). |
| `#/psalm/{n}/&hellip;/s{S}` | Single-stanza view. Click the stanza (or press the **Present** button) to enter full-screen presentation. Arrow keys / left- and right-edge taps move between stanzas; `Esc` exits. |
| `#/psalm/{n}/&hellip;?verses=1-3,5` | Filter to the given verses on either of the views above. |
| `#/meters` | Index of meters (excluding Common Meter, which appears in every psalm). |
| `#/first-lines` | Alphabetical index of first lines. |
| `#/concordance` | Letter selector (A&ndash;Z). |
| `#/concordance/{letter}` | Every word starting with that letter, each occurrence cited and shown in its line with the headword abbreviated. Articles, basic conjunctions/prepositions, and auxiliary verbs (incl. archaic forms) are excluded. |
| `#/search?q=&hellip;` | Full-text search results for the given query, with matches highlighted. The search box in the header opens a live suggestions panel as you type; Enter (or clicking "See all") goes to the full results page. |

A theme selector (System / Light / Dark) is in the top-right of the header.
The choice is remembered in `localStorage`; System (the default) follows
your OS preference.

## Sources

- Base text taken from: [Scottish Psalter &mdash; Words Only, Digital Edition (Free Church of Scotland, PDF)](https://freechurch.org/wp-content/uploads/2026/05/Scottish-Psalter-Words-Only-Digital-Edition.pdf)
- Also referenced: [1650 Scottish Metrical Psalter (The Westminster Standard)](https://thewestminsterstandard.org/1650-scottish-metrical-psalter/)

## License

[MIT](LICENSE)
