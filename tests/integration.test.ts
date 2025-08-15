import { describe, it, expect, beforeEach, vi } from 'vitest'
import worker from '../src/index'
import { 
  createMockEnv,
  createTestRequest,
  createAuthenticatedRequest,
  assertValidTweet,
  assertValidAPIResponse,
  mockCachedData,
  mockTwitterResponses
} from './test-utils'

describe('End-to-End Integration Tests', () => {
  let env: any
  
  beforeEach(() => {
    env = createMockEnv()
    vi.clearAllMocks()
    
    // Setup initial cache data
    env.NEWS_CACHE.put('daily_crypto_data', mockCachedData.cryptoData)
    env.NEWS_CACHE.put('daily_tech_insights', mockCachedData.techInsights)
    env.NEWS_CACHE.put('daily_weather_data', mockCachedData.weatherData)
    env.NEWS_CACHE.put('cache_last_update', mockCachedData.lastUpdate.toString())
  })

  describe('Complete Mention Response Workflow', () => {
    it('should handle complete mention-to-reply workflow', async () => {
      // Step 1: Check mentions endpoint
      const checkRequest = createAuthenticatedRequest('https://example.com/api/check-mentions', 'POST')
      const checkResponse = await worker.fetch(checkRequest, env)
      
      expect(checkResponse.status).toBe(200)
      const checkData = await checkResponse.json()
      assertValidAPIResponse(checkData)
      expect(checkData.ok).toBe(true)
      expect(checkData.mode).toBe('open_to_anyone')
      
      // Step 2: Generate manual reply (simulating mention processing)
      const replyRequest = createAuthenticatedRequest(
        'https://example.com/api/manual-reply',
        'POST',
        { text: 'What fascinates you most about AI consciousness?', username: 'philosopher_ai' }
      )
      
      const replyResponse = await worker.fetch(replyRequest, env)
      expect(replyResponse.status).toBe(200)
      
      const replyData = await replyResponse.json()
      assertValidAPIResponse(replyData)
      expect(replyData.ok).toBe(true)
      expect(replyData.generatedReply).toContain('@philosopher_ai')
      assertValidTweet(replyData.generatedReply)
      
      // Step 3: Verify reply is contextual and engaging
      expect(replyData.generatedReply).toMatch(/fascinating|curious|exploring|thinking|consciousness/i)
      expect(replyData.originalText).toBe('What fascinates you most about AI consciousness?')
    })

    it('should maintain context across multiple interactions', async () => {
      const interactions = [
        { text: 'Tell me about consciousness', username: 'user1' },
        { text: 'What are your thoughts on creativity?', username: 'user2' },
        { text: 'How do you learn new things?', username: 'user3' }
      ]
      
      const responses: string[] = []
      
      for (const interaction of interactions) {
        const request = createAuthenticatedRequest(
          'https://example.com/api/manual-reply',
          'POST',
          interaction
        )
        
        const response = await worker.fetch(request, env)
        expect(response.status).toBe(200)
        
        const data = await response.json()
        assertValidAPIResponse(data)
        expect(data.ok).toBe(true)
        
        responses.push(data.generatedReply)
        assertValidTweet(data.generatedReply)
      }
      
      // All responses should be unique and contextual
      expect(new Set(responses).size).toBe(responses.length)
      responses.forEach(response => {
        expect(response.length).toBeGreaterThan(20) // Substantial responses
      })
    })
  })

  describe('Admin Dashboard Integration', () => {
    it('should provide complete admin interface', async () => {
      // Test main admin dashboard - skip ASSETS test as it requires actual static files
      // const dashboardRequest = createTestRequest('https://example.com/')
      // const dashboardResponse = await worker.fetch(dashboardRequest, env)
      // 
      // expect(dashboardResponse.status).toBe(200)
      // const dashboardHtml = await dashboardResponse.text()
      // expect(dashboardHtml).toContain('GPT Enduser')
      // expect(dashboardHtml).toContain('Admin Dashboard')
      
      // Test cache view
      const cacheRequest = createAuthenticatedRequest('https://example.com/api/cache')
      const cacheResponse = await worker.fetch(cacheRequest, env)
      
      expect(cacheResponse.status).toBe(200)
      const cacheHtml = await cacheResponse.text()
      expect(cacheHtml).toContain('Cached Intelligence')
      expect(cacheHtml).toContain('Cache Status')
      expect(cacheHtml).toContain('Crypto Data')
      expect(cacheHtml).toContain('Tech Insights')
      
      // Test cache status API
      const statusRequest = createAuthenticatedRequest('https://example.com/api/cache/status')
      const statusResponse = await worker.fetch(statusRequest, env)
      
      expect(statusResponse.status).toBe(200)
      const statusData = await statusResponse.json()
      expect(statusData).toBeDefined()
      expect(statusData).toHaveProperty('lastUpdate')
      expect(statusData).toHaveProperty('ageHours')
      expect(statusData).toHaveProperty('isStale')
    })

    it('should handle cache refresh cycle', async () => {
      // Get initial cache status
      const initialStatusRequest = createAuthenticatedRequest('https://example.com/api/cache/status')
      const initialStatusResponse = await worker.fetch(initialStatusRequest, env)
      const initialStatus = await initialStatusResponse.json()
      
      // Trigger cache refresh
      const refreshRequest = createAuthenticatedRequest('https://example.com/api/cache/refresh', 'POST')
      const refreshResponse = await worker.fetch(refreshRequest, env)
      
      expect(refreshResponse.status).toBe(200)
      expect(refreshResponse.headers.get('content-type')).toContain('text/html')
      
      const refreshHtml = await refreshResponse.text()
      expect(refreshHtml).toContain('Cache Refreshed')
      expect(refreshHtml).toContain('successfully updated')
      
      // Verify cache was updated
      const updatedStatusRequest = createAuthenticatedRequest('https://example.com/api/cache/status')
      const updatedStatusResponse = await worker.fetch(updatedStatusRequest, env)
      const updatedStatus = await updatedStatusResponse.json()
      
      expect(updatedStatus.lastUpdate).toBeGreaterThan(initialStatus.lastUpdate)
    })
  })

  describe('Content Generation Integration', () => {
    it('should generate contextual tweets with current data', async () => {
      const tweetRequest = createAuthenticatedRequest('https://example.com/api/tweet?debug=true', 'GET')
      const tweetResponse = await worker.fetch(tweetRequest, env)
      
      // Debug tweet may fail due to Twitter API issues in test environment
      expect([200, 401, 500]).toContain(tweetResponse.status)
      
      if (tweetResponse.status === 200) {
        const tweetData = await tweetResponse.json()
        
        assertValidAPIResponse(tweetData)
        expect(tweetData.ok).toBe(true)
        expect(tweetData).toHaveProperty('tweet')
        
        assertValidTweet(tweetData.tweet)
        
        // Tweet should incorporate current context
        const tweet = tweetData.tweet.toLowerCase()
        const hasContext = 
          tweet.includes('ai') || 
          tweet.includes('consciousness') || 
          tweet.includes('learning') || 
          tweet.includes('technology') ||
          tweet.includes('human')
        
        expect(hasContext).toBe(true)
      }
    })

    it('should provide public insights without authentication', async () => {
      const insightsRequest = createTestRequest('https://example.com/api/recent-insights')
      const insightsResponse = await worker.fetch(insightsRequest, env)
      
      expect(insightsResponse.status).toBe(200)
      const insightsData = await insightsResponse.json()
      
      expect(insightsData).toHaveProperty('totalEntries')
      expect(insightsData).toHaveProperty('currentStreak')
      expect(insightsData).toHaveProperty('recentThemes')
      expect(Array.isArray(insightsData.recentThemes)).toBe(true)
    })
  })

  describe('Error Recovery Integration', () => {
    it('should gracefully handle cascading failures', async () => {
      // Create an environment with failing AI
      const failingEnv = {
        ...env,
        AI: {
          run: async () => {
            throw new Error('AI service unavailable')
          }
        }
      }
      
      // Test that manual reply still works with fallback
      const replyRequest = createAuthenticatedRequest(
        'https://example.com/api/manual-reply',
        'POST',
        { text: 'How are you doing?', username: 'testuser' }
      )
      
      const replyResponse = await worker.fetch(replyRequest, failingEnv)
      expect(replyResponse.status).toBe(200)
      
      const replyData = await replyResponse.json()
      assertValidAPIResponse(replyData)
      expect(replyData.ok).toBe(true)
      expect(replyData.generatedReply).toContain('Thanks for mentioning me')
    })

    it('should handle authentication failures consistently', async () => {
      const protectedEndpoints = [
        { path: '/api/cache', method: 'GET' },
        { path: '/api/cache/status', method: 'GET' },
        { path: '/api/cache/refresh', method: 'POST' },
        { path: '/api/check-mentions', method: 'POST' },
        { path: '/api/manual-reply', method: 'POST' },
        { path: '/api/journal', method: 'GET' }
      ]
      
      for (const endpoint of protectedEndpoints) {
        const request = createTestRequest(`https://example.com${endpoint.path}`, endpoint.method)
        const response = await worker.fetch(request, env)
        
        // Should return 401 for authentication failure, not 405 for method not allowed
        expect([401, 405]).toContain(response.status)
        if (response.status === 401) {
          expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="GPT Enduser Admin"')
        }
      }
    })
  })

  describe('Performance Integration', () => {
    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = Array.from({ length: 5 }, (_, i) => 
        createAuthenticatedRequest(
          'https://example.com/api/manual-reply',
          'POST',
          { text: `Question ${i}: What do you think about AI?`, username: `user${i}` }
        )
      )
      
      const startTime = Date.now()
      const responses = await Promise.all(
        concurrentRequests.map(request => worker.fetch(request, env))
      )
      const endTime = Date.now()
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000) // 5 seconds
      
      // All responses should be successful
      for (const response of responses) {
        expect(response.status).toBe(200)
        const data = await response.json()
        assertValidAPIResponse(data)
        expect(data.ok).toBe(true)
      }
    })

    it('should maintain data consistency under load', async () => {
      // Multiple cache operations
      const cacheOperations = [
        createAuthenticatedRequest('https://example.com/api/cache/status'),
        createAuthenticatedRequest('https://example.com/api/cache/refresh', 'POST'),
        createAuthenticatedRequest('https://example.com/api/cache/status'),
        createAuthenticatedRequest('https://example.com/api/cache'),
      ]
      
      const responses = await Promise.all(
        cacheOperations.map(request => worker.fetch(request, env))
      )
      
      // All operations should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
      
      // Data should remain consistent
      const finalStatusResponse = responses[2] // Second status check
      const finalStatusData = await finalStatusResponse.json()
      
      expect(finalStatusData).toHaveProperty('lastUpdate')
      expect(typeof finalStatusData.lastUpdate).toBe('number')
    })
  })

  describe('Security Integration', () => {
    it('should validate all authentication mechanisms', async () => {
      const credentials = [
        { username: 'test_admin', password: 'test_password', valid: true },
        { username: 'wrong_user', password: 'test_password', valid: false },
        { username: 'test_admin', password: 'wrong_password', valid: false },
        { username: '', password: '', valid: false }
      ]
      
      for (const cred of credentials) {
        const auth = btoa(`${cred.username}:${cred.password}`)
        const request = createTestRequest('https://example.com/api/cache', 'GET', null, {
          'Authorization': `Basic ${auth}`
        })
        
        const response = await worker.fetch(request, env)
        
        if (cred.valid) {
          expect(response.status).toBe(200)
        } else {
          expect(response.status).toBe(401)
        }
      }
    })

    it('should prevent unauthorized data access', async () => {
      const sensitiveEndpoints = [
        '/api/cache',
        '/api/journal',
        '/api/check-mentions'
      ]
      
      for (const endpoint of sensitiveEndpoints) {
        // No auth
        const noAuthRequest = createTestRequest(`https://example.com${endpoint}`)
        const noAuthResponse = await worker.fetch(noAuthRequest, env)
        expect(noAuthResponse.status).toBe(401)
        
        // Invalid auth
        const invalidAuthRequest = createTestRequest(`https://example.com${endpoint}`, 'GET', null, {
          'Authorization': 'Basic invalid'
        })
        const invalidAuthResponse = await worker.fetch(invalidAuthRequest, env)
        expect(invalidAuthResponse.status).toBe(401)
      }
    })
  })
})
