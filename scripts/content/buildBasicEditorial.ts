import { readFile, writeFile } from 'node:fs/promises'

import type { StoryContent, WordEntry, WordItem } from '../../src/domain/content/types'
import { normalizeWord } from './normalize'

type WordKind = 'noun' | 'verb' | 'adjective'

interface BasicEditorialWord {
  lemma: string
  kind: WordKind
  meaning: string
  examples?: [string, string]
}

/**
 * Directly edited beginner vocabulary. These words are intentionally kept in
 * source control instead of being an opaque translation-service export.
 */
export const BASIC_EDITORIAL_WORDS: readonly BasicEditorialWord[] = [
  ['apple', 'noun', '사과'], ['baby', 'noun', '아기'], ['bag', 'noun', '가방'],
  ['ball', 'noun', '공'], ['bed', 'noun', '침대'], ['bird', 'noun', '새'],
  ['fish', 'noun', '물고기'], ['boy', 'noun', '소년'], ['bread', 'noun', '빵'],
  ['bus', 'noun', '버스'], ['cake', 'noun', '케이크'], ['car', 'noun', '자동차'],
  ['cat', 'noun', '고양이'], ['hat', 'noun', '모자'], ['child', 'noun', '아이'],
  ['city', 'noun', '도시'], ['class', 'noun', '수업'], ['clock', 'noun', '시계'],
  ['clothes', 'noun', '옷'], ['cup', 'noun', '컵'], ['day', 'noun', '날'],
  ['dog', 'noun', '개'], ['door', 'noun', '문'], ['egg', 'noun', '달걀'],
  ['family', 'noun', '가족'], ['flower', 'noun', '꽃'], ['ice', 'noun', '얼음'],
  ['game', 'noun', '게임'], ['girl', 'noun', '소녀'], ['hand', 'noun', '손'],
  ['house', 'noun', '집'], ['key', 'noun', '열쇠'], ['kitchen', 'noun', '부엌'],
  ['letter', 'noun', '편지'], ['milk', 'noun', '우유'], ['money', 'noun', '돈'],
  ['moon', 'noun', '달'], ['morning', 'noun', '아침'], ['name', 'noun', '이름'],
  ['night', 'noun', '밤'], ['parent', 'noun', '부모'], ['park', 'noun', '공원'],
  ['pen', 'noun', '펜'], ['picture', 'noun', '그림'], ['room', 'noun', '방'],
  ['king', 'noun', '왕'], ['shoe', 'noun', '신발'], ['sister', 'noun', '자매'],
  ['song', 'noun', '노래'], ['table', 'noun', '탁자'],
  ['be', 'verb', '이다', ['To be kind is good.', 'Be happy today.']],
  ['come', 'verb', '오다', ['Come here, please.', 'They come home after school.']],
  ['do', 'verb', '하다', ['I do my homework.', 'We do it together.']],
  ['drink', 'verb', '마시다', ['I drink water.', 'We drink milk.']],
  ['eat', 'verb', '먹다', ['I eat an apple.', 'We eat bread.']],
  ['find', 'verb', '찾다', ['I find my key.', 'We find the book.']],
  ['get', 'verb', '얻다', ['I get a gift.', 'We get on the bus.']],
  ['give', 'verb', '주다', ['I give Mom a flower.', 'We give help to friends.']],
  ['go', 'verb', '가다', ['I go home.', 'We go to school.']],
  ['have', 'verb', '가지다', ['I have a book.', 'We have a game.']],
  ['help', 'verb', '돕다', ['I help my friend.', 'We help Dad.']],
  ['know', 'verb', '알다', ['I know your name.', 'We know the answer.']],
  ['like', 'verb', '좋아하다', ['I like music.', 'We like games.']],
  ['look', 'verb', '보다', ['I look at the moon.', 'We look outside.']],
  ['make', 'verb', '만들다', ['I make a cake.', 'We make a picture.']],
  ['play', 'verb', '놀다', ['The children play outside.', 'We play a game together.']],
  ['read', 'verb', '읽다', ['I read a book.', 'We read together.']],
  ['run', 'verb', '달리다', ['I run in the park.', 'We run fast.']],
  ['see', 'verb', '보다', ['I see a bird.', 'We see the moon.']],
  ['sit', 'verb', '앉다', ['I sit on a chair.', 'We sit together.']],
  ['sleep', 'verb', '자다', ['I sleep at night.', 'Babies sleep.']],
  ['take', 'verb', '가지고 가다', ['I take a bus.', 'We take a picture.']],
  ['talk', 'verb', '말하다', ['I talk to my teacher.', 'We talk together.']],
  ['walk', 'verb', '걷다', ['I walk to school.', 'We walk in the park.']],
  ['write', 'verb', '쓰다', ['I write a letter.', 'We write our names.']],
  ['big', 'adjective', '큰'], ['black', 'adjective', '검은'], ['blue', 'adjective', '파란'],
  ['clean', 'adjective', '깨끗한'], ['cold', 'adjective', '차가운'], ['fast', 'adjective', '빠른'],
  ['good', 'adjective', '좋은'], ['juice', 'noun', '주스'],
  ['happy', 'adjective', '행복한', ['I am happy today.', 'The happy child smiles.']],
  ['hot', 'adjective', '뜨거운'], ['little', 'adjective', '작은'], ['long', 'adjective', '긴'],
  ['new', 'adjective', '새로운'], ['old', 'adjective', '오래된'], ['red', 'adjective', '빨간'],
  ['sad', 'adjective', '슬픈'], ['short', 'adjective', '짧은'], ['small', 'adjective', '작은'],
  ['strong', 'adjective', '강한'], ['tall', 'adjective', '키가 큰'],
  ['tired', 'adjective', '피곤한', ['I am tired today.', 'We feel tired after the game.']],
  ['warm', 'adjective', '따뜻한'], ['white', 'adjective', '하얀'],
  ['yellow', 'adjective', '노란'], ['young', 'adjective', '어린'],
  ['air', 'noun', '공기'], ['animal', 'noun', '동물'], ['arm', 'noun', '팔'],
  ['aunt', 'noun', '이모'], ['banana', 'noun', '바나나'], ['bathroom', 'noun', '욕실'],
  ['beach', 'noun', '해변'], ['bicycle', 'noun', '자전거'], ['blanket', 'noun', '담요'],
  ['boat', 'noun', '배'], ['body', 'noun', '몸'], ['brother', 'noun', '형제'],
  ['camera', 'noun', '카메라'], ['candle', 'noun', '양초'], ['computer', 'noun', '컴퓨터'],
  ['country', 'noun', '나라'], ['cow', 'noun', '소'], ['daddy', 'noun', '아빠'],
  ['desk', 'noun', '책상'], ['doctor', 'noun', '의사'], ['farm', 'noun', '농장'],
  ['father', 'noun', '아버지'], ['fire', 'noun', '불'], ['foot', 'noun', '발'],
  ['fruit', 'noun', '과일'], ['garden', 'noun', '정원'], ['grandfather', 'noun', '할아버지'],
  ['grandmother', 'noun', '할머니'], ['guitar', 'noun', '기타'], ['hair', 'noun', '머리카락'],
  ['hospital', 'noun', '병원'], ['island', 'noun', '섬'], ['jacket', 'noun', '재킷'],
  ['lake', 'noun', '호수'], ['leg', 'noun', '다리'], ['library', 'noun', '도서관'],
  ['lunch', 'noun', '점심'], ['map', 'noun', '지도'], ['market', 'noun', '시장'],
  ['meal', 'noun', '식사'], ['mountain', 'noun', '산'], ['mouth', 'noun', '입'],
  ['museum', 'noun', '박물관'], ['newspaper', 'noun', '신문'], ['ocean', 'noun', '바다'],
  ['office', 'noun', '사무실'], ['orange', 'noun', '오렌지'], ['phone', 'noun', '전화기'],
  ['rain', 'noun', '비'], ['river', 'noun', '강'],
  ['ask', 'verb', '묻다', ['I ask a question.', 'We ask the teacher.']],
  ['bring', 'verb', '가져오다', ['I bring my bag.', 'We bring food to the park.']],
  ['buy', 'verb', '사다', ['I buy an apple.', 'We buy a new book.']],
  ['call', 'verb', '전화하다', ['I call my mom.', 'We call the doctor.']],
  ['carry', 'verb', '나르다', ['I carry the box.', 'We carry our bags.']],
  ['close', 'verb', '닫다', ['I close the door.', 'We close the book.']],
  ['cook', 'verb', '요리하다', ['I cook rice.', 'We cook dinner together.']],
  ['cut', 'verb', '자르다', ['I cut the cake.', 'We cut the paper.']],
  ['dance', 'verb', '춤추다', ['I dance to a song.', 'We dance together.']],
  ['drive', 'verb', '운전하다', ['I drive a car.', 'We drive to the beach.']],
  ['finish', 'verb', '끝내다', ['I finish my work.', 'We finish the game.']],
  ['fly', 'verb', '날다', ['Birds fly high.', 'We fly to another city.']],
  ['grow', 'verb', '자라다', ['Flowers grow in the garden.', 'We grow vegetables.']],
  ['hear', 'verb', '듣다', ['I hear a song.', 'We hear the rain.']],
  ['hold', 'verb', '잡다', ['I hold your hand.', 'We hold the flag.']],
  ['learn', 'verb', '배우다', ['I learn new words.', 'We learn at school.']],
  ['listen', 'verb', '듣다', ['I listen to music.', 'We listen to the teacher.']],
  ['live', 'verb', '살다', ['I live with my family.', 'We live near the park.']],
  ['meet', 'verb', '만나다', ['I meet my friend.', 'We meet after class.']],
  ['open', 'verb', '열다', ['I open the door.', 'We open the window.']],
  ['pay', 'verb', '지불하다', ['I pay for the cake.', 'We pay at the market.']],
  ['put', 'verb', '놓다', ['I put the pen on the desk.', 'We put on our jackets.']],
  ['sing', 'verb', '노래하다', ['I sing a song.', 'We sing together.']],
  ['swim', 'verb', '수영하다', ['I swim in the pool.', 'We swim at the beach.']],
  ['teach', 'verb', '가르치다', ['I teach a song.', 'We teach each other.']],
  ['angry', 'adjective', '화난'], ['beautiful', 'adjective', '아름다운'],
  ['bright', 'adjective', '밝은'], ['brown', 'adjective', '갈색의'],
  ['cheap', 'adjective', '싼'], ['cloudy', 'adjective', '흐린'], ['dark', 'adjective', '어두운'],
  ['dirty', 'adjective', '더러운'], ['early', 'adjective', '이른'], ['empty', 'adjective', '빈'],
  ['full', 'adjective', '가득 찬'], ['funny', 'adjective', '재미있는'],
  ['heavy', 'adjective', '무거운'], ['kind', 'adjective', '친절한'], ['light', 'adjective', '가벼운'],
  ['loud', 'adjective', '시끄러운'], ['quiet', 'adjective', '조용한'],
  ['ready', 'adjective', '준비된'], ['rich', 'adjective', '부유한'], ['round', 'adjective', '둥근'],
  ['slow', 'adjective', '느린'], ['soft', 'adjective', '부드러운'], ['sunny', 'adjective', '화창한'],
  ['thirsty', 'adjective', '목마른'], ['wet', 'adjective', '젖은'],
  ['airport', 'noun', '공항'], ['apartment', 'noun', '아파트'], ['artist', 'noun', '예술가'],
  ['bakery', 'noun', '빵집'], ['balloon', 'noun', '풍선'], ['bank', 'noun', '은행'],
  ['basket', 'noun', '바구니'], ['bell', 'noun', '종'], ['birthday', 'noun', '생일'],
  ['bottle', 'noun', '병'], ['box', 'noun', '상자'], ['bridge', 'noun', '다리'],
  ['building', 'noun', '건물'], ['butter', 'noun', '버터'], ['calendar', 'noun', '달력'],
  ['captain', 'noun', '선장'], ['castle', 'noun', '성'], ['center', 'noun', '중심'],
  ['church', 'noun', '교회'], ['circle', 'noun', '원'], ['coat', 'noun', '외투'],
  ['coffee', 'noun', '커피'], ['college', 'noun', '대학'], ['corner', 'noun', '모퉁이'],
  ['daughter', 'noun', '딸'], ['dinner', 'noun', '저녁 식사'], ['dream', 'noun', '꿈'],
  ['driver', 'noun', '운전사'], ['earth', 'noun', '지구'], ['engine', 'noun', '엔진'],
  ['engineer', 'noun', '기술자'], ['entrance', 'noun', '입구'], ['factory', 'noun', '공장'],
  ['field', 'noun', '들판'], ['floor', 'noun', '바닥'], ['forest', 'noun', '숲'],
  ['gift', 'noun', '선물'], ['glass', 'noun', '유리잔'], ['ground', 'noun', '땅'],
  ['guest', 'noun', '손님'], ['holiday', 'noun', '휴일'], ['homework', 'noun', '숙제'],
  ['hotel', 'noun', '호텔'], ['hour', 'noun', '시간'], ['job', 'noun', '일'],
  ['knee', 'noun', '무릎'], ['knife', 'noun', '칼'], ['language', 'noun', '언어'],
  ['lesson', 'noun', '수업'], ['line', 'noun', '줄'],
  ['arrive', 'verb', '도착하다', ['We arrive at the airport early.', 'The bus arrives on time.']],
  ['begin', 'verb', '시작하다', ['We begin our work together.', 'The lesson begins now.']],
  ['borrow', 'verb', '빌리다', ['I borrow a book from the library.', 'We borrow a map.']],
  ['catch', 'verb', '잡다', ['I catch the ball.', 'We catch the bus at eight.']],
  ['change', 'verb', '바꾸다', ['I change my coat.', 'The weather changes quickly.']],
  ['choose', 'verb', '고르다', ['I choose a red balloon.', 'We choose a game to play.']],
  ['climb', 'verb', '오르다', ['I climb the small hill.', 'We climb the stairs slowly.']],
  ['collect', 'verb', '모으다', ['I collect colorful leaves.', 'We collect the books.']],
  ['count', 'verb', '세다', ['I count the apples.', 'We count from one to ten.']],
  ['cover', 'verb', '덮다', ['I cover the bed with a blanket.', 'Clouds cover the moon.']],
  ['cross', 'verb', '건너다', ['I cross the bridge carefully.', 'We cross the street together.']],
  ['cry', 'verb', '울다', ['I cry when I feel sad.', 'The baby cries at night.']],
  ['drop', 'verb', '떨어뜨리다', ['I drop my pen.', 'Leaves drop from the tree.']],
  ['enjoy', 'verb', '즐기다', ['I enjoy the sunny day.', 'We enjoy the music.']],
  ['fall', 'verb', '떨어지다', ['Leaves fall from the tree.', 'Rain falls from the sky.']],
  ['feed', 'verb', '먹이를 주다', ['I feed the cat.', 'We feed the birds in winter.']],
  ['fill', 'verb', '채우다', ['I fill the cup with water.', 'We fill the basket with fruit.']],
  ['fix', 'verb', '고치다', ['I fix the broken toy.', 'We fix the bicycle together.']],
  ['follow', 'verb', '따라가다', ['I follow my teacher.', 'We follow the map.']],
  ['forget', 'verb', '잊다', ['I forget my phone at home.', 'We do not forget the key.']],
  ['happen', 'verb', '일어나다', ['Good things happen every day.', 'What happens after lunch?']],
  ['join', 'verb', '함께하다', ['I join the game.', 'We join hands in a circle.']],
  ['leave', 'verb', '떠나다', ['I leave home in the morning.', 'We leave the park at night.']],
  ['lend', 'verb', '빌려주다', ['I lend my pen to a friend.', 'We lend a hand to Dad.']],
  ['lose', 'verb', '잃어버리다', ['I lose my hat.', 'We lose the game sometimes.']],
  ['afraid', 'adjective', '무서워하는'], ['alive', 'adjective', '살아 있는'],
  ['bored', 'adjective', '지루한'], ['brave', 'adjective', '용감한'], ['busy', 'adjective', '바쁜'],
  ['calm', 'adjective', '차분한'], ['clear', 'adjective', '맑은'], ['clever', 'adjective', '영리한'],
  ['cool', 'adjective', '시원한'], ['dangerous', 'adjective', '위험한'], ['deep', 'adjective', '깊은'],
  ['difficult', 'adjective', '어려운'], ['dry', 'adjective', '마른'], ['easy', 'adjective', '쉬운'],
  ['excited', 'adjective', '신이 난'], ['fair', 'adjective', '공정한'], ['famous', 'adjective', '유명한'],
  ['free', 'adjective', '자유로운'], ['fresh', 'adjective', '신선한'], ['friendly', 'adjective', '친근한'],
  ['healthy', 'adjective', '건강한'], ['helpful', 'adjective', '도움이 되는'],
  ['hungry', 'adjective', '배고픈'], ['important', 'adjective', '중요한'], ['interesting', 'adjective', '흥미로운'],
].map(([lemma, kind, meaning, examples]) => ({ lemma, kind, meaning, examples })) as readonly BasicEditorialWord[]

