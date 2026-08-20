import type {
  GrammarErrorNote,
  GrammarNode,
} from '../../src/domain/content/types'
import { grammarProductionConstraintsForLevel } from '../../src/domain/grammar/productionConstraints'

interface ErrorCategory {
  title: string
  guidance: string
}

interface ErrorPair {
  wrong: string
  correct: string
}

export interface AuditedErrorPair extends ErrorPair {
  targetPattern: string
}

const ERROR_CATEGORIES: Readonly<Record<string, ErrorCategory>> = {
  ART: {
    title: '관사와 한정성 오류',
    guidance: '새 단수 가산명사에는 a/an을, 이미 특정된 명사에는 the를 쓰고 일반 복수·불가산명사는 무관사로 둔다.',
  },
  PREP: {
    title: '전치사와 결합 관계 오류',
    guidance: '동사·명사와 결합하는 전치사 및 시간·장소 관계를 통째로 확인한다.',
  },
  TENSE: {
    title: '시제와 상 선택 오류',
    guidance: '완료된 시점, 현재와의 관련성, 사건의 선후 관계를 먼저 정한 뒤 동사 형태를 선택한다.',
  },
  SV: {
    title: '주어-동사 수일치 오류',
    guidance: '동사와 가까운 명사가 아니라 문장의 실제 주어를 찾아 단수·복수 형태를 맞춘다.',
  },
  WO: {
    title: '어순과 정보구조 오류',
    guidance: '평서문·의문문·강조 구문의 필수 성분 순서와 이미 알려진 정보의 위치를 확인한다.',
  },
  MODAL: {
    title: '조동사 형태와 의미 오류',
    guidance: '조동사 뒤에는 동사원형을 쓰고 의무·가능성·추측의 강도를 문맥에 맞춘다.',
  },
  CLAUSE: {
    title: '절 연결과 종속 구조 오류',
    guidance: '접속사·관계사·비정형절이 담당하는 논리 관계를 한 번만 명확하게 표시한다.',
  },
  REG: {
    title: '레지스터와 담화 기능 오류',
    guidance: '독자와 목적에 맞는 격식, 연결 표현, 완곡성 및 정보 밀도를 일관되게 유지한다.',
  },
}

const ERROR_CODE_OVERRIDES: Readonly<Record<string, Partial<ErrorCategory>>> = {
  'REG-08': {
    title: '자연스러운 콜로케이션 오류',
    guidance: '직역한 동사 대신 영어에서 해당 명사와 관습적으로 결합하는 동사를 선택한다.',
  },
  'PREP-06': {
    title: '불필요하거나 누락된 전치사 오류',
    guidance: '타동사 뒤의 불필요한 전치사를 빼고, 전치사가 필요한 결합에는 정확한 형태를 넣는다.',
  },
}

/**
 * Editorially audited examples for every grammar-node/error-code pair.
 *
 * The target pattern is stored with the pair so a code cannot silently fall
 * back to an unrelated category example or drift to a different node rule.
 */
