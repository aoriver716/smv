# Scottish Metrical Psalter (1650)

The complete 1650 Scottish Metrical Psalter as structured JSON, with a small
PowerShell script that renders it into a printable Markdown book.

## Contents

| File | What it is |
|------|------------|
| [`psalter.json`](psalter.json) | The complete psalter as JSON &mdash; the source of truth. One entry per *setting* (a psalm has one or more settings to accommodate alternate versions or parts). |
| [`build-psalter.ps1`](build-psalter.ps1) | Renders `psalter.json` into [`psalter.md`](psalter.md). |
| [`psalter.md`](psalter.md) | Generated output: the full psalter as Markdown with a table of contents and one page per psalm. |

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

## Sources

- Base text taken from: [Scottish Psalter &mdash; Words Only, Digital Edition (Free Church of Scotland, PDF)](https://freechurch.org/wp-content/uploads/2026/05/Scottish-Psalter-Words-Only-Digital-Edition.pdf)
- Also referenced: [1650 Scottish Metrical Psalter (The Westminster Standard)](https://thewestminsterstandard.org/1650-scottish-metrical-psalter/)

## License

[MIT](LICENSE)
