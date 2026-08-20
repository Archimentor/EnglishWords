import type {
  GrammarLevel,
  GrammarProductionConstraints,
} from '../content/types'

const RUBRIC_EVIDENCE_COUNT = 3

function responsePart(
  minSentences: number,
  maxSentences: number | null,
) {
  return {
    id: 'response',
    label: '통합 답안',
    register: null,
    minSentences,
    maxSentences,
  }
}

function targetStructureEvidence() {
  return {
    id: 'target-structure',
    label: '이 노드의 목표 문법 구조가 정확히 쓰인 문장',
    minSelections: 1,
    requiredPartIds: ['response'],
  }
}

export function grammarProductionConstraintsForLevel(
  level: GrammarLevel,
): GrammarProductionConstraints {
  switch (level) {
    case 'A1':
      return {
        profileId: 'A1-production-v1',
        minSentences: 4,
        maxSentences: 6,
        maxRevisionRounds: null,
        rubricEvidenceCount: RUBRIC_EVIDENCE_COUNT,
        parts: [responsePart(4, 6)],
        evidenceRequirements: [
          {
            id: 'personal-context',
            label: '자기소개·일상 루틴·과거 경험 중 선택한 개인 맥락',
            minSelections: 1,
            requiredPartIds: ['response'],
          },
          {
            id: 'yes-no-question',
            label: '스스로 구성한 예/아니오 의문문',
            minSelections: 1,
            requiredPartIds: ['response'],
          },
          {
            id: 'wh-question',
            label: '스스로 구성한 WH 의문문',
            minSelections: 1,
            requiredPartIds: ['response'],
          },
          targetStructureEvidence(),
        ],
      }
    case 'A2':
      return {
        profileId: 'A2-production-v1',
        minSentences: 6,
        maxSentences: 8,
        maxRevisionRounds: null,
        rubricEvidenceCount: RUBRIC_EVIDENCE_COUNT,
        parts: [responsePart(6, 8)],
        evidenceRequirements: [
          {
            id: 'plan',
            label: '계획을 나타내는 문장',
            minSelections: 1,
            requiredPartIds: ['response'],
          },
          {
            id: 'experience',
            label: '경험을 나타내는 문장',
            minSelections: 1,
            requiredPartIds: ['response'],
          },
          {
            id: 'obligation',
            label: '의무를 나타내는 문장',
            minSelections: 1,
            requiredPartIds: ['response'],
          },
          {
            id: 'comparison',
            label: '비교 표현을 정확히 사용한 문장',
            minSelections: 1,
            requiredPartIds: ['response'],
          },
          {
            id: 'relative-clause',
            label: '간단한 관계절로 확장한 문장',
            minSelections: 1,
            requiredPartIds: ['response'],
          },
          targetStructureEvidence(),
        ],
      }
    case 'B1':
      return {
        profileId: 'B1-production-v1',
        minSentences: 8,
        maxSentences: 12,
        maxRevisionRounds: null,
        rubricEvidenceCount: RUBRIC_EVIDENCE_COUNT,
        parts: [responsePart(8, 12)],
        evidenceRequirements: [
          {
            id: 'cause-effect',
            label: '원인과 결과의 관계가 드러나는 문장',
            minSelections: 1,
            requiredPartIds: ['response'],
          },
          {
            id: 'required-clause',
            label: '조건문·간접화법·명사절 중 하나를 정확히 사용한 문장',
            minSelections: 1,
            requiredPartIds: ['response'],
          },
          targetStructureEvidence(),
        ],
      }
    case 'B2':
      return {
        profileId: 'B2-production-v1',
        minSentences: 4,
        maxSentences: null,
        maxRevisionRounds: null,
        rubricEvidenceCount: RUBRIC_EVIDENCE_COUNT,
        parts: [
          {
            id: 'introduction',
            label: '서론',
            register: null,
            minSentences: 1,
            maxSentences: null,
          },
          {
            id: 'evidence',
            label: '근거',
            register: null,
            minSentences: 1,
            maxSentences: null,
          },
          {
            id: 'counterargument',
            label: '반론',
            register: null,
            minSentences: 1,
            maxSentences: null,
          },
          {
            id: 'conclusion',
            label: '결론',
            register: null,
            minSentences: 1,
            maxSentences: null,
          },
        ],
        evidenceRequirements: [
          {
            id: 'complex-structures',
            label: '가정법·분사절·강조구문 등 서로 다른 복합문 구조',
            minSelections: 3,
            requiredPartIds: [],
          },
        ],
      }
    case 'C1':
      return {
        profileId: 'C1-production-v1',
        minSentences: 2,
        maxSentences: null,
        maxRevisionRounds: 2,
        rubricEvidenceCount: RUBRIC_EVIDENCE_COUNT,
        parts: [
          {
            id: 'work-email',
            label: '업무 이메일 문체',
            register: 'work-email',
            minSentences: 1,
            maxSentences: null,
          },
          {
            id: 'academic-paragraph',
            label: '학술 단락 문체',
            register: 'academic',
            minSentences: 1,
            maxSentences: null,
          },
        ],
        evidenceRequirements: [
          {
            id: 'same-content',
            label: '두 문체가 같은 핵심 내용을 전달한다는 대응 근거',
            minSelections: 2,
            requiredPartIds: ['work-email', 'academic-paragraph'],
          },
          {
            id: 'register-control',
            label: '각 문체의 어휘·문장 구조가 해당 레지스터에 맞는 근거',
            minSelections: 2,
            requiredPartIds: ['work-email', 'academic-paragraph'],
          },
        ],
      }
  }
}

export function grammarProductionConstraintsMatchLevel(
  level: GrammarLevel,
  constraints: GrammarProductionConstraints,
): boolean {
  return JSON.stringify(constraints) === JSON.stringify(
    grammarProductionConstraintsForLevel(level),
  )
}