const IRREGULAR_NOUN_FORMS: Readonly<Record<string, string[]>> = {
  child: ['child', 'children'],
  clothes: ['clothes'],
  bread: ['bread'],
  milk: ['milk'],
  money: ['money'],
  air: ['air'],
  hair: ['hair'],
  fruit: ['fruit'],
  foot: ['foot', 'feet'],
  butter: ['butter'],
  coffee: ['coffee'],
  earth: ['earth'],
  homework: ['homework'],
  knife: ['knife', 'knives'],
}

const VERB_FORMS: Readonly<Record<string, Record<string, string>>> = {
  be: { base: 'be', s3: 'is', past: 'was', participle: 'being', pastParticiple: 'been' },
  come: { base: 'come', s3: 'comes', past: 'came', participle: 'coming', pastParticiple: 'come' },
  do: { base: 'do', s3: 'does', past: 'did', participle: 'doing', pastParticiple: 'done' },
  drink: { base: 'drink', s3: 'drinks', past: 'drank', participle: 'drinking', pastParticiple: 'drunk' },
  eat: { base: 'eat', s3: 'eats', past: 'ate', participle: 'eating', pastParticiple: 'eaten' },
  find: { base: 'find', s3: 'finds', past: 'found', participle: 'finding', pastParticiple: 'found' },
  get: { base: 'get', s3: 'gets', past: 'got', participle: 'getting', pastParticiple: 'got' },
  give: { base: 'give', s3: 'gives', past: 'gave', participle: 'giving', pastParticiple: 'given' },
  go: { base: 'go', s3: 'goes', past: 'went', participle: 'going', pastParticiple: 'gone' },
  have: { base: 'have', s3: 'has', past: 'had', participle: 'having', pastParticiple: 'had' },
  help: { base: 'help', s3: 'helps', past: 'helped', participle: 'helping', pastParticiple: 'helped' },
  know: { base: 'know', s3: 'knows', past: 'knew', participle: 'knowing', pastParticiple: 'known' },
  like: { base: 'like', s3: 'likes', past: 'liked', participle: 'liking', pastParticiple: 'liked' },
  look: { base: 'look', s3: 'looks', past: 'looked', participle: 'looking', pastParticiple: 'looked' },
  make: { base: 'make', s3: 'makes', past: 'made', participle: 'making', pastParticiple: 'made' },
  play: { base: 'play', s3: 'plays', past: 'played', participle: 'playing', pastParticiple: 'played' },
  read: { base: 'read', s3: 'reads', past: 'read', participle: 'reading', pastParticiple: 'read' },
  run: { base: 'run', s3: 'runs', past: 'ran', participle: 'running', pastParticiple: 'run' },
  see: { base: 'see', s3: 'sees', past: 'saw', participle: 'seeing', pastParticiple: 'seen' },
  sit: { base: 'sit', s3: 'sits', past: 'sat', participle: 'sitting', pastParticiple: 'sat' },
  sleep: { base: 'sleep', s3: 'sleeps', past: 'slept', participle: 'sleeping', pastParticiple: 'slept' },
  take: { base: 'take', s3: 'takes', past: 'took', participle: 'taking', pastParticiple: 'taken' },
  talk: { base: 'talk', s3: 'talks', past: 'talked', participle: 'talking', pastParticiple: 'talked' },
  walk: { base: 'walk', s3: 'walks', past: 'walked', participle: 'walking', pastParticiple: 'walked' },
  write: { base: 'write', s3: 'writes', past: 'wrote', participle: 'writing', pastParticiple: 'written' },
  ask: { base: 'ask', s3: 'asks', past: 'asked', participle: 'asking', pastParticiple: 'asked' },
  bring: { base: 'bring', s3: 'brings', past: 'brought', participle: 'bringing', pastParticiple: 'brought' },
  buy: { base: 'buy', s3: 'buys', past: 'bought', participle: 'buying', pastParticiple: 'bought' },
  call: { base: 'call', s3: 'calls', past: 'called', participle: 'calling', pastParticiple: 'called' },
  carry: { base: 'carry', s3: 'carries', past: 'carried', participle: 'carrying', pastParticiple: 'carried' },
  close: { base: 'close', s3: 'closes', past: 'closed', participle: 'closing', pastParticiple: 'closed' },
  cook: { base: 'cook', s3: 'cooks', past: 'cooked', participle: 'cooking', pastParticiple: 'cooked' },
  cut: { base: 'cut', s3: 'cuts', past: 'cut', participle: 'cutting', pastParticiple: 'cut' },
  dance: { base: 'dance', s3: 'dances', past: 'danced', participle: 'dancing', pastParticiple: 'danced' },
  drive: { base: 'drive', s3: 'drives', past: 'drove', participle: 'driving', pastParticiple: 'driven' },
  finish: { base: 'finish', s3: 'finishes', past: 'finished', participle: 'finishing', pastParticiple: 'finished' },
  fly: { base: 'fly', s3: 'flies', past: 'flew', participle: 'flying', pastParticiple: 'flown' },
  grow: { base: 'grow', s3: 'grows', past: 'grew', participle: 'growing', pastParticiple: 'grown' },
  hear: { base: 'hear', s3: 'hears', past: 'heard', participle: 'hearing', pastParticiple: 'heard' },
  hold: { base: 'hold', s3: 'holds', past: 'held', participle: 'holding', pastParticiple: 'held' },
  learn: { base: 'learn', s3: 'learns', past: 'learned', participle: 'learning', pastParticiple: 'learned' },
  listen: { base: 'listen', s3: 'listens', past: 'listened', participle: 'listening', pastParticiple: 'listened' },
  live: { base: 'live', s3: 'lives', past: 'lived', participle: 'living', pastParticiple: 'lived' },
  meet: { base: 'meet', s3: 'meets', past: 'met', participle: 'meeting', pastParticiple: 'met' },
  open: { base: 'open', s3: 'opens', past: 'opened', participle: 'opening', pastParticiple: 'opened' },
  pay: { base: 'pay', s3: 'pays', past: 'paid', participle: 'paying', pastParticiple: 'paid' },
  put: { base: 'put', s3: 'puts', past: 'put', participle: 'putting', pastParticiple: 'put' },
  sing: { base: 'sing', s3: 'sings', past: 'sang', participle: 'singing', pastParticiple: 'sung' },
  swim: { base: 'swim', s3: 'swims', past: 'swam', participle: 'swimming', pastParticiple: 'swum' },
  teach: { base: 'teach', s3: 'teaches', past: 'taught', participle: 'teaching', pastParticiple: 'taught' },
  arrive: { base: 'arrive', s3: 'arrives', past: 'arrived', participle: 'arriving', pastParticiple: 'arrived' },
  begin: { base: 'begin', s3: 'begins', past: 'began', participle: 'beginning', pastParticiple: 'begun' },
  borrow: { base: 'borrow', s3: 'borrows', past: 'borrowed', participle: 'borrowing', pastParticiple: 'borrowed' },
  catch: { base: 'catch', s3: 'catches', past: 'caught', participle: 'catching', pastParticiple: 'caught' },
  change: { base: 'change', s3: 'changes', past: 'changed', participle: 'changing', pastParticiple: 'changed' },
  choose: { base: 'choose', s3: 'chooses', past: 'chose', participle: 'choosing', pastParticiple: 'chosen' },
  climb: { base: 'climb', s3: 'climbs', past: 'climbed', participle: 'climbing', pastParticiple: 'climbed' },
  collect: { base: 'collect', s3: 'collects', past: 'collected', participle: 'collecting', pastParticiple: 'collected' },
  count: { base: 'count', s3: 'counts', past: 'counted', participle: 'counting', pastParticiple: 'counted' },
  cover: { base: 'cover', s3: 'covers', past: 'covered', participle: 'covering', pastParticiple: 'covered' },
  cross: { base: 'cross', s3: 'crosses', past: 'crossed', participle: 'crossing', pastParticiple: 'crossed' },
  cry: { base: 'cry', s3: 'cries', past: 'cried', participle: 'crying', pastParticiple: 'cried' },
  drop: { base: 'drop', s3: 'drops', past: 'dropped', participle: 'dropping', pastParticiple: 'dropped' },
  enjoy: { base: 'enjoy', s3: 'enjoys', past: 'enjoyed', participle: 'enjoying', pastParticiple: 'enjoyed' },
  fall: { base: 'fall', s3: 'falls', past: 'fell', participle: 'falling', pastParticiple: 'fallen' },
  feed: { base: 'feed', s3: 'feeds', past: 'fed', participle: 'feeding', pastParticiple: 'fed' },
  fill: { base: 'fill', s3: 'fills', past: 'filled', participle: 'filling', pastParticiple: 'filled' },
  fix: { base: 'fix', s3: 'fixes', past: 'fixed', participle: 'fixing', pastParticiple: 'fixed' },
  follow: { base: 'follow', s3: 'follows', past: 'followed', participle: 'following', pastParticiple: 'followed' },
  forget: { base: 'forget', s3: 'forgets', past: 'forgot', participle: 'forgetting', pastParticiple: 'forgotten' },
  happen: { base: 'happen', s3: 'happens', past: 'happened', participle: 'happening', pastParticiple: 'happened' },
  join: { base: 'join', s3: 'joins', past: 'joined', participle: 'joining', pastParticiple: 'joined' },
  leave: { base: 'leave', s3: 'leaves', past: 'left', participle: 'leaving', pastParticiple: 'left' },
  lend: { base: 'lend', s3: 'lends', past: 'lent', participle: 'lending', pastParticiple: 'lent' },
  lose: { base: 'lose', s3: 'loses', past: 'lost', participle: 'losing', pastParticiple: 'lost' },
}

