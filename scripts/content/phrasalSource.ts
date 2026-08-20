import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'

import type { Level } from '../../src/domain/content/types'
import WinkPosTagger from 'wink-pos-tagger'

import {
  formsFor,
  parseCefrCsv,
  parseFrequencyCsv,
  sentenceFormsMatchPartOfSpeech,
} from './buildWordCatalog'
import { parseIpaDictionary } from './buildBasicEditorial'

export const PHRASAL_TRANSLATION_MODEL = {
  id: 'seongs/ke-t5-base-aihub-koen-translation-integrated-10m-en-to-ko',
  revision: '280cc2c35ec50579e1534c0493fcdcfdf0c5ece3',
  license: 'Apache-2.0',
} as const

export const PHRASAL_ALIGNMENT_MODEL = {
  id: 'sentence-transformers/all-MiniLM-L6-v2',
  revision: '1110a243fdf4706b3f48f1d95db1a4f5529b4d41',
  license: 'Apache-2.0',
} as const

export const REQUIRED_PHRASAL_PHRASES = ['wake up'] as const
export const PHRASAL_PREPARED_CANDIDATE_COUNT = 1_083

// Each of these pinned source records has two raw examples, but the examples
// represent different senses (or an accidental verb + preposition sequence),
// so no same-sense learning pair can be made from the record.
export const PHRASAL_SOURCE_EXCLUSIONS = new Set([
  'button up', 'change over', 'choke down', 'chuck out', 'come at', 'come into',
  'dig into', 'double over', 'draw off', 'drink in', 'dust down', 'face down',
  'fight off', 'flare up', 'foul up', 'get after', 'go at', 'heat up', 'hire out',
  'hook into', 'jump on', 'lead with', 'mount up', 'order up', 'pack away',
  'pack in', 'play off', 'plunge in', 'press on', 'put about',
  'run in', 'run up', 'separate out', 'shake down', 'sign on', 'sit on',
  'stake out', 'talk down', 'tease out', 'tie down', 'toss out', 'whip into',
])

export interface PinnedPhrasalRecovery {
  phrase: string
  line: number
  sentence: string
}

export interface PinnedPhrasalAlignment {
  englishDescription: string
  examples: readonly [string, string]
}

// Exact records from the checksummed Tatoeba/OPUS cache. They provide a second
// natural example for source senses whose original record mixed unrelated
// senses. Line coordinates make a changed upstream extraction fail closed.
export const PINNED_PHRASAL_RECOVERY = [
  { phrase: 'wake up', line: 11_110, sentence: "She wakes up at seven o'clock." },
  { phrase: 'wake up', line: 13_302, sentence: "I wake up at six o'clock in the morning." },
  { phrase: 'back off', line: 544_021, sentence: 'Tell those people to back off so that the helicopter can land.' },
  { phrase: 'back off', line: 557_867, sentence: 'The policeman asked people to back off.' },
  { phrase: 'block in', line: 226_803, sentence: "William's car was completely blocked in." },
  { phrase: 'block in', line: 520_339, sentence: "I couldn't get out of the parking space because I was blocked in." },
  { phrase: 'bottom out', line: 314_917, sentence: 'The deterioration of corporate earnings has yet to bottom out.' },
  { phrase: 'bottom out', line: 550_804, sentence: 'The Dow plunged 35 points and then bottomed out.' },
  { phrase: 'bounce off', line: 663_876, sentence: 'The sound bounces right off the walls.' },
  { phrase: 'bounce off', line: 1_470_926, sentence: 'If an object is in the path of the sound pulse, the sound bounces off the object and returns an “echo” to the sonar transducer.' },
  { phrase: 'call in', line: 561_378, sentence: 'A doctor was called in right away.' },
  { phrase: 'call in', line: 590_088, sentence: 'They called in a doctor because the child was ill.' },
  { phrase: 'catch out', line: 136_539, sentence: 'I was caught out by the bad weather.' },
  { phrase: 'catch out', line: 171_129, sentence: "Ziri didn't want to be caught out in the woods after dark." },
  { phrase: 'check into', line: 869_685, sentence: 'Tom checked into the hotel.' },
  { phrase: 'check into', line: 1_193_033, sentence: 'We checked into our hotel and then went out to do some sightseeing.' },
  { phrase: 'dig out', line: 452_903, sentence: 'We need to dig the truck out of the mud.' },
  { phrase: 'dig out', line: 928_392, sentence: 'Tom had to dig his car out of the snow.' },
  { phrase: 'fall in', line: 335_857, sentence: 'The roof of the house has fallen in.' },
  { phrase: 'fall in', line: 895_922, sentence: 'The roof is going to fall in one of these days.' },
  { phrase: 'fall off', line: 583_246, sentence: 'Theater attendance usually falls off in summer.' },
  { phrase: 'fall off', line: 623_476, sentence: 'Sales fell off in the third quarter.' },
  { phrase: 'fall through', line: 523_943, sentence: 'Our plans fell through.' },
  { phrase: 'fall through', line: 611_093, sentence: 'The project to build a new sports center has fallen through for lack of adequate funds.' },
  { phrase: 'fire up', line: 1_019_231, sentence: "I'm really fired up about this." },
  { phrase: 'fire up', line: 1_777_611, sentence: 'The cheerleaders worked hard to fire up the crowd before the players took the court for the final game of the Delaware high school basketball playoffs.' },
  { phrase: 'go with', line: 455, sentence: "Those shoes don't go with the suit." },
  { phrase: 'go with', line: 569_508, sentence: 'This tie goes with your shirt.' },
  { phrase: 'hang out', line: 15_947, sentence: 'Tom and his friends often hang out at the park together.' },
  { phrase: 'hang out', line: 64_244, sentence: 'Tom and his friends often hang out together after school.' },
  { phrase: 'insist on', line: 1_372, sentence: "I can't understand why you always insist on inviting her." },
  { phrase: 'insist on', line: 20_825, sentence: "If you insist on doing it that way, I'm not going to help you." },
  { phrase: 'keep from', line: 83, sentence: 'Urgent business kept me from going shopping with you.' },
  { phrase: 'keep from', line: 54_364, sentence: 'That noise keeps me from sleeping.' },
  { phrase: 'key in', line: 83_832, sentence: 'Has the data been keyed in yet?' },
  { phrase: 'key in', line: 780_586, sentence: 'You cannot key in numbers because the NumLock LED is off.' },
  { phrase: 'lay up', line: 538_063, sentence: "I've been laid up with flu for the last week." },
  { phrase: 'lay up', line: 562_470, sentence: 'Jim has been laid up with flu for three days.' },
  { phrase: 'lead to', line: 1_041, sentence: 'Globalisation has led to 24-hour trading.' },
  { phrase: 'lead to', line: 39_830, sentence: 'Bad thoughts lead to bad actions.' },
  { phrase: 'live in', line: 86_775, sentence: 'Only international students live in the new dormitory.' },
  { phrase: 'live in', line: 141_876, sentence: 'Three Canadian students live in this dormitory.' },
  { phrase: 'look out', line: 101_646, sentence: '"Look out!" someone cried.' },
  { phrase: 'look out', line: 1_224_514, sentence: "Look out, there's a shark!" },
  { phrase: 'make over', line: 568_222, sentence: 'I want to have this old coat made over.' },
  { phrase: 'make over', line: 634_451, sentence: 'He made over the interior of his house.' },
  { phrase: 'mess with', line: 183_095, sentence: 'Boston messes with my head.' },
  { phrase: 'mess with', line: 680_225, sentence: 'Too much cocoa can mess with your head.' },
  { phrase: 'play along', line: 122_493, sentence: "Ziri decided he was going to play along with Rima's lies." },
  { phrase: 'play along', line: 621_204, sentence: 'You should play along with him for the time being.' },
  { phrase: 'play around', line: 192_533, sentence: 'Ziri and Rima were having a good time playing around.' },
  { phrase: 'play around', line: 1_132_816, sentence: 'Children played around the tree.' },
  { phrase: 'polish off', line: 80_995, sentence: 'The cake had been polished off before I got home.' },
  { phrase: 'polish off', line: 97_506, sentence: '"I\'m afraid we\'ve already polished off the soup."' },
  { phrase: 'put over', line: 618_106, sentence: 'Nobody can put anything over on the bureau chief.' },
  { phrase: 'put over', line: 917_237, sentence: "You can't put anything over on Tom." },
  { phrase: 'roll in', line: 144_005, sentence: 'Fog rolled in from the sea.' },
  { phrase: 'roll in', line: 1_129_448, sentence: 'Dark clouds are rolling in.' },
  { phrase: 'run for', line: 38_862, sentence: 'I wanted to run for class president.' },
  { phrase: 'run for', line: 108_218, sentence: "I'm running for mayor." },
  { phrase: 'run into', line: 74_259, sentence: 'Our project ran into some issues.' },
  { phrase: 'run into', line: 84_401, sentence: "So far, we haven't run into any problems." },
  { phrase: 'see in', line: 3_287, sentence: 'I never understood what you saw in that boy.' },
  { phrase: 'see in', line: 1_712_610, sentence: "You say you love him, but I can't for the life of me understand what you see in him." },
  { phrase: 'see out', line: 470_270, sentence: 'Can I see Tom out?' },
  { phrase: 'see out', line: 662_481, sentence: 'Come and see this girl out.' },
  { phrase: 'send in', line: 638_057, sentence: 'He sent in his application to the office.' },
  { phrase: 'send in', line: 658_929, sentence: 'Have you sent in your report?' },
  { phrase: 'serve out', line: 282_657, sentence: 'He vowed that he would serve out his five-year term as chairperson.' },
  { phrase: 'serve out', line: 1_435_544, sentence: 'Sami served out his entire sentence.' },
  { phrase: 'sleep off', line: 1_015_827, sentence: 'Tom will be all right once he sleeps it off.' },
  { phrase: 'sleep off', line: 1_465_327, sentence: 'She slept it off.' },
  { phrase: 'soak in', line: 596_894, sentence: 'I was in a coffee bar soaking in the atmosphere.' },
  { phrase: 'soak in', line: 1_436_048, sentence: 'I wish I could return to Paris and order a dozen oysters at an outdoor cafe while soaking in the sun.' },
  { phrase: 'stamp out', line: 628_592, sentence: 'He stamped out a fire.' },
  { phrase: 'stamp out', line: 988_975, sentence: 'Tom stamped out the fire.' },
  { phrase: 'stay back', line: 202_791, sentence: 'Tom told us to stay back.' },
  { phrase: 'stay back', line: 753_678, sentence: 'You should stay back.' },
  { phrase: 'step up', line: 7_140, sentence: 'The Indonesian government has stepped up fire prevention and enforcement of existing forest laws.' },
  { phrase: 'step up', line: 158_344, sentence: 'Chinese banks began to prohibit the use of digital currencies in 2013 and stepped up regulations after 2016.' },
  { phrase: 'stick at', line: 115_307, sentence: '"Stick at it!"' },
  { phrase: 'stick at', line: 570_221, sentence: "Stick at it, and you'll pass the exam." },
  { phrase: 'store up', line: 1_724_104, sentence: 'Birds and mammals store up food for the winter.' },
  { phrase: 'store up', line: 1_724_105, sentence: 'Squirrels store up food for the winter.' },
  { phrase: 'switch on', line: 11_226, sentence: 'Could you switch the light on, please?' },
  { phrase: 'switch on', line: 29_307, sentence: 'Tom switched on the lights.' },
  { phrase: 'take to', line: 68_900, sentence: "He's taken to gardening." },
  { phrase: 'take to', line: 265_750, sentence: 'I took to reading.' },
  { phrase: 'throw in', line: 267_207, sentence: "Tom likes to throw in some French words when he's speaking English." },
  { phrase: 'throw in', line: 1_511_215, sentence: 'Holmes listened attentively to everything, throwing in a question from time to time.' },
  { phrase: 'tidy up', line: 61_951, sentence: 'Tom tidied up his bedroom.' },
  { phrase: 'tidy up', line: 471_394, sentence: 'We tidied up our classroom after school.' },
  { phrase: 'walk off', line: 224_159, sentence: 'I was mid-sentence when the girl simply walked off.' },
  { phrase: 'walk off', line: 131_320, sentence: 'Ziri turned around and walked off.' },
  { phrase: 'write back', line: 567_516, sentence: 'Write back to me as soon as you get this letter.' },
  { phrase: 'write back', line: 596_800, sentence: 'I wrote to my uncle, who wrote back to me soon.' },
  { phrase: 'brighten up', line: 271_128, sentence: 'The sky has brightened up.' },
  { phrase: 'brighten up', line: 1_818_346, sentence: 'It would be nice if it brightened up tomorrow.' },
  { phrase: 'set to', line: 68_366, sentence: 'As soon as their meeting was over, they set to work.' },
  { phrase: 'set to', line: 630_211, sentence: 'He took his coat off and set to work.' },
  { phrase: 'talk round', line: 164_893, sentence: "I'll try to talk him round." },
  { phrase: 'talk round', line: 205_020, sentence: "We haven't managed to talk him round." },
  { phrase: 'see around', line: 3_042, sentence: 'We hardly ever see you around here.' },
  { phrase: 'see around', line: 50_170, sentence: "I haven't seen her around here." },
  { phrase: 'knock over', line: 18_452, sentence: 'I accidentally knocked over the vase.' },
  { phrase: 'knock over', line: 1_187_614, sentence: 'Tom knocked over the vase.' },
] as const satisfies readonly PinnedPhrasalRecovery[]

