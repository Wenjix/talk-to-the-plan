export interface QualityGateResult {
  passed: boolean
  gate: 'specificity' | 'uniqueness' | 'branchability'
  score: number
  threshold: number
  feedback: string
}

const SPECIFICITY_THRESHOLD = 0.3
const UNIQUENESS_THRESHOLD = 0.6
const BRANCHABILITY_THRESHOLD = 0.5

export function runQualityGates(
  question: string,
  siblingQuestions: string[],
  parentContent: string,
): QualityGateResult[] {
  return [
    checkSpecificity(question, parentContent),
    checkUniqueness(question, siblingQuestions),
    checkBranchability(question),
  ]
}

function getWords(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean)
}

function getBigrams(text: string): Set<string> {
  const words = getWords(text)
  const bigrams = new Set<string>()
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]} ${words[i + 1]}`)
  }
  return bigrams
}

export function checkSpecificity(question: string, parentContent: string): QualityGateResult {
  const questionWords = question.split(/\s+/).filter(Boolean)
  const parentTerms = new Set(getWords(parentContent))
  const totalWords = Math.min(questionWords.length, 50)

  if (totalWords === 0) {
    return {
      passed: false,
      gate: 'specificity',
      score: 0,
      threshold: SPECIFICITY_THRESHOLD,
      feedback: 'Question is empty. Generate a specific question with concrete terms.',
    }
  }

  let matchCount = 0
  for (const word of questionWords) {
    const lower = word.toLowerCase()
    // Count domain terms from parent content
    if (parentTerms.has(lower)) {
      matchCount++
      continue
    }
    // Count named entities (capitalized words, likely proper nouns/terms)
    if (word.length > 1 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      matchCount++
    }
  }

  const score = matchCount / totalWords

  return {
    passed: score >= SPECIFICITY_THRESHOLD,
    gate: 'specificity',
    score,
    threshold: SPECIFICITY_THRESHOLD,
    feedback:
      score < SPECIFICITY_THRESHOLD
        ? 'The previous question was too vague. Generate a more specific question that references concrete entities from the parent context.'
        : '',
  }
}

export function checkUniqueness(
  question: string,
  siblingQuestions: string[],
): QualityGateResult {
  if (siblingQuestions.length === 0) {
    return {
      passed: true,
      gate: 'uniqueness',
      score: 0,
      threshold: UNIQUENESS_THRESHOLD,
      feedback: '',
    }
  }

  const questionBigrams = getBigrams(question)
  let maxSimilarity = 0

  for (const sibling of siblingQuestions) {
    const siblingBigrams = getBigrams(sibling)
    const intersection = new Set([...questionBigrams].filter((b) => siblingBigrams.has(b)))
    const union = new Set([...questionBigrams, ...siblingBigrams])
    const jaccard = union.size === 0 ? 0 : intersection.size / union.size
    maxSimilarity = Math.max(maxSimilarity, jaccard)
  }

  return {
    passed: maxSimilarity < UNIQUENESS_THRESHOLD,
    gate: 'uniqueness',
    score: maxSimilarity,
    threshold: UNIQUENESS_THRESHOLD,
    feedback:
      maxSimilarity >= UNIQUENESS_THRESHOLD
        ? 'The previous question was too similar to an existing sibling. Generate a question that explores a distinctly different angle.'
        : '',
  }
}

const OPEN_ENDED_STARTERS = ['how', 'why', 'what if', 'in what ways', 'what would']
const CLOSED_FORM_STARTERS = ['is it', 'does it', 'can you', 'will it', 'has it']

export function checkBranchability(question: string): QualityGateResult {
  const lower = question.toLowerCase().trim()
  let score = 0.5 // Default for mixed/unrecognized forms

  for (const starter of OPEN_ENDED_STARTERS) {
    if (lower.startsWith(starter)) {
      score = 1.0
      break
    }
  }

  if (score === 0.5) {
    for (const starter of CLOSED_FORM_STARTERS) {
      if (lower.startsWith(starter)) {
        score = 0.0
        break
      }
    }
  }

  return {
    passed: score >= BRANCHABILITY_THRESHOLD,
    gate: 'branchability',
    score,
    threshold: BRANCHABILITY_THRESHOLD,
    feedback:
      score < BRANCHABILITY_THRESHOLD
        ? 'The previous question was a closed-form (yes/no) question. Generate an open-ended question starting with how, why, what if, or in what ways.'
        : '',
  }
}
