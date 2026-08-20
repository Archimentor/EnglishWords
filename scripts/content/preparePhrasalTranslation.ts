import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  PHRASAL_ALIGNMENT_MODEL,
  PHRASAL_PREPARED_CANDIDATE_COUNT,
  PHRASAL_TRANSLATION_MODEL,
  PINNED_PHRASAL_ALIGNMENTS,
  REQUIRED_PHRASAL_PHRASES,
  readPinnedPhrasalRecovery,
  selectPhrasalSources,
} from './phrasalSource'
import { MACHINE_ASSISTED_SAME_AS_GLOSSES } from './phrasalGlossOverrides'
import { requireVerifiedContentSourceCaches } from './fetchSources'
import { formsFor } from './buildWordCatalog'

export async function preparePhrasalTranslation(cacheRoot = '.content-cache'): Promise<void> {
  await requireVerifiedContentSourceCaches([
    'phrasal-verbs',
    'ipa-dict',
    'frequency',
    'cefrj',
    'tatoeba-english',
  ], cacheRoot)
  const [rawSource, ipaSource, frequencySource, cefrSource, recoveryExamples] = await Promise.all([
    readFile(`${cacheRoot}/generated-english-phrasal-verbs.json`, 'utf8').then(JSON.parse),
    readFile(`${cacheRoot}/ipa-dict-en_US.txt`, 'utf8'),
    readFile(`${cacheRoot}/word-freq-top5000.csv`, 'utf8'),
    readFile(`${cacheRoot}/cefrj-vocabulary-profile-1.5.csv`, 'utf8'),
    readPinnedPhrasalRecovery(`${cacheRoot}/opus-tatoeba-v2023-04-12-en.txt.gz`),
  ])
  const phrases = selectPhrasalSources({
    rawSource,
    ipaSource,
    frequencySource,
    cefrSource,
    count: PHRASAL_PREPARED_CANDIDATE_COUNT,
    requiredPhrases: [...new Set([
      ...REQUIRED_PHRASAL_PHRASES,
      ...Object.keys(PINNED_PHRASAL_ALIGNMENTS),
    ])],
    recoveryExamples,
  })
  const candidatesByPhrase = new Map(phrases.map((candidate) => [candidate.phrase, candidate]))
  const sameAsGlossOverrides = Object.entries(MACHINE_ASSISTED_SAME_AS_GLOSSES).flatMap(([
    phrase,
    override,
  ]) => {
    const candidate = candidatesByPhrase.get(phrase)
    if (!candidate || !candidate.descriptions.includes(override.englishDescription)) return []
    return [{ phrase, ...override }]
  })
  await writeFile(`${cacheRoot}/phrasal-translation-input.json`, `${JSON.stringify({
    schemaVersion: '3.0.0',
    alignmentModel: PHRASAL_ALIGNMENT_MODEL,
    translationModel: PHRASAL_TRANSLATION_MODEL,
    targetCount: 1_000,
    requiredPhrases: REQUIRED_PHRASAL_PHRASES,
    alignmentOverrides: Object.entries(PINNED_PHRASAL_ALIGNMENTS).map(([
      phrase,
      alignment,
    ]) => ({
      phrase,
      englishDescription: alignment.englishDescription,
      examples: alignment.examples,
    })),
    sameAsGlossOverrides,
    phrases: phrases.map(({ phrase, baseVerb, descriptions, candidateExamples }) => ({
      phrase,
      verbForms: [...new Set(Object.values(formsFor(baseVerb, 'verb')).flat())],
      descriptions,
      examples: candidateExamples,
    })),
  }, null, 2)}\n`, 'utf8')
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  await preparePhrasalTranslation()
}
