import { describe, it, expect } from 'vitest'
import { estimateTokens } from '../../utils/tokens'

describe('estimateTokens', () => {
  it('estimates 1 token per 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcdefgh')).toBe(2)
  })

  it('rounds up partial tokens', () => {
    expect(estimateTokens('abc')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })
})