// These source records contain several senses in one unlabelled example pool.
// The exact source strings below keep one coherent sense together; this is a
// deterministic source-alignment rule and is not represented as human review.
export const PINNED_PHRASAL_ALIGNMENTS: Readonly<
  Record<string, PinnedPhrasalAlignment>
> = {
  'wake up': {
    englishDescription: 'same as wake',
    examples: [
      "She wakes up at seven o'clock.",
      "I wake up at six o'clock in the morning.",
    ],
  },
  'talk round': {
    englishDescription: 'to succeed in persuading someone to agree to something',
    examples: ["I'll try to talk him round.", "We haven't managed to talk him round."],
  },
  'see around': {
    englishDescription: 'to notice someone often in places that you go to regularly',
    examples: ['We hardly ever see you around here.', "I haven't seen her around here."],
  },
  'knock over': {
    englishDescription: 'same as knock down',
    examples: ['I accidentally knocked over the vase.', 'Tom knocked over the vase.'],
  },
  'shell out': {
    englishDescription: 'to spend a lot of money on something',
    examples: [
      'Since they wouldn’t share, I ended up shelling out for two hotel rooms.',
      "Tara was not a jewellery person, which was just as well because Finn certainly didn't have the money to shell out on chunky gold stuff.",
    ],
  },
  'shape up': {
    englishDescription: 'to develop',
    examples: [
      'Education is shaping up as the hottest issue on the agenda.',
      'This year is shaping up to be one of my busiest yet!',
    ],
  },
  'drag in': {
    englishDescription: 'to make someone become involved in a situation when they do not want to',
    examples: [
      'Last night it was the turn of the evangelical Christians to be dragged in.',
      'More worrying still were signs that France, too, was being dragged in.',
    ],
  },
  'plunge into': {
    englishDescription: 'to suddenly get into a particular state or situation',
    examples: [
      'The city was plunged into total darkness when the entire electrical system failed.',
      'The country is plunging into recession once more.',
    ],
  },
  'give over': {
    englishDescription: 'to stop doing something',
    examples: [
      'Give over making that noise!',
      '‘You know how fond I am of you.’ ‘Oh, give over, will you?’',
    ],
  },
  'get around': {
    englishDescription: 'to go or travel to different places',
    examples: [
      'At the age of 85 Milly still gets around quite well.',
      "He said: 'I can't get around my flat without the wheelchair.'",
    ],
  },
  'cut out': {
    englishDescription: 'to remove something from a larger piece by cutting',
    examples: [
      'I cut this article out of a magazine for you.',
      'Using the 5cm cutter, cut out six circles from the rectangular cake.',
    ],
  },
  'get about': {
    englishDescription: 'same as get around',
    examples: [
      "In Copenhagen it's just a pleasant way of getting about.",
      'You really need a car to get about here.',
    ],
  },
  'get round': {
    englishDescription: 'same as get around',
    examples: [
      'But his promise to try to get round human rights laws was undermined by his own Immigration Minister.',
      'It got round the law and alerted us to what is going on in our neighbourhood.',
    ],
  },
  'close down': {
    englishDescription: 'same as close',
    examples: [
      'Hotels are closing down all over the country.',
      'Their intention is to close down the factory.',
    ],
  },
  'straighten out': {
    englishDescription: 'to deal with a problem or a confused situation',
    examples: [
      'A team of accountants was brought in to straighten out the firm’s finances.',
      'He had still not had time to straighten out his own thoughts.',
    ],
  },
  'turn back': {
    englishDescription: 'to return the same way that you came instead of continuing on your journey, or to make someone do this',
    examples: [
      'Bad weather forced them to turn back.',
      'I got up and walked and followed the river a long way and then turned back again.',
    ],
  },
  'turn to': {
    englishDescription: 'to go to someone for help when you are having difficulty dealing with a situation',
    examples: [
      'I’m sorry, but I had no one else to turn to.',
      'There are plenty of people you can turn to for advice.',
    ],
  },
  'throw out': {
    englishDescription: 'same as throw away',
    examples: [
      'I’ve thrown out my old boots.',
      "She hadn't seen him throw out a perfectly good egg cup because it had got a little chip on the rim.",
    ],
  },
  'drop off': {
    englishDescription: 'same as drop',
    examples: [
      'Can you drop the kids off at school this morning?',
      'Is it ok if I drop the documents off later?',
    ],
  },
  'hang about': {
    englishDescription: 'same as hang',
    examples: [
      'Groups of youths hung about street corners.',
      'We’d better not hang about: it’s ten o’clock already.',
    ],
  },
  'finish up': {
    englishDescription: 'to be in a particular place or situation at the end of a long series of events',
    examples: [
      'I always finish up doing most of the work!',
      'She eventually finished up in London.',
    ],
  },
  'trip up': {
    englishDescription: 'to make a mistake, or to cause someone to make a mistake',
    examples: [
      'I tripped up on a couple of questions.',
      'The tests are designed to trip you up.',
    ],
  },
  'cool down': {
    englishDescription: 'same as cool',
    examples: [
      'The rain had cooled everything down.',
      'We had to wait until the engine had cooled down before restarting the car.',
    ],
  },
  'lock up': {
    englishDescription: 'to lock all the doors and windows of a building so that no one can get in',
    examples: [
      'I locked up and went to bed.',
      'It took me just a couple of minutes to retrieve the disc and lock up again.',
    ],
  },
  'toss up': {
    englishDescription: 'same as toss',
    examples: [
      'Let’s toss up to decide who drives.',
      'Neil tossed the penny up; she called ‘heads’ and won.',
    ],
  },
  'open up': {
    englishDescription: 'to talk more about your personal feelings and experiences',
    examples: [
      'It’s taken a few months, but Katy is finally starting to open up to me.',
      'She concentrated her attention on getting Richard to open up about himself.',
    ],
  },
  'cut across': {
    englishDescription: 'to go across an area of land instead of going around the edge of it',
    examples: [
      'He left his car up the road and cut across the fields on foot.',
      'We cut across the field to save time.',
    ],
  },
  'land up': {
    englishDescription: 'to finally arrive at a place or situation after a series of events',
    examples: [
      'We finally landed up at Tom’s house.',
      'We happened to land up just at the wrong party spot," said Gareth.',
    ],
  },
  'cough up': {
    englishDescription: 'to give money to pay for something, especially when you would prefer not to',
    examples: [
      'Come on, cough up, it’s your turn to pay.',
      'I had to cough up for the medical bills.',
    ],
  },
  'buy off': {
    englishDescription: 'to pay someone to stop threatening you or blackmailing you',
    examples: [
      'By the time the public discovers that a product is defective, the company has made so much money it can afford to buy off the victims.',
      'Efforts to buy her off have failed.',
    ],
  },
  'cut back': {
    englishDescription: 'to reduce the amount of something, especially money that you spend',
    examples: [
      'If you cut back on fat and sugar, you’ll lose weight.',
      'We’re trying to cut back on the amount we spend on food.',
    ],
  },
  'fill in': {
    englishDescription: 'to add information such as your name or address in the empty spaces on an official document',
    examples: [
      'I spent over two hours filling in the application form.',
      'Please fill in your name and address in the space provided.',
    ],
  },
  'camp out': {
    englishDescription: 'to sleep outside, with or without a tent or other shelter',
    examples: [
      'He planned to camp out in the wild.',
      'They camped out on the pavement in front of his office.',
    ],
  },
  'roll out': {
    englishDescription: 'to make something that is wrapped around itself become flat',
    examples: [
      'Roll out the pizza dough on a well-floured surface.',
      'She rolled out the document on the table.',
    ],
  },
  'connect up': {
    englishDescription: 'to join several things or places together',
    examples: [
      'I’ve connected the modem up to the phone line.',
      'The plumber came and connected up the dishwasher.',
    ],
  },
  'mark off': {
    englishDescription: 'to mark the limits of an area using a line, fence, rope etc',
    examples: [
      'The crime scene was marked off with official police tape.',
      'The various Moties used the lines to mark off their territories.',
    ],
  },
  'slow down': {
    englishDescription: 'if someone slows down, or if something slows them down, they become less active or effective',
    examples: [
      'For me, holidays are a time to slow down and relax.',
      'This cold is really slowing me down.',
    ],
  },
  'spy out': {
    englishDescription: 'to look around an area in order to find something',
    examples: [
      'He quickly spied out the waiter.',
      'I’m going to spy out a suitable place to meet.',
    ],
  },
  'buckle up': {
    englishDescription: 'to fasten your seat belt in a car, plane etc',
    examples: [
      "Buckle up, it's going to be a bumpy ride.",
      'Get ready, buckle up, and keep your arms and legs inside the vehicle at all times.',
    ],
  },
  'think over': {
    englishDescription: 'to consider a problem or decision carefully',
    examples: [
      'I began to pace about and think over my options.',
      'Let’s think over his proposal before we see him again.',
    ],
  },
  'lay on': {
    englishDescription: 'to provide something such as food, entertainment, or a service, especially without charging for it',
    examples: [
      'Extra buses are being laid on for late-night shoppers.',
      'They laid on a special party to mark his 31 years of service.',
    ],
  },
  'see about': {
    englishDescription: 'to deal with or organize something',
    examples: [
      'Can you see about getting us a lift home?',
      'We must see about a teacher for you right away.',
    ],
  },
  'do in': {
    englishDescription: 'to make someone feel very tired',
    examples: [
      'It was climbing that last hill that really did them in.',
      'I’m completely done in after all that running around.',
    ],
  },
  'enter into': {
    englishDescription: 'to agree to be part of an official agreement or contract',
    examples: [
      'Borrowers must be clear about the agreement they are entering into.',
      'In 1986, the organization entered into an agreement with a private firm to operate the security system.',
    ],
  },
  'go into': {
    englishDescription: 'to start working in a particular type of job or business',
    examples: [
      'Alex has decided to go into nursing.',
      'Eric went into the army right after school.',
    ],
  },
  'look through': {
    englishDescription: 'to read something quickly, especially to find the information you need',
    examples: [
      'But I looked through the book yesterday and found a huge number of favourite dishes in it.',
      'I’ll look through these files and see if I can find a copy of my CV.',
    ],
  },
  'sleep over': {
    englishDescription: 'to sleep at someone else’s house for one night',
    examples: [
      'Let him have friends to sleep over as a reward for staying in his own room.',
      'Mum, can Billy sleep over on Saturday?',
    ],
  },
  'flesh out': {
    englishDescription: 'to add more details about something in order to make it easier to understand or imagine',
    examples: [
      'After lunch we started to flesh out our campaign strategy, in his office.',
      "Time to flesh out the few terse facts he'd told me about his home.",
    ],
  },
  'drop in': {
    englishDescription: 'to make a short visit somewhere',
    examples: [
      "Maybe she'd drop in on Annie Cabbot, the only decent copper among them.",
      'My next unedifying conclusion was that in order to make this informality credible I had to drop in without warning at the Deanery.',
    ],
  },
  'call at': {
    englishDescription: 'to stop at a place on your way to another place, usually so that you can do something',
    examples: [
      'Can you call at the shop on your way home and get some milk?',
      'This train calls at Hagley and all stations to Birmingham.',
    ],
  },
  'crop up': {
    englishDescription: 'to happen suddenly or unexpectedly',
    examples: [
      'Ben had to go back to work – a problem’s cropped up.',
      'It is only in the last few years that it has cropped up for sale in the UK.',
    ],
  },
  'set back': {
    englishDescription: 'to delay the progress of someone or something',
    examples: [
      'Four years ago he took a knock that could have set back many a weaker character.',
      'The spending cuts have set the research project back several years.',
    ],
  },
  'strike off': {
    englishDescription: 'to go in a particular direction in a way that shows energy or determination',
    examples: [
      'Startled by the noise, he had struck off through the woods.',
      'They struck off across the desert without supplies.',
    ],
  },
  'set aside': {
    englishDescription: 'to keep or save something from a larger amount or supply in order to use it later for a particular purpose',
    examples: [
      'Have you set aside some money for your child’s education?',
      'Set aside a few hours for this task and be prepared to ask yourself some hard questions.',
    ],
  },
  'look over': {
    englishDescription: 'to examine something, usually quickly',
    examples: [
      'An American inspection team had looked over sites in January.',
      'He’d been looking over the leaflets he’d picked up earlier.',
    ],
  },
  'believe in': {
    englishDescription: 'to think that someone or something exists',
    examples: [
      'I don’t believe in miracles.',
      'I’m beginning to think you actually believe in ghosts!',
    ],
  },
  'settle down': {
    englishDescription: 'to make yourself comfortable in a place, especially in order to do something that will take a lot of time or effort',
    examples: [
      'I settled down in front of the television for the evening.',
      'She took a seat and settled down to wait.',
    ],
  },
  'go down': {
    englishDescription: 'to become less',
    examples: [
      'No one expects house prices to go down in the near future.',
      'The crime rate shows no signs of going down.',
    ],
  },
  'take off': {
    englishDescription: 'to become successful or popular very fast',
    examples: [
      'Her business has really taken off.',
      'Our plan was to design and sell software for the computer industry which was beginning to really take off then.',
    ],
  },
  'put out': {
    englishDescription: 'to cause problems or difficulties for someone by making them do something for you',
    examples: [
      'I don’t see why I should put myself out for him.',
      'It would be lovely to stay with you, but I don’t want to put you out.',
    ],
  },
  'fit in': {
    englishDescription: 'to be accepted by a group of people because you are similar to them',
    examples: [
      "Here Lee's lonely, he doesn't fit in; there he's ostracized.",
      'She fitted in with her new colleagues straight away.',
    ],
  },
  'come on': {
    englishDescription: 'to arrive on a sports field in order to replace another member of your team',
    examples: [
      'He came on as a substitute.',
      'Miller came on for Thompson in the 75th minute of the game.',
    ],
  },
  'run down': {
    englishDescription: 'to criticize someone, especially in an unfair way',
    examples: [
      'You’re a brilliant mother. Why do you run yourself down?',
      'You’re always running me down!',
    ],
  },
  'go back': {
    englishDescription: 'to return to a person, place, subject, or activity',
    examples: [
      'I’d like to go back to what Abby was saying just a minute ago.',
      'The computer breaks down and you go back to writing things down on pieces of paper.',
    ],
  },
  'blow away': {
    englishDescription: 'to impress someone very much or make them very excited',
    examples: [
      'But we were absolutely blown away by just how effective the combination of ingredients was.',
      'When I heard that song for the first time it just blew me away.',
    ],
  },
  'fight back': {
    englishDescription: 'to try to stop someone who has criticized you, or something that has harmed you',
    examples: [
      'The concert organizers have fought back against their critics.',
      'But we are going to fight back, make our voices heard and rebut these accusations, which very often have no evidence to support them.',
    ],
  },
  'hand over': {
    englishDescription: 'to give power or control to someone else',
    examples: [
      'They formally hand power over to the new government next week.',
      'Once the new operation is up and running, responsibility is handed over to a local team.',
    ],
  },
  'do up': {
    englishDescription: 'to fasten something',
    examples: [
      'Annie walked away, but not in a hurry, she stopped to do up the six buttons of her coat.',
      'The dress does up at the back.',
    ],
  },
  'eat up': {
    englishDescription: 'to eat all of something',
    examples: [
      'Come on, eat up your broccoli.',
      "You can have some more tomorrow, if you're a good boy and eat up all your dinner.",
    ],
  },
  'come off': {
    englishDescription: 'used for telling someone that you do not believe them or that what they are saying is stupid',
    examples: [
      'Come off it now – she was only trying to help.',
      'Come off it, I know lots of men who do housework.',
    ],
  },
  'take in': {
    englishDescription: 'to understand and remember something that you hear or read',
    examples: [
      'I’m not sure how much of his explanation she took in.',
      'Livy was too excited and tired to take in much of what was said.',
    ],
  },
  'go up': {
    englishDescription: 'to increase',
    examples: [
      'The price of oil has gone up by over 50 per cent in less than a year.',
      'We’d like to see the baby’s weight going steadily up.',
    ],
  },
  'come out': {
    englishDescription: 'if something comes out, it becomes known',
    examples: [
      'He said it’ll all come out in court.',
      'It eventually came out that she was already married.',
    ],
  },
  'put forward': {
    englishDescription: 'to officially suggest that someone should be considered for a particular job or position',
    examples: [
      'I’ve thought about putting myself forward to chair the meeting.',
      'Your name was put forward as a possible team leader.',
    ],
  },
  'wear out': {
    englishDescription: 'to make someone feel very tired',
    examples: [
      'She was worn out from looking after her elderly mother.',
      'You need a holiday or you’ll wear yourself out.',
    ],
  },
  'bear up': {
    englishDescription: 'to behave in a brave way in a very sad or difficult situation',
    examples: [
      'Asked how he was bearing up under the mounting questions about his economic competence, he was dismissive of the sceptics.',
      'Let’s see how he bears up under the pressure.',
    ],
  },
  'move over': {
    englishDescription: 'to stop doing something in order to let someone else do it',
    examples: [
      "Some of their players have had fantastic careers but it's time to move over and let some youngsters come through.",
      'They seem to expect older musicians to move over so that the younger ones can get a chance.',
    ],
  },
  'lay off': {
    englishDescription: 'to stop doing or using something, especially for a short period of time',
    examples: [
      'I had to lay off the medication for a while to see if that was causing my headaches.',
      'Just lay off complaining for a minute!',
    ],
  },
  'pull out': {
    englishDescription: 'if a vehicle or driver pulls out, they move onto a road or onto a part of a road where the traffic is moving faster',
    examples: [
      'A plume of exhaust trailed from the Opel, probably getting ready to pull out.',
      'She just pulled out in front of me without indicating!',
    ],
  },
  'bring in': {
    englishDescription: 'to use the skills of a particular group or person',
    examples: [
      'An independent investigator will be brought in to look at the allegations.',
      'This is an opportunity to bring in new talent.',
    ],
  },
  'go over': {
    englishDescription: 'to check something carefully',
    examples: [
      'Could you go over this report and correct any mistakes?',
      'Go over the figures carefully before you commit.',
    ],
  },
  'get on': {
    englishDescription: 'same as get along',
    examples: [
      'My parents and I don’t get on.',
      'She seems to get on with everybody.',
    ],
  },
  'ring up': {
    englishDescription: 'to record an amount of money by pressing buttons on a cash register',
    examples: [
      'She rang up our purchases quickly and we left.',
      'Then she carried the photograph to the front to ring up the purchase.',
    ],
  },
  'look to': {
    englishDescription: 'to direct your thoughts or attention to something',
    examples: [
      'The party needs to look to the future and forget its past problems.',
      'This is the moment to look to the future and take that step.',
    ],
  },
  'turn over': {
    englishDescription: 'to change the position of your body when you are lying or sleeping so that you face the opposite direction',
    examples: [
      'I turned over in bed and groaned.',
      'She turned over and went back to sleep.',
    ],
  },
  'come round': {
    englishDescription: 'to go to a place where someone is, especially their house, in order to visit them',
    examples: [
      "I must've wanted to talk, because some friends at school got together and came round to see me.",
      'I suggested he come round for dinner one night.',
    ],
  },
  'nod off': {
    englishDescription: 'to go to sleep, especially when you do not intend to',
    examples: [
      'He even kept a camp bed there for the nights when he was so exhausted he would begin to nod off as he worked.',
      "I drank it - I was feeling sleepy now, and it wouldn't do to nod off in Florence's drawing room.",
    ],
  },
  'mess up': {
    englishDescription: 'to make a mistake, or to do something badly',
    examples: [
      'She says she completely messed up the interview.',
      'You messed up. Don’t let it happen again.',
    ],
  },
  'get by': {
    englishDescription: 'to have just enough of something such as money or knowledge so that you can do what you need to do',
    examples: [
      "As long as she could get by on her bank loan, she didn't see any point in giving up her independence.",
      'My arithmetic isn’t very good, but I get by.',
    ],
  },
  'leave out': {
    englishDescription: 'to not include someone or something',
    examples: [
      'We decided to leave the chapter out of the book altogether.',
      "Maybe while they're at it they could leave out the mosquitoes and the ticks as well.",
    ],
  },
  'hit back': {
    englishDescription: 'to criticize someone who has criticized you',
    examples: [
      'MPs from across the political spectrum hit back against the conspiracy claims.',
      'Now publishers have begun to hit back against the ad blockers.',
    ],
  },
  'pour into': {
    englishDescription: 'to give a lot of effort, money, or help to someone or something',
    examples: [
      'How much money have you poured into Crystal Palace?',
      'The business has been valued at about 8m prior to any new money being poured into the venture.',
    ],
  },
  'back off': {
    englishDescription: 'to move backwards in order to get further away from something',
    examples: [
      'Tell those people to back off so that the helicopter can land.',
      'The policeman asked people to back off.',
    ],
  },
  'block in': {
    englishDescription: 'to stop someone from moving their car out of a place',
    examples: [
      "William's car was completely blocked in.",
      "I couldn't get out of the parking space because I was blocked in.",
    ],
  },
  'bottom out': {
    englishDescription: 'if something such as an economy or price bottoms out, it reaches its lowest level before starting to improve again',
    examples: [
      'The deterioration of corporate earnings has yet to bottom out.',
      'The Dow plunged 35 points and then bottomed out.',
    ],
  },
  'bounce off': {
    englishDescription: 'if light or sound bounces off a surface, it hits it and then moves away from it again',
    examples: [
      'The sound bounces right off the walls.',
      'If an object is in the path of the sound pulse, the sound bounces off the object and returns an “echo” to the sonar transducer.',
    ],
  },
  'call in': {
    englishDescription: 'to ask a person or organization that provides a service to come and deal with something',
    examples: [
      'A doctor was called in right away.',
      'They called in a doctor because the child was ill.',
    ],
  },
  'catch out': {
    englishDescription: 'to put someone in an unpleasant or difficult situation that they are not prepared for',
    examples: [
      'I was caught out by the bad weather.',
      "Ziri didn't want to be caught out in the woods after dark.",
    ],
  },
  'check into': {
    englishDescription: 'to arrive at a hotel or a private hospital where you have arranged to stay and give your personal details to the person working at the reception desk',
    examples: [
      'Tom checked into the hotel.',
      'We checked into our hotel and then went out to do some sightseeing.',
    ],
  },
  'dig out': {
    englishDescription: 'to get something out of a place or out of the ground by digging',
    examples: [
      'We need to dig the truck out of the mud.',
      'Tom had to dig his car out of the snow.',
    ],
  },
  'fall in': {
    englishDescription: 'if a roof or wall falls in, it falls to the ground',
    examples: [
      'The roof of the house has fallen in.',
      'The roof is going to fall in one of these days.',
    ],
  },
  'fall off': {
    englishDescription: 'if the amount, level, or value of something falls off, it gets smaller',
    examples: [
      'Theater attendance usually falls off in summer.',
      'Sales fell off in the third quarter.',
    ],
  },
  'fall through': {
    englishDescription: 'if something such as a deal, plan, or arrangement falls through, it fails to happen',
    examples: [
      'Our plans fell through.',
      'The project to build a new sports center has fallen through for lack of adequate funds.',
    ],
  },
  'fire up': {
    englishDescription: 'to make someone feel very enthusiastic',
    examples: [
      "I'm really fired up about this.",
      'The cheerleaders worked hard to fire up the crowd before the players took the court for the final game of the Delaware high school basketball playoffs.',
    ],
  },
  'go with': {
    englishDescription: 'to seem good, natural, or attractive in combination with something',
    examples: [
      "Those shoes don't go with the suit.",
      'This tie goes with your shirt.',
    ],
  },
  'hang out': {
    englishDescription: 'same as hang',
    examples: [
      'Tom and his friends often hang out at the park together.',
      'Tom and his friends often hang out together after school.',
    ],
  },
  'insist on': {
    englishDescription: 'to say very firmly that something must happen or must be done',
    examples: [
      "I can't understand why you always insist on inviting her.",
      "If you insist on doing it that way, I'm not going to help you.",
    ],
  },
  'keep from': {
    englishDescription: 'to prevent someone from doing something or prevent something from happening',
    examples: [
      'Urgent business kept me from going shopping with you.',
      'That noise keeps me from sleeping.',
    ],
  },
  'key in': {
    englishDescription: 'same as key',
    examples: [
      'Has the data been keyed in yet?',
      'You cannot key in numbers because the NumLock LED is off.',
    ],
  },
  'lay up': {
    englishDescription: 'same as lay',
    examples: [
      "I've been laid up with flu for the last week.",
      'Jim has been laid up with flu for three days.',
    ],
  },
  'lead to': {
    englishDescription: 'to begin a process that causes something to happen',
    examples: [
      'Globalisation has led to 24-hour trading.',
      'Bad thoughts lead to bad actions.',
    ],
  },
  'live in': {
    englishDescription: 'to live at the place where you work or study',
    examples: [
      'Only international students live in the new dormitory.',
      'Three Canadian students live in this dormitory.',
    ],
  },
  'look out': {
    englishDescription: 'used for warning someone to be careful, especially because they are likely to have an accident',
    examples: [
      '"Look out!" someone cried.',
      "Look out, there's a shark!",
    ],
  },
  'make over': {
    englishDescription: 'to change or improve the appearance of someone or something',
    examples: [
      'I want to have this old coat made over.',
      'He made over the interior of his house.',
    ],
  },
  'mess with': {
    englishDescription: 'to seriously upset someone or make them confused',
    examples: [
      'Boston messes with my head.',
      'Too much cocoa can mess with your head.',
    ],
  },
  'play along': {
    englishDescription: 'to pretend to agree with someone or something, especially in order to get what you want or avoid an argument',
    examples: [
      "Ziri decided he was going to play along with Rima's lies.",
      'You should play along with him for the time being.',
    ],
  },
  'play around': {
    englishDescription: 'same as play',
    examples: [
      'Ziri and Rima were having a good time playing around.',
      'Children played around the tree.',
    ],
  },
  'polish off': {
    englishDescription: 'to eat or drink something until it is finished',
    examples: [
      'The cake had been polished off before I got home.',
      '"I\'m afraid we\'ve already polished off the soup."',
    ],
  },
  'put over': {
    englishDescription: 'to trick someone into believing something that is not true',
    examples: [
      'Nobody can put anything over on the bureau chief.',
      "You can't put anything over on Tom.",
    ],
  },
  'roll in': {
    englishDescription: 'to arrive in large numbers or amounts',
    examples: [
      'Fog rolled in from the sea.',
      'Dark clouds are rolling in.',
    ],
  },
  'run for': {
    englishDescription: 'to try to be elected to an official job or position',
    examples: [
      'I wanted to run for class president.',
      "I'm running for mayor.",
    ],
  },
  'run into': {
    englishDescription: 'to start to have trouble/difficulty/problems etc',
    examples: [
      'Our project ran into some issues.',
      "So far, we haven't run into any problems.",
    ],
  },
  'see in': {
    englishDescription: 'to not understand why one person finds another person attractive or likes them',
    examples: [
      'I never understood what you saw in that boy.',
      "You say you love him, but I can't for the life of me understand what you see in him.",
    ],
  },
  'see out': {
    englishDescription: 'to go with someone to the door when they are leaving in order to say goodbye to them',
    examples: [
      'Can I see Tom out?',
      'Come and see this girl out.',
    ],
  },
  'send in': {
    englishDescription: 'to send a letter or document to an organization',
    examples: [
      'He sent in his application to the office.',
      'Have you sent in your report?',
    ],
  },
  'serve out': {
    englishDescription: 'to continue doing something until you are officially allowed to stop doing it',
    examples: [
      'He vowed that he would serve out his five-year term as chairperson.',
      'Sami served out his entire sentence.',
    ],
  },
  'sleep off': {
    englishDescription: 'to get rid of an unpleasant or uncomfortable feeling by sleeping, especially after eating or drinking too much',
    examples: [
      'Tom will be all right once he sleeps it off.',
      'She slept it off.',
    ],
  },
  'soak in': {
    englishDescription: 'to spend time experiencing and enjoying the mood or feeling in a place',
    examples: [
      'I was in a coffee bar soaking in the atmosphere.',
      'I wish I could return to Paris and order a dozen oysters at an outdoor cafe while soaking in the sun.',
    ],
  },
  'stamp out': {
    englishDescription: 'to make a fire stop burning by putting your feet down hard on it',
    examples: [
      'He stamped out a fire.',
      'Tom stamped out the fire.',
    ],
  },
  'stay back': {
    englishDescription: 'to not move forwards, or to not move towards something, usually something dangerous or unpleasant',
    examples: [
      'Tom told us to stay back.',
      'You should stay back.',
    ],
  },
  'step up': {
    englishDescription: 'to increase something',
    examples: [
      'The Indonesian government has stepped up fire prevention and enforcement of existing forest laws.',
      'Chinese banks began to prohibit the use of digital currencies in 2013 and stepped up regulations after 2016.',
    ],
  },
  'stick at': {
    englishDescription: 'to continue to work at something difficult or unpleasant in a determined way',
    examples: [
      '"Stick at it!"',
      "Stick at it, and you'll pass the exam.",
    ],
  },
  'store up': {
    englishDescription: 'to keep a lot of something so that you can use it later',
    examples: [
      'Birds and mammals store up food for the winter.',
      'Squirrels store up food for the winter.',
    ],
  },
  'switch on': {
    englishDescription: 'if you switch on something such as a light or a machine, or if it switches on, you make it start working',
    examples: [
      'Could you switch the light on, please?',
      'Tom switched on the lights.',
    ],
  },
  'take to': {
    englishDescription: 'to start doing something as a habit',
    examples: [
      "He's taken to gardening.",
      'I took to reading.',
    ],
  },
  'throw in': {
    englishDescription: 'to add a remark, question etc in a conversation',
    examples: [
      "Tom likes to throw in some French words when he's speaking English.",
      'Holmes listened attentively to everything, throwing in a question from time to time.',
    ],
  },
  'tidy up': {
    englishDescription: 'same as tidy',
    examples: [
      'Tom tidied up his bedroom.',
      'We tidied up our classroom after school.',
    ],
  },
  'walk off': {
    englishDescription: 'to leave somewhere, usually without telling people that you are going to leave',
    examples: [
      'I was mid-sentence when the girl simply walked off.',
      'Ziri turned around and walked off.',
    ],
  },
  'write back': {
    englishDescription: 'to send a reply to someone who has sent you a letter',
    examples: [
      'Write back to me as soon as you get this letter.',
      'I wrote to my uncle, who wrote back to me soon.',
    ],
  },
  'brighten up': {
    englishDescription: 'if the weather brightens up, it becomes sunnier',
    examples: [
      'The sky has brightened up.',
      'It would be nice if it brightened up tomorrow.',
    ],
  },
  'set to': {
    englishDescription: 'to start doing something in a determined or enthusiastic way',
    examples: [
      'As soon as their meeting was over, they set to work.',
      'He took his coat off and set to work.',
    ],
  },
  'lap up': {
    englishDescription: 'to enjoy something and be keen to get more of it',
    examples: [
      'Her fellow holidaymakers lapped up the glorious view.',
      'The jokes were crude but the audience were lapping them up.',
    ],
  },
  'serve up': {
    englishDescription: 'to provide something',
    examples: [
      'Aunt Edie served up a lovely roast leg of lamb for dinner.',
      'The teams served up some highly entertaining football this afternoon.',
    ],
  },
  'spread out': {
    englishDescription: 'to separate things that were together and put them separately on a surface',
    examples: [
      'Spread out the map so we can all see it.',
      'We spread our papers out on the table.',
    ],
  },
  'stretch out': {
    englishDescription: 'to lie down, usually in order to relax or to sleep',
    examples: [
      'Porter stretched out on his bunk, hands clasped behind his head.',
      'She stretched herself out on the sofa.',
    ],
  },
  'rise up': {
    englishDescription: 'same as rise',
    examples: [
      'The choir rose up together and began to sing.',
      'The crows rose up in alarm at the sound of the shotgun.',
    ],
  },
}

