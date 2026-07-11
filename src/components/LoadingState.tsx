interface LoadingStateProps {
  message?: string
}

export function LoadingState({
  message = '학습 콘텐츠를 불러오는 중입니다.',
}: LoadingStateProps) {
  return (
    <section role="status" aria-live="polite">
      <p>{message}</p>
    </section>
  )
}
