import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES } from './limits'
import { checkFileSize, describeFailure, formatBytes } from './uploadMessages'

const fileOfSize = (size: number) => new File([new Uint8Array(size)], 'big.pdf')

describe('describeFailure', () => {
  it('explains a scanned PDF in plain words', () => {
    expect(describeFailure('EMPTY_TEXT')).toMatch(/scanned PDFs/i)
  })

  it('tells the user what to do after an interruption', () => {
    expect(describeFailure('INTERRUPTED')).toMatch(/try again/i)
  })
})

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2 KB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
  ])('formats %d as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

describe('checkFileSize', () => {
  it('accepts a file at exactly the cap', () => {
    expect(checkFileSize(fileOfSize(MAX_UPLOAD_BYTES))).toBeNull()
  })

  it('names the file and both sizes when it is too big', () => {
    expect(checkFileSize(fileOfSize(MAX_UPLOAD_BYTES + 1))).toBe('"big.pdf" is 4.0 MB. Files can be up to 4.0 MB.')
  })
})