interface RawPhrasalRecord {
  descriptions?: unknown
  examples?: unknown
  frequency?: unknown
}

export interface SelectedPhrasalSource {
  phrase: string
  baseVerb: string
  particle: string
  level: Level
  description: string
  examples: [string, string]
  descriptions: string[]
  candidateExamples: string[]
  ipa: string
  sourceFrequency: number
  baseFrequencyRank: number | null
  baseCefr: string | null
  sourceIndex: number
}

const UNSAFE_CONTENT = [
  /\b(?:bullshit|fuck\w*|shit\w*|bitch\w*|cunts?|damn(?:ed)?|nigg(?:er|a)s?|piss\w*)\b/i,
  /\b(?:backside|bras?|breasts?|ejaculat\w*|intercourse|masturbat\w*|naked|nude|orgasm\w*|penis|porn(?:ography)?|pregnan\w*|prostitut\w*|rape\w*|sex(?:ual(?:ity)?)?|striptease|topless|vagina)\b/i,
  /\b(?:alcohol\w*|cocaine|drug[- ]addict\w*|drugs?|drunk\w*|hangovers?|heroin|marijuana|methadone|methamphetamine|opioid|opium|overdose)\b/i,
  /\b(?:abus\w*|attack\w*|beat(?:en|ing)?\s+up|blood\w*|bomb\w*|corpse\w*|dead|death|die[ds]?|dying|genocid\w*|guns?|kill\w*|lynch\w*|massacre\w*|murder\w*|rifles?|self[- ]harm|shoot\w*|stab\w*|strangl\w*|suicid\w*|terroris\w*|tortur\w*|violen\w*|weapons?)\b/i,
  /\b(?:child trafficking|death sentence|execute(?:d|s)?\s+(?:a\s+)?(?:person|people|prisoner|protester)|serial killer)\b/i,
  /\b(?:antisemitis\w*|gayness|hell|homophob\w*|racial hatred|racis\w*|suffocat\w*|trann(?:y|ies))\b/i,
  /\b(?:abortion|anti-intellectualism|elitism)\b/i,
  /\b(?:beer|booze|bourbon|brandy|champagne|cigarettes?|cigars?|dope|gin|lager|liquor|nicotine|rohypnol|rum|scotch|stoned|tobacco|vape|vodka|whisk(?:e)?y|wine)\b/i,
  /\b(?:axes?|burn(?:ed|ing)?|injur(?:ed|y|ies)|knif(?:e|es)|punch(?:ed|es|ing)?|robb(?:ed|ery|ing))\b/i,
] as const

