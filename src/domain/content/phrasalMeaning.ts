import type { PhrasalVerbItem } from './types'

/**
 * Concise, reader-facing corrections for source glosses whose intended sense is
 * sound but whose machine translation is too literal or structurally unclear.
 * The canonical catalog and its provenance remain unchanged; these labels are
 * deliberately scoped to the reading experience.
 */
const READER_GLOSS_CORRECTIONS: Readonly<Record<string, string>> = {
  'account for': '돈이 어디에 어떻게 쓰였는지 설명하다',
  'base on': '사실이나 근거를 바탕으로 하다',
  'bring out': '숨은 성질이나 특징이 드러나게 하다',
  'carry over': '한 기간의 돈이나 권리를 다음 기간으로 넘기다',
  'deal with': '문제나 상황에 대처하다',
  'draw up': '문서나 계획을 작성하다',
  'fall through': '계획이나 합의가 무산되다',
  'figure out': '이해하거나 해결 방법을 찾아내다',
  'hold back': '감정이나 반응을 드러내지 않고 억누르다',
  'iron out': '남은 문제나 의견 차이를 해결하다',
  'look into': '문제의 사실관계를 조사하다',
  'map out': '과정이나 계획을 자세히 짜다',
  'play down': '실제보다 덜 중요하거나 심각해 보이게 하다',
  'root out': '나쁘거나 불법적인 것을 찾아 없애다',
  'send in': '서류나 자료를 기관에 제출하다',
  'set down': '잊지 않도록 글로 적다',
  'size up': '사람이나 상황을 살펴 판단하다',
  'sort out': '문제나 혼란을 해결하다',
  'sound out': '대화를 통해 의견이나 태도를 알아보다',
  'start out': '처음에는 특정 모습이나 상태로 시작하다',
  'sum up': '사건이나 논의의 핵심을 요약하다',
  'back down': '반대에 부딪혀 요구나 주장을 거두다',
  'back off': '위험하거나 불편한 대상에서 뒤로 물러나다',
  'back out': '약속이나 합의에서 빠지다',
  'bear out': '사실이 맞음을 뒷받침하다',
  'bear with': '잠시 참고 기다려 달라고 부탁하다',
  'believe in': '누군가나 무언가가 존재한다고 믿다',
  'bottle up': '감정을 드러내지 않고 억누르다',
  'brighten up': '날씨나 하늘이 밝아지다',
  'brush off': '상대의 말이나 중요성을 무시하다',
  'buy out': '공동 소유자의 지분을 사들이다',
  'call in': '전문가나 서비스 인력을 불러 문제를 처리하게 하다',
  'catch out': '준비하지 못한 상황에서 곤란하게 하다',
  'check in': '호텔이나 병원에 도착해 등록하다',
  'check into': '호텔이나 병원에 도착해 등록하다',
  'claw back': '잃었던 돈을 세금이나 요금 등으로 되찾다',
  'come across': '특정한 인상을 주다',
  'come apart': '낡거나 약해져 여러 조각으로 분리되다',
  'come off': '말도 안 된다고 핀잔주다',
  'come on': '교체 선수로 경기장에 들어오다',
  'cover up': '사실이나 잘못을 숨기다',
  'cover for': '누군가가 자리를 비운 동안 그 일을 대신하다',
  'dig out': '파서 물건을 꺼내다',
  'do in': '누군가를 몹시 지치게 하다',
  'drag on': '바라는 것보다 오래 끌다',
  'drag up': '잊고 싶은 과거 일을 다시 꺼내다',
  'fear for': '누군가의 안전이나 안부를 걱정하다',
  'fill up': '음식을 충분히 먹어 배부르게 하다',
  'fit in': '집단에 자연스럽게 어울려 받아들여지다',
  'fix on': '눈이나 시선을 누군가나 무언가에 고정하다',
  'fob off': '불완전한 답변이나 물건으로 얼버무리다',
  'follow up': '더 알아보거나 후속 조치를 하다',
  'get over': '나쁜 일을 겪은 뒤 회복하다',
  'get past': '승인권자의 심사를 통과하다',
  'get together': '사람들이 만나 함께 시간을 보내다',
  'hear from': '누군가에게서 연락이나 소식을 받다',
  'hold on': '잠시 기다리다',
  'go against': '결정이나 판결이 누군가에게 불리하게 나다',
  'go out': '유행이 지나다',
  'laugh off': '농담으로 넘겨 대수롭지 않게 여기다',
  'line up': '다른 것과 나란히 맞추다',
  'lock into': '쉽게 벗어날 수 없는 체계나 계획에 묶다',
  'look out': '위험하지 않도록 조심하라고 경고하다',
  'look over': '빠르게 살펴보거나 점검하다',
  'make up': '다툰 뒤 화해하다',
  'make over': '외모나 모습을 바꾸거나 개선하다',
  'mix up': '둘 이상의 사람이나 사물을 서로 혼동하다',
  'muddle along': '뚜렷한 계획 없이 그럭저럭 이어 가다',
  'pair off': '짝을 이루거나 연인이 되다',
  'phone back': '다시 전화하다',
  'pick up': '바닥이나 낮은 곳에 있는 것을 들어 올리다',
  'play along': '목적을 위해 동의하는 척하다',
  'plan on': '무언가를 할 생각이거나 그렇게 될 것으로 예상하다',
  'pull out': '차량이 차선이나 도로로 진입하다',
  'push forward': '반대나 어려움에도 앞으로 나아가다',
  'put across': '생각이나 사람됨을 분명하고 효과적으로 전달하다',
  'put over': '사실이 아닌 것을 믿도록 속이다',
  'rake up': '잊고 싶은 과거 일을 다시 꺼내다',
  'rest with': '결정이나 책임이 누군가에게 있다',
  'run away': '머물던 곳에서 몰래 달아나다',
  'run down': '누군가를 부당하게 깎아내리다',
  'run out': '다 써서 남은 것이 없게 되다',
  'see about': '일을 처리하거나 준비하다',
  'see around': '자주 다니는 곳에서 누군가를 종종 마주치다',
  'seek out': '작정하고 찾아내다',
  'set aside': '나중에 쓰려고 일부를 따로 보관하다',
  'sign away': '서명해 재산이나 권리를 넘기다',
  'slow down': '속도나 활동을 늦추다',
  'speak out': '공개적으로 분명히 의견을 말하다',
  'spy out': '둘러보며 찾아내다',
  'stand back': '감정과 거리를 두고 상황을 객관적으로 보다',
  'stand for': '선거에 출마하다',
  'start in': '불평이나 비난을 장황하게 시작하다',
  'stay back': '앞으로 가지 않고 뒤에 머물다',
  'stick around': '무언가를 기다리며 더 오래 머물다',
  'store up': '나중에 쓰려고 많이 모아 두다',
  'take in': '듣거나 읽은 내용을 이해하고 기억하다',
  'take to': '무언가를 습관으로 시작하다',
  'talk back': '윗사람에게 말대꾸하다',
  'talk round': '설득해 동의하게 하다',
  'top up': '필요한 수준이 되도록 더 채우다',
  'trust to': '다른 방법이 없어 운이나 우연에 기대다',
  'try out': '적합하거나 효과적인지 시험해 보다',
  'turn back': '가던 길을 되돌아가거나 되돌리다',
  'turn off': '기계나 전원을 끄다',
  'turn over': '누운 몸을 반대쪽으로 돌리다',
  'walk around': '눈에 띄는 모습이나 행동으로 돌아다니다',
  'warm up': '따뜻해지거나 따뜻하게 하다',
  'watch out': '위험을 피하도록 조심하다',
  'watch over': '보호하거나 책임지고 지켜보다',
  'wear out': '누군가를 몹시 지치게 하다',
}

