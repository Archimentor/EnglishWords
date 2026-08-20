import type {
  Level,
  PhrasalVerbItem,
  StoryContent,
  WordItem,
} from '../../src/domain/content/types'

const STORY_TITLES: Record<Level, string> = {
  기초: '빨간 공을 따라간 Mina',
  유치원: '빛을 잃은 이야기책',
  초등학교: '네 장의 편지와 비밀 정원',
  중학교: '도시의 마지막 기록',
}

const FULL_NARRATIVE_ANCHORS = [
  'a', 'the', 'and', 'but', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'of', 'as',
  'be', 'have', 'do', 'will', 'park', 'letter', 'map', 'road', 'bird', 'find', 'look',
  'walk', 'make', 'take', 'give', 'help', 'begin', 'end',
] as const

const PLOT: Record<Level, {
  opening: string[]
  turns: string[]
  ending: string[]
  guide: string
  setting: string
  path: string
  helper: string
}> = {
  기초: {
    opening: [
      'In the morning, Mina was in the park with her red ball. A small bird sat on the ball with a blue letter in the mouth of the bird.',
      'Mina opened the letter and read it. The bird had lost the family. A map of the city was in the letter, and Mina knew she had to help.',
      'At the garden, Mina met a boy with a baby in his arms. His grandfather had a dog, and his grandmother gave the family warm bread. A girl came from the old house with a blue hat in her hand. The girl knew the bird was in that house. Mina put the red ball in her bag, took the map, and ran to the road.',
    ],
    turns: [
      'Mina took the map, and the bird went with her. Their long walk began at the garden.',
      'The road grew dark. The bird began to cry, but Mina did not end the walk. She read the letter and found a new road.',
      'At night, the map ended at a closed door. Mina heard a bird cry in the house. She took the key from the letter and opened the door.',
      'The family saw the bird and ran to it. The bird was happy, and Mina gave it the red ball.',
    ],
    ending: [
      'The long night ended. Mina walked to her house, and the bird was with the family of the bird.',
    ],
    guide: 'map',
    setting: 'park',
    path: 'road',
    helper: 'bird',
  },
  유치원: {
    opening: [
      'After school, Mina found an old book on a desk. The book had a message about a lost story, and one page did not have words.',
      'When Mina opened the book, a small light came from the page. The message said the school would lose the story. Mina had to find the answer.',
      'Mina called her team to the library. One child found a picture on a clock, and a girl found a number on the table. The picture and the number made a door on the empty page. Mina was afraid to open it, so the group held hands and opened it.',
    ],
    turns: [
      'Mina showed the book to her team. They read the question and started to look for the answer.',
      'The answer was wrong because the message changed again. Mina listened to the group and tried a new idea.',
      'At night, the page opened. The answer was not a number. It was the history of the school and the group that cared for it.',
      'Mina wrote the story in the book. The light came back, and the pages had words again.',
    ],
    ending: [
      'In the morning, Mina brought the book to school. The children read it with the team, and the lost story had a new end.',
    ],
    guide: 'book',
    setting: 'school',
    path: 'road',
    helper: 'team',
  },
  초등학교: {
    opening: [
      'During a summer morning, Mina found a secret letter at the city garden. The letter said that the garden would close unless someone could solve a mystery by night.',
      'Four clues were hidden across the city. Mina called her team, opened the letter, and began the journey.',
      'A clue was in an old glass house. A broken picture showed the garden when it did not have a tall building on the hill. On the back, a child had written one sentence: the old tree knows the way. Mina copied the words into her notebook, and the team followed a small road between the trees.',
    ],
    turns: [
      'A clue led to an empty house, but the answer there raised a new question. Mina recorded the detail, and the team moved on.',
      'A sudden storm damaged the letter. Mina almost lost hope, but the team joined the broken parts and found a hidden message.',
      'The final clue showed that the garden held the secret. The old trees kept the history that the city had forgotten.',
      'Mina showed the four letters and the full report. The city chose to protect the garden, and the locked gate opened again.',
    ],
    ending: [
      'At night, Mina and the team returned to the garden. Their difficult journey became a story of hope, trust, and a place saved by the team.',
    ],
    guide: 'clue',
    setting: 'garden',
    path: 'road',
    helper: 'team',
  },
  중학교: {
    opening: [
      'Mina worked on a report about a city district that had lost the public record. Without that record, innocent families carried blame for an old crime, while a group with power controlled the public story.',
      'A damaged file arrived with a map and a warning. Mina began to investigate the case, compare the sources, and publish only the facts that the sources could support.',
      'At the district office, Mina met a guard with a damaged picture and a prison record. The date on the paper did not agree with the public report. A witness described an army truck crossing the desert road on the night of the crime, but the public file called the event an accident. Mina copied the detail and put the original record in a safe room.',
    ],
    turns: [
      'The early records disagreed, and some witnesses feared the result of speaking. Mina documented the conflict and protected the original page.',
      'A powerful group tried to stop the research. Instead of accepting the claim, Mina tested the dates, followed the money, and found a pattern hidden across many years.',
      'The final file revealed the crime and the long wait that followed it. Mina now faced a choice between personal safety and the truth owed to the public.',
      'Mina released the complete report with the sources. The court opened the case again, the city restored the record, and the public began a difficult reform.',
    ],
    ending: [
      'The report did not repair the harm at once, but it changed the public story. Mina closed the file knowing that honest memory was the beginning of justice, not the end.',
    ],
    guide: 'report',
    setting: 'city',
    path: 'road',
    helper: 'team',
  },
}

