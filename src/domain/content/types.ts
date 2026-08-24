export const LEVELS = ['기초', '유치원', '초등학교', '중학교'] as const
export type Level = (typeof LEVELS)[number]

export const DIFFICULTIES = ['veryEasy', 'easy', 'normal', 'hard', 'veryHard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export type ContentKind = 'word' | 'phrasalVerb'

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

export const GRAMMAR_EXERCISE_PHASES = [
  'diagnostic',
  'practice',
  'rediagnostic',
] as const
export type GrammarExercisePhase = (typeof GRAMMAR_EXERCISE_PHASES)[number]

export const GRAMMAR_EXERCISE_TYPES = [
  'choice',
  'translation',
  'errorCorrection',
] as const
export type GrammarExerciseType = (typeof GRAMMAR_EXERCISE_TYPES)[number]

export const GRAMMAR_EXAMPLE_DIFFICULTIES = ['guided', 'independent'] as const
export type GrammarExampleDifficulty =
  (typeof GRAMMAR_EXAMPLE_DIFFICULTIES)[number]

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
  ipa: string
  levelHint: Level
  meaningKo: string[]
  examples: string[]
  partOfSpeech: 'phrasalVerb'
  usageNotes: string
  difficulty: Difficulty
}

export interface StudyItem {
  id: string
  kind: ContentKind
  term: string
  lemma: string
  level: Level
  difficulty: Difficulty
  partsOfSpeech: string[]
  forms: string[]
  meanings: string[]
  ipa: string | null
  examples: string[]
  entries: WordEntry[]
}

export interface StoryContent {
  schemaVersion: string
  level: Level
  title: string
  chapterTitles: string[]
  isManual: boolean
  coverage: {
    mustCoverAll: boolean
    allowUpperLevelWords: false
    coverageRate: number
    phrasalVerbCoverageRate: number
  }
  usedWords: Array<{
    lemma: string
    partOfSpeech: string
    forms: string[]
  }>
  usedPhrasalVerbs: Array<{
    id: string
    phrasalVerb: string
    storyForm: string
    context: string
    senseId: string
    meaningKo: string
  }>
  storyText: string
}

export interface GrammarRule {
  heading: string
  explanation: string
  keyPoints: string[]
  exceptions: string[]
}

export interface GrammarExample {
  english: string
  korean: string
  difficulty: GrammarExampleDifficulty
}

export interface GrammarExercise {
  id: string
  phase: GrammarExercisePhase
  type: GrammarExerciseType
  prompt: string
  choices: string[]
  answer: string
  explanation: string
  errorCode: string
}

export interface GrammarProductionPartConstraint {
  id: string
  label: string
  register: string | null
  minSentences: number
  maxSentences: number | null
}

export interface GrammarProductionEvidenceConstraint {
  id: string
  label: string
  minSelections: number
  requiredPartIds: string[]
}

export interface GrammarProductionConstraints {
  profileId: string
  minSentences: number
  maxSentences: number | null
  maxRevisionRounds: number | null
  rubricEvidenceCount: number
  parts: GrammarProductionPartConstraint[]
  evidenceRequirements: GrammarProductionEvidenceConstraint[]
}

export interface GrammarProductionTask {
  prompt: string
  requirements: string[]
  rubric: string[]
  constraints: GrammarProductionConstraints
}

export interface GrammarErrorNote {
  code: string
  title: string
  wrongExample: string
  correction: string
  reviewRule: string
}

export interface GrammarMasteryRule {
  quizAccuracy: number
  productionPass: boolean
  errorTolerance: number
}

export interface GrammarNode {
  id: string
  level: GrammarLevel
  title: string
  prerequisite: string | null
  difficultyTag: GrammarDifficultyTag
  canDo: string[]
  summary: string
  rules: GrammarRule[]
  patterns: string[]
  examples: GrammarExample[]
  exercises: GrammarExercise[]
  productionTask: GrammarProductionTask
  errorCodes: string[]
  errorNotes: GrammarErrorNote[]
  masteryRule: GrammarMasteryRule
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

export interface RuntimeCatalog extends ContentCatalog {
  itemsByLevel: Record<Level, StudyItem[]>
  itemsById: Record<string, StudyItem>
}

export type ValidationMode = 'development' | 'release'

export interface ValidationIssue {
  code: string
  path: string
  message: string
}