/** A directly reviewed IPA correction for the one selected lemma absent upstream. */
const EDITORIAL_IPA: Readonly<Record<string, string>> = {
  clothes: '/kloʊðz/',
}

function plural(lemma: string): string {
  if (/(s|x|ch|sh)$/.test(lemma)) return `${lemma}es`
  if (/[^aeiou]y$/.test(lemma)) return `${lemma.slice(0, -1)}ies`
  return `${lemma}s`
}

function adjectiveForms(lemma: string): string[] {
  const irregular: Readonly<Record<string, string[]>> = {
    good: ['good', 'better', 'best'],
    little: ['little', 'less', 'least'],
    big: ['big', 'bigger', 'biggest'],
    hot: ['hot', 'hotter', 'hottest'],
    sad: ['sad', 'sadder', 'saddest'],
    wet: ['wet', 'wetter', 'wettest'],
    beautiful: ['beautiful', 'more beautiful', 'most beautiful'],
    afraid: ['afraid'],
    alive: ['alive'],
    bored: ['bored', 'more bored', 'most bored'],
    dangerous: ['dangerous', 'more dangerous', 'most dangerous'],
    difficult: ['difficult', 'more difficult', 'most difficult'],
    excited: ['excited', 'more excited', 'most excited'],
    famous: ['famous', 'more famous', 'most famous'],
    helpful: ['helpful', 'more helpful', 'most helpful'],
    important: ['important', 'more important', 'most important'],
    interesting: ['interesting', 'more interesting', 'most interesting'],
  }
  if (irregular[lemma]) return irregular[lemma]
  if (lemma.endsWith('y')) return [lemma, `${lemma.slice(0, -1)}ier`, `${lemma.slice(0, -1)}iest`]
  return [lemma, `${lemma}er`, `${lemma}est`]
}