function normalizeDictionaryEnding(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.!?]+$/gu, '')
    .replace(/하기 위해서(?:입니다|요)?$/u, '하다')
    .replace(/하기 위해$/u, '하다')
    .replace(/기 위해서(?:입니다|요)?$/u, '다')
    .replace(/기 위해$/u, '다')
    .replace(/하는 데 사용됩니다$/u, '할 때 쓰는 말이다')
    .replace(/하는 것입니다$/u, '하다')
    .replace(/하는 것이다$/u, '하다')
    .replace(/하는 것은$/u, '하다')
    .replace(/하는 것$/u, '하다')
    .replace(/하게 되는 것이다$/u, '하게 되다')
    .replace(/해야 할 것이다$/u, '하다')
    .replace(/해야 합니다$/u, '하다')
    .replace(/하세요$/u, '하다')
    .replace(/합니다$/u, '하다')
    .replace(/됩니다$/u, '되다')
    .replace(/있습니다$/u, '있다')
    .replace(/없습니다$/u, '없다')
    .replace(/것입니다$/u, '것이다')
    .replace(/입니다$/u, '이다')
    .replace(/당신/gu, '자신')
}

export function readerPhrasalVerbMeanings(
  item: Pick<PhrasalVerbItem, 'phrasalVerb' | 'meaningKo'>,
): string[] {
  const correction = READER_GLOSS_CORRECTIONS[item.phrasalVerb]
  if (correction) return [correction]
  return [...new Set(item.meaningKo
    .map(normalizeDictionaryEnding)
    .filter((meaning) => meaning.length > 0))]
}

export function hasReaderGlossCorrection(phrase: string): boolean {
  return Object.hasOwn(READER_GLOSS_CORRECTIONS, phrase)
}
