interface LoadingStateProps {
  message?: string
}

export function LoadingState({
  message = '학습 콘텐츠를 불러오는 중입니다.',
}: LoadingStateProps) {
  return (
    <section
      className="state-panel state-panel--loading"
      data-state="loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p>{message}</p>
    </section>
  )
}
