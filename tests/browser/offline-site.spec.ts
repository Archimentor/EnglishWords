import {
  expect,
  test,
  type ConsoleMessage,
  type Locator,
  type Page,
} from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import {
  findCssResourceReferences,
  findOfflineResourceReferences,
  isAllowedOfflineResourceReference,
  OFFLINE_CONTENT_SECURITY_POLICY,
} from '../../scripts/offline-build'
import { STORAGE_KEY } from '../../src/state/persistence'

function captureBrowserFailures(page: Page): () => void {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`)
  })

  return () => expect(failures).toEqual([])
}

async function expectNoExternalResourceReferences(page: Page): Promise<void> {
  const snapshot = await page.evaluate(() => ({
    html: document.documentElement.outerHTML,
    styleSheetRules: [...document.styleSheets].flatMap((styleSheet) => {
      try {
        return [...styleSheet.cssRules].map((rule) => rule.cssText)
      } catch {
        return ['<inaccessible stylesheet>']
      }
    }),
  }))
  const parsed = new JSDOM(snapshot.html)
  try {
    const references = [
      ...findOfflineResourceReferences(parsed.window.document),
      ...snapshot.styleSheetRules.flatMap((css, index) =>
        findCssResourceReferences(css).map((value) => ({
          location: `document.styleSheets[${index}]`,
          value,
        })),
      ),
    ]
    expect(
      references.filter(
        (reference) => !isAllowedOfflineResourceReference(reference.value),
      ),
    ).toEqual([])
    expect(snapshot.styleSheetRules).not.toContain('<inaccessible stylesheet>')
  } finally {
    parsed.window.close()
  }
}

async function expectNoViewportOverflow(page: Page): Promise<void> {
  const overflowing = await page.evaluate(() =>
    [document.documentElement, document.body, document.querySelector('#root')]
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        name: element.tagName.toLowerCase() + (element.id ? `#${element.id}` : ''),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
  )

  expect(overflowing).toEqual([])
}

async function tabUntilFocused(
  page: Page,
  target: Locator,
  direction: 'forward' | 'backward' = 'forward',
  maximumPresses = 60,
): Promise<void> {
  const key = direction === 'forward' ? 'Tab' : 'Shift+Tab'

  for (let index = 0; index < maximumPresses; index += 1) {
    await page.keyboard.press(key)
    if (await target.evaluate((element) => element === document.activeElement)) return
  }

  throw new Error(
    `Keyboard focus did not reach the target after ${maximumPresses} ${key} presses.`,
  )
}

async function exerciseGrammarSmoke(page: Page): Promise<void> {
  await page.getByRole('button', { name: '문법', exact: true }).click()
  await expect(page.getByRole('heading', { name: '문법 학습' })).toBeVisible()
  await page
    .getByRole('navigation', { name: '문법 레벨' })
    .getByRole('button', { name: 'A1', exact: true })
    .click()
  await page.getByRole('button', { name: /^A1-G01 .*학습 가능/u }).click()
  await expect(page.getByRole('heading', { name: /^A1-G01 /u })).toBeVisible()
  await expect(page.getByRole('heading', { name: '문법 개념' })).toBeVisible()
  await expect(page.getByRole('list', { name: '이 문법 노드의 관련 단어' })).toBeVisible()

  const diagnostic = page.locator('.grammar-exercise[data-phase="diagnostic"]')
  await diagnostic.getByRole('radio', { name: 'The soup smells wonderful.' }).click()
  await diagnostic.getByRole('button', { name: '채점하기' }).click()
  await expect(diagnostic.getByText('정답입니다.', { exact: true })).toBeVisible()
  await expectNoViewportOverflow(page)
}

