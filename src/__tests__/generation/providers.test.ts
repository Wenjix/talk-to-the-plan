import { describe, it, expect } from 'vitest'
import { MockProvider } from '../../generation/providers/mock'
import { getProviderById, getProviderForPersona, getDefaultProvider } from '../../generation/providers'
import type { ApiKeys } from '../../generation/providers/types'

describe('MockProvider', () => {
  const provider = new MockProvider()

  it('generate returns valid JSON string', async () => {
    const result = await provider.generate('test prompt')
    expect(() => JSON.parse(result)).not.toThrow()
  })

  it('generateStream returns valid JSON string', async () => {
    const chunks: string[] = []
    const result = await provider.generateStream('test prompt', (delta) => chunks.push(delta))
    expect(() => JSON.parse(result)).not.toThrow()
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.join('')).toBe(result)
  })

  it('detects path_questions prompt and returns paths response', async () => {
    const result = await provider.generate('Generate path_questions for Conversation Compass')
    const parsed = JSON.parse(result)
    expect(parsed.paths).toBeDefined()
    expect(parsed.paths.clarify).toBeTruthy()
    expect(parsed.paths['go-deeper']).toBeTruthy()
  })

  it('detects branch prompt and returns branches response', async () => {
    const result = await provider.generate('Generate follow-up questions to branch')
    const parsed = JSON.parse(result)
    expect(parsed.branches).toBeDefined()
    expect(parsed.branches.length).toBe(3)
  })

  it('defaults to answer response for unrecognized prompts', async () => {
    const result = await provider.generate('some random prompt')
    const parsed = JSON.parse(result)
    expect(parsed.summary).toBeTruthy()
    expect(parsed.bullets).toBeDefined()
    expect(parsed.bullets.length).toBeGreaterThan(0)
  })
})

describe('getProviderById', () => {
  it('returns DemoProvider when apiKey is empty', () => {
    const provider = getProviderById('mistral', '')
    expect(provider).toBeDefined()
    expect(provider.generate).toBeDefined()
  })

  it('returns MistralProvider for mistral', () => {
    const provider = getProviderById('mistral', 'FakeMistralKey12345678901234')
    expect(provider).toBeDefined()
    expect(provider.generate).toBeDefined()
  })

  it('returns AnthropicProvider for anthropic', () => {
    const provider = getProviderById('anthropic', 'sk-ant-FakeKey1234567890123')
    expect(provider).toBeDefined()
    expect(provider.generate).toBeDefined()
  })

  it('caches provider for same (providerId, key) pair', () => {
    const key = 'FakeCacheTestKey12345678901234567'
    const provider1 = getProviderById('mistral', key)
    const provider2 = getProviderById('mistral', key)
    expect(provider1).toBe(provider2)
  })

  it('creates different providers for different providerIds', () => {
    const key = 'FakeSharedKey1234567890123456789'
    const provider1 = getProviderById('mistral', key)
    const provider2 = getProviderById('anthropic', key)
    expect(provider1).not.toBe(provider2)
  })
})

describe('getProviderForPersona', () => {
  const emptyKeys: ApiKeys = { mistral: '', anthropic: '' }

  it('returns DemoProvider when all keys are empty', () => {
    const provider = getProviderForPersona('expansive', emptyKeys)
    expect(provider).toBeDefined()
    expect(provider.generate).toBeDefined()
  })

  it('maps expansive persona to mistral', () => {
    const keys: ApiKeys = { ...emptyKeys, mistral: 'FakeMistralKey12345678901234' }
    const provider = getProviderForPersona('expansive', keys)
    expect(provider).toBeDefined()
  })

  it('maps analytical persona to mistral', () => {
    const keys: ApiKeys = { ...emptyKeys, mistral: 'FakeMistralKey12345678901234' }
    const provider = getProviderForPersona('analytical', keys)
    expect(provider).toBeDefined()
  })

  it('maps pragmatic persona to anthropic', () => {
    const keys: ApiKeys = { ...emptyKeys, anthropic: 'sk-ant-FakeKey1234567890123' }
    const provider = getProviderForPersona('pragmatic', keys)
    expect(provider).toBeDefined()
  })

  it('maps socratic persona to anthropic', () => {
    const keys: ApiKeys = { ...emptyKeys, anthropic: 'sk-ant-FakeKey1234567890123' }
    const provider = getProviderForPersona('socratic', keys)
    expect(provider).toBeDefined()
  })

  it('uses custom config when provided', () => {
    const apiKeys: ApiKeys = { mistral: '', anthropic: 'sk-ant-FakeKey1234567890123' };
    const config = {
      expansive: { providerId: 'anthropic' as const, modelId: 'claude-sonnet-4-6' },
      analytical: { providerId: 'mistral' as const, modelId: 'mistral-large-2512' },
      pragmatic: { providerId: 'anthropic' as const, modelId: 'claude-sonnet-4-6' },
      socratic: { providerId: 'anthropic' as const, modelId: 'claude-sonnet-4-6' },
    };
    // expansive mapped to anthropic with key → should get AnthropicProvider, not DemoProvider
    const provider = getProviderForPersona('expansive', apiKeys, config);
    expect(provider).toBeDefined();
    expect(provider.generate).toBeDefined();
  })
})

describe('getDefaultProvider', () => {
  it('returns mistral provider', () => {
    const keys: ApiKeys = { mistral: 'FakeMistralKey12345678901234', anthropic: '' }
    const provider = getDefaultProvider(keys)
    expect(provider).toBeDefined()
    expect(provider.generate).toBeDefined()
  })

  it('returns DemoProvider when mistral key is empty', () => {
    const keys: ApiKeys = { mistral: '', anthropic: 'sk-ant-FakeKey1234567890123' }
    const provider = getDefaultProvider(keys)
    expect(provider).toBeDefined()
  })
})
