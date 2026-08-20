import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const noticesPath = resolve(process.cwd(), 'THIRD_PARTY_NOTICES.md')

describe('third-party notices', () => {
  test('preserves the pinned source and translation-model notices', async () => {
    const notices = await readFile(noticesPath, 'utf8')

    expect(notices).toContain('Korean Wiktionary contributors')
    expect(notices).toContain('CC BY-SA 4.0')
    expect(notices).toContain('https://creativecommons.org/licenses/by-sa/4.0/')
    expect(notices).toContain('Copyright (c) 2016 dohliam')
    expect(notices).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy')
    expect(notices).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
    expect(notices).toContain('CEFR-J Vocabulary Profile 1.5')
    expect(notices).toContain('filiph/english_words')
    expect(notices).toContain('OPUS Tatoeba v2023-04-12')
    expect(notices).toContain('CC BY 2.0 FR')
    expect(notices).toContain('Open Multilingual Wordnet bilingual tables')
    expect(notices).toContain('406bf83b3c507a3d1f26e88252d5d66893fd36bf')
    expect(notices).toContain('Korean license: CC BY-SA (the pinned snapshot header does not specify a version)')
    expect(notices).toContain('Princeton WordNet 3.0')
    expect(notices).toContain('WordNet 3.0 Copyright 2006 by Princeton University')
    expect(notices).toContain('550b6625bcef1f2abff2ff770a5a0d272c9c6b2a')
    expect(notices).toContain('WithEnglishWeCan/generated-english-phrasal-verbs')
    expect(notices).toContain('wink-pos-tagger')
    expect(notices).toContain('GRAYPE Systems Private Limited')
    expect(notices).toContain('seongs/ke-t5-base-aihub-koen-translation-integrated-10m-en-to-ko')
    expect(notices).toContain('280cc2c35ec50579e1534c0493fcdcfdf0c5ece3')
    expect(notices).toContain('sentence-transformers/all-MiniLM-L6-v2')
    expect(notices).toContain('1110a243fdf4706b3f48f1d95db1a4f5529b4d41')
    expect(notices).toContain('compromise')
    expect(notices).toContain('14.16.0')
    expect(notices).toContain('Apache-2.0')
    expect(notices).toContain('React and React DOM')
    expect(notices).toContain('Copyright (c) Meta Platforms, Inc. and affiliates.')
  })
})