const phrasalPosTagger = new WinkPosTagger()

export function isSafePhrasalContent(value: string): boolean {
  const normalized = value.replace(/\bmake a fire stop burning\b/gi, 'extinguish a fire')
  return !UNSAFE_CONTENT.some((pattern) => pattern.test(normalized))
}

export function isSuitablePhrasalExample(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length >= 12
    && trimmed.length <= 160
    && /[.!?][’'"]?$/.test(trimmed)
    && !/^[a-z]{1,3}\d+[`']/i.test(trimmed)
    && isSafePhrasalContent(trimmed)
}

export async function readPinnedPhrasalRecovery(
  path: string,
  expectedRecords: readonly PinnedPhrasalRecovery[] = PINNED_PHRASAL_RECOVERY,
): Promise<Map<string, string[]>> {
  const expectedByLine = new Map(expectedRecords.map((record) => [record.line, record]))
  if (expectedByLine.size !== expectedRecords.length) {
    throw new Error('Pinned Tatoeba phrasal recovery lines must be unique')
  }
  const found = new Map<string, string[]>()
  const input = createReadStream(path).pipe(createGunzip())
  const lines = createInterface({ input, crlfDelay: Infinity })
  let lineNumber = 0
  for await (const rawLine of lines) {
    lineNumber += 1
    const expected = expectedByLine.get(lineNumber)
    if (!expected) continue
    const sentence = rawLine.trim()
    if (sentence !== expected.sentence
      || !isSuitablePhrasalExample(sentence)
      || !containsPhrasalUse(sentence, expected.phrase)) {
      throw new Error(`Pinned Tatoeba phrasal recovery mismatch at line ${lineNumber}`)
    }
    const examples = found.get(expected.phrase) ?? []
    examples.push(sentence)
    found.set(expected.phrase, examples)
    expectedByLine.delete(lineNumber)
    if (expectedByLine.size === 0) {
      lines.close()
      input.destroy()
      break
    }
  }
  if (expectedByLine.size > 0) {
    throw new Error(
      `Pinned Tatoeba phrasal recovery records are missing: ${[...expectedByLine.keys()].join(', ')}`,
    )
  }
  return found
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim()).filter(Boolean))]
}

export function containsPhrasalBase(sentence: string, phrase: string): boolean {
  const words = phrase.trim().split(/\s+/)
  if (words.length !== 2 || words.some((word) => !/^[a-z]+$/i.test(word))) return false
  const [baseVerb, particle] = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const objectWord = `[A-Za-z]+(?:['’~-][A-Za-z]+)*`
  const contiguous = `${baseVerb}\\s+${particle}`
  const separable = `${baseVerb}(?:\\s+${objectWord}){1,3}\\s+${particle}`
  return new RegExp(`(?<![A-Za-z])(?:${contiguous}|${separable})(?![A-Za-z])`, 'i').test(sentence)
}

export function containsPhrasalUse(sentence: string, phrase: string): boolean {
  const words = phrase.trim().toLowerCase().split(/\s+/)
  if (words.length !== 2 || words.some((word) => !/^[a-z]+$/.test(word))) return false
  const [baseVerb, particle] = words as [string, string]
  const forms = formsFor(baseVerb, 'verb')
  const verbForms = new Set((Array.isArray(forms) ? forms : Object.values(forms))
    .map((form) => form.toLowerCase()))
  const terms = phrasalPosTagger.tagSentence(sentence).map((term) => ({
    value: term.value,
    normal: term.normal,
    pos: String(term.pos),
  }))
  const isWord = (value: string) => /[a-z0-9]/i.test(value)
  const hasCompromiseVerbEvidence = sentenceFormsMatchPartOfSpeech(
    sentence,
    [...verbForms],
    'verb',
    baseVerb,
  )
  const previousWordIndex = (index: number): number | undefined => {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (isWord(terms[cursor]!.value)) return cursor
    }
    return undefined
  }
  const nextWordIndex = (index: number): number | undefined => {
    for (let cursor = index + 1; cursor < terms.length; cursor += 1) {
      if (isWord(terms[cursor]!.value)) return cursor
    }
    return undefined
  }
  const followsNominalDeterminer = (index: number): boolean => {
    let cursor = previousWordIndex(index)
    let modifiers = 0
    while (cursor !== undefined && modifiers < 4) {
      const candidate = terms[cursor]!
      if (['DT', 'PDT', 'PRP$'].includes(candidate.pos)) return true
      if (!/^(?:JJ|JJR|JJS|NN|NNS|VBG|RB)$/.test(candidate.pos)) return false
      modifiers += 1
      cursor = previousWordIndex(cursor)
    }
    return false
  }
  const isVerbContext = (index: number): boolean => {
    const term = terms[index]!
    if (terms[index - 1]?.pos === 'HYPH' || terms[index + 1]?.pos === 'HYPH') return false
    const immediatePreviousIndex = previousWordIndex(index)
    if (immediatePreviousIndex !== undefined
      && terms[immediatePreviousIndex]!.normal === 'all') {
      const contractionIndex = previousWordIndex(immediatePreviousIndex)
      if (contractionIndex !== undefined
        && /^(?:d|ll|will|'d|'ll)$/.test(terms[contractionIndex]!.normal)) return true
    }
    if ((term.pos === 'VB' || !/^VB/.test(term.pos)) && followsNominalDeterminer(index)) {
      return false
    }
    if (/^VB/.test(term.pos)) return true
    const previousIndex = previousWordIndex(index)
    if (previousIndex === undefined) return true
    const previous = terms[previousIndex]!
    if (term.pos.startsWith('NN')) {
      let cursor: number | undefined = previousIndex
      let modifiers = 0
      while (cursor !== undefined && modifiers < 3) {
        const candidate = terms[cursor]!
        if (['DT', 'PDT', 'PRP$'].includes(candidate.pos)) return false
        if (!candidate.pos.startsWith('NN') && !candidate.pos.startsWith('JJ')) break
        modifiers += 1
        cursor = previousWordIndex(cursor)
      }
    }
    if (previous.pos === 'MD' || previous.normal === 'to') return true
    if (previous.normal === "n't") {
      const auxiliaryIndex = previousWordIndex(previousIndex)
      return auxiliaryIndex !== undefined && /^(?:do|does|did|can|could|will|would)$/.test(
        terms[auxiliaryIndex]!.normal,
      )
    }
    return hasCompromiseVerbEvidence || /^(?:PRP|WP)$/.test(previous.pos)
      || ['and', 'everyone', 'nobody', 'or', 'please', 'someone'].includes(previous.normal)
  }

  for (let baseIndex = 0; baseIndex < terms.length; baseIndex += 1) {
    const base = terms[baseIndex]!
    if (!verbForms.has(base.normal) || !isVerbContext(baseIndex)) continue
    let interveningWords = 0
    for (let particleIndex = baseIndex + 1; particleIndex < terms.length; particleIndex += 1) {
      const candidate = terms[particleIndex]!
      if (!isWord(candidate.value)) {
        if (!/^[’']$/.test(candidate.value)) break
        continue
      }
      if (candidate.normal === particle) {
        if (interveningWords > 3) break
        const followingIndex = nextWordIndex(particleIndex)
        const following = followingIndex === undefined ? undefined : terms[followingIndex]
        const secondFollowingIndex = followingIndex === undefined
          ? undefined
          : nextWordIndex(followingIndex)
        const secondFollowing = secondFollowingIndex === undefined
          ? undefined
          : terms[secondFollowingIndex]
        if (particle === 'to' && following && /^VB/.test(following.pos)
          && !(baseVerb === 'set' && following.normal === 'work')) break
        if (baseVerb === 'come' && particle === 'at'
          && ['all', 'last'].includes(following?.normal ?? '')) break
        if (baseVerb === 'get' && particle === 'about'
          && (following?.pos === 'CD' || /^\d/.test(following?.value ?? ''))) break
        if (baseVerb === 'make' && particle === 'over'
          && (following?.pos === 'CD' || /^[$£€\d]/.test(following?.value ?? ''))) break
        if (baseVerb === 'change' && particle === 'over'
          && /^(?:time|years?|months?|weeks?|days?|decades?|centur(?:y|ies))$/.test(
            following?.normal ?? '',
          )) break
        if (baseVerb === 'cool' && particle === 'down'
          && /^(?:am|are|be|been|being|is|was|were|'m|'re|'s)$/.test(
            terms[previousWordIndex(baseIndex) ?? -1]?.normal ?? '',
          )) break
        if (baseVerb === 'sleep' && particle === 'over'
          && /^(?:lose|loses|losing|lost)$/.test(
            terms[previousWordIndex(baseIndex) ?? -1]?.normal ?? '',
          )) break
        if (baseVerb === 'lay' && particle === 'on'
          && /^(?:her|his|its|my|our|the|their|your)$/.test(following?.normal ?? '')
          && /^(?:back|bed|belly|floor|ground|side|stomach)$/.test(
            secondFollowing?.normal ?? '',
          )) break
        if (['catch', 'hire'].includes(baseVerb) && particle === 'out'
          && following?.normal === 'of') break
        return true
      }
      interveningWords += 1
      if (interveningWords > 3) break
    }
  }
  return false
}

function stripIpa(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '')
}

export function selectPhrasalSources(input: {
  rawSource: unknown
  ipaSource: string
  frequencySource: string
  cefrSource: string
  count?: number
  requiredPhrases?: readonly string[]
  recoveryExamples?: ReadonlyMap<string, readonly string[]>
}): SelectedPhrasalSource[] {
  if (typeof input.rawSource !== 'object' || input.rawSource === null || Array.isArray(input.rawSource)) {
    throw new Error('Phrasal source must be an object keyed by phrase')
  }
  const ipa = parseIpaDictionary(input.ipaSource)
  const frequency = parseFrequencyCsv(input.frequencySource)
  const cefr = parseCefrCsv(input.cefrSource)
  const pool = Object.entries(input.rawSource as Record<string, RawPhrasalRecord>).flatMap(
    ([rawPhrase, raw], sourceIndex) => {
      const phrase = rawPhrase.trim().toLowerCase()
      if (!/^[a-z]+ [a-z]+$/.test(phrase)
        || !isSafePhrasalContent(phrase)
        || PHRASAL_SOURCE_EXCLUSIONS.has(phrase)) return []
      const [baseVerb, particle] = phrase.split(' ') as [string, string]
      const baseIpa = ipa.get(baseVerb)
      const particleIpa = ipa.get(particle)
      const descriptions = stringArray(raw.descriptions).filter(isSafePhrasalContent)
      const examples = [...new Set([
        ...stringArray(raw.examples),
        ...(input.recoveryExamples?.get(phrase) ?? []),
      ])]
        .filter(isSuitablePhrasalExample)
        .filter((example) => containsPhrasalUse(example, phrase))
      if (!baseIpa || !particleIpa || descriptions.length === 0 || examples.length < 2) return []
      const sourceFrequency = typeof raw.frequency === 'number' && Number.isFinite(raw.frequency)
        ? raw.frequency
        : 0
      return [{
        phrase,
        baseVerb,
        particle,
        description: descriptions[0]!,
        descriptions,
        candidateExamples: examples,
        ipa: `/${stripIpa(baseIpa)} ${stripIpa(particleIpa)}/`,
        sourceFrequency,
        baseFrequencyRank: frequency.get(baseVerb)?.rank ?? null,
        baseCefr: cefr.get(baseVerb)?.level ?? null,
        sourceIndex,
      }]
    },
  )
  pool.sort((left, right) =>
    right.sourceFrequency - left.sourceFrequency
    || (left.baseFrequencyRank ?? 10_000) - (right.baseFrequencyRank ?? 10_000)
    || left.sourceIndex - right.sourceIndex
    || left.phrase.localeCompare(right.phrase))

  const targetCount = input.count ?? 1_000
  const requiredPhrases = (input.requiredPhrases ?? []).map((phrase) => phrase.trim().toLowerCase())
  if (new Set(requiredPhrases).size !== requiredPhrases.length) {
    throw new Error('Required phrasal phrases must be unique')
  }
  if (requiredPhrases.some((phrase) => !/^[a-z]+ [a-z]+$/.test(phrase))) {
    throw new Error('Required phrasal phrases must contain exactly two lowercase words')
  }
  if (requiredPhrases.length > targetCount) {
    throw new Error(`Required phrasal phrase count exceeds target count ${targetCount}`)
  }
  const candidatesByPhrase = new Map(pool.map((candidate) => [candidate.phrase, candidate]))
  const missingRequired = requiredPhrases.filter((phrase) => !candidatesByPhrase.has(phrase))
  if (missingRequired.length > 0) {
    throw new Error(`Required phrasal phrases are missing or ineligible: ${missingRequired.join(', ')}`)
  }
  const requiredSet = new Set(requiredPhrases)
  const orderedPool = [
    ...requiredPhrases.map((phrase) => candidatesByPhrase.get(phrase)!),
    ...pool.filter((candidate) => !requiredSet.has(candidate.phrase)),
  ]
  const selected: Array<Omit<SelectedPhrasalSource, 'level'>> = []
  const usedExamples = new Set<string>()
  for (const candidate of orderedPool) {
    const exact = candidate.candidateExamples
      .filter((example) => containsPhrasalBase(example, candidate.phrase))
      .sort((left, right) => left.length - right.length || left.localeCompare(right))
    const remaining = candidate.candidateExamples
      .filter((example) => !containsPhrasalBase(example, candidate.phrase))
      .sort((left, right) => left.length - right.length || left.localeCompare(right))
    const chosen: string[] = []
    for (const example of [...exact, ...remaining]) {
      if (usedExamples.has(example)) continue
      chosen.push(example)
      if (chosen.length === 2) break
    }
    if (chosen.length < 2) continue
    chosen.forEach((example) => usedExamples.add(example))
    selected.push({
      phrase: candidate.phrase,
      baseVerb: candidate.baseVerb,
      particle: candidate.particle,
      description: candidate.description,
      examples: [chosen[0]!, chosen[1]!],
      descriptions: candidate.descriptions,
      candidateExamples: candidate.candidateExamples,
      ipa: candidate.ipa,
      sourceFrequency: candidate.sourceFrequency,
      baseFrequencyRank: candidate.baseFrequencyRank,
      baseCefr: candidate.baseCefr,
      sourceIndex: candidate.sourceIndex,
    })
    if (selected.length === targetCount) break
  }
  if (selected.length !== targetCount) {
    throw new Error(`Expected ${targetCount} verified phrasal sources; found ${selected.length}`)
  }
  const selectedPhrases = new Set(selected.map(({ phrase }) => phrase))
  const omittedRequired = requiredPhrases.filter((phrase) => !selectedPhrases.has(phrase))
  if (omittedRequired.length > 0) {
    throw new Error(`Required phrasal phrases could not reserve unique examples: ${omittedRequired.join(', ')}`)
  }

  const levels: Level[] = ['기초', '유치원', '초등학교', '중학교']
  return selected.map((source, index) => ({
    ...source,
    level: levels[Math.min(levels.length - 1, Math.floor(index * levels.length / targetCount))]!,
  }))
}