export const AUDITED_ERROR_PAIRS: Readonly<Record<string, AuditedErrorPair>> = {
  'A1-G01:WO-01': {
    wrong: 'The soup wonderful smells.',
    correct: 'The soup smells wonderful.',
    targetPattern: 'S + linking verb + C',
  },
  'A1-G01:SV-01': {
    wrong: 'My brother enjoy science magazines.',
    correct: 'My brother enjoys science magazines.',
    targetPattern: 'S + transitive verb + O',
  },
  'A1-G02:TENSE-01': {
    wrong: 'Mina are at home today.',
    correct: 'Mina is at home today.',
    targetPattern: 'S + am/is/are + C / Am/Is/Are + S + C?',
  },
  'A1-G02:SV-02': {
    wrong: 'Does your cousins work nearby?',
    correct: 'Do your cousins work nearby?',
    targetPattern: 'S + do/does not + V / Do/Does + S + V?',
  },
  'A1-G02:WO-02': {
    wrong: 'Where your cousin does work?',
    correct: 'Where does your cousin work?',
    targetPattern: 'WH-word + do/does + S + V?',
  },
  'A1-G03:SV-03': {
    wrong: 'There is two clean cups in the kitchen.',
    correct: 'There are two clean cups in the kitchen.',
    targetPattern: 'There are + plural noun + place phrase',
  },
  'A1-G03:ART-01': {
    wrong: 'There is pharmacy across the street.',
    correct: 'There is a pharmacy across the street.',
    targetPattern: 'There is + a/an + singular noun + place phrase',
  },
  'A1-G04:TENSE-01': {
    wrong: 'The children build a sandcastle now.',
    correct: 'The children are building a sandcastle now.',
    targetPattern: 'S + am/is/are + V-ing',
  },
  'A1-G04:TENSE-02': {
    wrong: 'Yesterday, we take the train to Busan.',
    correct: 'Yesterday, we took the train to Busan.',
    targetPattern: 'S + V-ed / irregular past form',
  },
  'A1-G05:WO-03': {
    wrong: 'She called I after class.',
    correct: 'She called me after class.',
    targetPattern: 'Subject pronoun + V + object pronoun',
  },
  'A1-G05:SV-01': {
    wrong: 'They calls us after class.',
    correct: 'They call us after class.',
    targetPattern: 'Subject pronoun + V + object pronoun',
  },
  'A1-G06:ART-01': {
    wrong: 'I saw dog in the park.',
    correct: 'I saw a dog in the park.',
    targetPattern: 'a/an + singular count noun / the + specific noun',
  },
  'A1-G06:PREP-01': {
    wrong: 'The lesson starts in nine.',
    correct: 'The lesson starts at nine.',
    targetPattern: 'at + clock time / on + day or date / in + month or year',
  },
  'A1-G07:MODAL-01': {
    wrong: 'Mina can swims across the pool.',
    correct: 'Mina can swim across the pool.',
    targetPattern: "S + can/can't + base verb",
  },
  'A1-G07:WO-04': {
    wrong: 'Please the window close.',
    correct: 'Please close the window.',
    targetPattern: "Base verb + object / Don't + base verb",
  },
  'A1-G08:CLAUSE-01': {
    wrong: 'Leo stayed home because was raining.',
    correct: 'Leo stayed home because it was raining.',
    targetPattern: 'clause + and/but/because + clause',
  },
  'A1-G08:WO-05': {
    wrong: 'Leo often is tired after school.',
    correct: 'Leo is often tired after school.',
    targetPattern: 'S + be + frequency adverb + C',
  },
  'A2-G01:TENSE-04': {
    wrong: 'Tomorrow, Mina visited Jeju.',
    correct: 'Tomorrow, Mina will visit Jeju.',
    targetPattern: 'S + will + base verb',
  },
  'A2-G01:MODAL-02': {
    wrong: 'We are going visit Jeju during the school break.',
    correct: 'We are going to visit Jeju during the school break.',
    targetPattern: 'S + am/is/are going to + base verb',
  },
  'A2-G02:TENSE-03': {
    wrong: 'I lived in this neighborhood for six years, and I still live here.',
    correct: 'I have lived in this neighborhood for six years, and I still live here.',
    targetPattern: 'S + have/has + past participle + since/for + time',
  },
  'A2-G02:PREP-02': {
    wrong: 'I have lived in this neighborhood since six years.',
    correct: 'I have lived in this neighborhood for six years.',
    targetPattern: 'S + have/has + past participle + since/for + time',
  },
  'A2-G03:WO-06': {
    wrong: 'This route than the highway is shorter.',
    correct: 'This route is shorter than the highway.',
    targetPattern: 'A + be + comparative + than + B',
  },
  'A2-G03:ART-02': {
    wrong: 'Maya is most patient student in the class.',
    correct: 'Maya is the most patient student in the class.',
    targetPattern: 'A + be + the + superlative + in/of + group',
  },
  'A2-G04:ART-03': {
    wrong: 'We have any milk in the fridge.',
    correct: 'We have some milk in the fridge.',
    targetPattern: 'some/any + plural count noun or uncount noun',
  },
  'A2-G04:SV-04': {
    wrong: 'There is many chairs in the room.',
    correct: 'There are many chairs in the room.',
    targetPattern: 'many/few + plural count noun',
  },
  'A2-G05:MODAL-03': {
    wrong: 'Visitors must signs in at the front desk.',
    correct: 'Visitors must sign in at the front desk.',
    targetPattern: 'S + must/have to/should + base verb',
  },
  'A2-G05:TENSE-04': {
    wrong: 'I can swim when I was six.',
    correct: 'I could swim when I was six.',
    targetPattern: 'S + could + base verb + when + past time',
  },
  'A2-G06:TENSE-05': {
    wrong: 'Yesterday, the museum is closed by the storm.',
    correct: 'Yesterday, the museum was closed by the storm.',
    targetPattern: 'S + was/were + past participle + by + agent',
  },
  'A2-G06:SV-05': {
    wrong: 'The documents is stored on this server.',
    correct: 'The documents are stored on this server.',
    targetPattern: 'S + am/is/are + past participle',
  },
  'A2-G07:CLAUSE-02': {
    wrong: 'The woman lives upstairs is a violinist.',
    correct: 'The woman who lives upstairs is a violinist.',
    targetPattern: 'noun + who/which/that + verb',
  },
  'A2-G07:WO-07': {
    wrong: 'This is the café where did we first meet.',
    correct: 'This is the café where we first met.',
    targetPattern: 'place/time + where/when + subject + verb',
  },
  'A2-G08:WO-08': {
    wrong: 'Myself I fixed the bicycle.',
    correct: 'I fixed the bicycle myself.',
    targetPattern: 'S + reflexive pronoun + V / S + V + object + reflexive pronoun',
  },
  'A2-G08:PREP-03': {
    wrong: 'The children introduced themselves the new coach.',
    correct: 'The children introduced themselves to the new coach.',
    targetPattern: 'S + V + reflexive pronoun',
  },
  'A2-G09:CLAUSE-03': {
    wrong: 'Nora enjoys to cook for her friends.',
    correct: 'Nora enjoys cooking for her friends.',
    targetPattern: 'verb + to + base verb / verb + V-ing',
  },
  'A2-G09:WO-09': {
    wrong: 'Nora enjoys cooking, does she?',
    correct: "Nora enjoys cooking, doesn't she?",
    targetPattern: 'affirmative clause, negative auxiliary + pronoun?',
  },
  'B1-G01:TENSE-03': {
    wrong: 'I have watched that film last May.',
    correct: 'I watched that film last May.',
    targetPattern: 'S + have/has + past participle / S + past verb + finished time',
  },
  'B1-G01:TENSE-06': {
    wrong: 'The train has left before we reached the station.',
    correct: 'The train had left before we reached the station.',
    targetPattern: 'S + had + past participle + before + S + past verb',
  },
  'B1-G02:TENSE-07': {
    wrong: 'If I knew the answer, I will solve the problem.',
    correct: 'If I knew the answer, I would solve the problem.',
    targetPattern: 'If + past, would + base verb',
  },
  'B1-G02:CLAUSE-04': {
    wrong: 'I wish I know how to solve this problem.',
    correct: 'I wish I knew how to solve this problem.',
    targetPattern: 'S + wish + S + past verb',
  },
  'B1-G03:TENSE-08': {
    wrong: 'Last Monday, Jin said that he is working from home that day.',
    correct: 'Last Monday, Jin said that he was working from home that day.',
    targetPattern: 'S + said (that) + reported clause',
  },
  'B1-G03:CLAUSE-05': {
    wrong: 'The guide asked where was the exit.',
    correct: 'The guide asked where the exit was.',
    targetPattern: 'S + asked + if/wh-clause with statement order',
  },
  'B1-G04:CLAUSE-06': {
    wrong: 'We asked whether if the plan could work.',
    correct: 'We asked whether the plan could work.',
    targetPattern: 'S + V + if/whether + S + V',
  },
  'B1-G04:WO-10': {
    wrong: 'Could you tell me where is the nearest ATM?',
    correct: 'Could you tell me where the nearest ATM is?',
    targetPattern: 'S + V + wh-word + S + V',
  },
  'B1-G05:CLAUSE-07': {
    wrong: 'The book that you lent it to me was fascinating.',
    correct: 'The book that you lent me was fascinating.',
    targetPattern: 'defining noun + who/which/that + clause',
  },
  'B1-G05:WO-07': {
    wrong: 'Ms. Patel, who the design team leads, joined us for lunch.',
    correct: 'Ms. Patel, who leads the design team, joined us for lunch.',
    targetPattern: 'noun, who/which + non-defining clause, + main clause',
  },
  'B1-G06:MODAL-04': {
    wrong: 'The lights are off, so they might are asleep.',
    correct: 'The lights are off, so they might be asleep.',
    targetPattern: "S + might/must/can't + base verb",
  },
  'B1-G06:CLAUSE-08': {
    wrong: 'All applications must submitted by Friday.',
    correct: 'All applications must be submitted by Friday.',
    targetPattern: 'S + modal + be + past participle',
  },
  'B1-G07:TENSE-09': {
    wrong: 'I use to live near the river.',
    correct: 'I used to live near the river.',
    targetPattern: 'S + used to + base verb',
  },
  'B1-G07:WO-11': {
    wrong: 'Every summer, would my grandfather take us fishing.',
    correct: 'Every summer, my grandfather would take us fishing.',
    targetPattern: 'past-time context + S + would + base verb',
  },
  'B1-G08:CLAUSE-09': {
    wrong: 'Although the task was difficult, but the team finished it on time.',
    correct: 'Although the task was difficult, the team finished it on time.',
    targetPattern: 'Although + clause, main clause / main clause; however, clause',
  },
  'B1-G08:REG-01': {
    wrong: 'The road was flooded, therefore the buses were delayed.',
    correct: 'The road was flooded; therefore, the buses were delayed.',
    targetPattern: 'cause clause; therefore, result clause',
  },
  'B1-G09:CLAUSE-10': {
    wrong: 'We were thirsty on the way home, so we stopped buying some water.',
    correct: 'We were thirsty on the way home, so we stopped to buy some water.',
    targetPattern: 'stop + to + base verb / stop + V-ing',
  },
  'B1-G09:WO-12': {
    wrong: 'Before you leave tomorrow, please remember locking the door.',
    correct: 'Before you leave tomorrow, please remember to lock the door.',
    targetPattern: 'remember/forget + to + base verb / remember/forget + V-ing',
  },
  'B2-G01:TENSE-10': {
    wrong: 'She has been rehearse all morning.',
    correct: 'She has been rehearsing all morning.',
    targetPattern: 'S + have/has been + V-ing + for/since',
  },
  'B2-G01:TENSE-11': {
    wrong: 'By next June, I complete the certification.',
    correct: 'By next June, I will have completed the certification.',
    targetPattern: 'S + will have + past participle + by + future time',
  },
  'B2-G02:TENSE-12': {
    wrong: 'If we would have checked the forecast, we would have brought umbrellas.',
    correct: 'If we had checked the forecast, we would have brought umbrellas.',
    targetPattern: 'If + S + had + past participle, S + would have + past participle',
  },
  'B2-G02:CLAUSE-11': {
    wrong: 'If Lena had accepted that job, she would have lived in Berlin now.',
    correct: 'If Lena had accepted that job, she would live in Berlin now.',
    targetPattern: 'If + S + had + past participle, S + would + base verb now',
  },
  'B2-G03:MODAL-05': {
    wrong: 'You should told me about the schedule change.',
    correct: 'You should have told me about the schedule change.',
    targetPattern: 'S + should/might/must + have + past participle',
  },
  'B2-G03:TENSE-13': {
    wrong: 'The package must have arrive while we were out.',
    correct: 'The package must have arrived while we were out.',
    targetPattern: 'S + should/might/must + have + past participle',
  },
  'B2-G04:CLAUSE-12': {
    wrong: 'Having finished the presentation, the questions were answered by Mia.',
    correct: 'Having finished the presentation, Mia answered the questions.',
    targetPattern: 'Having + past participle, main clause',
  },
  'B2-G04:SV-06': {
    wrong: 'The documents stored on this server is encrypted.',
    correct: 'The documents stored on this server are encrypted.',
    targetPattern: 'noun + V-ing/past participle phrase',
  },
  'B2-G05:WO-13': {
    wrong: 'Rarely we see such careful craftsmanship.',
    correct: 'Rarely do we see such careful craftsmanship.',
    targetPattern: 'Negative adverbial + auxiliary + S + base verb',
  },
  'B2-G05:CLAUSE-13': {
    wrong: 'It was Hana which noticed the calculation error.',
    correct: 'It was Hana who noticed the calculation error.',
    targetPattern: 'It is/was + focused element + that/who + clause',
  },
  'B2-G06:CLAUSE-14': {
    wrong: 'We had the air conditioner repair before summer.',
    correct: 'We had the air conditioner repaired before summer.',
    targetPattern: 'S + have/get + O + past participle',
  },
  'B2-G06:WO-14': {
    wrong: 'I heard knocking someone at the back door.',
    correct: 'I heard someone knocking at the back door.',
    targetPattern: 'S + see/hear + O + base verb/V-ing',
  },
  'B2-G07:PREP-04': {
    wrong: 'The committee reached an agreement which everyone could commit to it.',
    correct: 'The committee reached an agreement to which everyone could commit.',
    targetPattern: 'noun + preposition + which/whom + S + V',
  },
  'B2-G07:CLAUSE-15': {
    wrong: 'They developed a process whereby is waste heat reused.',
    correct: 'They developed a process whereby waste heat is reused.',
    targetPattern: 'noun + whereby + S + V',
  },
  'B2-G08:REG-02': {
    wrong: 'The city got bigger quickly, and this made people need more houses.',
    correct: 'The rapid expansion of the city increased housing demand.',
    targetPattern: 'the + nominalized noun + of + noun + academic verb',
  },
  'B2-G08:CLAUSE-16': {
    wrong: 'It is essential that to verify every sample.',
    correct: 'It is essential to verify every sample.',
    targetPattern: 'It is adjective + to-infinitive / that-clause',
  },
  'B2-G09:ART-04': {
    wrong: 'The all three remaining proposals require further review.',
    correct: 'All three remaining proposals require further review.',
    targetPattern: 'all + [the/these/my] + number + plural noun',
  },
  'B2-G09:WO-15': {
    wrong: 'Both younger my sisters study environmental science.',
    correct: 'Both my younger sisters study environmental science.',
    targetPattern: 'both + [the/these/my] + adjective + plural noun',
  },
  'C1-G01:REG-03': {
    wrong: 'The first proposal reduced costs; this stuff made it attractive to the board.',
    correct: 'The first proposal reduced costs; this advantage made it attractive to the board.',
    targetPattern: 'noun phrase + reference with this/that/these/those + summary noun',
  },
  'C1-G01:CLAUSE-17': {
    wrong: 'Some teams adopted the new process, while others did not adopt so.',
    correct: 'Some teams adopted the new process, while others did not do so.',
    targetPattern: 'repeated noun/verb phrase → one/ones or do so',
  },
  'C1-G02:WO-16': {
    wrong: 'Only after the audit the company revised its policy.',
    correct: 'Only after the audit did the company revise its policy.',
    targetPattern: 'Only/Not until + phrase/clause + auxiliary + S + base verb',
  },
  'C1-G02:CLAUSE-18': {
    wrong: 'So compelling the evidence was that the committee reopened the case.',
    correct: 'So compelling was the evidence that the committee reopened the case.',
    targetPattern: 'So + adjective + be + S + that + clause',
  },
  'C1-G03:REG-04': {
    wrong: 'The decline definitely proves that reporting practices changed.',
    correct: 'The decline may partly reflect changes in reporting practices.',
    targetPattern: 'S + may/might + base verb',
  },
  'C1-G03:MODAL-06': {
    wrong: 'The decline may partly reflects changes in reporting practices.',
    correct: 'The decline may partly reflect changes in reporting practices.',
    targetPattern: 'S + may/might + base verb',
  },
  'C1-G04:REG-05': {
    wrong: 'The post-consultation policy-introduction processing-time reduction was substantial.',
    correct: 'The policy was introduced after consultation and reduced processing time. The improvement was substantial.',
    targetPattern: 'dense claim; short emphasis sentence.',
  },
  'C1-G04:CLAUSE-19': {
    wrong: 'Introduced after months of consultation, processing time was reduced by the policy.',
    correct: 'The policy, introduced after months of consultation, reduced processing time.',
    targetPattern: 'full relative/adverb clause ↔ participle or prepositional phrase',
  },
  'C1-G05:REG-06': {
    wrong: 'Send me the revised figures now.',
    correct: 'I would appreciate it if you could send me the revised figures by noon.',
    targetPattern: 'Can you + base verb? ↔ I would appreciate it if you could + base verb',
  },
  'C1-G05:REG-07': {
    wrong: 'The study looked into whether income explained the difference.',
    correct: 'The study investigated whether income explained the difference.',
    targetPattern: 'phrasal verb in speech ↔ precise single verb in formal writing',
  },
  'C1-G06:ART-05': {
    wrong: 'The research produced useful finding.',
    correct: 'The research produced a useful finding.',
    targetPattern: 'a/an + new singular count noun / the + identifiable noun / zero article + general plural or uncount noun',
  },
  'C1-G06:PREP-05': {
    wrong: 'The impact for the new regulations on small firms remains uncertain.',
    correct: 'The impact of the new regulations on small firms remains uncertain.',
    targetPattern: 'head noun + singular/plural verb despite intervening phrases',
  },
  'C1-G06:TENSE-14': {
    wrong: 'Research on urban mobility increased significantly over the past decade.',
    correct: 'Research on urban mobility has increased significantly over the past decade.',
    targetPattern: 'time frame + aspect choice: past, present perfect or past perfect',
  },
  'C1-G06:SV-07': {
    wrong: 'The impact of the new regulations on small firms remain uncertain.',
    correct: 'The impact of the new regulations on small firms remains uncertain.',
    targetPattern: 'head noun + singular/plural verb despite intervening phrases',
  },
  'C1-G07:WO-17': {
    wrong: 'We yesterday reviewed carefully the evidence in the office.',
    correct: 'We reviewed the evidence carefully in the office yesterday.',
    targetPattern: 'S + V + manner + place + time',
  },
  'C1-G07:REG-08': {
    wrong: 'We did a decision after reviewing the evidence.',
    correct: 'We made a decision after reviewing the evidence.',
    targetPattern: 'make/take/have + conventional noun collocation',
  },
  'C1-G07:PREP-06': {
    wrong: "The team discussed about the proposal in detail at yesterday's meeting.",
    correct: "The team discussed the proposal in detail at yesterday's meeting.",
    targetPattern: 'S + V + manner + place + time',
  },
}

