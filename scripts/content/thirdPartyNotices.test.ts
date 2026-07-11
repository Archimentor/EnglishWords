import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const noticesPath = resolve(process.cwd(), 'THIRD_PARTY_NOTICES.md')

describe('third-party notices', () => {
  test('preserves the required Korean Wiktionary and ipa-dict license notices', async () => {
    const notices = await readFile(noticesPath, 'utf8')

    expect(notices).toContain('Korean Wiktionary contributors')
    expect(notices).toContain('CC BY-SA 4.0')
    expect(notices).toContain('https://creativecommons.org/licenses/by-sa/4.0/')
    expect(notices).toContain('Copyright (c) 2016 dohliam')
    expect(notices).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy')
    expect(notices).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
  })
})
