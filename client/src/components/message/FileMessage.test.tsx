import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import FileMessage from './FileMessage'

const base = { id: 'u1', name: 'cv.pdf', sizeBytes: 2048, createdAt: '' }

describe('FileMessage', () => {
  it('names the attached file', () => {
    render(<FileMessage name="cv.pdf" />)

    expect(screen.getByRole('group', { name: 'Attached file cv.pdf' })).toHaveTextContent('cv.pdf')
  })

  // Before the chat's uploads load there is no status to show, only the name.
  it('shows only the name until the upload is known', () => {
    render(<FileMessage name="cv.pdf" />)

    expect(screen.queryByText('Processing')).not.toBeInTheDocument()
    expect(screen.queryByText('Ready')).not.toBeInTheDocument()
  })

  it('shows the size and that it is still processing', () => {
    render(<FileMessage name="cv.pdf" upload={{ ...base, status: 'processing' }} />)

    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(screen.getByText('Processing')).toBeInTheDocument()
  })

  it('marks a ready file', () => {
    render(<FileMessage name="cv.pdf" upload={{ ...base, status: 'ready', chunkCount: 2 }} />)

    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  // A bare "Failed" leaves the user guessing what to do next.
  it('explains why a file failed', () => {
    render(<FileMessage name="cv.pdf" upload={{ ...base, status: 'failed', failureCode: 'EMPTY_TEXT' }} />)

    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText(/scanned PDFs/i)).toBeInTheDocument()
  })
})