test('HTTP preview renders the core learning journey without browser failures', async ({ page }) => {
  test.setTimeout(60_000)
  const assertNoBrowserFailures = captureBrowserFailures(page)

  await page.goto('/')
  await expect(page).toHaveTitle('영단어 5000 마스터')
  await expect(page.getByRole('heading', { name: '기초 학습 대시보드' })).toBeVisible()
  await expectNoViewportOverflow(page)

  await page.getByRole('button', { name: '단어장' }).click()
  await expect(page.getByRole('heading', { name: '기초 단어장' })).toBeVisible()
  await page.getByRole('searchbox', { name: '단어 검색' }).fill('wake up')
  await expect(page.getByRole('rowheader', { name: 'wake up', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '소설', exact: true }).click()
  await expect(page.locator('.view--story')).toBeVisible()
  const storyWord = page.getByRole('button', { name: /^story word:/u }).first()
  await storyWord.click()
  await expect(page.locator('#story-word-detail')).toBeVisible()
  const closeStoryDetail = page.getByRole('button', { name: '닫기', exact: true })
  await expect(closeStoryDetail).toBeFocused()
  await expectNoViewportOverflow(page)
  await closeStoryDetail.click()
  await expect(storyWord).toBeFocused()

  await page.getByText(/^일반 단어 확장 장면 · 전체/u).click()
  const practiceWord = page
    .locator('.story-practice:not(.story-phrasal-practice)')
    .getByRole('button', { name: /^story word:/u })
    .first()
  await practiceWord.click()
  await expect(page.locator('#story-word-detail')).toBeVisible()
  await page.getByRole('button', { name: '닫기', exact: true }).click()

  await expect(page.getByText('통합 단어장 750 / 750', { exact: true })).toBeVisible()
  await page.getByText('구동사 확장 장면 · 전체 250개', { exact: true }).click()
  const phrasalVerb = page.getByRole('button', {
    name: 'story phrasal verb: wake up',
    exact: true,
  })
  await phrasalVerb.click()
  await expect(page.getByRole('heading', { name: 'wake up 구동사 상세' })).toBeVisible()
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(phrasalVerb).toBeFocused()

  await exerciseGrammarSmoke(page)

  await page.getByRole('button', { name: '학습', exact: true }).click()
  await expect(page.getByRole('heading', { name: '학습 레벨 선택' })).toBeVisible()
  await page
    .getByRole('navigation', { name: '학습 레벨 메뉴' })
    .getByRole('button', { name: '기초', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '기초 플래시카드 학습' })).toBeVisible()
  const firstCard = page.getByRole('button', { name: / 카드 뒤집기$/u }).first()
  await firstCard.click()
  await expect(firstCard).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '어려움', exact: true }).click()
  await expect(page.getByRole('button', { name: '어려움', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '기억했어요' }).click()
  const restoredCardName = await page
    .getByRole('button', { name: / 카드 뒤집기$/u })
    .first()
    .getAttribute('aria-label')

  await page.reload()
  await expect(page.getByRole('heading', { name: '기초 플래시카드 학습' })).toBeVisible()
  await expect(page.getByRole('button', { name: '어려움', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  if (!restoredCardName) throw new Error('Expected the current study card label to persist.')
  await expect(page.getByRole('button', { name: restoredCardName, exact: true })).toBeVisible()
  await expectNoViewportOverflow(page)

  await page.getByRole('button', { name: '퀴즈', exact: true }).click()
  await expect(page.getByRole('heading', { name: '퀴즈 레벨 선택' })).toBeVisible()
  await page
    .getByRole('navigation', { name: '퀴즈 레벨 메뉴' })
    .getByRole('button', { name: '기초', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '퀴즈 유형 선택' })).toBeVisible()
  await page.getByRole('button', { name: '짧은 문장 변환' }).click()
  await expect(page.getByRole('heading', { name: '퀴즈', exact: true })).toBeVisible()

  for (let index = 0; index < 10; index += 1) {
    const prompt = page.getByTestId('quiz-prompt')
    const promptText = await prompt.textContent()
    await page.getByRole('textbox', { name: '답안' }).fill('__browser_wrong_answer__')
    await page.getByRole('button', { name: '정답 확인' }).click()
    await expect(page.locator('.quiz-feedback[data-state="incorrect"]')).toBeVisible()
    await expect(prompt).toHaveText(promptText ?? '')

    const nextLabel = index === 9 ? '결과 보기' : '다음문제'
    const nextButton = page.getByRole('button', { name: nextLabel, exact: true })
    await expect(nextButton).toBeEnabled()
    await nextButton.click()
  }

  await expect(page.getByRole('heading', { name: '퀴즈 결과' })).toBeVisible()
  await expect(page.getByText('정답률 0%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '틀린 단어 다시 학습' }).click()
  await expect(page.getByText('오답 집중 복습')).toBeVisible()
  await expect(page.locator('.view--study[data-mode="mistakes"]')).toBeVisible()
  await expectNoViewportOverflow(page)
  assertNoBrowserFailures()
})

test('root file index supports the core journey with keyboard input only', async ({ page }) => {
  const assertNoBrowserFailures = captureBrowserFailures(page)
  const offlineIndex = pathToFileURL(resolve('index.html')).href

  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('opaque origin', 'SecurityError')
      },
    })
  })
  await page.goto(offlineIndex)
  await expect(page.getByRole('heading', { name: '기초 학습 대시보드' })).toBeVisible()
  await expectNoViewportOverflow(page)

  // This scenario intentionally performs every interaction through keyboard events.
  const skipLink = page.getByRole('link', { name: '본문으로 건너뛰기' })
  await tabUntilFocused(page, skipLink)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()

  const levelMenu = page.getByRole('navigation', { name: '레벨 메뉴' })
  const wordbookMenu = levelMenu.getByRole('button', { name: '단어장', exact: true })
  await page.keyboard.press('Shift+Tab')
  await expect(wordbookMenu).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '기초 단어장' })).toBeVisible()

  const search = page.getByRole('searchbox', { name: '단어 검색' })
  await tabUntilFocused(page, search)
  await page.keyboard.type('wake up')
  await expect(page.getByRole('rowheader', { name: 'wake up', exact: true })).toBeVisible()

  const storyMenu = levelMenu.getByRole('button', { name: '소설', exact: true })
  await tabUntilFocused(page, storyMenu, 'backward')
  await page.keyboard.press('Enter')
  await expect(page.locator('.view--story')).toBeVisible()
  const storyWord = page.getByRole('button', { name: /^story word:/u }).first()
  await tabUntilFocused(page, storyWord)
  await page.keyboard.press('Enter')
  const closeStoryDetail = page.getByRole('button', { name: '닫기', exact: true })
  await expect(closeStoryDetail).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(storyWord).toBeFocused()

  const primaryMenu = page.getByRole('navigation', { name: '주 메뉴' })
  const studyMenu = primaryMenu.getByRole('button', { name: '학습', exact: true })
  await tabUntilFocused(page, studyMenu, 'backward')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '학습 레벨 선택' })).toBeVisible()
  const studyLevel = page
    .getByRole('navigation', { name: '학습 레벨 메뉴' })
    .getByRole('button', { name: '기초', exact: true })
  await tabUntilFocused(page, studyLevel)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '기초 플래시카드 학습' })).toBeVisible()

  const card = page.getByRole('button', { name: / 카드 뒤집기$/u }).first()
  await tabUntilFocused(page, card)
  await page.keyboard.press('Enter')
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Space')
  await expect(card).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Space')
  await expect(card).toHaveAttribute('aria-pressed', 'true')

  const quizMenu = primaryMenu.getByRole('button', { name: '퀴즈', exact: true })
  await tabUntilFocused(page, quizMenu, 'backward')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '퀴즈 레벨 선택' })).toBeVisible()
  const quizLevel = page
    .getByRole('navigation', { name: '퀴즈 레벨 메뉴' })
    .getByRole('button', { name: '기초', exact: true })
  await tabUntilFocused(page, quizLevel)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '퀴즈 유형 선택' })).toBeVisible()
  const sentenceTransform = page.getByRole('button', { name: '짧은 문장 변환' })
  await tabUntilFocused(page, sentenceTransform)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '퀴즈', exact: true })).toBeVisible()

  const answer = page.getByRole('textbox', { name: '답안' })
  await tabUntilFocused(page, answer)
  await page.keyboard.type('__keyboard_wrong_answer__')
  const submit = page.getByRole('button', { name: '정답 확인' })
  await tabUntilFocused(page, submit)
  await page.keyboard.press('Enter')
  await expect(page.locator('.quiz-feedback[data-state="incorrect"]')).toBeVisible()

  const next = page.getByRole('button', { name: '다음문제', exact: true })
  await tabUntilFocused(page, next)
  await page.keyboard.press('Enter')
  await expect(page.getByText('현재 2 / 전체 10', { exact: true })).toBeVisible()
  await expect(page.getByTestId('quiz-prompt')).toBeFocused()

  await expectNoViewportOverflow(page)
  assertNoBrowserFailures()
})