type NarrativeWord = {
  word: WordItem
  lemma: string
  partOfSpeech: string
}

type Plot = (typeof PLOT)[Level]

interface NarrativeContext {
  plot: Plot
  examplesByLemma: ReadonlyMap<string, string>
}

type NarrativeBuckets = Record<'noun' | 'verb' | 'adjective' | 'adverb' | 'function', NarrativeWord[]>

interface NarrativeScene {
  theme: StoryTheme
  words: NarrativeWord[]
}

type StoryTheme =
  | 'people'
  | 'home'
  | 'food'
  | 'school'
  | 'art'
  | 'nature'
  | 'travel'
  | 'work'
  | 'health'
  | 'science'
  | 'society'
  | 'emotion'
  | 'other'

const STORY_THEME_ORDER: readonly StoryTheme[] = [
  'people', 'home', 'food', 'school', 'art', 'nature', 'travel', 'work', 'health',
  'science', 'society', 'emotion', 'other',
]

function groups<T>(values: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size))
}

function primaryWord(word: WordItem): NarrativeWord {
  return {
    word,
    lemma: word.lemma,
    partOfSpeech: word.entries[0]!.partOfSpeech,
  }
}

function bucketFor(partOfSpeech: string): keyof NarrativeBuckets {
  if (partOfSpeech === 'noun') return 'noun'
  if (partOfSpeech === 'verb') return 'verb'
  if (partOfSpeech === 'adjective') return 'adjective'
  if (partOfSpeech === 'adverb') return 'adverb'
  return 'function'
}

function wordTheme({ lemma, word }: NarrativeWord): StoryTheme {
  const source = `${lemma} ${word.entries.flatMap(({ meanings }) => meanings).join(' ')}`.toLowerCase()
  if (/family|parent|mother|father|wife|husband|son|daughter|boy|girl|baby|child|사람|가족|부모|어머니|아버지|남편|아내|아들|딸|아이|친구/.test(source)) return 'people'
  if (/house|home|room|door|bed|kitchen|chair|table|clothes|집|가정|방|문|침대|부엌|가구|옷/.test(source)) return 'home'
  if (/food|bread|cake|milk|coffee|rice|fruit|apple|drink|eat|음식|빵|우유|커피|과일|먹|마시/.test(source)) return 'food'
  if (/school|class|book|word|letter|study|learn|teach|question|answer|학교|수업|책|단어|글자|공부|배우|가르치|질문|대답/.test(source)) return 'school'
  if (/music|song|film|picture|game|play|art|dance|story|음악|노래|영화|그림|게임|놀이|예술|춤|이야기/.test(source)) return 'art'
  if (/animal|bird|fish|dog|cat|tree|flower|river|sea|mountain|weather|동물|새|물고기|개|고양이|나무|꽃|강|바다|산|날씨/.test(source)) return 'nature'
  if (/road|street|city|country|travel|journey|car|bus|train|ship|길|도로|도시|나라|여행|자동차|버스|기차|배/.test(source)) return 'travel'
  if (/work|business|company|money|job|office|market|trade|일|업무|사업|회사|돈|직업|사무|시장|거래/.test(source)) return 'work'
  if (/body|health|disease|medical|doctor|hospital|pain|blood|몸|건강|질병|의학|의사|병원|통증|피/.test(source)) return 'health'
  if (/science|research|system|machine|computer|energy|chem|physics|과학|연구|체계|기계|컴퓨터|에너지|화학|물리/.test(source)) return 'science'
  if (/law|war|crime|court|government|politic|society|army|법|전쟁|범죄|법원|정부|정치|사회|군대/.test(source)) return 'society'
  if (/love|fear|hope|happy|sad|feeling|mind|idea|사랑|두려|희망|행복|슬프|감정|마음|생각/.test(source)) return 'emotion'
  return 'other'
}

function scenesFromWords(words: readonly NarrativeWord[]): NarrativeWord[][] {
  const buckets: NarrativeBuckets = {
    noun: [],
    verb: [],
    adjective: [],
    adverb: [],
    function: [],
  }
  words.forEach((word) => buckets[bucketFor(word.partOfSpeech)].push(word))

  const quotas: Array<[keyof NarrativeBuckets, number]> = [
    ['noun', 5],
    ['verb', 3],
    ['adjective', 3],
    ['adverb', 1],
    ['function', 2],
  ]
  const scenes: NarrativeWord[][] = []
  while (Object.values(buckets).some((bucket) => bucket.length > 0)) {
    const scene: NarrativeWord[] = []
    for (const [name, quota] of quotas) scene.push(...buckets[name].splice(0, quota))
    while (scene.length < 14) {
      const largest = (Object.keys(buckets) as Array<keyof NarrativeBuckets>)
        .sort((left, right) => buckets[right].length - buckets[left].length)[0]!
      const next = buckets[largest].shift()
      if (!next) break
      scene.push(next)
    }
    scenes.push(scene)
  }
  return scenes
}

