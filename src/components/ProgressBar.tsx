interface ProgressBarProps {
  label: string
  value: number
  max: number
  valueText?: string
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)))
}

function formatPercent(value: number): string {
  return `${Number(value.toFixed(1))}%`
}

export function ProgressBar({ label, value, max, valueText }: ProgressBarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0
  const finiteValue = Number.isFinite(value) ? value : 0
  const safeValue = Math.min(Math.max(finiteValue, 0), safeMax)
  const percent = safeMax === 0 ? 0 : (safeValue / safeMax) * 100
  const visibleValue =
    valueText ??
    `${formatNumber(safeValue)} / ${formatNumber(safeMax)} (${formatPercent(percent)})`

  return (
    <div className="progress-block">
      <p className="progress-label">{label}</p>
      <div
        className="progress-track"
        data-state={safeValue >= safeMax && safeMax > 0 ? 'complete' : 'progress'}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        aria-valuetext={visibleValue}
      >
        <span className="progress-fill" aria-hidden="true" style={{ width: `${percent}%` }} />
      </div>
      <p className="progress-value">{visibleValue}</p>
    </div>
  )
}
