import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const stylesDirectory = resolve(process.cwd(), 'src/styles')

describe('CSS custom property contracts', () => {
  test('every var() reference without a fallback names a defined custom property', () => {
    const files = readdirSync(stylesDirectory)
      .filter((file) => file.endsWith('.css'))
      .sort()
    const sources = files.map((file) => ({
      file,
      source: readFileSync(resolve(stylesDirectory, file), 'utf8'),
    }))
    const definitions = new Set(
      sources.flatMap(({ source }) =>
        [...source.matchAll(/(--[\w-]+)\s*:/gu)].map((match) => match[1]!)),
    )
    const undefinedReferences = sources.flatMap(({ file, source }) =>
      [...source.matchAll(/var\(\s*(--[\w-]+)\s*\)/gu)]
        .map((match) => match[1]!)
        .filter((property) => !definitions.has(property))
        .map((property) => `${file}: ${property}`),
    )

    expect(undefinedReferences).toEqual([])
  })
})
