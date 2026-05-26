import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the app heading', () => {
    render(<App />)
    expect(screen.getByText('Friendship Garden')).toBeInTheDocument()
  })

  it('explains the garden starts empty and private', () => {
    render(<App />)
    expect(
      screen.getByText(/your garden starts empty/i),
    ).toBeInTheDocument()
  })

  it('shows the primary action to add a friend', () => {
    render(<App />)
    const button = screen.getByRole('button', {
      name: /add your first friend/i,
    })
    expect(button).toBeInTheDocument()
  })

  it('does not use guilt-heavy, punitive, or surveillance language', () => {
    render(<App />)
    const copy = document.body.textContent?.toLowerCase() ?? ''
    const forbidden = [
      'neglect',
      'failing',
      'shame',
      'guilty',
      'track',
      'monitor',
      'surveillance',
      'crm',
      'contact manager',
    ]
    forbidden.forEach((phrase) => {
      expect(copy).not.toContain(phrase)
    })
  })
})