function examplesFor(word: BasicEditorialWord): [string, string] {
  if (word.examples) return word.examples
  if (word.kind === 'noun') {
    if (word.lemma === 'clothes') return ['My clothes are clean.', 'These clothes are new.']
    if (word.lemma === 'bread') return ['Bread is warm.', 'We eat bread together.']
    if (word.lemma === 'milk') return ['Milk is in the cup.', 'I drink milk every day.']
    if (word.lemma === 'money') return ['Money is in my bag.', 'I save my money.']
    return [`The ${word.lemma} is here.`, `I like this ${word.lemma}.`]
  }
  return [`The ball is ${word.lemma}.`, `It looks ${word.lemma}.`]
}

function formsFor(word: BasicEditorialWord): string[] | Record<string, string> {
  if (word.kind === 'verb') return VERB_FORMS[word.lemma]!
  if (word.kind === 'adjective') return adjectiveForms(word.lemma)
  return IRREGULAR_NOUN_FORMS[word.lemma] ?? [word.lemma, plural(word.lemma)]
}

export function buildBasicEditorialWords(ipaByLemma: ReadonlyMap<string, string>): WordItem[] {
  return BASIC_EDITORIAL_WORDS.map((word, rank) => {
    const ipa = ipaByLemma.get(word.lemma) ?? EDITORIAL_IPA[word.lemma]
    if (!ipa) throw new Error(`Missing pinned IPA for ${word.lemma}`)
    return normalizeWord({
      lemma: word.lemma,
      levelBucket: '기초',
      rank,
      partOfSpeech: word.kind,
      meanings: [word.meaning],
      ipa,
      forms: formsFor(word),
      examples: examplesFor(word),
    })
  })
}

