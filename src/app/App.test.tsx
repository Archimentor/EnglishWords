import { render, screen } from '@testing-library/react'
import { App } from './App'

test('서비스 이름과 초기 레벨을 보여준다', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: '영단어 5000 마스터' })).toBeInTheDocument()
  expect(screen.getByText('기초 학습 대시보드')).toBeInTheDocument()
})