function categoryPrefix(code: string): string {
  return code.split('-', 1)[0] ?? ''
}

function categoryFor(code: string): ErrorCategory {
  const base = ERROR_CATEGORIES[categoryPrefix(code)]
  if (!base) throw new Error(`Unknown grammar error category: ${code}`)
  return { ...base, ...ERROR_CODE_OVERRIDES[code] }
}

function pairFor(node: GrammarNode, code: string): AuditedErrorPair {
  const key = `${node.id}:${code}`
  const pair = AUDITED_ERROR_PAIRS[key]
  if (!pair) throw new Error(`Missing audited grammar error pair: ${key}`)
  return pair
}

function assertAuditedGrammarCatalog(nodes: readonly GrammarNode[]): boolean {
  if (nodes.length !== 42) return true

  const recognizedPatternCount = nodes.reduce((count, node) => {
    const pairsForNode = Object.entries(AUDITED_ERROR_PAIRS)
      .filter(([key]) => key.startsWith(`${node.id}:`))
      .map(([, pair]) => pair)
    return count + Number(pairsForNode.some((pair) =>
      node.patterns.includes(pair.targetPattern)))
  }, 0)
  // Generic/custom 42-node catalogs are outside this editorial refinement.
  // Once even one audited pattern is present, however, treat the collection
  // as the canonical curriculum and reject partial drift instead of mixing it
  // with unaudited examples.
  if (recognizedPatternCount === 0) return false

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const actualKeys = nodes.flatMap((node) =>
    node.errorCodes.map((code) => `${node.id}:${code}`))
  const expectedKeys = Object.keys(AUDITED_ERROR_PAIRS)
  const actualKeySet = new Set(actualKeys)
  const expectedKeySet = new Set(expectedKeys)
  const missing = expectedKeys.filter((key) => !actualKeySet.has(key))
  const unexpected = actualKeys.filter((key) => !expectedKeySet.has(key))
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Grammar audit coverage mismatch (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'})`,
    )
  }

  for (const [key, pair] of Object.entries(AUDITED_ERROR_PAIRS)) {
    const separator = key.indexOf(':')
    const nodeId = key.slice(0, separator)
    const node = nodesById.get(nodeId)
    if (!node?.patterns.includes(pair.targetPattern)) {
      throw new Error(
        `Audited grammar error pair ${key} targets an unknown node pattern: ${pair.targetPattern}`,
      )
    }
  }
  return true
}

