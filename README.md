# Scottish Metrical Psalter (1650)

The complete 1650 Scottish Metrical Psalter as structured JSON, with a small
PowerShell script that renders it into a printable Markdown book and a
browser-side single-page app that reads the JSON directly.

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
| [`build-psalter.ps1`](build-psalter.ps1) | Renders `psalter.json` into [`psalter.md`](psalter.md). |
| [`psalter.md`](psalter.md) | Generated output: the full psalter as Markdown with a table of contents and one page per psalm. |
| [`index.html`](index.html), [`app.js`](app.js), [`style.css`](style.css) | The browser app. Static files, no build step, no framework. |

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

## Rebuild the Markdown

```powershell
.\build-psalter.ps1
```

The script:

- groups settings by psalm,
- emits a table of contents partitioned into the five traditional books of the Psalter (Psalms 1&ndash;41, 42&ndash;72, 73&ndash;89, 90&ndash;106, 107&ndash;150),
- renders one page per psalm using a CSS `page-break-after` div, with the inscription italicised at the top and each version or part underneath with its meter and stanzas,
- appends a "Back to Top" link at the end of every psalm.

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

A theme selector (System / Light / Dark) is in the top-right of the header.
The choice is remembered in `localStorage`; System (the default) follows
your OS preference.

## Sources

- Base text taken from: [Scottish Psalter &mdash; Words Only, Digital Edition (Free Church of Scotland, PDF)](https://freechurch.org/wp-content/uploads/2026/05/Scottish-Psalter-Words-Only-Digital-Edition.pdf)
- Also referenced: [1650 Scottish Metrical Psalter (The Westminster Standard)](https://thewestminsterstandard.org/1650-scottish-metrical-psalter/)

## License

[MIT](LICENSE)
