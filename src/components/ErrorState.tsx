import { ContentLoadError } from '../domain/content/loadCatalog'

interface ErrorStateProps {
  error: unknown
  onRetry: () => void
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const contentError = error instanceof ContentLoadError ? error : null
  const firstIssue = contentError?.issues?.[0]

  return (
    <section role="alert" aria-labelledby="content-error-title">
      <h2 id="content-error-title">학습 콘텐츠를 불러오지 못했습니다</h2>
      <p>잠시 후 다시 시도해 주세요.</p>
      {contentError?.path ? <p>{`실패 경로: ${contentError.path}`}</p> : null}
      {contentError?.status !== undefined ? (
        <p>{`HTTP ${contentError.status}`}</p>
      ) : null}
      {contentError?.issues ? (
        <div>
          <p>{`검증 문제 ${contentError.issues.length}개`}</p>
          {firstIssue ? (
            <p>{`첫 문제 ${firstIssue.path}: ${firstIssue.message}`}</p>
          ) : null}
        </div>
      ) : null}
      <button type="button" onClick={onRetry}>다시 시도</button>
    </section>
  )
}
