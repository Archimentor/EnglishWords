# Content source provenance

The release word and phrasal-verb pipelines use the nine pinned source
snapshots below. Downloads are written only to `.content-cache/`, which is
ignored by Git, and every downloaded file must match its recorded SHA-256
digest before a build step may parse it. The generated manifests under
`public/data/provenance/` record which inputs and processing models produced
each checked-in catalog. Run `npm run content:report` to inspect the local
cache and verification state.

| ID | Purpose | Attribution | License | Pinned download | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `cefrj` | CEFR level evidence | CEFR-J Vocabulary Profile 1.5 | CEFR-J terms of use | [commit-pinned CSV](https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/d4e45b75b38f27b30dfc5c44d8c571aec7e7092f/cefrj-vocabulary-profile-1.5.csv) | `b0dd3c635f1c9a4fdf1490c7e5b7c48e8bbe55b652ad0c9860a95f98e10ae498` |
| `korean-wiktionary` | Korean glosses and lexical forms | Korean Wiktionary contributors via Wikimedia Dumps | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [2026-07-01 Wikimedia XML bzip2](https://dumps.wikimedia.org/kowiktionary/20260701/kowiktionary-20260701-pages-articles.xml.bz2) | `190f1b94870c5a09f3006f2d61d10da4d4997e5c968f4491186215c2e33b460e` |
| `frequency` | Frequency ranking | filiph/english_words | [MIT](https://github.com/filiph/english_words/blob/master/LICENSE) | [commit-pinned CSV](https://raw.githubusercontent.com/filiph/english_words/4191ae1341c5e3dc640731c20f118746a51e7143/data/word-freq-top5000.csv) | `87a73f5bca66862983dd430ba5d37129706f761291b433d33fcac8de117f66fc` |
| `tatoeba-english` | English example sentences | OPUS Tatoeba v2023-04-12 (J. Tiedemann, 2012; source: Tatoeba Project) | [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/) | [versioned English text gzip](https://object.pouta.csc.fi/OPUS-Tatoeba/v2023-04-12/mono/en.txt.gz) | `a32c5500cd76b9479859764fb78537a4b9b53fab8fa3bdc0fc04dd70f28bf29b` |
| `ipa-dict` | Verified English IPA pronunciations | open-dict-data/ipa-dict (MIT; third-party credit) | [MIT](https://github.com/open-dict-data/ipa-dict/blob/43c3570eb3553bdd19fccd2bd0091534889af023/LICENSE) | [commit-pinned en_US text](https://raw.githubusercontent.com/open-dict-data/ipa-dict/43c3570eb3553bdd19fccd2bd0091534889af023/data/en_US.txt) | `2af6f154a5c363275f052d1f85acedef38ed185ca9745aa4314be77f6b70de67` |
| `omw-english-wordnet` | English lemma-to-PWN-synset coordinates for bilingual recovery | Princeton WordNet 3.0 via Open Multilingual Wordnet | Princeton WordNet 3.0 License | [commit-pinned OMW table](https://raw.githubusercontent.com/omwn/omw-data/406bf83b3c507a3d1f26e88252d5d66893fd36bf/wns/eng/wn-data-eng.tab) | `d1409d88addcdb890b1606dd280b558cca4258b1f33bd580d54ed949daad1ede` |
| `omw-korean-wiktionary` | Korean lemmas joined only by exact PWN synset coordinates | Korean Wiktionary data via Open Multilingual Wordnet | CC BY-SA (snapshot header; version unspecified) | [commit-pinned OMW table](https://raw.githubusercontent.com/omwn/omw-data/406bf83b3c507a3d1f26e88252d5d66893fd36bf/wns/wikt/wn-wikt-kor.tab) | `50134a5fa559130cba7cb3fa1f14c3a67ed05cafd6fdf59e7603d4230a92571f` |
| `wordnet-3.0` | Exact derivational sense-key evidence for the word-family registry | Princeton WordNet 3.0 | Princeton WordNet 3.0 License | [commit-pinned NLTK archive](https://raw.githubusercontent.com/nltk/nltk_data/550b6625bcef1f2abff2ff770a5a0d272c9c6b2a/packages/corpora/wordnet.zip) | `cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59` |
| `phrasal-verbs` | English descriptions and examples for the 1,000 phrasal-verb catalog items | WithEnglishWeCan/generated-english-phrasal-verbs | MIT (declared in the pinned README) | [commit-pinned JSON](https://raw.githubusercontent.com/WithEnglishWeCan/generated-english-phrasal-verbs/25de2d4421e02e6b58b65ca5f163f3bb3a58e772/phrasal.verbs.build.json) | `880f113bd1ee7983fba81d0ae5bc804a7242e2d1c51b5f34cee202f73bb5f8f6` |

The exact URL, cache filename, and SHA-256 digest live in
[`scripts/content/sources.ts`](../scripts/content/sources.ts). Before content
derived from a source is released, the build must record that source in a
provenance manifest and add its applicable attribution and license terms to
the [third-party notices](../THIRD_PARTY_NOTICES.md) and accompanying
documentation.

## Word recovery and family evidence

The bilingual recovery path joins the two OMW tables only by exact Princeton
WordNet 3.0 offset/POS identifiers. It accepts a lemma/POS when it has one PWN
synset, or when every PWN synset has a Korean row and those rows share a Korean
label. It does not treat surface co-occurrence as sense evidence. Every released
OMW entry also requires IPA evidence and two globally unique, POS-matched
Tatoeba lines. Before those two release lines are allocated, the candidate must
have a five-sentence POS-matched source buffer. Its provenance records every
accepted synset coordinate and the two selected source-line coordinates.

For age-band allocation, safe source-labelled A1 family heads fill kindergarten
first. Only a remaining quota gap may use safe source-labelled A2 heads, in the
same frequency/lemma order. B1, B2, unrated, and every lemma, meaning, or example
matched by the sensitive-topic policy remain ineligible for that fallback.

The canonical family registry is checked in at
`src/domain/content/wordFamilySourceRegistry.ts`. Its generated relationships
have status `source-verified`, while the three explicit maintainer decisions
have status `maintainer-curated`; neither status claims a separate human
editorial review. Runtime suffix stripping and stemming are not used. Run
`npm run content:validate:families` to verify all recorded sense-key pairs
against the digest-pinned WordNet archive and to recheck component connectivity
and global member ownership.

## Canonical phrasal registry and candidate generation

`scripts/content/phrasal-glosses.json` is the single release source of truth for
all 1,000 phrasal verbs. Its schema-v5 rows bind an explicit English definition,
Korean draft, two same-sense examples, a stable sense hash, and exact per-example
provenance. The registry contains no unresolved `same as ...` definitions and no
unlabelled similarity-ranking claims. All rows were exhaustively machine-assisted
audited in three non-overlapping shards; 617 retained exact source pairs and 383
received definition-conditioned editorial draft pairs. This is not evidence of
human editorial approval, and every row preserves that status explicitly.

| Item | Value |
| --- | --- |
| Model | [`seongs/ke-t5-base-aihub-koen-translation-integrated-10m-en-to-ko`](https://huggingface.co/seongs/ke-t5-base-aihub-koen-translation-integrated-10m-en-to-ko/tree/280cc2c35ec50579e1534c0493fcdcfdf0c5ece3) |
| Revision | `280cc2c35ec50579e1534c0493fcdcfdf0c5ece3` |
| Recorded license | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) |
| Candidate output | `.content-cache/phrasal-gloss-candidates.json` |

| Alignment item | Value |
| --- | --- |
| Model | [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/tree/1110a243fdf4706b3f48f1d95db1a4f5529b4d41) |
| Revision | `1110a243fdf4706b3f48f1d95db1a4f5529b4d41` |
| Recorded license | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) |
| Candidate method | Mean-pooled cosine similarity with pair-heavy ranking; this proposes schema-v4 candidates only and cannot overwrite the release registry |

The two model revisions are deliberately recorded separately from the nine
source snapshots: they are processing tools, not additional lexical sources.
The final schema-v5 registry retains those model coordinates as historical
candidate provenance while recording whether each released pair came from an
exact source coordinate or a definition-conditioned editorial draft. The four
story files are approved manual inputs with `isManual: true`. Each keeps the
connected `storyText` narrative separate from the full-coverage
`vocabularyPracticeText` scenes. Their reviewer, review timestamp, and exact
whole-payload source digest are recorded in the single
`scripts/content/manual-stories` input path and are enforced by
`npm run validate:release`; changing an approved payload requires renewed human
approval.

Every phrasal example must pass both the `compromise` and
`wink-pos-tagger`-backed verb/particle syntax checks, including inflected and
separable forms. Retained examples point either to the exact source object and
example index or to an exact line-pinned Tatoeba record. Replaced examples are
marked `definition-conditioned-machine-generated` and may appear only on an
editorial-correction row. The builder verifies these relationships against the
pinned caches and fails closed on stale coordinates, mixed provenance, unsafe
content, duplicates, or a sense-hash mismatch.

## Reproducing the checked-in catalogs

The complete regeneration path is explicit because `npm run content:build`
reuses the checked-in phrasal-gloss manifest; it does not download models or
translate glosses by itself.

```powershell
npm run content:fetch
npm run content:report
npm run content:validate:families
npm run content:build
```

The checked-in schema-v5 registry is intentionally the only release input. To
produce a new, non-release candidate set for a future exhaustive audit, run:

```powershell
python -m pip install -r scripts/content/requirements-content.txt
npm run content:prepare:phrasals
npm run content:propose:phrasals
```

That optional command writes only
`.content-cache/phrasal-gloss-candidates.json`; it never modifies the canonical
registry. Promoting a candidate requires a new complete audit with explicit
definitions, examples, origins, and unresolved-row count zero.

`npm run content:build` first assembles and validates the complete word,
phrasal-verb, story, grammar, and provenance generation in memory. It then
promotes all generated files as one bounded transaction. A validation or
mid-commit failure restores the previous checked-in artifacts byte-for-byte
and removes temporary transaction files, preventing mixed content generations.

The optional Python proposal step downloads the two revision-pinned model
snapshots into `.content-cache/models/` and writes its candidate atomically.
The TypeScript release builder accepts only canonical schema v5 and rejects the
wrong model revisions, unsafe or duplicate examples, non-verbal occurrences,
unresolved cross-references, stale source coordinates, inconsistent generation
origins, and invalid sense hashes. Machine assistance remains a draft even when
every structural check passes.

The metadata contract accepts only GitHub raw URLs that embed a 40-character
commit, dated Wikimedia dump URLs whose path and filename carry the same dump
date, and versioned OPUS Tatoeba releases. Branch names, `latest` paths, and
undated rolling exports are deliberately rejected.
