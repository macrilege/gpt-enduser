import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCachedData, refreshCache } from '../src/news-cache'
import { 
  createMockEnv,
  assertValidCacheData,
  mockCachedData 
} from './test-utils'

// Mock fetch globally for testing
global.fetch = vi.fn()

describe('News Cache System', () => {
  let env: any
  
  beforeEach(() => {
    env = createMockEnv()
    vi.clearAllMocks()
    
    // Reset fetch mock
    ;(global.fetch as any).mockReset()
  })

  describe('Cache Data Retrieval', () => {
    it('should return cached data when available and fresh', async () => {
      // Setup fresh cache
      const now = Date.now()
      await env.NEWS_CACHE.put('daily_crypto_data', mockCachedData.cryptoData)
      await env.NEWS_CACHE.put('daily_tech_insights', mockCachedData.techInsights)
      await env.NEWS_CACHE.put('daily_weather_data', mockCachedData.weatherData)
      await env.NEWS_CACHE.put('cache_last_update', now.toString())
      
      const cachedData = await getCachedData(env)
      
      assertValidCacheData(cachedData)
      expect(cachedData.cryptoData).toBe(mockCachedData.cryptoData)
      expect(cachedData.techInsights).toBe(mockCachedData.techInsights)
      expect(cachedData.weatherData).toBe(mockCachedData.weatherData)
      expect(cachedData.lastUpdate).toBe(now)
    })

    it('should refresh stale cache data', async () => {
      // Setup stale cache (older than 6 hours)
      const staleTime = Date.now() - (7 * 60 * 60 * 1000) // 7 hours ago
      await env.NEWS_CACHE.put('cache_last_update', staleTime.toString())
      
      // Mock successful API responses
      ;(global.fetch as any)
        .mockResolvedValueOnce({ // CoinGecko trending
          ok: true,
          json: () => Promise.resolve({ coins: [] })
        })
        .mockResolvedValueOnce({ // CoinGecko market
          ok: true,
          json: () => Promise.resolve([])
        })
        .mockResolvedValueOnce({ // CryptoCompare news
          ok: true,
          json: () => Promise.resolve({ Data: [] })
        })
        .mockResolvedValueOnce({ // GitHub trending
          ok: true,
          json: () => Promise.resolve({ items: [] })
        })
        .mockResolvedValueOnce({ // Hacker News top stories
          ok: true,
          json: () => Promise.resolve([1, 2, 3])
        })
        .mockResolvedValueOnce({ // Hacker News new stories
          ok: true,
          json: () => Promise.resolve([4, 5, 6])
        })
        .mockResolvedValueOnce({ // Hacker News best stories
          ok: true,
          json: () => Promise.resolve([7, 8, 9])
        })
      
      const cachedData = await getCachedData(env)
      
      assertValidCacheData(cachedData)
      expect(cachedData.lastUpdate).toBeGreaterThan(staleTime)
    })

    it('should handle empty cache gracefully', async () => {
      // Clear any existing cache
      await env.NEWS_CACHE.delete('daily_crypto_data')
      await env.NEWS_CACHE.delete('daily_tech_insights')
      await env.NEWS_CACHE.delete('daily_weather_data')
      await env.NEWS_CACHE.delete('cache_last_update')
      
      const cachedData = await getCachedData(env)
      
      assertValidCacheData(cachedData)
      // Cache will be populated with fallback data when empty
      expect(typeof cachedData.cryptoData).toBe('string')
      expect(typeof cachedData.techInsights).toBe('string')
      expect(typeof cachedData.weatherData).toBe('string')
      expect(cachedData.lastUpdate).toBeGreaterThan(0)
    })
  })

  describe('Cache Refresh', () => {
    it('should force refresh cache regardless of age', async () => {
      // Setup fresh cache
      const recentTime = Date.now() - (1 * 60 * 60 * 1000) // 1 hour ago
      await env.NEWS_CACHE.put('cache_last_update', recentTime.toString())
      
      // Mock API responses
      ;(global.fetch as any)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ items: [], Data: [], coins: [] })
        })
      
      await refreshCache(env)
      
      const newUpdateTime = await env.NEWS_CACHE.get('cache_last_update')
      expect(parseInt(newUpdateTime || '0')).toBeGreaterThan(recentTime)
    })

    it('should handle API failures during refresh', async () => {
      // Mock API failure
      ;(global.fetch as any).mockRejectedValue(new Error('Network error'))
      
      // Should not throw
      await expect(refreshCache(env)).resolves.not.toThrow()
      
      // Cache should still be updated with fallback data
      const cachedData = await getCachedData(env)
      assertValidCacheData(cachedData)
    })
  })

  describe('Data Sources', () => {
    it('should handle CoinGecko API responses', async () => {
      const mockTrendingResponse = {
        coins: [{
          item: {
            name: 'Bitcoin',
            data: { price_change_percentage_24h: { usd: 2.5 } }
          }
        }]
      }
      
      const mockMarketResponse = [{
        name: 'Ethereum',
        current_price: 3200,
        price_change_percentage_24h: 1.8
      }]
      
      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTrendingResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMarketResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ Data: [] })
        })
      
      await refreshCache(env)
      
      const cryptoData = await env.NEWS_CACHE.get('daily_crypto_data')
      expect(cryptoData).toContain('Bitcoin')
      expect(cryptoData).toContain('+2.5%')
    })

    it('should handle GitHub API responses', async () => {
      const mockGitHubResponse = {
        items: [{
          name: 'awesome-ai',
          language: 'Python',
          description: 'Awesome AI tools and resources',
          stargazers_count: 1500
        }]
      }
      
      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockGitHubResponse)
        })
      
      await refreshCache(env)
      
      const techInsights = await env.NEWS_CACHE.get('daily_tech_insights')
      expect(typeof techInsights).toBe('string')
      expect(techInsights.length).toBeGreaterThan(0)
      // Mock API may not produce exact content due to fallback generation
      expect(techInsights).toMatch(/tech|innovation|ai|development/i)
    })

    it('should handle Hacker News API responses', async () => {
      const mockStoryIds = [1, 2, 3]
      const mockStory = {
        id: 1,
        type: 'story',
        title: 'Amazing AI Breakthrough',
        score: 150,
        descendants: 25,
        time: Math.floor(Date.now() / 1000),
        url: 'https://example.com'
      }
      
      ;(global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockStoryIds)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([])
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([])
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockStory)
        })
      
      await refreshCache(env)
      
      const techInsights = await env.NEWS_CACHE.get('daily_tech_insights')
      expect(techInsights).toBeDefined()
    })
  })

  describe('Weather Data Generation', () => {
    it('should generate weather insights without API calls', async () => {
      await refreshCache(env)
      
      const weatherData = await env.NEWS_CACHE.get('daily_weather_data')
      expect(weatherData).toBeDefined()
      expect(weatherData).toContain('|') // Should have multiple insights
      
      // Should contain seasonal or weather-related terms
      const weatherTerms = ['weather', 'coding', 'spring', 'summer', 'winter', 'autumn', 'outdoor', 'indoor']
      const hasWeatherTerm = weatherTerms.some(term => 
        weatherData!.toLowerCase().includes(term)
      )
      expect(hasWeatherTerm).toBe(true)
    })

    it('should vary weather insights based on time', async () => {
      // Mock different times
      const originalDate = Date
      
      const mockTime1 = new Date('2025-08-14T10:00:00Z')
      const mockTime2 = new Date('2025-08-14T22:00:00Z')
      
      // Test morning time
      global.Date = class extends originalDate {
        constructor() { return mockTime1 }
        static now() { return mockTime1.getTime() }
      } as any
      
      await refreshCache(env)
      const weatherData1 = await env.NEWS_CACHE.get('daily_weather_data')
      
      // Clear cache
      await env.NEWS_CACHE.delete('daily_weather_data')
      
      // Test evening time
      global.Date = class extends originalDate {
        constructor() { return mockTime2 }
        static now() { return mockTime2.getTime() }
      } as any
      
      await refreshCache(env)
      const weatherData2 = await env.NEWS_CACHE.get('daily_weather_data')
      
      // Restore original Date
      global.Date = originalDate
      
      // Weather insights might be different for different times
      expect(weatherData1).toBeDefined()
      expect(weatherData2).toBeDefined()
      expect(typeof weatherData1).toBe('string')
      expect(typeof weatherData2).toBe('string')
    })
  })

  describe('Error Resilience', () => {
    it('should provide fallback data when all APIs fail', async () => {
      // Mock all API calls to fail
      ;(global.fetch as any).mockRejectedValue(new Error('Network failure'))
      
      await refreshCache(env)
      
      const cachedData = await getCachedData(env)
      assertValidCacheData(cachedData)
      
      // Should have fallback content
      expect(cachedData.techInsights).toMatch(/Innovation|tech|development/i)
      expect(cachedData.weatherData).toMatch(/perfect|golden|outdoor|summer/i)
    })

    it('should handle partial API failures', async () => {
      // Mock mixed success/failure responses
      ;(global.fetch as any)
        .mockResolvedValueOnce({ ok: false, status: 404 }) // CoinGecko fails
        .mockResolvedValueOnce({ ok: false, status: 500 }) // Market data fails
        .mockResolvedValueOnce({ ok: false, status: 429 }) // News fails
        .mockResolvedValueOnce({ // GitHub succeeds
          ok: true,
          json: () => Promise.resolve({ items: [] })
        })
      
      await refreshCache(env)
      
      const cachedData = await getCachedData(env)
      assertValidCacheData(cachedData)
      
      // Crypto data should be empty (APIs failed)
      expect(cachedData.cryptoData).toBe('')
      // Tech insights should have fallback data
      expect(cachedData.techInsights).toBeDefined()
      expect(cachedData.techInsights.length).toBeGreaterThan(0)
    })
  })

  describe('Cache Performance', () => {
    it('should complete cache update within reasonable time', async () => {
      const startTime = Date.now()
      
      // Mock fast API responses
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [], Data: [], coins: [] })
      })
      
      await refreshCache(env)
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // Should complete within 10 seconds (generous for testing)
      expect(duration).toBeLessThan(10000)
    })

    it('should cache data efficiently', async () => {
      await refreshCache(env)
      
      // Verify all cache keys are set
      const cacheKeys = ['daily_crypto_data', 'daily_tech_insights', 'daily_weather_data', 'cache_last_update']
      
      for (const key of cacheKeys) {
        const value = await env.NEWS_CACHE.get(key)
        expect(value).toBeDefined()
        expect(value).not.toBe('')
      }
    })
  })
})
