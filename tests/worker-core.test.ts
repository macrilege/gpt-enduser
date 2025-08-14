import { describe, it, expect, beforeEach, vi } from 'vitest'
import worker from '../src/index'
import { 
  createMockEnv, 
  createTestRequest, 
  createAuthenticatedRequest,
  assertValidAPIResponse,
  mockCachedData 
} from './test-utils'

describe('Worker Core Functionality', () => {
  let env: any
  
  beforeEach(() => {
    env = createMockEnv()
    
    // Pre-populate cache with mock data
    env.NEWS_CACHE.put('daily_crypto_data', mockCachedData.cryptoData)
    env.NEWS_CACHE.put('daily_tech_insights', mockCachedData.techInsights)
    env.NEWS_CACHE.put('daily_weather_data', mockCachedData.weatherData)
    env.NEWS_CACHE.put('cache_last_update', mockCachedData.lastUpdate.toString())
  })

  describe('Basic Routes', () => {
    it('should serve the main chat interface', async () => {
      const request = createTestRequest('https://example.com/')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      
      const html = await response.text()
      expect(html).toContain('GPT Enduser')
      expect(html).toContain('chat')
    })

    it('should handle 404 for unknown routes', async () => {
      const request = createTestRequest('https://example.com/unknown-route')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(404)
    })

    it('should require authentication for admin routes', async () => {
      const request = createTestRequest('https://example.com/api/cache')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(401)
      expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Admin Access"')
    })
  })

  describe('Cache API', () => {
    it('should return cached data with authentication', async () => {
      const request = createAuthenticatedRequest('https://example.com/api/cache')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      
      const html = await response.text()
      expect(html).toContain('Cached Intelligence')
      expect(html).toContain('Cache Status')
    })

    it('should return cache status as JSON', async () => {
      const request = createAuthenticatedRequest('https://example.com/api/cache/status')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      
      const data = await response.json()
      assertValidAPIResponse(data)
      expect(data.ok).toBe(true)
      expect(data).toHaveProperty('cacheAge')
      expect(data).toHaveProperty('lastUpdate')
    })

    it('should handle cache refresh', async () => {
      const request = createAuthenticatedRequest('https://example.com/api/cache/refresh', 'POST')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      
      const data = await response.json()
      assertValidAPIResponse(data)
      expect(data.ok).toBe(true)
      expect(data.message).toContain('refresh')
    })
  })

  describe('Manual Reply System', () => {
    it('should generate manual replies with authentication', async () => {
      const request = createAuthenticatedRequest(
        'https://example.com/api/manual-reply', 
        'POST',
        { text: 'What do you think about AI consciousness?', username: 'testuser' }
      )
      
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      
      const data = await response.json()
      assertValidAPIResponse(data)
      expect(data.ok).toBe(true)
      expect(data).toHaveProperty('generatedReply')
      expect(data.generatedReply).toContain('@testuser')
      expect(data.originalText).toBe('What do you think about AI consciousness?')
    })

    it('should reject manual reply without text', async () => {
      const request = createAuthenticatedRequest(
        'https://example.com/api/manual-reply', 
        'POST',
        { username: 'testuser' } // missing text
      )
      
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(400)
      
      const data = await response.json()
      expect(data.ok).toBe(false)
      expect(data.error).toContain('Missing')
    })

    it('should handle manual reply without authentication', async () => {
      const request = createTestRequest(
        'https://example.com/api/manual-reply', 
        'POST',
        { text: 'test', username: 'testuser' }
      )
      
      const response = await worker.fetch(request, env)
      expect(response.status).toBe(401)
    })
  })

  describe('Mention Checking', () => {
    it('should check mentions with authentication', async () => {
      const request = createAuthenticatedRequest('https://example.com/api/check-mentions', 'POST')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      
      const data = await response.json()
      assertValidAPIResponse(data)
      expect(data.ok).toBe(true)
      expect(data).toHaveProperty('mentionsFound')
      expect(data).toHaveProperty('mode')
      expect(data.mode).toBe('open_to_anyone')
    })

    it('should require authentication for mention checking', async () => {
      const request = createTestRequest('https://example.com/api/check-mentions', 'POST')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(401)
    })
  })

  describe('Journal API', () => {
    it('should handle journal requests with authentication', async () => {
      const request = createAuthenticatedRequest('https://example.com/api/journal')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      
      const html = await response.text()
      expect(html).toContain('journal')
    })

    it('should reject journal access without authentication', async () => {
      const request = createTestRequest('https://example.com/api/journal')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(401)
    })
  })

  describe('Public Endpoints', () => {
    it('should serve recent insights without authentication', async () => {
      const request = createTestRequest('https://example.com/api/recent-insights')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      
      const data = await response.json()
      expect(data).toHaveProperty('insights')
      expect(data).toHaveProperty('lastUpdate')
    })

    it('should handle debug tweet generation', async () => {
      const request = createTestRequest('https://example.com/api/tweet?debug=true')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      
      const data = await response.json()
      assertValidAPIResponse(data)
      expect(data.ok).toBe(true)
      expect(data).toHaveProperty('tweet')
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON in requests', async () => {
      const request = new Request('https://example.com/api/manual-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + btoa('test_admin:test_password')
        },
        body: 'invalid json{'
      })
      
      const response = await worker.fetch(request, env)
      expect(response.status).toBe(500)
    })

    it('should handle method not allowed', async () => {
      const request = createAuthenticatedRequest('https://example.com/api/cache', 'DELETE')
      const response = await worker.fetch(request, env)
      
      expect(response.status).toBe(405)
    })
  })
})
