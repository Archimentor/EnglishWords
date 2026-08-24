import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

function captureBrowserFailures(page: Page): () => void {
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`)
  })
  return () => expect(failures).toEqual([])
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

async function revealWakeUp(page: Page) {
  const wrapper = page.locator('[data-phrasal-verb="wake up"]').first()
  for (let index = 0; index < 20 && await wrapper.count() === 0; index += 1) {
    const loadMore = page.getByRole('button', { name: /다음 이야기 보기/u })
    if (await loadMore.count() === 0) break
    await loadMore.click()
  }
  await expect(wrapper).toBeVisible()
  return wrapper
}

test('HTTP preview renders the novel-only story and core learning journey', async ({ page }) => {
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
  await expect(page.getByText('실제 소설 본문 커버리지')).toHaveCount(0)
  await expect(page.getByText('전체 학습 단어')).toHaveCount(0)
  await expect(page.getByText('전체 학습 구동사')).toHaveCount(0)
  await expect(page.getByText(/100% 다루도록/u)).toHaveCount(0)

  const storyWord = page.getByRole('button', { name: /^story word:/u }).first()
  await expect(storyWord).toBeVisible()
  await storyWord.click()
  const closeStoryDetail = page.getByRole('button', { name: '닫기', exact: true })
  await expect(closeStoryDetail).toBeFocused()
  await closeStoryDetail.click()
  await expect(storyWord).toBeFocused()

  const wakeUp = await revealWakeUp(page)
  const wakeWord = wakeUp.getByRole('button', { name: 'story word: wake' })
  const upWord = wakeUp.getByRole('button', { name: 'story word: up' })
  const phrasalVerb = wakeUp.getByRole('button', { name: 'story phrasal verb: wake up' })
  await expect(wakeWord).toBeVisible()
  await expect(upWord).toBeVisible()
  await expect(phrasalVerb).toBeVisible()
  await expect(phrasalVerb).toHaveClass(/story-inline-phrasal-meaning-button/u)

  await wakeWord.click()
  await expect(page.getByRole('heading', { name: 'wake 단어 상세' })).toBeVisible()
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(wakeWord).toBeFocused()

  await phrasalVerb.click()
  await expect(page.getByRole('heading', { name: 'wake up 구동사 상세' })).toBeVisible()
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(phrasalVerb).toBeFocused()

  await page.getByRole('button', { name: '문법', exact: true }).click()
  await expect(page.getByRole('heading', { name: '문법 학습' })).toBeVisible()

  await page.getByRole('button', { name: '학습', exact: true }).click()
  await expect(page.getByRole('heading', { name: '학습 레벨 선택' })).toBeVisible()
  await page
    .getByRole('navigation', { name: '학습 레벨 메뉴' })
    .getByRole('button', { name: '기초', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: '기초 플래시카드 학습' })).toBeVisible()

  await expectNoViewportOverflow(page)
  assertNoBrowserFailures()
})

test('tracked offline index renders the novel-only application without network storage', async ({ page }) => {
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
  await page.getByRole('button', { name: '소설', exact: true }).click()
  await expect(page.locator('.view--story')).toBeVisible()
  await expect(page.getByText('실제 소설 본문 커버리지')).toHaveCount(0)
  await expect(page.getByText('전체 학습 단어')).toHaveCount(0)
  await expect(page.getByText('전체 학습 구동사')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /다음 이야기 보기/u })).toBeVisible()
  await expectNoViewportOverflow(page)
  assertNoBrowserFailures()
})
