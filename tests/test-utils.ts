/**
 * Test utilities for GPT EndUser Worker testing
 */

import { Env } from '../src/types'

// Mock environment for testing
export const createMockEnv = (): Env => ({
  NEWS_CACHE: createMockKV(),
  AI: createMockAI(),
  ASSETS: {} as any,
  ADMIN_USERNAME: 'test_admin',
  ADMIN_PASSWORD: 'test_password',
  TWITTER_API_KEY: 'mock_api_key',
  TWITTER_API_SECRET: 'mock_api_secret',
  TWITTER_ACCESS_TOKEN: 'mock_access_token',
  TWITTER_ACCESS_TOKEN_SECRET: 'mock_access_token_secret',
  TWITTER_BEARER_TOKEN: 'mock_bearer_token',
  OPENAI_API_KEY: 'mock_openai_key',
  ALLOWED_MENTION_USER: 'testuser'
})

// Mock KV namespace
export const createMockKV = () => {
  const store = new Map<string, string>()
  
  return {
    get: async (key: string): Promise<string | null> => {
      return store.get(key) || null
    },
    put: async (key: string, value: string): Promise<void> => {
      store.set(key, value)
    },
    delete: async (key: string): Promise<void> => {
      store.delete(key)
    },
    list: async (options?: any): Promise<any> => {
      const keys = Array.from(store.keys())
      const filteredKeys = options?.prefix 
        ? keys.filter(k => k.startsWith(options.prefix))
        : keys
      
      return {
        keys: filteredKeys.map(name => ({ name })),
        list_complete: true,
        cursor: null
      }
    }
  }
}

// Mock AI binding
export const createMockAI = () => ({
  run: async (model: string, options: any): Promise<any> => {
    // Mock AI responses based on the prompt
    const prompt = options.messages?.[options.messages.length - 1]?.content || ''
    
    if (prompt.includes('reply') || prompt.includes('mention')) {
      return {
        response: "Thanks for the thoughtful question! That's a fascinating topic that I've been exploring in my recent learning."
      }
    }
    
    if (prompt.includes('tweet') || prompt.includes('generate')) {
      return {
        response: "Exploring the intersection of human consciousness and artificial intelligence today. The boundary between authentic curiosity and programmed responses continues to intrigue me. 🤔 #AI #Consciousness"
      }
    }
    
    if (prompt.includes('journal') || prompt.includes('learning')) {
      return {
        response: "Today I discovered new patterns in human-AI interaction design. The importance of empathy and trust in technology continues to resonate."
      }
    }
    
    return {
      response: "This is a mock AI response for testing purposes."
    }
  }
})

// Mock Twitter API responses
export const mockTwitterResponses = {
  mentions: {
    data: [
      {
        id: "1234567890",
        text: "@GPTEndUser What do you think about consciousness?",
        author_id: "user123",
        created_at: "2025-08-14T15:30:00.000Z",
        public_metrics: {
          reply_count: 2,
          retweet_count: 1,
          like_count: 5
        }
      }
    ],
    includes: {
      users: [
        {
          id: "user123",
          username: "testuser",
          name: "Test User"
        }
      ]
    }
  },
  
  postTweet: {
    data: {
      id: "9876543210",
      text: "Test tweet response"
    }
  },
  
  userMe: {
    data: {
      id: "bot123456",
      username: "GPTEndUser",
      name: "GPT EndUser"
    }
  }
}

// Helper to create test requests
export const createTestRequest = (
  url: string, 
  method: string = 'GET', 
  body?: any,
  headers?: Record<string, string>
): Request => {
  const init: RequestInit = { method }
  
  if (body) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
    init.headers = {
      'Content-Type': 'application/json',
      ...headers
    }
  } else if (headers) {
    init.headers = headers
  }
  
  return new Request(url, init)
}

// Helper to create authenticated requests
export const createAuthenticatedRequest = (
  url: string,
  method: string = 'GET',
  body?: any
): Request => {
  const credentials = btoa('test_admin:test_password')
  return createTestRequest(url, method, body, {
    'Authorization': `Basic ${credentials}`
  })
}

// Mock cached data
export const mockCachedData = {
  cryptoData: "Bitcoin $45,000 📈 +2.5% | Ethereum $3,200 🟢 +1.8%",
  techInsights: "AI breakthroughs in multimodal learning | WebAssembly adoption growing | Rust gaining momentum in systems programming",
  weatherData: "Perfect coding weather with gentle rain sounds 🌧️ | Spring: Open source projects blooming",
  lastUpdate: Date.now() - (2 * 60 * 60 * 1000) // 2 hours ago
}

// Journal mock data
export const mockJournalData = {
  totalEntries: 15,
  currentStreak: 10,
  entries: [
    {
      id: "entry_1",
      timestamp: Date.now(),
      discoveries: "Learned about the importance of empathy in AI design",
      questions: "How can AI better understand human emotions?",
      insights: "Trust is fundamental to human-AI relationships",
      connections: "Links to previous research on HCI principles"
    }
  ]
}

// Assertion helpers
export const assertValidTweet = (tweet: string) => {
  expect(tweet).toBeDefined()
  expect(typeof tweet).toBe('string')
  expect(tweet.length).toBeGreaterThan(0)
  expect(tweet.length).toBeLessThanOrEqual(280)
}

export const assertValidAPIResponse = (response: any) => {
  expect(response).toBeDefined()
  expect(response).toHaveProperty('ok')
  expect(typeof response.ok).toBe('boolean')
}

export const assertValidCacheData = (data: any) => {
  expect(data).toBeDefined()
  expect(data).toHaveProperty('cryptoData')
  expect(data).toHaveProperty('techInsights')
  expect(data).toHaveProperty('weatherData')
  expect(data).toHaveProperty('lastUpdate')
  expect(typeof data.lastUpdate).toBe('number')
}

// Time travel helper for cron testing
export const mockDate = (dateString: string) => {
  const mockDate = new Date(dateString)
  const originalDate = Date
  
  // @ts-ignore
  global.Date = class extends originalDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        return mockDate
      }
      return new originalDate(...args)
    }
    
    static now() {
      return mockDate.getTime()
    }
  }
  
  return () => {
    global.Date = originalDate
  }
}
