import { render, screen } from '@testing-library/react'
import { ProgressBar } from './ProgressBar'

describe('ProgressBar', () => {
  it('shows the same visible and accessible progress value', () => {
    render(<ProgressBar label="단어 목표 진행" value={8} max={500} />)

    const bar = screen.getByRole('progressbar', { name: '단어 목표 진행' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '500')
    expect(bar).toHaveAttribute('aria-valuenow', '8')
    expect(bar).toHaveAttribute('aria-valuetext', '8 / 500 (1.6%)')
    expect(screen.getByText('8 / 500 (1.6%)')).toBeInTheDocument()
  })

  it.each([
    { value: -3, max: 10, now: '0', text: '0 / 10 (0%)' },
    { value: 30, max: 10, now: '10', text: '10 / 10 (100%)' },
    { value: Number.NaN, max: 0, now: '0', text: '0 / 0 (0%)' },
  ])('clamps invalid progress safely: $text', ({ value, max, now, text }) => {
    render(<ProgressBar label="안전 진행" value={value} max={max} />)

    const bar = screen.getByRole('progressbar', { name: '안전 진행' })
    expect(bar).toHaveAttribute('aria-valuenow', now)
    expect(bar).toHaveAttribute('aria-valuetext', text)
    expect(screen.getByText(text)).toBeInTheDocument()
  })
})