function errorNotesAndPairs(node: GrammarNode): {
  notes: GrammarErrorNote[]
  pairs: Map<string, ErrorPair>
} {
  const pairs = new Map<string, ErrorPair>()
  const notes = node.errorCodes.map((code): GrammarErrorNote => {
    const category = categoryFor(code)
    const pair = pairFor(node, code)
    pairs.set(code, pair)
    return {
      code,
      title: category.title,
      wrongExample: pair.wrong,
      correction: `올바른 예: ${pair.correct} ${category.guidance} 목표 패턴: ${pair.targetPattern}.`,
      reviewRule: `${code}가 두 번 연속 발생하면 ${node.prerequisite ?? node.id}의 관련 규칙을 확인하고, 다른 답으로 고친 뒤 재진단한다.`,
    }
  })
  return { notes, pairs }
}

function refinedRules(node: GrammarNode) {
  return node.rules.map((rule, ruleIndex) => ({
    ...rule,
    exceptions: node.errorCodes.map((code) => {
      const category = categoryFor(code)
      const pattern = pairFor(node, code).targetPattern
      return ruleIndex === 0
        ? `${code}: ${node.title}의 「${pattern}」에서 ${category.guidance}`
        : `${code}: ${node.title}의 「${pattern}」을 실제 문맥에 적용할 때 의미를 먼저 정하고 ${category.title.replace(/ 오류$/, '')}를 마지막에 대조한다.`
    }),
  }))
}