function entryForms(entry: WordEntry): string[] {
  return Array.isArray(entry.forms) ? entry.forms : Object.values(entry.forms)
}

/** Builds an authored beginner reading passage from the directly reviewed examples. */
export function buildBasicEditorialStory(words: readonly WordItem[]): StoryContent {
  const readingLines = ['To be kind is good.', ...words.map((word) => word.entries[0]!.examples[0]!)]
  return {
    schemaVersion: '1.0.0',
    level: '기초',
    title: '작은 것들로 시작한 하루',
    isManual: true,
    coverage: {
      mustCoverAll: true,
      allowUpperLevelWords: false,
      coverageRate: 1,
    },
    usedWords: words.map((word) => ({
      lemma: word.lemma,
      partOfSpeech: word.entries[0]!.partOfSpeech,
      forms: entryForms(word.entries[0]!),
    })),
    storyText: readingLines.join(' '),
  }
}

export function parseIpaDictionary(source: string): Map<string, string> {
  const entries = source.split(/\r?\n/).flatMap((line) => {
    const [lemma, values] = line.split('\t')
    const ipa = values?.match(/\/[^/]+\//)?.[0]
    return lemma && ipa ? [[lemma.toLowerCase(), ipa] as const] : []
  })
  return new Map(entries)
}

export async function readIpaDictionary(path: string): Promise<Map<string, string>> {
  return parseIpaDictionary(await readFile(path, 'utf8'))
}

async function main(): Promise<void> {
  const ipa = await readIpaDictionary('.content-cache/ipa-dict-en_US.txt')
  await writeFile(
    'public/data/wordlists/기초.json',
    `${JSON.stringify(buildBasicEditorialWords(ipa), null, 2)}\n`,
  )
  await writeFile(
    'public/data/stories/기초.json',
    `${JSON.stringify(buildBasicEditorialStory(buildBasicEditorialWords(ipa)), null, 2)}\n`,
  )
}

if (process.argv[1]?.endsWith('buildBasicEditorial.ts')) {
  await main()
}
