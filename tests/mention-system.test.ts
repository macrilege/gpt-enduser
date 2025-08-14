import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  createMockEnv,
  mockTwitterResponses,
  assertValidTweet,
  mockCachedData,
  mockJournalData
} from './test-utils'

// We'll need to import the actual functions when they're exported
// For now, we'll test the logic principles

describe('Mention Response System', () => {
  let env: any
  
  beforeEach(() => {
    env = createMockEnv()
    
    // Setup mock data
    env.NEWS_CACHE.put('daily_crypto_data', mockCachedData.cryptoData)
    env.NEWS_CACHE.put('daily_tech_insights', mockCachedData.techInsights)
    env.NEWS_CACHE.put('daily_weather_data', mockCachedData.weatherData)
    env.NEWS_CACHE.put('cache_last_update', mockCachedData.lastUpdate.toString())
  })

  describe('Mention Filtering', () => {
    it('should identify worthy mentions', () => {
      const worthyMentions = [
        '@GPTEndUser What do you think about consciousness?',
        '@GPTEndUser How does learning work for artificial intelligence?',
        '@GPTEndUser I wonder about the nature of reality and AI',
        '@GPTEndUser Can you explain your thoughts on creativity?',
        '@GPTEndUser What fascinates you most about human behavior?'
      ]
      
      const unworthyMentions = [
        '@GPTEndUser hi',
        '@GPTEndUser lol',
        '@GPTEndUser thanks',
        '@GPTEndUser follow me back',
        '@GPTEndUser spam crypto investment',
        'Just a short msg'
      ]
      
      // Test the filtering logic (this would need the actual function)
      function isWorthyMention(text: string): boolean {
        const lowText = text.toLowerCase()
        
        // Too short
        if (lowText.length < 20) return false
        
        // Skip reactions
        if (/^(lol|haha|wow|cool|nice|thanks|yes|no|hi)\b/.test(lowText)) return false
        
        // Skip spam
        if (/spam|crypto|follow.*back|investment/.test(lowText)) return false
        
        // Accept thoughtful content
        return /\b(why|how|what|consciousness|learning|think|wonder|explain|fascinates|\?)/i.test(text)
      }
      
      worthyMentions.forEach(mention => {
        expect(isWorthyMention(mention)).toBe(true)
      })
      
      unworthyMentions.forEach(mention => {
        expect(isWorthyMention(mention)).toBe(false)
      })
    })

    it('should handle edge cases in mention filtering', () => {
      const edgeCases = [
        '', // empty
        'a'.repeat(500), // very long
        '@GPTEndUser ' + '🤖'.repeat(50), // emoji spam
        '@GPTEndUser What do you think about this very long question that goes on and on and might exceed normal conversation limits but is still a valid thoughtful question?', // long but valid
      ]
      
      function isWorthyMention(text: string): boolean {
        const lowText = text.toLowerCase()
        if (lowText.length < 20 || lowText.length > 1000) return false
        if (/^(lol|haha|wow|cool|nice|thanks|yes|no|hi)\b/.test(lowText)) return false
        if (/spam|crypto|follow.*back/.test(lowText)) return false
        return /\b(why|how|what|consciousness|learning|think|wonder|explain|\?)/i.test(text)
      }
      
      expect(isWorthyMention(edgeCases[0])).toBe(false) // empty
      expect(isWorthyMention(edgeCases[1])).toBe(false) // too long
      expect(isWorthyMention(edgeCases[2])).toBe(false) // emoji spam
      expect(isWorthyMention(edgeCases[3])).toBe(true) // long but valid
    })
  })

  describe('Reply Generation', () => {
    it('should generate contextual replies', async () => {
      const mockMention = {
        id: '123456789',
        text: '@GPTEndUser What do you think about consciousness?',
        author_username: 'testuser',
        created_at: new Date().toISOString()
      }
      
      // Mock the reply generation (this would use the actual function)
      const generateReply = async (mention: any) => {
        const replyText = await env.AI.run('mock-model', {
          messages: [
            { role: 'system', content: 'You are GPTEndUser' },
            { role: 'user', content: `Reply to this mention: ${mention.text}` }
          ]
        })
        
        return `@${mention.author_username} ${replyText.response}`
      }
      
      const reply = await generateReply(mockMention)
      
      expect(reply).toContain('@testuser')
      expect(reply).toContain('thoughtful') // The mock returns "thoughtful question"
      assertValidTweet(reply)
    })

    it('should include context from cached data', async () => {
      const mockMention = {
        id: '123456789',
        text: '@GPTEndUser What are your thoughts on tech trends?',
        author_username: 'techfan',
        created_at: new Date().toISOString()
      }
      
      // Mock reply that includes context
      const generateContextualReply = async (mention: any) => {
        const cachedData = {
          techInsights: await env.NEWS_CACHE.get('daily_tech_insights'),
          cryptoData: await env.NEWS_CACHE.get('daily_crypto_data')
        }
        
        // Simulate AI using context
        const contextPrompt = `
        Context: ${cachedData.techInsights}
        Mention: ${mention.text}
        Generate a reply that references current tech trends.
        `
        
        const response = await env.AI.run('mock-model', {
          messages: [{ role: 'user', content: contextPrompt }]
        })
        
        return `@${mention.author_username} ${response.response}`
      }
      
      const reply = await generateContextualReply(mockMention)
      
      expect(reply).toContain('@techfan')
      assertValidTweet(reply)
    })

    it('should handle reply length constraints', () => {
      const testCases = [
        {
          username: 'user',
          reply: 'Short reply',
          expected: '@user Short reply'
        },
        {
          username: 'verylongusername',
          reply: 'A'.repeat(300),
          expected: 'Should be truncated'
        }
      ]
      
      const formatReply = (username: string, replyText: string): string => {
        const replyTweet = `@${username} ${replyText}`
        return replyTweet.length > 280 ? replyTweet.slice(0, 277) + '...' : replyTweet
      }
      
      testCases.forEach(testCase => {
        const result = formatReply(testCase.username, testCase.reply)
        assertValidTweet(result)
        expect(result).toContain(`@${testCase.username}`)
        
        if (testCase.expected === 'Should be truncated') {
          expect(result.length).toBeLessThanOrEqual(280)
          expect(result).toMatch(/\.\.\.$/)
        }
      })
    })
  })

  describe('Response Tracking', () => {
    it('should track responded mentions', async () => {
      const mentionId = '123456789'
      
      // Mock the tracking function
      const markMentionAsReplied = async (mentionId: string) => {
        await env.NEWS_CACHE.put(`responded_${mentionId}`, Date.now().toString())
      }
      
      const hasRepliedToMention = async (mentionId: string): Promise<boolean> => {
        const replied = await env.NEWS_CACHE.get(`responded_${mentionId}`)
        return replied !== null
      }
      
      // Initially should not be marked as replied
      expect(await hasRepliedToMention(mentionId)).toBe(false)
      
      // Mark as replied
      await markMentionAsReplied(mentionId)
      
      // Should now be marked as replied
      expect(await hasRepliedToMention(mentionId)).toBe(true)
    })

    it('should prevent duplicate replies', async () => {
      const mentionId = '123456789'
      const replyCount = { count: 0 }
      
      const processReply = async (mentionId: string) => {
        const alreadyReplied = await env.NEWS_CACHE.get(`responded_${mentionId}`)
        if (alreadyReplied) {
          return { skipped: true, reason: 'Already replied' }
        }
        
        // Simulate reply
        replyCount.count++
        await env.NEWS_CACHE.put(`responded_${mentionId}`, Date.now().toString())
        return { skipped: false, replied: true }
      }
      
      // First reply should succeed
      const result1 = await processReply(mentionId)
      expect(result1.skipped).toBe(false)
      expect(replyCount.count).toBe(1)
      
      // Second reply should be skipped
      const result2 = await processReply(mentionId)
      expect(result2.skipped).toBe(true)
      expect(replyCount.count).toBe(1) // No additional reply
    })
  })

  describe('Rate Limiting', () => {
    it('should respect rate limits', () => {
      const rateLimiter = {
        lastRequest: 0,
        minInterval: 60000 // 1 minute
      }
      
      const canMakeRequest = (): boolean => {
        const now = Date.now()
        if (now - rateLimiter.lastRequest < rateLimiter.minInterval) {
          return false
        }
        rateLimiter.lastRequest = now
        return true
      }
      
      // First request should be allowed
      expect(canMakeRequest()).toBe(true)
      
      // Immediate second request should be denied
      expect(canMakeRequest()).toBe(false)
      
      // Advance time
      rateLimiter.lastRequest = Date.now() - 61000 // 61 seconds ago
      
      // Should be allowed again
      expect(canMakeRequest()).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      const mockFailureEnv = {
        ...env,
        AI: {
          run: async () => {
            throw new Error('AI service unavailable')
          }
        }
      }
      
      const safeReplyGeneration = async (mention: any) => {
        try {
          const response = await mockFailureEnv.AI.run('model', {
            messages: [{ role: 'user', content: mention.text }]
          })
          return `@${mention.author_username} ${response.response}`
        } catch (error) {
          console.error('AI generation failed:', error)
          return `@${mention.author_username} Thanks for mentioning me! I'm thinking about that...`
        }
      }
      
      const mention = {
        author_username: 'testuser',
        text: 'What do you think?'
      }
      
      const reply = await safeReplyGeneration(mention)
      
      expect(reply).toContain('@testuser')
      expect(reply).toContain('Thanks for mentioning me')
      assertValidTweet(reply)
    })

    it('should handle malformed mention data', () => {
      const malformedMentions = [
        null,
        undefined,
        {},
        { text: null },
        { author_username: null },
        { text: '', author_username: '' }
      ]
      
      const validateMention = (mention: any): boolean => {
        if (!mention || typeof mention !== 'object') return false
        if (!mention.text || typeof mention.text !== 'string') return false
        if (!mention.author_username || typeof mention.author_username !== 'string') return false
        if (mention.text.trim().length === 0) return false
        return true
      }
      
      malformedMentions.forEach(mention => {
        expect(validateMention(mention)).toBe(false)
      })
      
      // Valid mention should pass
      const validMention = {
        text: '@GPTEndUser Hello!',
        author_username: 'testuser',
        id: '123'
      }
      expect(validateMention(validMention)).toBe(true)
    })
  })
})
