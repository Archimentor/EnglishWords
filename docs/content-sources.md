# Content source provenance

The production vocabulary catalog is built offline from the four pinned source
snapshots below. Downloads are written only to `.content-cache/`, which is
ignored by Git. The build pipeline must verify every downloaded file against
the recorded SHA-256 digest before parsing it.

| ID | Purpose | Attribution | License | Pinned download |
| --- | --- | --- | --- | --- |
| `cefrj` | CEFR level evidence | CEFR-J Vocabulary Profile 1.5 | CEFR-J terms of use | [CSV](https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv) |
| `korean-wiktionary` | Korean glosses and lexical forms | Korean Wiktionary via Wiktextract/Kaikki | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [JSONL gzip](https://kaikki.org/dictionary/downloads/ko/ko-extract.jsonl.gz) |
| `frequency` | Frequency ranking | filiph/english_words | [MIT](https://github.com/filiph/english_words/blob/master/LICENSE) | [CSV](https://raw.githubusercontent.com/filiph/english_words/master/data/word-freq-top5000.csv) |
| `tatoeba-english` | English example sentences | Tatoeba Project | [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/) | [TSV bzip2](https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2) |

The exact URL, cache filename, and SHA-256 digest live in
[`scripts/content/sources.ts`](../../scripts/content/sources.ts). Attribution
and license obligations remain attached to the generated catalog's provenance
manifest and accompanying documentation.
