# Third-party notices

## CEFR-J Vocabulary Profile 1.5

This product records CEFR evidence from CEFR-J Vocabulary Profile 1.5.

- Attribution: CEFR-J Vocabulary Profile 1.5
- Source: <https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/d4e45b75b38f27b30dfc5c44d8c571aec7e7092f/cefrj-vocabulary-profile-1.5.csv>
- Terms: CEFR-J terms of use

## Korean Wiktionary

The content pipeline is configured to use material from the Korean Wiktionary
dump dated 2026-07-01. The following notice applies to artifacts derived from
that source.

- Attribution: Korean Wiktionary contributors
- Source: <https://dumps.wikimedia.org/kowiktionary/20260701/kowiktionary-20260701-pages-articles.xml.bz2>
- License: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)

The Korean Wiktionary source is made available under CC BY-SA 4.0. Any
redistribution or adaptation of the derived content must preserve appropriate
attribution, link to the license, indicate changes where applicable, and meet
the license's ShareAlike requirements.

## ipa-dict

This product uses pronunciation data from `open-dict-data/ipa-dict`.

- Attribution: open-dict-data/ipa-dict
- Source: <https://github.com/open-dict-data/ipa-dict/tree/43c3570eb3553bdd19fccd2bd0091534889af023>
- License: MIT

MIT License

Copyright (c) 2016 dohliam

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## English frequency ranking

This product records frequency-rank evidence from `filiph/english_words`.

- Attribution: filiph/english_words
- Source: <https://raw.githubusercontent.com/filiph/english_words/4191ae1341c5e3dc640731c20f118746a51e7143/data/word-freq-top5000.csv>
- License: MIT (the MIT notice above applies)

## OPUS Tatoeba English sentences

This product records English example-sentence evidence from OPUS Tatoeba
v2023-04-12.

- Attribution: OPUS Tatoeba v2023-04-12 (J. Tiedemann, 2012; source: Tatoeba Project)
- Source: <https://object.pouta.csc.fi/OPUS-Tatoeba/v2023-04-12/mono/en.txt.gz>
- License: [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/)

## Open Multilingual Wordnet bilingual tables

The word-catalog recovery path joins the following two tables only on exact
Princeton WordNet 3.0 synset identifiers. Polysemous lemma/POS rows are accepted
only when every WordNet synset is translated and the Korean labels converge.

- English attribution: Princeton WordNet 3.0 via Open Multilingual Wordnet
- English source: <https://raw.githubusercontent.com/omwn/omw-data/406bf83b3c507a3d1f26e88252d5d66893fd36bf/wns/eng/wn-data-eng.tab>
- English license: Princeton WordNet 3.0 License (reproduced below)
- Korean attribution: Korean Wiktionary data via Open Multilingual Wordnet
- Korean source: <https://raw.githubusercontent.com/omwn/omw-data/406bf83b3c507a3d1f26e88252d5d66893fd36bf/wns/wikt/wn-wikt-kor.tab>
- Korean license: CC BY-SA (the pinned snapshot header does not specify a version)

## Princeton WordNet 3.0

The checked-in word-family registry records exact derivational sense-key
relationships from Princeton WordNet 3.0. The reproducible validator reads this
commit- and digest-pinned archive:
<https://raw.githubusercontent.com/nltk/nltk_data/550b6625bcef1f2abff2ff770a5a0d272c9c6b2a/packages/corpora/wordnet.zip>.

WordNet Release 3.0

This software and database is being provided to you, the LICENSEE, by Princeton
University under the following license. By obtaining, using and/or copying this
software and database, you agree that you have read, understood, and will comply
with these terms and conditions.

Permission to use, copy, modify and distribute this software and database and
its documentation for any purpose and without fee or royalty is hereby granted,
provided that you agree to comply with the following copyright notice and
statements, including the disclaimer, and that the same appear on ALL copies of
the software, database and documentation, including modifications that you make
for internal use or for distribution.

WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.

THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES
NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT
LIMITATION, PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF
MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE
LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT INFRINGE ANY THIRD PARTY
PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.

The name of Princeton University or Princeton may not be used in advertising or
publicity pertaining to distribution of the software and/or database. Title to
copyright in this software, database and any associated documentation shall at
all times remain with Princeton University and LICENSEE agrees to preserve same.

## WithEnglishWeCan generated English phrasal verbs

This product records English descriptions and examples from the pinned
WithEnglishWeCan/generated-english-phrasal-verbs snapshot used to build the
1,000-item phrasal-verb catalog.

- Attribution: WithEnglishWeCan/generated-english-phrasal-verbs
- Source: <https://raw.githubusercontent.com/WithEnglishWeCan/generated-english-phrasal-verbs/25de2d4421e02e6b58b65ca5f163f3bb3a58e772/phrasal.verbs.build.json>
- License: MIT (declared in the pinned README)

## Phrasal example-alignment model

The English description and source-example pairs in the phrasal-verb catalog
were selected with a pinned sentence-similarity model. The resulting pairs are
machine-aligned drafts, not human editorial approval.

- Model: `sentence-transformers/all-MiniLM-L6-v2`
- Revision: `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`
- Source: <https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/tree/1110a243fdf4706b3f48f1d95db1a4f5529b4d41>
- License: [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)

## Phrasal Korean-gloss translation model

The Korean glosses for the 1,000 phrasal-verb records were generated with a
pinned machine-translation model. They remain machine-generated content and
are not human editorial approval.

- Model: `seongs/ke-t5-base-aihub-koen-translation-integrated-10m-en-to-ko`
- Revision: `280cc2c35ec50579e1534c0493fcdcfdf0c5ece3`
- Source: <https://huggingface.co/seongs/ke-t5-base-aihub-koen-translation-integrated-10m-en-to-ko/tree/280cc2c35ec50579e1534c0493fcdcfdf0c5ece3>
- License: [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)

## compromise

The vocabulary build pipeline uses the pinned `compromise` English NLP
package for inflection and part-of-speech ranking.

- Source: <https://github.com/spencermountain/compromise>
- Version: `14.16.0`
- License: MIT (the MIT notice above applies)

## wink-pos-tagger

The content pipeline uses the pinned `wink-pos-tagger` package as an
independent Penn Treebank part-of-speech signal for ambiguous word forms and
phrasal-verb example verification.

- Source: <https://github.com/winkjs/wink-pos-tagger>
- Version: `2.2.2`
- Copyright: 2017-18 GRAYPE Systems Private Limited
- License: MIT (the MIT notice above applies)

## React and React DOM

This product includes React and React DOM.

- Source: <https://github.com/facebook/react>
- License: MIT

MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
