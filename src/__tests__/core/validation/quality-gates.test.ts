import { describe, it, expect } from 'vitest'
import {
  runQualityGates,
  checkSpecificity,
  checkUniqueness,
  checkBranchability,
} from '../../../core/validation/quality-gates'

describe('checkSpecificity', () => {
  it('passes for questions with domain terms from parent', () => {
    const result = checkSpecificity(
      'How does the microservices deployment pipeline handle rollbacks?',
      'microservices deployment pipeline CI/CD rollbacks canary releases',
    )
    expect(result.passed).toBe(true)
    expect(result.gate).toBe('specificity')
    expect(result.score).toBeGreaterThanOrEqual(0.3)
  })

  it('fails for vague generic questions', () => {
    const result = checkSpecificity(
      'what are the implications of that?',
      'microservices deployment pipeline CI/CD rollbacks canary releases',
    )
    expect(result.passed).toBe(false)
    expect(result.score).toBeLessThan(0.3)
    expect(result.feedback).toBeTruthy()
  })

  it('counts capitalized named entities', () => {
    const result = checkSpecificity(
      'How would Amazon Web Services compare to Google Cloud Platform here?',
      'cloud infrastructure',
    )
    // Amazon, Web, Services, Google, Cloud, Platform are capitalized
    expect(result.score).toBeGreaterThan(0)
  })

  it('returns 0 score for empty question', () => {
    const result = checkSpecificity('', 'some parent content')
    expect(result.passed).toBe(false)
    expect(result.score).toBe(0)
  })
})

describe('checkUniqueness', () => {
  it('passes when no siblings exist', () => {
    const result = checkUniqueness('How does X work?', [])
    expect(result.passed).toBe(true)
    expect(result.score).toBe(0)
  })

  it('passes for questions with different content', () => {
    const result = checkUniqueness('How does the deployment pipeline handle rollbacks?', [
      'What are the security implications of microservices?',
      'How should we handle database migrations?',
    ])
    expect(result.passed).toBe(true)
    expect(result.score).toBeLessThan(0.6)
  })

  it('fails for near-duplicate questions', () => {
    const result = checkUniqueness(
      'How does the deployment pipeline handle rollbacks in production?',
      ['How does the deployment pipeline handle rollbacks in staging?'],
    )
    expect(result.passed).toBe(false)
    expect(result.score).toBeGreaterThanOrEqual(0.6)
    expect(result.feedback).toBeTruthy()
  })

  it('checks against all siblings, fails on highest similarity', () => {
    const result = checkUniqueness(
      'How does the deployment pipeline handle rollbacks in production?',
      [
        'What about security?',
        'How does the deployment pipeline handle rollbacks in staging?', // near-duplicate
      ],
    )
    expect(result.passed).toBe(false)
  })
})

describe('checkBranchability', () => {
  it('passes for open-ended how questions', () => {
    const result = checkBranchability('How would you approach this problem?')
    expect(result.passed).toBe(true)
    expect(result.score).toBe(1.0)
  })

  it('passes for why questions', () => {
    const result = checkBranchability('Why is this approach better?')
    expect(result.passed).toBe(true)
    expect(result.score).toBe(1.0)
  })

  it('passes for what if questions', () => {
    const result = checkBranchability('What if we used a different architecture?')
    expect(result.passed).toBe(true)
    expect(result.score).toBe(1.0)
  })

  it('fails for closed-form yes/no questions', () => {
    const result = checkBranchability('Is it possible to deploy without downtime?')
    expect(result.passed).toBe(false)
    expect(result.score).toBe(0.0)
    expect(result.feedback).toBeTruthy()
  })

  it('fails for does it questions', () => {
    const result = checkBranchability('Does it support horizontal scaling?')
    expect(result.passed).toBe(false)
    expect(result.score).toBe(0.0)
  })

  it('gives mixed score for unrecognized patterns', () => {
    const result = checkBranchability('Describe the trade-offs involved')
    expect(result.passed).toBe(true)
    expect(result.score).toBe(0.5)
  })
})

describe('runQualityGates', () => {
  it('returns results for all three gates', () => {
    const results = runQualityGates(
      'How does the microservices architecture handle failover?',
      ['What about testing strategies?'],
      'microservices architecture failover distributed systems',
    )
    expect(results.length).toBe(3)
    expect(results.map((r) => r.gate)).toEqual(['specificity', 'uniqueness', 'branchability'])
  })

  it('all gates pass for a good question', () => {
    const results = runQualityGates(
      'How would the microservices deployment pipeline handle database migration rollbacks?',
      ['What are the security implications?'],
      'microservices deployment pipeline database migration rollbacks',
    )
    expect(results.every((r) => r.passed)).toBe(true)
  })

  it('specificity fails for vague question', () => {
    const results = runQualityGates('tell me more about that', [], 'complex technical topic')
    const specificity = results.find((r) => r.gate === 'specificity')!
    expect(specificity.passed).toBe(false)
  })
})