test('root self-contained index renders directly without network assets or browser failures', async ({ page }) => {
  const assertNoBrowserFailures = captureBrowserFailures(page)
  const offlineIndex = pathToFileURL(resolve('index.html')).href
  const nonDocumentRequests: string[] = []
  const requestFailures: string[] = []
  const webSockets: string[] = []

  page.on('request', (request) => {
    if (request.resourceType() !== 'document') {
      nonDocumentRequests.push(
        `${request.resourceType()} ${request.method()} ${request.url()}`,
      )
    }
  })
  page.on('requestfailed', (request) => {
    requestFailures.push(
      `${request.resourceType()} ${request.method()} ${request.url()}: `
        + (request.failure()?.errorText ?? 'unknown failure'),
    )
  })
  page.on('websocket', (socket) => webSockets.push(socket.url()))

  await page.addInitScript(() => {
    const runtimeRequests = { fetch: 0, xhr: 0 }
    Object.defineProperty(window, '__englishWordsOfflineRuntimeRequests', {
      configurable: true,
      value: runtimeRequests,
    })
    window.fetch = () => {
      runtimeRequests.fetch += 1
      return Promise.reject(new Error('The offline app attempted to call fetch().'))
    }
    window.XMLHttpRequest.prototype.send = function (): never {
      runtimeRequests.xhr += 1
      throw new Error('The offline app attempted to send an XMLHttpRequest.')
    }
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('opaque origin', 'SecurityError')
      },
    })
  })

  await page.goto(offlineIndex)
  await expect(page).toHaveURL(offlineIndex)
  await expect(page.getByRole('heading', { name: '기초 학습 대시보드' })).toBeVisible()
  await expectNoViewportOverflow(page)
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    OFFLINE_CONTENT_SECURITY_POLICY,
  )
  await expect(page.getByRole('status')).toContainText('새로고침하면 초기화')

  await page.getByRole('button', { name: '단어장', exact: true }).click()
  await expect(page.getByRole('heading', { name: '기초 단어장' })).toBeVisible()
  await page.getByRole('searchbox', { name: '단어 검색' }).fill('wake up')
  await expect(page.getByRole('rowheader', { name: 'wake up', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '소설', exact: true }).click()
  await expect(page.locator('.view--story')).toBeVisible()
  const storyWord = page.getByRole('button', { name: /^story word:/u }).first()
  await storyWord.click()
  await expect(page.locator('#story-word-detail')).toBeVisible()
  await page.getByRole('button', { name: '닫기', exact: true }).click()

  await exerciseGrammarSmoke(page)

  await page.getByRole('button', { name: '학습', exact: true }).click()
  await expect(page.getByRole('heading', { name: '학습 레벨 선택' })).toBeVisible()
  await page
    .getByRole('navigation', { name: '학습 레벨 메뉴' })
    .getByRole('button', { name: '기초', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '기초 플래시카드 학습' })).toBeVisible()
  const firstCard = page.getByRole('button', { name: / 카드 뒤집기$/u }).first()
  await firstCard.click()
  await expect(firstCard).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '퀴즈', exact: true }).click()
  await expect(page.getByRole('heading', { name: '퀴즈 레벨 선택' })).toBeVisible()
  await page
    .getByRole('navigation', { name: '퀴즈 레벨 메뉴' })
    .getByRole('button', { name: '기초', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '퀴즈 유형 선택' })).toBeVisible()
  await page.getByRole('button', { name: '짧은 문장 변환' }).click()
  await expect(page.getByRole('heading', { name: '퀴즈', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '답안' }).fill('__offline_wrong_answer__')
  await page.getByRole('button', { name: '정답 확인' }).click()
  await expect(page.locator('.quiz-feedback[data-state="incorrect"]')).toBeVisible()

  await expectNoViewportOverflow(page)
  await expectNoExternalResourceReferences(page)
  const runtimeRequests = await page.evaluate(() => {
    const offlineWindow = window as typeof window & {
      __englishWordsOfflineRuntimeRequests?: { fetch: number; xhr: number }
    }
    return offlineWindow.__englishWordsOfflineRuntimeRequests
  })
  expect(runtimeRequests).toEqual({ fetch: 0, xhr: 0 })
  expect(nonDocumentRequests).toEqual([])
  expect(requestFailures).toEqual([])
  expect(webSockets).toEqual([])
  assertNoBrowserFailures()
})