function themedScenes(words: readonly WordItem[]): NarrativeScene[] {
  const themed = new Map<StoryTheme, NarrativeWord[]>()
  for (const word of words.map(primaryWord)) {
    const theme = wordTheme(word)
    const values = themed.get(theme) ?? []
    values.push(word)
    themed.set(theme, values)
  }
  return STORY_THEME_ORDER.flatMap((theme) =>
    scenesFromWords(themed.get(theme) ?? []).map((scene) => ({ theme, words: scene })))
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
}

function meaningOf(word: NarrativeWord): string {
  return word.word.entries[0]?.meanings.join(' ') ?? ''
}

function nounKind(word: NarrativeWord): 'person' | 'place' | 'abstract' | 'object' {
  const meaning = meaningOf(word)
  if (
    /사람|남자|여자|아이|어린이|아기|가족|부모|어머니|아버지|할아버지|할머니|아내|남편|아들|딸|친척|친구|직업|관리|교사|학생|군인|죄수|전문가|회원|선수|작가|배우|의사|간호사|경호원|경비원|감시인|보호자|목격자|손님|고객|직원|죄인|수감자/.test(meaning)
  ) return 'person'
  if (
    /장소|지역|나라|국가|도시|마을|건물|학교|가게|방|길|도로|강|바다|산|공원|정원|사막|감옥|유치장|영창|사무실|교회|공장|농장|병원|역|공항|섬|해변/.test(meaning)
  ) return 'place'
  if (
    /상태|행위|성질|감정|생각|개념|권리|정치|사회|학문|과정|문제|방법|정도|능력|관계|정보|시간|기회|이유|효과|변화|사실|전쟁|질병|병|예의|친절|정의|자유|사랑|행복|슬픔|태도|관습|습관|기록|보고|연구|역사|경제|법|범죄|평화|검토|평론/.test(meaning)
    || /(?:tion|sion|ment|ness|ity|ship|ism|ance|ence|acy|hood)$/.test(word.lemma)
  ) return 'abstract'
  return 'object'
}

function nounKindGroups(words: readonly NarrativeWord[]): NarrativeWord[][] {
  const grouped = new Map<ReturnType<typeof nounKind>, NarrativeWord[]>()
  for (const word of words) {
    const kind = nounKind(word)
    const values = grouped.get(kind) ?? []
    values.push(word)
    grouped.set(kind, values)
  }
  return [...grouped.values()]
}

function selectSceneExamples(
  words: readonly NarrativeWord[],
  examplesByLemma: ReadonlyMap<string, string>,
): { examples: string[]; remaining: NarrativeWord[] } {
  const examples: string[] = []
  const remaining: NarrativeWord[] = []
  for (const word of words) {
    const selected = examplesByLemma.get(word.lemma)
    if (selected) examples.push(selected)
    else remaining.push(word)
  }

  return { examples, remaining }
}

function renderNounChunk(words: readonly NarrativeWord[], context: NarrativeContext): string {
  const { plot } = context
  const lemmas = words.map(({ lemma }) => lemma)
  const kind = nounKind(words[0]!)
  if (kind === 'abstract') {
    const patterns = [
      (lemma: string) => `The ${lemma} changed Mina's plan.`,
      (lemma: string) => `Mina knew the ${lemma} was important.`,
      (lemma: string) => `The ${plot.guide} had a picture of the ${lemma}.`,
      (lemma: string) => `Mina did not forget the ${lemma}.`,
      (lemma: string) => `The ${lemma} gave Mina a new way.`,
      (lemma: string) => `Mina read the ${lemma} in the ${plot.guide}.`,
    ]
    return lemmas.map((lemma, index) => patterns[index % patterns.length]!(lemma)).join(' ')
  }
  if (lemmas.length === 1) {
    const sentence = kind === 'person'
      ? `The ${lemmas[0]} helped Mina at the ${plot.setting}.`
      : kind === 'place'
        ? `Mina walked to the ${lemmas[0]}.`
        : `Mina found the ${lemmas[0]} in the ${plot.setting}.`
    return sentence
  }
  if (kind === 'person') {
    const [first, second, third, fourth, fifth, sixth] = lemmas
    return [
      `At the ${plot.setting}, Mina met the ${first} and the ${second}.`,
      ...(third ? [`The ${third} and the ${fourth ?? plot.helper} had seen the ${plot.helper}.`] : []),
      ...(fifth ? [`The ${fifth} and the ${sixth ?? plot.helper} helped Mina read the ${plot.guide}.`] : []),
    ].join(' ')
  }
  if (kind === 'place') {
    const [first, second, third, fourth, fifth, sixth] = lemmas
    return [
      `Mina walked from the ${first} to the ${second}.`,
      ...(third ? [`Mina found the ${third} at the ${fourth ?? plot.setting}.`] : []),
      ...(fifth ? [`The ${plot.guide} had the ${fifth} and the ${sixth ?? plot.setting}.`] : []),
    ].join(' ')
  }
  const patterns = [
    (lemma: string) => `Mina found the ${lemma} at the ${plot.setting}.`,
    (lemma: string) => `The ${lemma} was on the ${plot.guide}.`,
    (lemma: string) => `The ${lemma} was in the picture.`,
    (lemma: string) => `Mina put the ${lemma} in her bag.`,
    (lemma: string) => `The ${plot.helper} looked at the ${lemma}.`,
    (lemma: string) => `Mina took the ${lemma} with the ${plot.guide}.`,
  ]
  return lemmas.map((lemma, index) => patterns[index % patterns.length]!(lemma)).join(' ')
}

