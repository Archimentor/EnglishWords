import { makeCatalog } from '../../test/fixtures'
import { validateCatalog } from './validation'

describe('validateCatalog', () => {
  test('개발 모드에서 유효한 카탈로그를 허용한다', () => {
    expect(validateCatalog(makeCatalog(), 'development')).toEqual([])
  })

  test('뒤 레벨에서 다시 등장한 lemma를 거부한다', () => {
    const issues = validateCatalog(makeCatalog({ duplicateLemma: 'play' }), 'development')

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_LEMMA',
        path: 'wordlists.유치원[0].lemma',
      }),
    )
  })

  test('나중에 등장한 중복 단어 ID를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          유치원: { id: 'word-play' },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'DUPLICATE_ID',
        path: 'wordlists.유치원[0].id',
      }),
    )
  })

  test('대표 단어가 없는 word family를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: { isFamilyHead: false },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(expect.objectContaining({ code: 'FAMILY_HEAD_COUNT' }))
  })

  test('대표 단어가 둘인 word family를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          유치원: { familyId: 'family-play' },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(expect.objectContaining({ code: 'FAMILY_HEAD_COUNT' }))
  })

  test('뜻이 없는 품사 entry를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: { entryOverrides: { meanings: [] } },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'EMPTY_MEANINGS',
        path: 'wordlists.기초[0].entries[0].meanings',
      }),
    )
  })

  test('예문이 두 개보다 적은 품사 entry를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: { entryOverrides: { examples: ['I play outside.'] } },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'EXAMPLES_TOO_FEW',
        path: 'wordlists.기초[0].entries[0].examples',
      }),
    )
  })

  test('공백뿐인 IPA를 거부한다', () => {
    const issues = validateCatalog(
      makeCatalog({
        wordOverrides: {
          기초: { entryOverrides: { ipa: '   ' } },
        },
      }),
      'development',
    )

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_IPA',
        path: 'wordlists.기초[0].entries[0].ipa',
      }),
    )
  })

  test.each([
    ['null', null, 'catalog'],
    ['배열', [], 'catalog'],
    ['wordlists 누락', {}, 'wordlists'],
  ])('%s 입력에서 예외 대신 INVALID_CATALOG를 반환한다', (_name, catalog, path) => {
    expect(() => validateCatalog(catalog, 'development')).not.toThrow()
    expect(validateCatalog(catalog, 'development')).toContainEqual(
      expect.objectContaining({ code: 'INVALID_CATALOG', path }),
    )
  })

  test('형태가 잘못된 단어에서 정확한 경로의 INVALID_CATALOG를 반환한다', () => {
    const validCatalog = makeCatalog()
    const malformedCatalog = {
      ...validCatalog,
      wordlists: {
        ...validCatalog.wordlists,
        기초: [{ ...validCatalog.wordlists.기초[0]!, id: 42 }],
      },
    }

    expect(() => validateCatalog(malformedCatalog, 'development')).not.toThrow()
    expect(validateCatalog(malformedCatalog, 'development')).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_CATALOG',
        path: 'wordlists.기초[0].id',
      }),
    )
  })
})
