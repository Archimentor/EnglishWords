import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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
  for (let chapterIndex = 0; chapterIndex < 6; chapterIndex += 1) {
    if (await wrapper.count() > 0) {
      await expect(wrapper).toBeVisible()
      return wrapper
    }
    if (chapterIndex < 5) {
      await page.getByRole('button', { name: /다음 챕터/u }).click()
    }
  }
  throw new Error('wake up was not found in the six-chapter basic novel')
}

const READER_LEVELS = [
  { level: '기초', title: 'The Blue Bags' },
  { level: '유치원', title: 'Music in a Dark Room' },
  { level: '초등학교', title: 'The Lamp at Harbor Point' },
  { level: '중학교', title: 'The Last Broadcast' },
] as const

test('HTTP preview renders the novel-only reading flow and core learning journey', async ({
  page,
}) => {
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
  await expect(page.getByRole('heading', { name: 'The Blue Bags', level: 2 })).toBeVisible()
  await expect(page.getByText('챕터 1 / 6', { exact: true })).toBeVisible()
  await expect(page.getByText('이번 장면의 단어')).toHaveCount(0)
  await expect(page.getByText('이번 장면의 표현')).toHaveCount(0)
  await expect(page.getByText('전체 학습 단어')).toHaveCount(0)
  await expect(page.getByText('전체 학습 구동사')).toHaveCount(0)

  const storyWord = page.getByRole('button', { name: /^story word:/u }).first()
  await expect(storyWord).toBeVisible()
  await storyWord.click()
  const closeStoryDetail = page.getByRole('button', { name: '닫기', exact: true })
  await expect(closeStoryDetail).toBeFocused()
  await closeStoryDetail.click()
  await expect(storyWord).toBeFocused()

  const wakeUp = await revealWakeUp(page)
  const componentButtons = wakeUp.getByRole('button', {
    name: /^story phrasal component:/u,
  })
  const phrasalVerb = wakeUp.locator('.story-inline-phrasal__badge')
  await expect(componentButtons).toHaveCount(2)
  await expect(phrasalVerb).toHaveClass(/story-inline-phrasal__badge/u)
  await expect(phrasalVerb).toHaveText('구')

  const firstComponent = componentButtons.first()
  await firstComponent.click()
  await expect(page.getByRole('heading', { name: 'wake up 구동사 상세' })).toBeVisible()
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(firstComponent).toBeFocused()

  await phrasalVerb.click()
  await expect(page.getByRole('heading', { name: 'wake up 구동사 상세' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '본문에서의 뜻' })).toBeVisible()
  await expect(page.getByText('잠에서 깨다', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '본문 문장' })).toBeVisible()
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

for (const { level, title } of READER_LEVELS) {
  test(`${level} reader shows six developed chapters with inline word and phrasal lookup`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const assertNoBrowserFailures = captureBrowserFailures(page)
    let openedPhrasalDetail = false

    await page.goto('/')
    await page
      .getByRole('navigation', { name: '주 메뉴' })
      .getByRole('button', { name: level, exact: true })
      .click()
    await page
      .getByRole('navigation', { name: '레벨 메뉴' })
      .getByRole('button', { name: '소설', exact: true })
      .click()
    await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible()

    for (let chapterIndex = 0; chapterIndex < 6; chapterIndex += 1) {
      await expect(page.getByText(
        `챕터 ${chapterIndex + 1} / 6`,
        { exact: true },
      )).toBeVisible()
      const paragraphs = page.locator('.story-paragraph')
      await expect(paragraphs).toHaveCount(5)
      const sentenceCounts = await paragraphs.evaluateAll((elements) =>
        elements.map((element) => element.textContent?.match(/[^.!?]+[.!?]+/gu)?.length ?? 0))
      expect(sentenceCounts.every((count) => count >= 2)).toBe(true)
      expect(sentenceCounts.reduce((total, count) => total + count, 0)).toBeGreaterThanOrEqual(12)

      const wordButtons = page.getByRole('button', { name: /^story word:/u })
      expect(await wordButtons.count()).toBeGreaterThan(0)
      const phraseWrappers = page.locator('.story-inline-phrasal')
      const phraseBadges = page.locator('.story-inline-phrasal__badge')
      expect(await phraseBadges.count()).toBe(await phraseWrappers.count())

      if (chapterIndex === 0) {
        const representativeWord = wordButtons.first()
        await representativeWord.click()
        await expect(page.getByRole('heading', { name: /단어 상세$/u })).toBeVisible()
        await page.getByRole('button', { name: '닫기', exact: true }).click()
        await expect(representativeWord).toBeFocused()
      }

      if (!openedPhrasalDetail && await phraseBadges.count() > 0) {
        const representativePhrasal = phraseBadges.first()
        await representativePhrasal.click()
        await expect(page.getByRole('heading', { name: /구동사 상세$/u })).toBeVisible()
        await expect(page.getByRole('heading', { name: '본문에서의 뜻' })).toBeVisible()
        await expect(page.getByRole('heading', { name: '본문 문장' })).toBeVisible()
        await page.getByRole('button', { name: '닫기', exact: true }).click()
        await expect(representativePhrasal).toBeFocused()
        openedPhrasalDetail = true
      }

      await expectNoViewportOverflow(page)
      if (chapterIndex < 5) {
        await page.getByRole('button', { name: `다음 챕터 (${chapterIndex + 2})` }).click()
      }
    }

    expect(openedPhrasalDetail).toBe(true)
    await expect(page.getByRole('button', { name: '소설 읽기 완료' })).toBeDisabled()
    await expect(page.getByText('이번 장면의 단어')).toHaveCount(0)
    await expect(page.getByText('이번 장면의 표현')).toHaveCount(0)
    assertNoBrowserFailures()
  })
}

test('tracked offline index renders the six-chapter reader without network storage', async ({
  page,
}) => {
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
  await expect(page.getByRole('heading', { name: 'The Blue Bags', level: 2 })).toBeVisible()
  await expect(page.getByText('챕터 1 / 6', { exact: true })).toBeVisible()
  await expect(page.getByText('이번 장면의 단어')).toHaveCount(0)
  await expect(page.getByText('이번 장면의 표현')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '다음 챕터 (2)' })).toBeVisible()
  await expectNoViewportOverflow(page)
  assertNoBrowserFailures()
})
