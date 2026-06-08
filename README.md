# Scottish Metrical Psalter (1650)

A web reader for the 1650 Scottish Metrical Psalter, with tools for presenting lyrics on-screen.

## Introduction

Dear reader,

What you see here is a web reader for the 1650 Scottish Metrical Psalter. I built it with one feature in mind: **presenting psalm lyrics on a screen**. Of course, the immediate applications are congregational singing or teaching, though I recognise most who use the 1650 don't project lyrics in worship. It only exists in the first place because I wanted a way to render 1650 lyrics on screen for a series of YouTube videos promoting psalm singing (still a work in progress). Alternatively, this also doubles as a reader and can be **downloaded for offline use**. Whatever the case, I hope it may be found useful beyond my own limited scope.

On that note, I am considering ways to improve this and perhaps broaden the use cases. One idea is to rework it as a presentation-first tool that draws on other texts used in reformed circles (KJV, WCF, WSC, WLC), with an export function so slides can be brought into the tool of your choice (or presented natively from the app). If that sounds useful, or if you have other ideas, feel free to open a [feature request](https://github.com/aoriver716/smv/issues/new?template=feature.yml).

*Extol the Lord with me, let us exalt his name together.*<br>
The developer

## Browse Online

Browse the psalter at **[aoriver716.github.io/smv](https://aoriver716.github.io/smv/)**.

## Features

### Presentation Mode

The primary use case is to present psalm lyrics on a screen. From any psalm setting, click the **Present** button to enter full-screen presentation.

- **Navigation.** `←` / `→` on the keyboard, or tap the left / right
  side of the screen.
- **Font size.** A slider lives at the top of the screen. Move your mouse
  there (or tap the top edge on touch) to reveal it (if hidden).
- **Exit.** Press `Esc`. On mobile, use your usual gesture for exiting
  fullscreen.

### Sharing

Every psalm setting, every stanza, and every [playlist](#playlists) has its own URL. Click the `Share` button to share or copy the link. Clicking on a stanza zooms in on it, from where you can also share or present that single stanza.

### Offline Use

The psalter can be installed as a standalone app that works without an internet connection. Most browsers will offer an install prompt automatically; if yours doesn't, see [MDN's instructions for installing a PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing#installing_pwas) or look up how to install a PWA for your specific device and browser.

### Playlists

Assemble an ordered sequence of psalm selections — whole psalms or portions — and present them all as a slide deck. Optional title slides can be included to transition between settings.

Each playlist has its own shareable  URL, so the same order of psalms can be passed to anyone else who needs access to the slides.

## Contents

| File | What it is |
|------|------------|
| [`psalter.json`](psalter.json) | The complete psalter as JSON &mdash; the source of truth. One entry per *setting* (a psalm has one or more settings to accommodate alternate versions or parts). |
| [`psalter.schema.json`](psalter.schema.json) | JSON Schema for `psalter.json`. Editors that respect `$schema` will lint and complete the data automatically. |
| [`index.html`](index.html), [`style.css`](style.css), [`js/`](js/) | The browser app. Static files, no build step, no framework. |
| [`manifest.webmanifest`](manifest.webmanifest), [`sw.js`](sw.js), [`icon.svg`](icon.svg) | PWA manifest, service worker (offline cache), and app icon. |

## Data Shape

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

## Run the Web App Locally

The web app uses ES modules, so opening `index.html` directly via `file://`
will not work in most browsers. Serve the folder over HTTP:

```powershell
# Python (any recent version)
python -m http.server 8080
# or, with Node
npx serve .
```

Then open <http://localhost:8080/> in your browser.

## URL Scheme

All routes are hash-based, so the page never reloads:

| Route | View |
|-------|------|
| `#/` | Title and table of contents (Books I&ndash;V). |
| `#/psalm/{n}` | A psalm. Multi-setting psalms canonicalise to the first version or part. |
| `#/psalm/{n}/v{V}` | A specific version of a multi-version psalm. |
| `#/psalm/{n}/p{P}` | A specific part (Psalm 119 only at present). |
| `#/psalm/{n}/p{P}/v{V}` | A specific part *and* version (supported, even though no current setting uses both). |
| `#/psalm/{n}/…/s{S}` | Single-stanza view. Click the stanza (or press the **Present** button) to enter full-screen presentation. Arrow keys / left- and right-edge taps move between stanzas; `Esc` exits. |
| `#/psalm/{n}/…?verses=1-3,5` | Filter to the given verses on either of the views above. |
| `#/meters` | Index of meters (excluding Common Meter, which appears in every psalm). |
| `#/first-lines` | Alphabetical index of first lines. |
| `#/concordance` | Letter selector (A&ndash;Z). |
| `#/concordance/{letter}` | Every word starting with that letter, each occurrence cited and shown in its line with the headword abbreviated. Articles, basic conjunctions/prepositions, and auxiliary verbs (incl. archaic forms) are excluded. |
| `#/search?q=…` | Full-text search results for the given query, with matches highlighted. The search box in the header opens a live suggestions panel as you type; Enter (or clicking "See all") goes to the full results page. |

A theme selector (System / Light / Dark) is in the top-right of the header.
The choice is remembered in `localStorage`; System (the default) follows
your OS preference.

## Sources

- Base text taken from: [Scottish Psalter &mdash; Words Only, Digital Edition (Free Church of Scotland, PDF)](https://freechurch.org/wp-content/uploads/2026/05/Scottish-Psalter-Words-Only-Digital-Edition.pdf)
- Also referenced: [1650 Scottish Metrical Psalter (The Westminster Standard)](https://thewestminsterstandard.org/1650-scottish-metrical-psalter/)

## License

[MIT](LICENSE)