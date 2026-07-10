export const LEVELS = ['기초', '유치원', '초등학교', '중학교'] as const
export type Level = (typeof LEVELS)[number]

export const DIFFICULTIES = ['veryEasy', 'easy', 'normal', 'hard', 'veryHard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const GRAMMAR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const
export type GrammarLevel = (typeof GRAMMAR_LEVELS)[number]

export const GRAMMAR_DIFFICULTY_TAGS = [
  'core',
  'expansion',
  'integration',
  'complex',
  'precision',
] as const
export type GrammarDifficultyTag = (typeof GRAMMAR_DIFFICULTY_TAGS)[number]

export interface WordEntry {
  partOfSpeech: string
  forms: string[] | Record<string, string>
  meanings: string[]
  ipa: string
  examples: string[]
}

export interface WordItem {
  id: string
  word: string
  lemma: string
  level: Level
  familyId: string
  isFamilyHead: boolean
  difficulty: Difficulty
  entries: WordEntry[]
}

export interface PhrasalVerbItem {
  id: string
  baseVerb: string
  particle: string
  phrasalVerb: string
  levelHint: Level
  meaningKo: string[]
  examples: string[]
  partOfSpeech: 'phrasalVerb'
  usageNotes: string
  difficulty: Difficulty
}

export interface StoryContent {
  schemaVersion: string
  level: Level
  title: string
  isManual: boolean
  coverage: {
    mustCoverAll: boolean
    allowUpperLevelWords: boolean
    coverageRate: number
  }
  usedWords: Array<{
    lemma: string
    partOfSpeech: string
    forms: string[]
  }>
  storyText: string
}

export interface GrammarNode {
  id: string
  level: GrammarLevel
  title: string
  prerequisite: string | null
  difficultyTag: GrammarDifficultyTag
  canDo: string[]
  summary: string
  patterns: string[]
  examples: string[]
  errorCodes: string[]
  masteryRule: {
    quizAccuracy: number
    productionPass: boolean
    errorTolerance: number
  }
}

export interface ContentCatalog {
  wordlists: Record<Level, WordItem[]>
  phrasalVerbs: {
    top: PhrasalVerbItem[]
    byLevel: Record<Level, PhrasalVerbItem[]>
  }
  stories: Record<Level, StoryContent>
  grammarNodes: GrammarNode[]
}

export type ValidationMode = 'development' | 'release'

export interface ValidationIssue {
  code: string
  path: string
  message: string
}
