# Scottish Metrical Psalter (1650)

[![Deploy to GitHub Pages](https://github.com/aoriver716/smv/actions/workflows/pages.yml/badge.svg)](https://github.com/aoriver716/smv/actions/workflows/pages.yml)
[![CI](https://github.com/aoriver716/smv/actions/workflows/ci.yml/badge.svg)](https://github.com/aoriver716/smv/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![No build step](https://img.shields.io/badge/build-none-success)](#run-the-web-app-locally)
[![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8)](#run-the-web-app-locally)

The complete 1650 Scottish Metrical Psalter as structured JSON, paired with a
no-build, browser-side single-page app that reads the JSON directly and
renders it as a fully browsable, searchable, printable, projectable book.

## Browse online

A static, no-build web app is published from this repository:

**[aoriver716.github.io/smv](https://aoriver716.github.io/smv/)**

It loads [`psalter.json`](psalter.json) at runtime and renders the contents,
each psalm, individual stanzas, a meter index, a first-line index, and a full
concordance, all from the same data file.

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

### URL scheme

All routes are hash-based, so the page never reloads:

| Route | View |
|-------|------|
| `#/` | Title and table of contents (Books I&ndash;V). |
| `#/psalm/{n}` | A psalm. Multi-setting psalms canonicalise to the first version or part. |
| `#/psalm/{n}/v{V}` | A specific version of a multi-version psalm. |
| `#/psalm/{n}/p{P}` | A specific part (Psalm 119 only at present). |
| `#/psalm/{n}/p{P}/v{V}` | A specific part *and* version (supported, even though no current setting uses both). |
| `#/psalm/{n}/&hellip;/s{S}` | Zoomed view of a single stanza, with previous/next arrows (also bound to `<-`, `->`, `Esc`). A **Present** button enters full-screen presentation mode; arrow keys still navigate and `Esc` exits. |
| `#/psalm/{n}/&hellip;?verses=1-3,5` | Filter to the given verses on either of the views above. |
| `#/meters` | Index of meters (excluding Common Meter, which appears in every psalm). |
| `#/first-lines` | Alphabetical index of first lines. |
| `#/concordance` | Letter selector (A&ndash;Z). |
| `#/concordance/{letter}` | Every word starting with that letter, each occurrence cited and shown in its line with the headword abbreviated. Articles, basic conjunctions/prepositions, and auxiliary verbs (incl. archaic forms) are excluded. |
| `#/search?q=&hellip;` | Full-text search results for the given query, with matches highlighted. The search box in the header opens a live suggestions panel as you type; Enter (or clicking "See all") goes to the full results page. |

A theme selector (System / Light / Dark) is in the top-right of the header.
The choice is remembered in `localStorage`; System (the default) follows
your OS preference.

On each psalm setting and stanza view there is a **Copy link** button that
copies the current URL to the clipboard, and on the setting view there are
**Previous / Next psalm** links beneath the stanzas. The site has a print
stylesheet that hides navigation chrome and lays the stanzas out cleanly on
paper &mdash; useful for printing a single psalm setting.

The site is also a Progressive Web App: it ships a manifest and a service
worker so it can be installed (Chrome/Edge address-bar install icon; iOS
Safari **Share &rarr; Add to Home Screen**) and works offline once you've
loaded it.

## Sources

- Base text taken from: [Scottish Psalter &mdash; Words Only, Digital Edition (Free Church of Scotland, PDF)](https://freechurch.org/wp-content/uploads/2026/05/Scottish-Psalter-Words-Only-Digital-Edition.pdf)
- Also referenced: [1650 Scottish Metrical Psalter (The Westminster Standard)](https://thewestminsterstandard.org/1650-scottish-metrical-psalter/)

## License

[MIT](LICENSE)