function productionPrompt(node: GrammarNode): string {
  switch (node.level) {
    case 'A1':
      return `${node.title}을 활용해 자기소개·일상 루틴·과거 경험 중 한 맥락을 4~6문장으로 쓰고, 예/아니오 의문문과 WH 의문문을 각각 포함하세요.`
    case 'A2':
      return `${node.title}을 활용해 계획·경험·의무를 포함한 6~8문장 단락을 쓰고, 비교 표현과 간단한 관계절로 문장을 확장하세요.`
    case 'B1':
      return `${node.title}을 활용해 원인과 결과가 연결되는 8~12문장 에세이를 쓰고, 조건문·간접화법·명사절 중 하나 이상을 정확히 사용하세요.`
    case 'B2':
      return `${node.title}을 활용해 서론·근거·반론·결론을 각각 작성하고, 가정법·분사절·강조구문 등 복합문 구조가 쓰인 문장을 세 개 이상 근거로 제시하세요.`
    case 'C1':
      return `${node.title}을 활용해 같은 핵심 내용을 업무 이메일과 학술 단락의 두 문체로 각각 작성하세요. 검토에서 수정이 필요하면 최대 두 차례 안에 자체 교정하세요.`
  }
}

function productionRubric(node: GrammarNode): string[] {
  const levelCriterion = {
    A1: '4~6문장이 한 개인 맥락으로 연결되고 예/아니오 질문과 WH 질문이 모두 자연스럽다.',
    A2: '6~8문장에 계획·경험·의무, 비교 표현과 관계절이 모두 문맥에 맞게 포함된다.',
    B1: '8~12문장 에세이에 원인-결과와 조건문·간접화법·명사절 중 하나 이상이 정확히 포함된다.',
    B2: '서론·근거·반론·결론이 구분되고 서로 다른 복합문 구조 세 개 이상이 정확하다.',
    C1: '두 문체가 같은 핵심 내용을 유지하면서 업무 이메일과 학술 단락의 레지스터를 각각 일관되게 지킨다.',
  }[node.level]
  return [
    `목표 문법과 「${node.patterns.join(' / ')}」 구조의 형태·어순·의미가 정확하다.`,
    levelCriterion,
    `${node.errorCodes.join(', ')}를 점검표로 사용해 목표 문법의 형태·의미·문맥을 스스로 수정했다.`,
  ]
}

