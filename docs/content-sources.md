# Content source provenance

The production vocabulary catalog is built offline from the four pinned source
snapshots below. Downloads are written only to `.content-cache/`, which is
ignored by Git. The build pipeline must verify every downloaded file against
the recorded SHA-256 digest before parsing it.

| ID | Purpose | Attribution | License | Pinned download | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `cefrj` | CEFR level evidence | CEFR-J Vocabulary Profile 1.5 | CEFR-J terms of use | [commit-pinned CSV](https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/d4e45b75b38f27b30dfc5c44d8c571aec7e7092f/cefrj-vocabulary-profile-1.5.csv) | `b0dd3c635f1c9a4fdf1490c7e5b7c48e8bbe55b652ad0c9860a95f98e10ae498` |
| `korean-wiktionary` | Korean glosses and lexical forms | Korean Wiktionary contributors via Wikimedia Dumps | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [2026-07-01 Wikimedia XML bzip2](https://dumps.wikimedia.org/kowiktionary/20260701/kowiktionary-20260701-pages-articles.xml.bz2) | `190f1b94870c5a09f3006f2d61d10da4d4997e5c968f4491186215c2e33b460e` |
| `frequency` | Frequency ranking | filiph/english_words | [MIT](https://github.com/filiph/english_words/blob/master/LICENSE) | [commit-pinned CSV](https://raw.githubusercontent.com/filiph/english_words/4191ae1341c5e3dc640731c20f118746a51e7143/data/word-freq-top5000.csv) | `87a73f5bca66862983dd430ba5d37129706f761291b433d33fcac8de117f66fc` |
| `tatoeba-english` | English example sentences | OPUS Tatoeba v2023-04-12 (J. Tiedemann, 2012; source: Tatoeba Project) | [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/) | [versioned English text gzip](https://object.pouta.csc.fi/OPUS-Tatoeba/v2023-04-12/mono/en.txt.gz) | `a32c5500cd76b9479859764fb78537a4b9b53fab8fa3bdc0fc04dd70f28bf29b` |

The exact URL, cache filename, and SHA-256 digest live in
[`scripts/content/sources.ts`](../../scripts/content/sources.ts). Attribution
and license obligations remain attached to the generated catalog's provenance
manifest and accompanying documentation.

The metadata contract accepts only GitHub raw URLs that embed a 40-character
commit, dated Wikimedia dump URLs whose path and filename carry the same dump
date, and versioned OPUS Tatoeba releases. Branch names, `latest` paths, and
undated rolling exports are deliberately rejected.
