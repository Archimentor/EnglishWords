import { useState, type FormEvent } from 'react'
import {
  GRAMMAR_LEVELS,
  type GrammarExercise,
  type GrammarExercisePhase,
  type GrammarNode,
  type WordItem,
} from '../../domain/content/types'
import {
  emptyGrammarMastery,
  grammarErrorClusters,
  grammarLevelProgress,
  grammarProductionDraft,
  grammarProductionEvidenceSentence,
  grammarProductionSentences,
  isGrammarNodeUnlocked,
  isGrammarProductionSubmissionValid,
  latestGrammarExerciseAccuracy,
  latestGrammarExerciseResult,
  type GrammarExerciseResult,
  type GrammarMastery,
  type GrammarProductionEvidenceReference,
  type GrammarProductionPart,
  type GrammarProductionRecord,
  type GrammarProductionRequirementEvidence,
  type GrammarProductionSubmission,
} from '../../domain/grammar/mastery'
import { isGrammarAnswerCorrect } from '../../domain/grammar/grading'
import {
  selectGrammarLearningPlan,
  type GrammarRecommendationReason,
} from '../../domain/grammar/recommendation'
import { relatedGrammarWords } from '../../domain/grammar/vocabulary'
import { GRAMMAR_SECTIONS, type GrammarSection } from '../../state/appState'

interface GrammarViewProps {
  nodes: readonly GrammarNode[]
  words?: readonly WordItem[]
  grammarSection: GrammarSection
  selectedNodeId: string | null
  mastery: Readonly<Record<string, GrammarMastery>>
  onSelectLevel: (section: GrammarSection) => void
  onSelectNode: (node: GrammarNode) => void
  onRecordExercise: (
    node: GrammarNode,
    exercise: GrammarExercise,
    correct: boolean,
  ) => void
  onRecordPrerequisiteReview: (
    node: GrammarNode,
    reviewedNode: GrammarNode,
  ) => void
  onSubmitProduction: (
    node: GrammarNode,
    submission: GrammarProductionSubmission,
  ) => void
  onReviewProduction: (node: GrammarNode, reviewChecks: boolean[]) => void
  onRestartProduction?: (node: GrammarNode) => void
}

interface ExerciseFeedback {
  correct: boolean
  answer: string
  explanation: string
  submittedAnswer: string
}

const PHASE_LABELS = {
  diagnostic: '1. 진단',
  practice: '2. 학습·변형 연습',
  rediagnostic: '4. 재진단',
} as const

