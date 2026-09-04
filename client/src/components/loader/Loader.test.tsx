import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Loader from './Loader'

describe('Loader', () => {
  // A spinner that only exists visually tells a screen reader nothing, so the
  // waiting state has to be announced rather than drawn.
  it('announces that something is loading', () => {
    render(<Loader />)

    expect(screen.getByRole('status')).toHaveAccessibleName('Loading')
  })

  it('takes a label describing what is being waited on', () => {
    render(<Loader label="Checking your session" />)

    expect(screen.getByRole('status')).toHaveAccessibleName('Checking your session')
  })

  // The ring is decoration; the label is the message. Exposing both would have
  // assistive tech read the same state twice.
  it('hides the spinner itself from assistive tech', () => {
    const { container } = render(<Loader />)

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