function refinedProductionTask(node: GrammarNode): GrammarNode['productionTask'] {
  const constraints = grammarProductionConstraintsForLevel(node.level)
  return {
    prompt: productionPrompt(node),
    requirements: [
      ...constraints.evidenceRequirements.map(({ label }) => label),
      `목표 패턴 「${node.patterns.join(' / ')}」 중 해당 노드의 구조를 정확히 사용한다.`,
    ],
    rubric: productionRubric(node),
    constraints,
  }
}

export function refineGrammarNode(node: GrammarNode): GrammarNode {
  const { notes, pairs } = errorNotesAndPairs(node)
  const exercises = node.exercises.map((exercise, phaseIndex) => {
    const code = node.errorCodes[Math.min(phaseIndex, node.errorCodes.length - 1)]!
    const pair = pairs.get(code)!
    const category = categoryFor(code)
    if (exercise.phase === 'diagnostic') {
      return {
        ...exercise,
        type: 'choice' as const,
        prompt: `${node.title}: ${code}에 해당하지 않는 올바른 문장을 고르세요.`,
        choices: [pair.wrong, pair.correct],
        answer: pair.correct,
        explanation: `${code}: ${category.guidance} 따라서 “${pair.correct}”가 맞다.`,
        errorCode: code,
      }
    }
    return {
      ...exercise,
      type: 'errorCorrection' as const,
      prompt: `${code} 오류 문장을 바르게 고치세요: ${pair.wrong}`,
      choices: [],
      answer: pair.correct,
      explanation: `${code}: ${category.guidance} 따라서 “${pair.correct}”으로 고친다.`,
      errorCode: code,
    }
  })

  return {
    ...node,
    rules: refinedRules(node),
    exercises,
    productionTask: refinedProductionTask(node),
    errorNotes: notes,
  }
}

export function refineGrammarNodes(nodes: readonly GrammarNode[]): GrammarNode[] {
  if (!assertAuditedGrammarCatalog(nodes)) return [...nodes]
  return nodes.map(refineGrammarNode)
}