const RECOMMENDATION_LABELS: Record<GrammarRecommendationReason, string> = {
  'focus-review': '연속 오류 집중 복습',
  rediagnostic: '산출 승인 후 재진단',
  'error-recovery': '오류 우선 회복',
  'continue-learning': '진행 중 학습 이어가기',
  'next-unstarted': '다음 새 학습',
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`
}

function exerciseStateKey(nodeId: string, exerciseId: string): string {
  return JSON.stringify([nodeId, exerciseId])
}

function GrammarExerciseCard({
  node,
  exercise,
  enabled,
  lockMessage,
  result,
  answer,
  feedback,
  onAnswer,
  onSubmit,
}: {
  node: GrammarNode
  exercise: GrammarExercise
  enabled: boolean
  lockMessage: string
  result: GrammarExerciseResult | undefined
  answer: string
  feedback: ExerciseFeedback | undefined
  onAnswer: (value: string) => void
  onSubmit: (correct: boolean) => void
}) {
  const recordedCorrect = result?.correct === true
  const recordedWrong = result?.correct === false
  const duplicateLocalAnswer =
    feedback?.submittedAnswer.trim() === answer.trim() && answer.trim().length > 0

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (
      !enabled ||
      recordedCorrect ||
      answer.trim().length === 0 ||
      duplicateLocalAnswer
    ) return
    onSubmit(isGrammarAnswerCorrect(answer, exercise.answer))
  }

  return (
    <form
      className="grammar-exercise"
      data-phase={exercise.phase}
      data-state={recordedCorrect ? 'completed' : enabled ? 'ready' : 'locked'}
      onSubmit={submit}
    >
      <h5>{PHASE_LABELS[exercise.phase]}</h5>
      <p>{exercise.prompt}</p>
      {exercise.type === 'choice' ? (
        <fieldset disabled={!enabled || recordedCorrect}>
          <legend className="visually-hidden">{exercise.prompt}</legend>
          {exercise.choices.map((choice) => (
            <label className="grammar-choice" key={choice}>
              <input
                type="radio"
                name={exercise.id}
                value={choice}
                checked={answer === choice}
                onChange={(event) => onAnswer(event.currentTarget.value)}
              />
              <span>{choice}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <label>
          <span className="visually-hidden">{`${node.id} ${PHASE_LABELS[exercise.phase]} 답안`}</span>
          <textarea
            aria-label={`${node.id} ${PHASE_LABELS[exercise.phase]} 답안`}
            value={answer}
            disabled={!enabled || recordedCorrect}
            rows={3}
            onChange={(event) => onAnswer(event.currentTarget.value)}
          />
        </label>
      )}
      {recordedCorrect ? (
        <button type="button" disabled>채점 완료</button>
      ) : !enabled ? (
        <p className="grammar-step-lock">{lockMessage}</p>
      ) : (
        <button
          type="submit"
          disabled={answer.trim().length === 0 || duplicateLocalAnswer}
        >
          {recordedWrong ? '다시 채점하기' : '채점하기'}
        </button>
      )}
      {feedback ? (
        <div
          className="grammar-feedback"
          data-state={feedback.correct ? 'correct' : 'incorrect'}
          role="status"
        >
          <strong>{feedback.correct ? '정답입니다.' : '다시 확인하세요.'}</strong>
          {!feedback.correct ? <p>{`정답: ${feedback.answer}`}</p> : null}
          <p>{feedback.explanation}</p>
        </div>
      ) : result ? (
        <p
          className="grammar-feedback"
          data-state={result.correct ? 'correct' : 'incorrect'}
          role="status"
        >
          {result.correct
            ? '이 문항은 정답으로 기록되었습니다.'
            : '이 문항은 오답으로 기록되었습니다. 답안을 수정해 다시 채점하세요.'}
        </p>
      ) : null}
    </form>
  )
}

type OptionalEvidenceReference = GrammarProductionEvidenceReference | undefined

interface ProductionSentenceOption {
  reference: GrammarProductionEvidenceReference
  value: string
  label: string
}

function evidenceValue(reference: GrammarProductionEvidenceReference): string {
  return JSON.stringify([reference.partId, reference.sentenceIndex])
}

function evidenceReference(value: string): GrammarProductionEvidenceReference | undefined {
  if (value.length === 0) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      Number.isInteger(parsed[1]) &&
      (parsed[1] as number) >= 0
    ) {
      return { partId: parsed[0], sentenceIndex: parsed[1] as number }
    }
  } catch {
    // A select can only emit generated values; malformed input remains unselected.
  }
  return undefined
}

function sentenceRange(minimum: number, maximum: number | null): string {
  return maximum === null ? `${minimum}문장 이상` : `${minimum}~${maximum}문장`
}

function ProductionCard({
  node,
  enabled,
  partTexts,
  requirementEvidence,
  rubricEvidence,
  revisionNote,
  production,
  reviewChecks,
  onPartText,
  onRequirementEvidence,
  onRequirementEvidenceCount,
  onRubricEvidence,
  onRevisionNote,
  onReviewCheck,
  onSubmit,
  onReview,
  onRestart,
}: {
  node: GrammarNode
  enabled: boolean
  partTexts: Readonly<Record<string, string>>
  requirementEvidence: Readonly<Record<string, readonly OptionalEvidenceReference[]>>
  rubricEvidence: readonly OptionalEvidenceReference[]
  revisionNote: string
  production: GrammarProductionRecord | null
  reviewChecks: Readonly<Record<number, boolean | undefined>>
  onPartText: (partId: string, value: string) => void
  onRequirementEvidence: (
    requirementId: string,
    index: number,
    reference: OptionalEvidenceReference,
  ) => void
  onRequirementEvidenceCount: (requirementId: string, count: number) => void
  onRubricEvidence: (index: number, reference: OptionalEvidenceReference) => void
  onRevisionNote: (value: string) => void
  onReviewCheck: (index: number, value: boolean | undefined) => void
  onSubmit: (submission: GrammarProductionSubmission) => void
  onReview: (checks: boolean[]) => void
  onRestart: () => void
}) {
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const { constraints } = node.productionTask
  const parts = constraints.parts.map((part): GrammarProductionPart => ({
    partId: part.id,
    text: partTexts[part.id] ?? production?.parts.find(({ partId }) => partId === part.id)?.text ?? '',
  }))
  const sentenceOptions = parts.flatMap((part) => {
    const partConstraint = constraints.parts.find(({ id }) => id === part.partId)
    return grammarProductionSentences(part.text).map((sentence, sentenceIndex) => {
      const reference = { partId: part.partId, sentenceIndex }
      return {
        reference,
        value: evidenceValue(reference),
        label: `${partConstraint?.label ?? part.partId} ${sentenceIndex + 1}. ${sentence}`,
      }
    })
  })
  const optionValues = new Set(sentenceOptions.map(({ value }) => value))
  const status = production?.reviewStatus
  const maxRevisionRounds = constraints.maxRevisionRounds
  const revisionLimitReached = status === 'rejected' &&
    production !== null &&
    maxRevisionRounds !== null &&
    production.revisionRound >= maxRevisionRounds
  const submissionLocked = !enabled || status === 'pending' || status === 'approved' ||
    revisionLimitReached

  function selectedValue(reference: OptionalEvidenceReference): string {
    if (!reference) return ''
    const value = evidenceValue(reference)
    return optionValues.has(value) ? value : ''
  }

  function submitProduction(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (submissionLocked) return
    const normalizedParts = parts.map((part) => ({ ...part, text: part.text.trim() }))
    const normalizedRequirementEvidence: GrammarProductionRequirementEvidence[] =
      constraints.evidenceRequirements.map((requirement) => ({
        requirementId: requirement.id,
        selections: (requirementEvidence[requirement.id] ?? [])
          .filter((reference): reference is GrammarProductionEvidenceReference =>
            reference !== undefined && optionValues.has(evidenceValue(reference))),
      }))
    const normalizedRubricEvidence = rubricEvidence
      .filter((reference): reference is GrammarProductionEvidenceReference =>
        reference !== undefined && optionValues.has(evidenceValue(reference)))
    const submission: GrammarProductionSubmission = {
      draft: grammarProductionDraft(normalizedParts),
      parts: normalizedParts,
      requirementEvidence: normalizedRequirementEvidence,
      rubricEvidence: normalizedRubricEvidence,
      revisionNote: status === 'rejected' && maxRevisionRounds !== null
        ? revisionNote.trim() || null
        : null,
    }
    if (!isGrammarProductionSubmissionValid(submission, node.productionTask)) {
      setValidationMessage(
        `${sentenceRange(constraints.minSentences, constraints.maxSentences)}의 유효한 답안과 모든 필수·루브릭 근거를 선택하세요. 각 문장은 세 단어 이상이어야 합니다.`,
      )
      return
    }
    setValidationMessage(null)
    onSubmit(submission)
  }

  function submitReview(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const reviewCount = node.productionTask.rubric.length +
      constraints.evidenceRequirements.length
    const checks = Array.from({ length: reviewCount }, (_, index) => reviewChecks[index])
    if (checks.some((check) => check === undefined)) return
    onReview(checks.map(Boolean))
  }

  function evidenceSelect(
    ariaLabel: string,
    reference: OptionalEvidenceReference,
    options: readonly ProductionSentenceOption[],
    onChange: (reference: OptionalEvidenceReference) => void,
  ) {
    return (
      <select
        aria-label={ariaLabel}
        value={selectedValue(reference)}
        onChange={(event) => {
          setValidationMessage(null)
          onChange(evidenceReference(event.currentTarget.value))
        }}
      >
        <option value="">근거 문장 선택</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    )
  }

  function reviewSelect(
    ariaLabel: string,
    checkIndex: number,
  ) {
    return (
      <label>
        <span>판정</span>
        <select
          aria-label={ariaLabel}
          value={reviewChecks[checkIndex] === undefined
            ? ''
            : reviewChecks[checkIndex]
              ? 'met'
              : 'revise'}
          onChange={(event) => onReviewCheck(
            checkIndex,
            event.currentTarget.value === ''
              ? undefined
              : event.currentTarget.value === 'met',
          )}
        >
          <option value="">판정 선택</option>
          <option value="met">충족</option>
          <option value="revise">수정 필요</option>
        </select>
      </label>
    )
  }

  return (
    <section
      className="grammar-exercise grammar-production"
      data-phase="production"
      data-state={submissionLocked ? 'locked' : 'ready'}
    >
      <form onSubmit={submitProduction}>
        <h5>3. 산출 과제</h5>
        <p>{node.productionTask.prompt}</p>
        <p className="inline-status" role="status">
          {`전체 ${sentenceRange(constraints.minSentences, constraints.maxSentences)}`}
          {maxRevisionRounds === null
            ? ''
            : ` · 자체 교정 최대 ${maxRevisionRounds}회`}
        </p>
        <ul>
          {node.productionTask.requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
        {constraints.parts.map((part, index) => {
          const ariaLabel = constraints.parts.length === 1
            ? `${node.id} 산출 과제 답안`
            : `${node.id} ${part.label} 답안`
          return (
            <label key={part.id}>
              <span>{`${part.label} (${sentenceRange(part.minSentences, part.maxSentences)})`}</span>
              <textarea
                aria-label={ariaLabel}
                value={parts[index]?.text ?? ''}
                disabled={submissionLocked}
                rows={constraints.parts.length === 1 ? 8 : 5}
                onChange={(event) => {
                  setValidationMessage(null)
                  onPartText(part.id, event.currentTarget.value)
                }}
              />
            </label>
          )
        })}
        <fieldset disabled={submissionLocked}>
          <legend>필수 요건 근거</legend>
          {constraints.evidenceRequirements.map((requirement, requirementIndex) => {
            const selected = requirementEvidence[requirement.id] ?? []
            const selectionCount = Math.max(requirement.minSelections, selected.length)
            return (
              <div key={requirement.id} className="grammar-production-evidence-group">
                <p>{requirement.label}</p>
                {Array.from({ length: selectionCount }, (_, selectionIndex) => {
                  const requiredPartId = requirement.requiredPartIds[selectionIndex]
                  const options = requiredPartId
                    ? sentenceOptions.filter(({ reference }) =>
                        reference.partId === requiredPartId)
                    : sentenceOptions
                  return (
                    <label key={`${requirement.id}-${selectionIndex}`}>
                      <span>{`근거 ${selectionIndex + 1}`}</span>
                      {evidenceSelect(
                        `${node.id} 필수 근거 ${requirementIndex + 1}-${selectionIndex + 1}`,
                        selected[selectionIndex],
                        options,
                        (reference) => onRequirementEvidence(
                          requirement.id,
                          selectionIndex,
                          reference,
                        ),
                      )}
                    </label>
                  )
                })}
                <div className="action-row">
                  <button
                    type="button"
                    onClick={() => onRequirementEvidenceCount(requirement.id, selectionCount + 1)}
                  >
                    근거 추가
                  </button>
                  {selectionCount > requirement.minSelections ? (
                    <button
                      type="button"
                      onClick={() => onRequirementEvidenceCount(requirement.id, selectionCount - 1)}
                    >
                      마지막 근거 제거
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </fieldset>
        <fieldset disabled={submissionLocked}>
          <legend>루브릭 근거 문장</legend>
          {node.productionTask.rubric.map((criterion, index) => (
            <label key={criterion}>
              <span>{criterion}</span>
              {evidenceSelect(
                `${node.id} 루브릭 근거 ${index + 1}`,
                rubricEvidence[index],
                sentenceOptions,
                (reference) => onRubricEvidence(index, reference),
              )}
            </label>
          ))}
        </fieldset>
        {status === 'rejected' && production && maxRevisionRounds !== null && !revisionLimitReached ? (
          <label>
            <span>{`자체 교정 기록 (${production.revisionRound + 1}/${maxRevisionRounds})`}</span>
            <textarea
              aria-label={`${node.id} 자체 교정 기록`}
              value={revisionNote}
              disabled={submissionLocked}
              rows={3}
              onChange={(event) => onRevisionNote(event.currentTarget.value)}
            />
          </label>
        ) : null}
        {!enabled ? (
          <p className="grammar-step-lock">변형 연습을 먼저 제출하세요.</p>
        ) : status === 'pending' ? (
          <p className="grammar-step-lock">제출한 근거를 기준별로 검토하세요.</p>
        ) : status === 'approved' ? null : revisionLimitReached ? (
          <div>
            <p className="grammar-step-lock">
              자체 교정 2회를 모두 사용했습니다. 새 산출 사이클에서 다시 작성하세요.
            </p>
            <button type="button" onClick={onRestart}>새 산출 사이클 시작</button>
          </div>
        ) : (
          <button type="submit">
            {status === 'rejected' ? '산출 과제 다시 제출' : '산출 과제 제출'}
          </button>
        )}
        {validationMessage ? (
          <p className="grammar-feedback" data-state="incorrect" role="alert">
            {validationMessage}
          </p>
        ) : null}
      </form>

      {status === 'pending' && production ? (
        <form aria-label={`${node.id} 산출 과제 루브릭 검토`} onSubmit={submitReview}>
          <p className="grammar-feedback" data-state="incorrect" role="status">
            산출 과제가 검토 대기 중입니다. 선택된 근거로 각 기준을 수동 판정하세요.
          </p>
          {production.revisionNote ? <p>{`자체 교정 기록: ${production.revisionNote}`}</p> : null}
          {node.productionTask.rubric.map((criterion, index) => (
            <div key={criterion}>
              <p>{criterion}</p>
              <blockquote>
                {grammarProductionEvidenceSentence(
                  production.parts,
                  production.rubricEvidence[index]!,
                ) ?? '유효한 근거 없음'}
              </blockquote>
              {reviewSelect(`${node.id} 루브릭 검토 ${index + 1}`, index)}
            </div>
          ))}
          {constraints.evidenceRequirements.map((requirement, index) => {
            const evidence = production.requirementEvidence[index]
            const checkIndex = node.productionTask.rubric.length + index
            return (
              <div key={requirement.id}>
                <p>{requirement.label}</p>
                {evidence?.selections.map((reference, selectionIndex) => (
                  <blockquote key={evidenceValue(reference)}>
                    {`${selectionIndex + 1}. ${grammarProductionEvidenceSentence(
                      production.parts,
                      reference,
                    ) ?? '유효한 근거 없음'}`}
                  </blockquote>
                ))}
                {reviewSelect(`${node.id} 필수 요건 검토 ${index + 1}`, checkIndex)}
              </div>
            )
          })}
          <button
            type="submit"
            disabled={Array.from({
              length: node.productionTask.rubric.length +
                constraints.evidenceRequirements.length,
            }, (_, index) => reviewChecks[index]).some((check) => check === undefined)}
          >
            루브릭 검토 저장
          </button>
        </form>
      ) : status === 'approved' ? (
        <p className="grammar-feedback" data-state="correct" role="status">
          산출 과제 검토가 승인되었습니다. 재진단으로 정확도를 확인하세요.
        </p>
      ) : status === 'rejected' ? (
        <p className="grammar-feedback" data-state="incorrect" role="status">
          루브릭 검토 결과 수정이 필요합니다. 답안과 근거를 고쳐 다시 제출하세요.
        </p>
      ) : null}
    </section>
  )
}

export function GrammarView({
  nodes,
  words = [],
  grammarSection,
  selectedNodeId,
  mastery,
  onSelectLevel,
  onSelectNode,
  onRecordExercise,
  onRecordPrerequisiteReview,
  onSubmitProduction,
  onReviewProduction,
  onRestartProduction,
}: GrammarViewProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [exerciseFeedback, setExerciseFeedback] = useState<
    Record<string, ExerciseFeedback>
  >({})
  const [productionPartTexts, setProductionPartTexts] = useState<
    Record<string, Record<string, string>>
  >({})
  const [productionRequirementEvidence, setProductionRequirementEvidence] = useState<
    Record<string, Record<string, OptionalEvidenceReference[]>>
  >({})
  const [productionRubricEvidence, setProductionRubricEvidence] = useState<
    Record<string, OptionalEvidenceReference[]>
  >({})
  const [productionRevisionNotes, setProductionRevisionNotes] = useState<Record<string, string>>({})
  const [productionReviewChecks, setProductionReviewChecks] = useState<
    Record<string, Record<number, boolean | undefined>>
  >({})

  const selectedNode = selectedNodeId && grammarSection !== '대시보드'
    ? nodes.find(
        ({ id, level }) => id === selectedNodeId && level === grammarSection,
      )
    : undefined
  const selectedIndex = selectedNode
    ? nodes.findIndex(({ id }) => id === selectedNode.id)
    : -1
  const selectedUnlocked = selectedNode
    ? isGrammarNodeUnlocked(selectedNode, nodes, mastery)
    : false
  const currentMastery = selectedNode
    ? mastery[selectedNode.id] ?? emptyGrammarMastery()
    : emptyGrammarMastery()
  const vocabularyLinks = selectedNode ? relatedGrammarWords(selectedNode, words) : []
  const learningPlan = selectGrammarLearningPlan(nodes, mastery)
  const errorClusters = grammarErrorClusters(mastery, nodes)
  const reviewRequirement = currentMastery.reviewRequirement
  const reviewTarget = reviewRequirement
    ? nodes.find(({ id }) => id === reviewRequirement.nodeId)
    : undefined

  function phaseComplete(phase: GrammarExercisePhase): boolean {
    if (!selectedNode) return false
    return selectedNode.exercises
      .filter((exercise) => exercise.phase === phase)
      .every((exercise) => latestGrammarExerciseResult(currentMastery, exercise.id) !== undefined)
  }

  const diagnosticComplete = phaseComplete('diagnostic')
  const practiceComplete = phaseComplete('practice')
  const reviewComplete = !currentMastery.mustReview || reviewRequirement?.completed === true

  function renderExercise(exercise: GrammarExercise) {
    if (!selectedNode) return null
    const stateKey = exerciseStateKey(selectedNode.id, exercise.id)
    const enabled = exercise.phase === 'diagnostic'
      || (exercise.phase === 'practice' && diagnosticComplete)
      || (
        exercise.phase === 'rediagnostic' &&
        diagnosticComplete &&
        practiceComplete &&
        currentMastery.productionPassed &&
        reviewComplete
      )
    const lockMessage = exercise.phase === 'practice'
      ? '진단 문항을 먼저 제출하세요.'
      : !currentMastery.productionPassed
        ? '산출 과제의 루브릭 검토 승인을 먼저 완료하세요.'
        : '지정된 규칙의 복습 완료를 먼저 기록하세요.'

    return (
      <GrammarExerciseCard
        key={stateKey}
        node={selectedNode}
        exercise={exercise}
        enabled={enabled}
        lockMessage={lockMessage}
        result={latestGrammarExerciseResult(currentMastery, exercise.id)}
        answer={answers[stateKey] ?? ''}
        feedback={exerciseFeedback[stateKey]}
        onAnswer={(value) => setAnswers((current) => ({
          ...current,
          [stateKey]: value,
        }))}
        onSubmit={(correct) => {
          setExerciseFeedback((current) => ({
            ...current,
            [stateKey]: {
              correct,
              answer: exercise.answer,
              explanation: exercise.explanation,
              submittedAnswer: answers[stateKey] ?? '',
            },
          }))
          onRecordExercise(selectedNode, exercise, correct)
        }}
      />
    )
  }

  return (
    <section
      className="view view--grammar"
      data-state={selectedNode ? (selectedUnlocked ? 'detail' : 'locked') : 'index'}
      aria-labelledby="grammar-title"
    >
      <header className="feature-header">
        <p className="feature-kicker">42개 핵심 문법 지도</p>
        <h2 id="grammar-title">문법 학습</h2>
      </header>
      <nav className="nav-row grammar-levels" aria-label="문법 레벨">
        {GRAMMAR_SECTIONS.map((section) => (
          <button
            key={section}
            className="nav-chip nav-chip--secondary"
            type="button"
            aria-current={grammarSection === section ? 'page' : undefined}
            data-state={grammarSection === section ? 'active' : 'inactive'}
            onClick={() => onSelectLevel(section)}
          >
            {section}
          </button>
        ))}
      </nav>

      {grammarSection === '대시보드' ? (
        <section className="panel grammar-summary" aria-labelledby="grammar-summary-title">
          <h3 id="grammar-summary-title">
            {`전체 ${learningPlan.totalCount}개 중 ${learningPlan.completedCount}개 숙달`}
          </h3>
          <section aria-labelledby="grammar-recommendation-title">
            <h4 id="grammar-recommendation-title">추천 학습</h4>
            {learningPlan.allCompleted ? (
              <p role="status">모든 문법 학습을 완료했습니다.</p>
            ) : learningPlan.recommendation ? (
              <button
                className="grammar-node-button"
                type="button"
                aria-label={`${learningPlan.recommendation.node.id} 추천 학습 선택`}
                onClick={() => onSelectNode(learningPlan.recommendation!.node)}
              >
                <span>{`${learningPlan.recommendation.node.id} ${learningPlan.recommendation.node.title}`}</span>
                <small>{RECOMMENDATION_LABELS[learningPlan.recommendation.reason]}</small>
              </button>
            ) : (
              <p role="status">현재 추천 가능한 문법 노드가 없습니다.</p>
            )}
          </section>

          <div className="grammar-node-meta" aria-label="문법 학습 진단 지표">
            <span>
              <strong>선행노드 통과율</strong>
              {` ${learningPlan.prerequisitePassRate.passed}/${learningPlan.prerequisitePassRate.total} (${percent(learningPlan.prerequisitePassRate.ratio)})`}
            </span>
            <span>
              <strong>재진단 반복 횟수</strong>
              {` ${learningPlan.rediagnosticRepeatCount}회`}
            </span>
          </div>

          <section aria-labelledby="grammar-rediagnostic-queue-title">
            <h4 id="grammar-rediagnostic-queue-title">
              {`재진단 큐 ${learningPlan.rediagnosticQueue.length}개`}
            </h4>
            {learningPlan.rediagnosticQueue.length === 0 ? (
              <p>재진단을 기다리는 노드가 없습니다.</p>
            ) : (
              <div className="grammar-node-nav">
                {learningPlan.rediagnosticQueue.map((item) => (
                  <button
                    className="grammar-node-button"
                    type="button"
                    key={item.node.id}
                    aria-label={`${item.node.id} 재진단 선택`}
                    onClick={() => onSelectNode(item.node)}
                  >
                    <span>{`${item.node.id} ${item.node.title}`}</span>
                    <small>{`오류 ${item.errorCount}회 · 재진단 ${item.rediagnosticAttempts}회`}</small>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="grammar-focus-review-queue-title">
            <h4 id="grammar-focus-review-queue-title">
              {`집중 복습 큐 ${learningPlan.focusReviewQueue.length}개`}
            </h4>
            {learningPlan.focusReviewQueue.length === 0 ? (
              <p>집중 복습을 기다리는 노드가 없습니다.</p>
            ) : (
              <div className="grammar-node-nav">
                {learningPlan.focusReviewQueue.map((item) => (
                  <button
                    className="grammar-node-button"
                    type="button"
                    key={item.node.id}
                    aria-label={`${item.node.id} 집중 복습 선택`}
                    onClick={() => onSelectNode(item.node)}
                  >
                    <span>{`${item.node.id} ${item.node.title}`}</span>
                    <small>{`오류 ${item.errorCount}회 · 재시도 ${item.retryCount}회`}</small>
                  </button>
                ))}
              </div>
            )}
          </section>

          <ul className="grammar-progress-list">
            {GRAMMAR_LEVELS.map((level) => {
              const progress = grammarLevelProgress(level, nodes, mastery)
              return (
                <li key={level}>
                  <span>{`${level} ${progress.completed}/${progress.total}`}</span>
                  <progress
                    aria-label={`${level} 문법 숙달도`}
                    max={progress.total || 1}
                    value={progress.completed}
                  />
                  <span>{percent(progress.ratio)}</span>
                </li>
              )
            })}
          </ul>
          <h4>집중 복습 오류</h4>
          {errorClusters.length === 0 ? (
            <p>아직 기록된 오류가 없습니다.</p>
          ) : (
            <ol>
              {errorClusters.slice(0, 5).map(({ code, count }) => (
                <li key={code}>{`${code} ${count}회`}</li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <div className="grammar-workspace">
          <nav className="grammar-node-nav" aria-label={`${grammarSection} 문법 노드`}>
            {nodes
              .filter(({ level }) => level === grammarSection)
              .map((node) => {
                const unlocked = isGrammarNodeUnlocked(node, nodes, mastery)
                const completed = Boolean(mastery[node.id]?.completed)
                return (
                  <button
                    key={node.id}
                    className="grammar-node-button"
                    type="button"
                    aria-current={selectedNode?.id === node.id ? 'page' : undefined}
                    data-state={completed
                      ? 'completed'
                      : selectedNode?.id === node.id
                        ? 'active'
                        : unlocked
                          ? 'inactive'
                          : 'locked'}
                    disabled={!unlocked}
                    onClick={() => onSelectNode(node)}
                  >
                    <span>{`${node.id} ${node.title}`}</span>
                    <small>{completed ? '숙달' : unlocked ? '학습 가능' : '잠김'}</small>
                  </button>
                )
              })}
          </nav>

          {selectedNode && selectedUnlocked ? (
            <article className="panel grammar-detail" aria-labelledby="grammar-detail-title">
              <div className="grammar-node-meta">
                <span>{`난이도: ${selectedNode.difficultyTag}`}</span>
                <span>{`선행 노드: ${selectedNode.prerequisite ?? '없음'}`}</span>
                <span>{`정답률: ${percent(latestGrammarExerciseAccuracy(currentMastery))}`}</span>
                <span>{currentMastery.completed ? '숙달 완료' : '학습 중'}</span>
              </div>
              <h3 id="grammar-detail-title">{`${selectedNode.id} ${selectedNode.title}`}</h3>
              <p>{selectedNode.summary}</p>

              {currentMastery.mustReview && reviewRequirement ? (
                <section className="grammar-rule-card" aria-labelledby="grammar-review-title">
                  <p className="grammar-review-warning" role="alert">
                    {`${reviewRequirement.errorCode} 오류가 두 번 연속 발생했습니다. ${reviewRequirement.nodeId} 규칙의 복습 완료가 기록되기 전에는 재진단할 수 없습니다.`}
                  </p>
                  <h4 id="grammar-review-title">
                    {reviewTarget
                      ? `${reviewTarget.id} ${reviewTarget.title} 집중 복습`
                      : `${reviewRequirement.nodeId} 집중 복습`}
                  </h4>
                  {reviewTarget ? (
                    <>
                      <p>{reviewTarget.summary}</p>
                      {reviewTarget.rules.map((rule) => (
                        <div key={rule.heading}>
                          <h5>{rule.heading}</h5>
                          <p>{rule.explanation}</p>
                          <ul>
                            {rule.keyPoints.map((point) => <li key={point}>{point}</li>)}
                          </ul>
                        </div>
                      ))}
                      <ul>
                        {reviewTarget.errorNotes.map((note) => (
                          <li key={note.code}>{`${note.code}: ${note.reviewRule}`}</li>
                        ))}
                      </ul>
                      {reviewRequirement.completed ? (
                        <p className="grammar-feedback" data-state="correct" role="status">
                          지정된 규칙의 복습 완료가 기록되었습니다.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onRecordPrerequisiteReview(selectedNode, reviewTarget)}
                        >
                          복습 완료 기록
                        </button>
                      )}
                    </>
                  ) : (
                    <p role="alert">복습할 문법 노드를 찾을 수 없습니다.</p>
                  )}
                </section>
              ) : null}

              <h4>학습 목표</h4>
              <ul>
                {selectedNode.canDo.map((item) => <li key={item}>{item}</li>)}
              </ul>

              <h4>문법 개념</h4>
              <div className="grammar-rule-grid">
                {selectedNode.rules.map((rule) => (
                  <section key={rule.heading} className="grammar-rule-card">
                    <h5>{rule.heading}</h5>
                    <p>{rule.explanation}</p>
                    <ul>
                      {rule.keyPoints.map((point) => <li key={point}>{point}</li>)}
                    </ul>
                    <strong>예외·주의</strong>
                    <ul>
                      {rule.exceptions.map((exception) => (
                        <li key={exception}>{exception}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <h4>핵심 패턴</h4>
              <ul>
                {selectedNode.patterns.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <h4>번역 예문</h4>
              <div className="grammar-example-grid">
                {selectedNode.examples.map((example) => (
                  <figure key={example.english} className="grammar-example-card">
                    <figcaption>
                      {example.difficulty === 'guided' ? '기본' : '도전'}
                    </figcaption>
                    <p lang="en">{example.english}</p>
                    <p>{example.korean}</p>
                  </figure>
                ))}
              </div>

              <h4>단어장 연결</h4>
              {vocabularyLinks.length > 0 ? (
                <ul className="grammar-vocabulary-grid" aria-label="이 문법 노드의 관련 단어">
                  {vocabularyLinks.map((word) => (
                    <li key={word.id}>
                      <strong lang="en">{word.word}</strong>
                      <span>{word.level}</span>
                      <span>{word.entries.flatMap(({ meanings }) => meanings)[0]}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="inline-status">현재 예문에서 단어장 형태와 일치하는 관련 단어가 없습니다.</p>
              )}

              <h4>단계형 학습</h4>
              <div className="grammar-learning-loop">
                {selectedNode.exercises
                  .filter(({ phase }) => phase !== 'rediagnostic')
                  .map(renderExercise)}
                <ProductionCard
                  key={selectedNode.id}
                  node={selectedNode}
                  enabled={practiceComplete}
                  partTexts={productionPartTexts[selectedNode.id]
                    ?? Object.fromEntries(
                      (currentMastery.production?.parts ?? []).map(({ partId, text }) => [
                        partId,
                        text,
                      ]),
                    )}
                  requirementEvidence={productionRequirementEvidence[selectedNode.id]
                    ?? Object.fromEntries(
                      (currentMastery.production?.requirementEvidence ?? []).map((evidence) => [
                        evidence.requirementId,
                        evidence.selections,
                      ]),
                    )}
                  rubricEvidence={productionRubricEvidence[selectedNode.id]
                    ?? currentMastery.production?.rubricEvidence
                    ?? []}
                  revisionNote={productionRevisionNotes[selectedNode.id] ?? ''}
                  production={currentMastery.production}
                  reviewChecks={productionReviewChecks[selectedNode.id] ?? {}}
                  onPartText={(partId, value) => setProductionPartTexts((current) => ({
                    ...current,
                    [selectedNode.id]: {
                      ...current[selectedNode.id],
                      [partId]: value,
                    },
                  }))}
                  onRequirementEvidence={(requirementId, index, reference) =>
                    setProductionRequirementEvidence((current) => {
                      const fallback = currentMastery.production?.requirementEvidence
                        .find((evidence) => evidence.requirementId === requirementId)
                        ?.selections ?? []
                      const next = [
                        ...(current[selectedNode.id]?.[requirementId] ?? fallback),
                      ] as OptionalEvidenceReference[]
                      next[index] = reference
                      return {
                        ...current,
                        [selectedNode.id]: {
                          ...current[selectedNode.id],
                          [requirementId]: next,
                        },
                      }
                    })}
                  onRequirementEvidenceCount={(requirementId, count) =>
                    setProductionRequirementEvidence((current) => {
                      const fallback = currentMastery.production?.requirementEvidence
                        .find((evidence) => evidence.requirementId === requirementId)
                        ?.selections ?? []
                      const previous = current[selectedNode.id]?.[requirementId] ?? fallback
                      const next = Array.from({ length: count }, (_, index) => previous[index])
                      return {
                        ...current,
                        [selectedNode.id]: {
                          ...current[selectedNode.id],
                          [requirementId]: next,
                        },
                      }
                    })}
                  onRubricEvidence={(index, reference) => setProductionRubricEvidence((current) => {
                    const next = [
                      ...(current[selectedNode.id]
                        ?? currentMastery.production?.rubricEvidence
                        ?? []),
                    ] as OptionalEvidenceReference[]
                    next[index] = reference
                    return { ...current, [selectedNode.id]: next }
                  })}
                  onRevisionNote={(value) => setProductionRevisionNotes((current) => ({
                    ...current,
                    [selectedNode.id]: value,
                  }))}
                  onReviewCheck={(index, value) => setProductionReviewChecks((current) => ({
                    ...current,
                    [selectedNode.id]: {
                      ...current[selectedNode.id],
                      [index]: value,
                    },
                  }))}
                  onSubmit={(submission) => {
                    setProductionReviewChecks((current) => ({
                      ...current,
                      [selectedNode.id]: {},
                    }))
                    onSubmitProduction(selectedNode, submission)
                  }}
                  onReview={(checks) => onReviewProduction(selectedNode, checks)}
                  onRestart={() => {
                    setProductionPartTexts((current) => ({
                      ...current,
                      [selectedNode.id]: {},
                    }))
                    setProductionRequirementEvidence((current) => ({
                      ...current,
                      [selectedNode.id]: {},
                    }))
                    setProductionRubricEvidence((current) => ({
                      ...current,
                      [selectedNode.id]: [],
                    }))
                    setProductionRevisionNotes((current) => ({
                      ...current,
                      [selectedNode.id]: '',
                    }))
                    setProductionReviewChecks((current) => ({
                      ...current,
                      [selectedNode.id]: {},
                    }))
                    onRestartProduction?.(selectedNode)
                  }}
                />
                {selectedNode.exercises
                  .filter(({ phase }) => phase === 'rediagnostic')
                  .map(renderExercise)}
              </div>

              <h4>오답 노트</h4>
              <div className="grammar-error-notes">
                {selectedNode.errorNotes.map((note) => (
                  <details key={note.code}>
                    <summary>{`${note.code} ${note.title}`}</summary>
                    <p>{`잘못된 예: ${note.wrongExample}`}</p>
                    <p>{note.correction}</p>
                    <p>{`복습 규칙: ${note.reviewRule}`}</p>
                  </details>
                ))}
              </div>

              <h4>통과 기준</h4>
              <ul>
                <li>{`정답률 ${percent(selectedNode.masteryRule.quizAccuracy)} 이상`}</li>
                <li>
                  {selectedNode.masteryRule.productionPass
                    ? '산출 과제 통과 필요'
                    : '산출 과제 통과 불필요'}
                </li>
                <li>{`오류율 ${percent(selectedNode.masteryRule.errorTolerance)} 이하`}</li>
              </ul>

              <div className="action-row grammar-pager">
                <button
                  type="button"
                  disabled={
                    selectedIndex <= 0 ||
                    !nodes[selectedIndex - 1] ||
                    !isGrammarNodeUnlocked(nodes[selectedIndex - 1]!, nodes, mastery)
                  }
                  onClick={() => {
                    const previous = nodes[selectedIndex - 1]
                    if (previous) onSelectNode(previous)
                  }}
                >
                  이전 문법
                </button>
                <button
                  type="button"
                  disabled={
                    selectedIndex < 0 ||
                    selectedIndex >= nodes.length - 1 ||
                    !nodes[selectedIndex + 1] ||
                    !isGrammarNodeUnlocked(nodes[selectedIndex + 1]!, nodes, mastery)
                  }
                  onClick={() => {
                    const next = nodes[selectedIndex + 1]
                    if (next) onSelectNode(next)
                  }}
                >
                  다음 문법
                </button>
              </div>
            </article>
          ) : selectedNode ? (
            <p className="panel empty-state" role="status">
              선행 노드와 이전 레벨 숙달 기준을 충족해야 학습할 수 있습니다.
            </p>
          ) : (
            <p className="panel empty-state">학습 가능한 문법 노드를 선택하세요.</p>
          )}
        </div>
      )}
    </section>
  )
}