function looksTransitive(word: NarrativeWord): boolean {
  return /타동사|\(타\)|\(타동|…을|…를|~을|~를/.test(meaningOf(word))
}

function renderVerb(word: NarrativeWord, context: NarrativeContext): string {
  const { plot } = context
  if (word.lemma === 'be') return `The ${plot.helper} had to be with Mina.`
  if (word.lemma === 'have') return `Mina and the ${plot.helper} have the ${plot.guide}.`
  if (word.lemma === 'do') return 'Mina will do it.'
  if (word.lemma === 'will') return `Mina will follow the ${plot.path}.`
  if (word.lemma === 'can') return 'Mina can help.'
  if (word.lemma === 'may') return `Mina may find the ${plot.guide}.`
  if (word.lemma === 'must') return `Mina must follow the ${plot.path}.`
  if (word.lemma === 'would') return `Mina would help the ${plot.helper}.`
  if (looksTransitive(word)) return `Mina had to ${word.lemma} it.`
  return `Mina began to ${word.lemma}.`
}

function renderVerbs(words: readonly NarrativeWord[], context: NarrativeContext): string {
  if (words.length === 0) return ''
  const special = words.filter(({ lemma }) => ['be', 'have', 'do', 'will', 'can', 'may', 'must', 'would'].includes(lemma))
  const actions = words.filter((word) => !special.includes(word))
  const actionSentences = groups(actions, 2).map(([first, second]) => second
    ? `Mina began to ${first!.lemma}, and the ${context.plot.helper} helped her ${second.lemma}.`
    : `Mina began to ${first!.lemma}.`)
  return [
    ...special.map((word) => renderVerb(word, context)),
    ...actionSentences,
  ].join(' ')
}

function renderAdjectives(words: readonly NarrativeWord[], context: NarrativeContext): string {
  const [first, second, third] = words.map(({ lemma }) => lemma)
  if (!first) return ''
  if (!second) return `The ${context.plot.guide} was ${first}.`
  return [
    `The ${context.plot.guide} looked ${first}, but the ${context.plot.path} was ${second}.`,
    ...(third ? [`Mina felt ${third} and held the ${context.plot.guide}.`] : []),
  ].join(' ')
}

const DEGREE_ADVERBS = new Set(['very', 'too', 'quite', 'rather', 'almost', 'nearly', 'enough'])
const FREQUENCY_ADVERBS = new Set([
  'always', 'never', 'often', 'usually', 'sometimes', 'again', 'already', 'ever', 'rarely',
])
const SENTENCE_ADVERBS = new Set([
  'then', 'now', 'later', 'perhaps', 'probably', 'actually', 'finally', 'however', 'therefore',
  'instead', 'otherwise', 'fortunately', 'unfortunately',
])

function renderAdverb(word: NarrativeWord, context: NarrativeContext): string {
  const { plot } = context
  if (word.lemma === 'not') return 'Mina did not end the walk.'
  if (word.lemma === 'there') return `There was a door on the ${plot.path}.`
  if (DEGREE_ADVERBS.has(word.lemma)) return `The ${plot.path} was ${word.lemma} dark.`
  if (FREQUENCY_ADVERBS.has(word.lemma)) return `Mina ${word.lemma} looked at the ${plot.guide}.`
  if (SENTENCE_ADVERBS.has(word.lemma)) {
    return `${capitalize(word.lemma)}, Mina followed the ${plot.path}.`
  }
  return `Mina followed the plan ${word.lemma}.`
}

function pronounSentence(lemma: string, plot: Plot): string {
  if (['i', 'you', 'he', 'she', 'it', 'we', 'they'].includes(lemma)) {
    return `${capitalize(lemma)} will help Mina.`
  }
  if (['us', 'them', 'me', 'him'].includes(lemma)) return `Mina asked ${lemma} for help.`
  if (lemma === 'hers' || lemma === 'theirs') return `The ${plot.guide} was ${lemma}.`
  if (lemma === 'anything') return 'Mina could not find anything.'
  if (lemma === 'nothing') return 'Mina found nothing at the door.'
  if (lemma === 'everything') return `Mina put everything in the ${plot.guide}.`
  if (lemma === 'something') return `Mina found something in the ${plot.guide}.`
  if (['someone', 'somebody'].includes(lemma)) return `${capitalize(lemma)} helped Mina.`
  if (['everyone', 'everybody'].includes(lemma)) return `Mina asked ${lemma} to help.`
  if (['anyone', 'anybody'].includes(lemma)) return `${capitalize(lemma)} could help Mina.`
  if (lemma === 'nobody') return 'Nobody could stop Mina.'
  if (lemma === 'none') return 'None of the pages were lost.'
  if (lemma === 'itself') return `The ${plot.guide} opened by itself.`
  if (lemma === 'oneself') return 'To know oneself was part of the answer.'
  if (lemma === 'yourself') return 'You can do it by yourself.'
  if (lemma === 'himself') return 'The boy opened the door himself.'
  if (lemma === 'herself') return 'Mina opened the door herself.'
  if (lemma === 'myself') return 'I will carry the letter myself.'
  if (lemma === 'ourselves') return 'We will find the answer ourselves.'
  if (lemma === 'themselves') return 'They opened the book themselves.'
  return `${capitalize(lemma)} followed Mina.`
}

function prepositionSentence(lemma: string, plot: Plot): string {
  const exact: Record<string, string> = {
    to: `Mina walked to the ${plot.setting}.`,
    in: `The ${plot.guide} was in the bag.`,
    on: `The letter was on the ${plot.guide}.`,
    at: 'Mina was at the door.',
    for: `The letter was for Mina.`,
    with: `Mina walked with the ${plot.helper}.`,
    from: `The letter came from the ${plot.setting}.`,
    of: `Mina read the end of the letter.`,
    as: 'Mina gave the ball as a gift.',
    by: 'The book was by the door.',
    about: `The message was about the ${plot.guide}.`,
    into: `Mina walked into the ${plot.setting}.`,
    through: `Mina walked through the ${plot.setting}.`,
    after: `After school, Mina read the ${plot.guide}.`,
    between: 'The letter was between the book and the map.',
    up: `Mina walked up the ${plot.path}.`,
    until: `Mina read until night.`,
    during: `During the night, Mina read the ${plot.guide}.`,
    without: `Mina would not go without the ${plot.guide}.`,
    among: 'The letter was among the books.',
    within: `The answer was within the ${plot.guide}.`,
    across: `Mina walked across the ${plot.setting}.`,
    along: `Mina walked along the ${plot.path}.`,
    upon: `The letter was upon the ${plot.guide}.`,
    since: `Since the morning, Mina had followed the ${plot.path}.`,
    except: 'Mina found the pages except one.',
    till: 'Mina waited till night.',
    per: 'The book had one mark per page.',
    despite: `Despite the problem, Mina kept walking.`,
    throughout: 'Mina worked throughout the night.',
    via: `Mina went via the ${plot.setting}.`,
    toward: `Mina walked toward the ${plot.setting}.`,
    atop: `The letter was atop the ${plot.guide}.`,
  }
  return exact[lemma] ?? `The letter was ${lemma} the ${plot.guide}.`
}

function conjunctionSentence(lemma: string, plot: Plot): string {
  const exact: Record<string, string> = {
    and: `Mina walked and the ${plot.helper} followed.`,
    but: `The ${plot.path} was dark, but Mina walked.`,
    or: `The bird was in the ${plot.setting} or the garden.`,
    if: `If Mina found the answer, the ${plot.guide} would open.`,
    when: `When Mina read the letter, the ${plot.helper} looked at her.`,
    because: `Mina went on because the ${plot.helper} needed help.`,
    while: `Mina read while the ${plot.helper} watched.`,
    though: `Though the ${plot.path} was dark, Mina went on.`,
    either: `Either road could take Mina home.`,
    whether: `Mina did not know whether the ${plot.path} was right.`,
    nor: 'Mina did not stop, nor did she go back.',
    unless: `The door would not open unless Mina found the answer.`,
    provided: `Mina would go, provided the ${plot.helper} went with her.`,
    whenever: `Whenever Mina read the ${plot.guide}, she found a new question.`,
    lest: `Mina held the letter, lest the ${plot.helper} take it.`,
  }
  return exact[lemma] ?? `${capitalize(lemma)} Mina read the ${plot.guide}, she found a road.`
}

function determinerSentence(lemma: string, plot: Plot): string {
  if (lemma === 'an') return 'An old book was on the table.'
  if (lemma === 'some') return `Some light came from the ${plot.guide}.`
  return `${capitalize(lemma)} letter was on the ${plot.guide}.`
}

function numeralSentence(lemma: string, plot: Plot): string {
  if (/^(fourth|fifth|sixth|seventh|eighth|twentieth)$/.test(lemma)) {
    return `Mina opened the ${lemma} page.`
  }
  if (lemma === 'one') return `Mina read about one star in the ${plot.guide}.`
  return `Mina read about ${lemma} stars in the ${plot.guide}.`
}

function functionSentence(word: NarrativeWord, plot: Plot): string {
  if (word.partOfSpeech === 'pronoun') return pronounSentence(word.lemma, plot)
  if (word.partOfSpeech === 'preposition') return prepositionSentence(word.lemma, plot)
  if (word.partOfSpeech === 'conjunction') return conjunctionSentence(word.lemma, plot)
  if (word.partOfSpeech === 'determiner') return determinerSentence(word.lemma, plot)
  if (word.partOfSpeech === 'numeral') return numeralSentence(word.lemma, plot)
  if (word.partOfSpeech === 'interjection') {
    return `${capitalize(word.lemma)}! Mina looked at the ${plot.helper} and laughed.`
  }
  return `Mina found ${word.lemma} in the ${plot.guide}.`
}

function bridge(sceneIndex: number, theme: StoryTheme, plot: Plot): string {
  const themeBridges: Record<StoryTheme, string[]> = {
    people: [
      `A family at the ${plot.setting} had seen the ${plot.helper}.`,
      `Mina asked the family at the door for help.`,
    ],
    home: [
      `The red line ended at a house, and Mina went in.`,
      `In a quiet room, the ${plot.guide} made a new picture.`,
    ],
    food: [
      `A warm light came from the kitchen, and the ${plot.helper} looked at Mina.`,
      `Mina sat at a table, but the red line did not end there.`,
    ],
    school: [
      `In a class, Mina opened the ${plot.guide} and read a new line.`,
      `A page on the desk changed when Mina put the ${plot.guide} on it.`,
    ],
    art: [
      `A picture on the wall was like the picture in the ${plot.guide}.`,
      `Mina saw a game in the room and joined it.`,
    ],
    nature: [
      `The ${plot.helper} flew from the garden to the river.`,
      `At a tree, Mina found a new line on the ${plot.guide}.`,
    ],
    travel: [
      `The ${plot.path} went from the garden to the city, and Mina went on.`,
      `At the station, Mina found a red line.`,
    ],
    work: [
      `The market was busy, but Mina saw the ${plot.helper}.`,
      `At the office, Mina found a new line in the ${plot.guide}.`,
    ],
    health: [
      `At the hospital, the ${plot.helper} sat and looked at Mina.`,
      `Mina sat with the ${plot.helper}, and it was ready to go.`,
    ],
    science: [
      `A computer made a blue line on the ${plot.guide}.`,
      `Mina checked the picture and made a new plan.`,
    ],
    society: [
      `At the center of the town, Mina found a letter.`,
      `The family listened as Mina read the ${plot.guide}.`,
    ],
    emotion: [
      `The dark ${plot.path} made Mina afraid, but she held the ${plot.guide}.`,
      `Mina was tired, but the ${plot.helper} still needed her help.`,
    ],
    other: [
      `The ${plot.guide} made a new picture, and Mina looked at it.`,
      `The picture changed, and Mina walked with the ${plot.helper}.`,
      `Mina found a new line in the ${plot.guide} and made a plan.`,
      `A door in the picture opened, and Mina walked on the ${plot.path}.`,
    ],
  }
  const choices = themeBridges[theme]
  return choices[sceneIndex % choices.length]!
}

function renderScene(
  scene: NarrativeScene,
  sceneIndex: number,
  sceneCount: number,
  context: NarrativeContext,
): string {
  const { plot } = context
  const { examples, remaining } = selectSceneExamples(scene.words, context.examplesByLemma)
  const byBucket: NarrativeBuckets = {
    noun: [], verb: [], adjective: [], adverb: [], function: [],
  }
  remaining.forEach((word) => byBucket[bucketFor(word.partOfSpeech)].push(word))
  const stage = phrasalStoryStage(sceneIndex, sceneCount, plot)
  const closes = [
    `Mina looked at the picture. The blue letter was there, and she made a new plan.`,
    `The picture ended, but a red line was on the ${plot.guide}. Mina went on.`,
    `Mina read the ${plot.guide} and found the ${plot.path}.`,
    `The ${plot.helper} was ready, and Mina took the ${plot.guide}.`,
  ]
  return [
    stage.opening,
    bridge(sceneIndex, scene.theme, plot),
    ...renderStoryVoices(examples),
    ...nounKindGroups(byBucket.noun)
      .flatMap((sameKind) => groups(sameKind, 6))
      .map((chunk) => renderNounChunk(chunk, context)),
    renderVerbs(byBucket.verb, context),
    ...groups(byBucket.adjective, 3).map((chunk) => renderAdjectives(chunk, context)),
    ...byBucket.adverb.map((word) => renderAdverb(word, context)),
    ...byBucket.function.map((word) => functionSentence(word, plot)),
    closes[sceneIndex % closes.length],
    stage.closing,
  ].filter(Boolean).join(' ')
}

function storyTokens(storyText: string): Set<string> {
  return new Set(storyText.toLowerCase().match(/[\p{L}\p{N}]+(?:['’–-][\p{L}\p{N}]+)*/gu) ?? [])
}

function hasFullNarrativeAnchors(allowedWords: readonly WordItem[]): boolean {
  const lemmas = new Set(allowedWords.map(({ lemma }) => lemma))
  return FULL_NARRATIVE_ANCHORS.every((lemma) => lemmas.has(lemma))
}

function fallbackStoryText(words: readonly WordItem[]): string {
  return groups(words, 8)
    .map((chunk, index) => `Mina ${chunk.map(({ lemma }) => lemma).join(' ')}${index % 3 === 2 ? '!' : '.'}`)
    .join('\n\n')
}

function selectStoryWordUses(words: readonly WordItem[]): {
  usedWords: StoryContent['usedWords']
  examplesByLemma: ReadonlyMap<string, string>
} {
  const reservedLemmas = new Set(words.map(({ lemma }) => lemma.toLowerCase()))
  const claimedForms = new Set<string>()
  const examplesByLemma = new Map<string, string>()
  const usedWords = words.map((word) => {
    const candidates = word.entries.flatMap((entry) => {
      return entry.examples.flatMap((rawExample) => {
        const example = rawExample.trim()
        if (/\b(?:assholes?|bastards?|fuck(?:ed|ing)?|shit(?:ty)?|whores?|sluts?)\b/iu.test(example)) {
          return []
        }
        const tokens = storyTokens(example)
        const forms = Array.isArray(entry.forms) ? entry.forms : Object.values(entry.forms)
        return [...new Set(forms)]
          .filter((form) => tokens.has(form.toLowerCase()))
          .map((form) => ({ example, form, partOfSpeech: entry.partOfSpeech }))
      })
    }).sort((left, right) => {
      const lemmaDifference = Number(left.form.toLowerCase() !== word.lemma.toLowerCase())
        - Number(right.form.toLowerCase() !== word.lemma.toLowerCase())
      const minaDifference = Number(!/\bMina\b/u.test(left.example))
        - Number(!/\bMina\b/u.test(right.example))
      return lemmaDifference
        || minaDifference
        || left.example.length - right.example.length
        || left.example.localeCompare(right.example)
    })
    const selected = candidates.find(({ form }) => {
      const normalizedForm = form.toLowerCase()
      return !claimedForms.has(normalizedForm)
        && (
          normalizedForm === word.lemma.toLowerCase()
          || !reservedLemmas.has(normalizedForm)
        )
    })
    if (!selected) {
      claimedForms.add(word.lemma.toLowerCase())
      return {
        lemma: word.lemma,
        partOfSpeech: word.entries[0]!.partOfSpeech,
        forms: [word.lemma],
      }
    }
    claimedForms.add(selected.form.toLowerCase())
    examplesByLemma.set(word.lemma, selected.example)
    return {
      lemma: word.lemma,
      partOfSpeech: selected.partOfSpeech,
      forms: [selected.form],
    }
  })
  return { usedWords, examplesByLemma }
}

function selectPhrasalStoryExample(item: PhrasalVerbItem): string {
  const ranked = [...item.examples].sort((left, right) => {
    const minaDifference = Number(!/\bMina\b/u.test(left)) - Number(!/\bMina\b/u.test(right))
    if (minaDifference !== 0) return minaDifference
    const wordDifference = (left.match(/[A-Za-z]+(?:['’~-][A-Za-z]+)*/gu)?.length ?? 0)
      - (right.match(/[A-Za-z]+(?:['’~-][A-Za-z]+)*/gu)?.length ?? 0)
    return wordDifference || left.length - right.length || left.localeCompare(right)
  })
  const selected = ranked[0]?.trim()
  if (!selected) throw new Error(`Phrasal verb ${item.phrasalVerb} has no usable story example`)
  return selected
}

function renderStoryVoices(examples: readonly string[]): string[] {
  const speakers = [
    (example: string) => `A child read from the page: “${example}”`,
    (example: string) => `A woman wrote on the page: “${example}”`,
    (example: string) => `A boy talked to Mina: “${example}”`,
    (example: string) => `A girl called from the city: “${example}”`,
    (example: string) => `The picture opened, and Mina heard: “${example}”`,
  ]
  return examples.map((example, index) => speakers[index % speakers.length]!(example))
}

function renderPhrasalVoices(
  chunk: ReadonlyArray<StoryContent['usedPhrasalVerbs'][number]>,
): string[] {
  return renderStoryVoices(chunk.map(({ example }) => example))
}

function phrasalStoryStage(sceneIndex: number, sceneCount: number, plot: Plot): {
  opening: string
  closing: string
} {
  const stage = Math.min(4, Math.floor(sceneIndex * 5 / sceneCount))
  const stages = [
    {
      opening: `The ${plot.guide} had a blue line. Mina began a new walk with the ${plot.helper}.`,
      closing: `Mina put the page on the map and followed the red line.`,
    },
    {
      opening: `The ${plot.path} became dark, and rain fell. Mina was afraid, but the ${plot.helper} was with her.`,
      closing: `The new picture had a road for Mina. She held the ${plot.guide} and went on.`,
    },
    {
      opening: `The map did not have the road. Mina listened to the ${plot.helper} and changed her plan.`,
      closing: `Mina joined the lines and made a new plan. She went on with the ${plot.helper}.`,
    },
    {
      opening: `At a dark old house, Mina found the family from the picture. The door was closed, and they asked for help.`,
      closing: `The picture became clear, and Mina opened a new door. The family followed her.`,
    },
    {
      opening: `The red line ended at the ${plot.setting}. Mina carried the pages with her.`,
      closing: `The pages made a full picture. Mina found the way, and the family was happy.`,
    },
  ] as const
  return stages[stage]!
}

function phrasalSceneOpening(sceneIndex: number, plot: Plot): string {
  const openings = [
    `In the morning, Mina found a new page in the ${plot.guide}. The ${plot.helper} looked at the page and began to walk.`,
    `A red line crossed the page and went to the ${plot.setting}. Mina took the ${plot.guide} and followed it.`,
    `At the ${plot.setting}, a closed door had a blue picture. Mina took the key and opened the door.`,
    `The room was dark, but a page had a little light. Mina went in and took the page.`,
    `Rain fell on the ${plot.path}, and the ${plot.guide} was wet. Mina covered it with her bag and continued the walk.`,
    `At night, the ${plot.helper} began to cry at a dark old house. Mina ran to the house and found a page.`,
    `The page had a road to the city. Mina called her family and asked for help.`,
    `A family brought a picture from the garden. Mina put it on the ${plot.guide} and saw a new line.`,
    `The line ended at a wall. Mina did not know the way, but the ${plot.helper} found a door.`,
    `The door was closed, and the key did not open it. Mina read the ${plot.guide} and found a small line.`,
  ] as const
  return openings[sceneIndex % openings.length]!
}

function buildPhrasalVerbPractice(
  level: Level,
  phrasalVerbs: readonly PhrasalVerbItem[],
  allowedWords: readonly WordItem[],
): Pick<StoryContent, 'usedPhrasalVerbs' | 'phrasalVerbPracticeText'> {
  const usedPhrasalVerbs = phrasalVerbs.map((item) => ({
    id: item.id,
    phrasalVerb: item.phrasalVerb,
    example: selectPhrasalStoryExample(item),
  }))
  if (usedPhrasalVerbs.length === 0) {
    return { usedPhrasalVerbs, phrasalVerbPracticeText: 'Mina.' }
  }

  if (!hasFullNarrativeAnchors(allowedWords)) {
    return {
      usedPhrasalVerbs,
      phrasalVerbPracticeText: groups(usedPhrasalVerbs, 5)
        .map((chunk) => chunk.map(({ example }) => example).join(' '))
        .join('\n\n'),
    }
  }

  const plot = PLOT[level]
  const scenes = groups(usedPhrasalVerbs, 5)
  return {
    usedPhrasalVerbs,
    phrasalVerbPracticeText: scenes
      .map((chunk, index) => {
        const stage = phrasalStoryStage(index, scenes.length, plot)
        return [
          stage.opening,
          phrasalSceneOpening(index, plot),
          ...renderPhrasalVoices(chunk),
          stage.closing,
        ].join(' ')
      })
      .join('\n\n'),
  }
}

function buildReadingTexts(
  level: Level,
  words: readonly WordItem[],
  allowedWords: readonly WordItem[],
): Pick<StoryContent, 'usedWords' | 'storyText' | 'vocabularyPracticeText'> {
  if (!hasFullNarrativeAnchors(allowedWords)) {
    return {
      usedWords: words.map((word) => ({
        lemma: word.lemma,
        partOfSpeech: word.entries[0]!.partOfSpeech,
        forms: [word.lemma],
      })),
      storyText: 'Mina.',
      vocabularyPracticeText: fallbackStoryText(words),
    }
  }

  const plot = PLOT[level]
  const { usedWords, examplesByLemma } = selectStoryWordUses(words)
  const context: NarrativeContext = { plot, examplesByLemma }
  const storyText = [...plot.opening, ...plot.turns, ...plot.ending].join('\n\n')
  const scenes = themedScenes(words)
  const practiceParagraphs = scenes.map((scene, index) =>
    renderScene(scene, index, scenes.length, context))

  const vocabularyPracticeText = practiceParagraphs.join('\n\n')
  const tokens = storyTokens(`${storyText}\n\n${vocabularyPracticeText}`)
  const missing = usedWords.filter(({ forms }) =>
    forms.some((form) => !tokens.has(form.toLowerCase())))
  if (missing.length > 0) {
    throw new Error(`Reading package for ${level} omitted: ${missing.map(({ lemma }) => lemma).join(', ')}`)
  }
  return { usedWords, storyText, vocabularyPracticeText }
}

export function buildStoryDraft(
  level: Level,
  words: readonly WordItem[],
  allowedWords: readonly WordItem[] = words,
  phrasalVerbs: readonly PhrasalVerbItem[] = [],
): StoryContent {
  const texts = buildReadingTexts(level, words, allowedWords)
  const phrasalPractice = buildPhrasalVerbPractice(level, phrasalVerbs, allowedWords)
  return {
    schemaVersion: '1.0.0',
    level,
    title: STORY_TITLES[level],
    isManual: false,
    coverage: {
      mustCoverAll: true,
      allowUpperLevelWords: false,
      coverageRate: 1,
    },
    ...texts,
    ...phrasalPractice,
  }
}