test('a long recovery backup stays inside the mobile viewport without losing content', async ({ page }) => {
  const rawBackup = 'x'.repeat(2_000)

  await page.goto('/')
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: rawBackup },
  )
  await page.reload()

  const recoveryDetails = page.getByText('복구 원본 보기', { exact: true })
  await recoveryDetails.click()
  const recoveryBackup = page.getByTestId('state-raw-backup')
  await expect(recoveryBackup).toBeVisible()
  await expect(recoveryBackup).toHaveText(rawBackup)
  await expectNoViewportOverflow(page)

  const dimensions = await recoveryBackup.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)
})

test('a long flashcard term wraps without widening a 320px document', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '학습', exact: true }).click()
  await page
    .getByRole('navigation', { name: '학습 레벨 메뉴' })
    .getByRole('button', { name: '중학교', exact: true })
    .click()

  const term = page.locator('.flashcard-term')
  await expect(term).toBeVisible()
  await term.evaluate((element) => {
    element.textContent = 'misunderstanding'
  })
  await expect(term).toHaveText('misunderstanding')
  await expectNoViewportOverflow(page)

  const widths = await term.evaluate((element) => ({
    term: element.getBoundingClientRect().width,
    card: element.closest('.flashcard-face')?.getBoundingClientRect().width ?? 0,
  }))
  expect(widths.term).toBeLessThanOrEqual(widths.card)
})

test('wordbook form controls keep the app font and touch target at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '단어장', exact: true }).click()

  const category = page.getByLabel('항목 종류')
  await expect(category).toBeVisible()
  const styles = await category.evaluate((element) => {
    const controlStyle = getComputedStyle(element)
    const bodyStyle = getComputedStyle(document.body)
    return {
      height: element.getBoundingClientRect().height,
      controlFont: controlStyle.fontFamily,
      bodyFont: bodyStyle.fontFamily,
    }
  })
  expect(styles.height).toBeGreaterThanOrEqual(44)
  expect(styles.controlFont).toBe(styles.bodyFont)
  await expectNoViewportOverflow(page)
})
