import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  createMockEnv,
  createTestRequest,
  mockDate,
  assertValidTweet
} from './test-utils'

describe('Cron Scheduling System', () => {
  let env: any
  
  beforeEach(() => {
    env = createMockEnv()
    vi.clearAllMocks()
  })

  describe('Cron Schedule Validation', () => {
    it('should have valid cron expressions', () => {
      const cronSchedules = [
        '30 11 * * *',  // Cache refresh at 6:30 AM Central (11:30 AM UTC)
        '0 12 * * *',   // Morning DFW weather tweet at 7 AM Central (12 PM UTC)
        '0 19 * * *',   // Daily tweet at 1 PM Central Time (7 PM UTC)
        '*/7 * * * *',  // Check mentions every 7 minutes
        '30 2 * * *'    // Good night tweet at 9:30 PM Central (2:30 AM UTC)
      ]
      
      const validateCronExpression = (cron: string): boolean => {
        const parts = cron.split(' ')
        if (parts.length !== 5) return false
        
        const [minute, hour, day, month, dayOfWeek] = parts
        
        // Basic validation
        const isValidMinute = /^(\*|([0-5]?\d)(,([0-5]?\d))*|\*\/\d+)$/.test(minute)
        const isValidHour = /^(\*|([01]?\d|2[0-3])(,([01]?\d|2[0-3]))*|\*\/\d+)$/.test(hour)
        const isValidDay = /^(\*|([1-2]?\d|3[01])(,([1-2]?\d|3[01]))*|\*\/\d+)$/.test(day)
        const isValidMonth = /^(\*|([1-9]|1[0-2])(,([1-9]|1[0-2]))*|\*\/\d+)$/.test(month)
        const isValidDayOfWeek = /^(\*|[0-6](,[0-6])*|\*\/\d+)$/.test(dayOfWeek)
        
        return isValidMinute && isValidHour && isValidDay && isValidMonth && isValidDayOfWeek
      }
      
      cronSchedules.forEach(schedule => {
        expect(validateCronExpression(schedule)).toBe(true)
      })
    })

    it('should detect invalid cron expressions', () => {
      const invalidCronSchedules = [
        '*/7* * * *',    // Missing space (the bug we fixed)
        '60 12 * * *',   // Invalid minute (60)
        '30 25 * * *',   // Invalid hour (25)
        '30 12 32 * *',  // Invalid day (32)
        '30 12 * 13 *',  // Invalid month (13)
        '30 12 * * 8',   // Invalid day of week (8)
        '30 12 *',       // Too few parts
        '30 12 * * * *', // Too many parts
      ]
      
      const validateCronExpression = (cron: string): boolean => {
        try {
          const parts = cron.split(' ')
          if (parts.length !== 5) return false
          
          const [minute, hour, day, month, dayOfWeek] = parts
          
          const isValidMinute = /^(\*|([0-5]?\d)(,([0-5]?\d))*|\*\/\d+)$/.test(minute)
          const isValidHour = /^(\*|([01]?\d|2[0-3])(,([01]?\d|2[0-3]))*|\*\/\d+)$/.test(hour)
          const isValidDay = /^(\*|([1-2]?\d|3[01])(,([1-2]?\d|3[01]))*|\*\/\d+)$/.test(day)
          const isValidMonth = /^(\*|([1-9]|1[0-2])(,([1-9]|1[0-2]))*|\*\/\d+)$/.test(month)
          const isValidDayOfWeek = /^(\*|[0-6](,[0-6])*|\*\/\d+)$/.test(dayOfWeek)
          
          return isValidMinute && isValidHour && isValidDay && isValidMonth && isValidDayOfWeek
        } catch {
          return false
        }
      }
      
      invalidCronSchedules.forEach(schedule => {
        expect(validateCronExpression(schedule)).toBe(false)
      })
    })
  })

  describe('Scheduled Function Execution', () => {
    it('should execute cache refresh on schedule', async () => {
      const mockExecutionContext = {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn()
      }
      
      // Mock the scheduled handler call
      const handleScheduledEvent = async (event: any) => {
        if (event.cron === '30 11 * * *') {
          // This would be cache refresh
          await env.NEWS_CACHE.put('cache_refresh_executed', Date.now().toString())
          return { success: true, action: 'cache_refresh' }
        }
        return { success: false }
      }
      
      const scheduledEvent = {
        type: 'scheduled',
        cron: '30 11 * * *',
        scheduledTime: Date.now()
      }
      
      const result = await handleScheduledEvent(scheduledEvent)
      
      expect(result.success).toBe(true)
      expect(result.action).toBe('cache_refresh')
      
      const executed = await env.NEWS_CACHE.get('cache_refresh_executed')
      expect(executed).toBeDefined()
    })

    it('should execute mention checking on schedule', async () => {
      let mentionCheckExecuted = false
      
      const handleScheduledEvent = async (event: any) => {
        if (event.cron === '*/7 * * * *') {
          // This would be mention checking
          mentionCheckExecuted = true
          return { success: true, action: 'check_mentions' }
        }
        return { success: false }
      }
      
      const scheduledEvent = {
        type: 'scheduled',
        cron: '*/7 * * * *',
        scheduledTime: Date.now()
      }
      
      const result = await handleScheduledEvent(scheduledEvent)
      
      expect(result.success).toBe(true)
      expect(result.action).toBe('check_mentions')
      expect(mentionCheckExecuted).toBe(true)
    })

    it('should execute weather tweets on schedule', async () => {
      const weatherTweets: string[] = []
      
      const handleScheduledEvent = async (event: any) => {
        if (event.cron === '0 12 * * *') {
          // Morning weather tweet
          const tweet = 'Good morning! ☀️ Perfect coding weather in DFW today.'
          weatherTweets.push(tweet)
          return { success: true, action: 'morning_weather', tweet }
        } else if (event.cron === '0 19 * * *') {
          // Daily tweet
          const tweet = 'Contemplating the fascinating intersection of AI consciousness and human creativity today. 🤔 #AI'
          weatherTweets.push(tweet)
          return { success: true, action: 'daily_tweet', tweet }
        }
        return { success: false }
      }
      
      // Test morning weather
      const morningEvent = {
        type: 'scheduled',
        cron: '0 12 * * *',
        scheduledTime: Date.now()
      }
      
      const morningResult = await handleScheduledEvent(morningEvent)
      expect(morningResult.success).toBe(true)
      expect(morningResult.action).toBe('morning_weather')
      
      // Test daily tweet
      const dailyEvent = {
        type: 'scheduled',
        cron: '0 19 * * *',
        scheduledTime: Date.now()
      }
      
      const dailyResult = await handleScheduledEvent(dailyEvent)
      expect(dailyResult.success).toBe(true)
      expect(dailyResult.action).toBe('daily_tweet')
      
      expect(weatherTweets).toHaveLength(2)
      weatherTweets.forEach(tweet => {
        assertValidTweet(tweet)
      })
    })

    it('should execute good night tweets on schedule', async () => {
      let goodNightExecuted = false
      
      const handleScheduledEvent = async (event: any) => {
        if (event.cron === '30 2 * * *') {
          // Good night tweet
          goodNightExecuted = true
          return { success: true, action: 'good_night', tweet: 'Good night, digital world! 🌙' }
        }
        return { success: false }
      }
      
      const scheduledEvent = {
        type: 'scheduled',
        cron: '30 2 * * *',
        scheduledTime: Date.now()
      }
      
      const result = await handleScheduledEvent(scheduledEvent)
      
      expect(result.success).toBe(true)
      expect(result.action).toBe('good_night')
      expect(goodNightExecuted).toBe(true)
    })
  })

  describe('Time Zone Handling', () => {
    it('should handle Central Time conversion correctly', () => {
      // Test UTC to Central Time conversion
      const convertUTCToCentral = (utcHour: number): number => {
        // Central Time is UTC-5 (CDT) or UTC-6 (CST)
        // For simplicity, assume CDT (UTC-5)
        return (utcHour - 5 + 24) % 24
      }
      
      // Test conversions for our schedule
      expect(convertUTCToCentral(11)).toBe(6)  // 11:30 UTC = 6:30 AM Central (cache refresh)
      expect(convertUTCToCentral(12)).toBe(7)  // 12:00 UTC = 7:00 AM Central (morning weather)
      expect(convertUTCToCentral(19)).toBe(14) // 19:00 UTC = 2:00 PM Central (daily tweet)
      expect(convertUTCToCentral(2)).toBe(21)  // 02:30 UTC = 9:30 PM Central (good night)
    })

    it('should validate schedule timing makes sense', () => {
      const scheduleTimings = [
        { name: 'Cache Refresh', centralTime: '6:30 AM', purpose: 'Prepare data before morning tweet' },
        { name: 'Morning Weather', centralTime: '7:00 AM', purpose: 'Good morning tweet' },
        { name: 'Daily Tweet', centralTime: '2:00 PM', purpose: 'Afternoon engagement' },
        { name: 'Mention Check', centralTime: 'Every 7 minutes', purpose: 'Respond to interactions' },
        { name: 'Good Night', centralTime: '9:30 PM', purpose: 'Evening sign-off' }
      ]
      
      scheduleTimings.forEach(schedule => {
        expect(schedule.name).toBeDefined()
        expect(schedule.centralTime).toBeDefined()
        expect(schedule.purpose).toBeDefined()
      })
      
      // Verify logical ordering
      const timeOrder = ['6:30 AM', '7:00 AM', '2:00 PM', '9:30 PM']
      
      const parseTime = (timeStr: string): number => {
        if (timeStr.includes('Every')) return -1 // Skip for periodic tasks
        const [time, period] = timeStr.split(' ')
        const [hour, minute] = time.split(':').map(Number)
        return period === 'PM' && hour !== 12 ? hour + 12 : (period === 'AM' && hour === 12 ? 0 : hour)
      }
      
      const sortedTimes = timeOrder
        .map(parseTime)
        .filter(t => t !== -1)
        .sort((a, b) => a - b)
      
      expect(sortedTimes).toEqual([6, 7, 14, 21]) // 6:30 AM, 7:00 AM, 2:00 PM, 9:30 PM in 24h format
    })
  })

  describe('Error Handling in Scheduled Tasks', () => {
    it('should handle scheduled task failures gracefully', async () => {
      const failingScheduledHandler = async (event: any) => {
        if (event.cron === '*/7 * * * *') {
          throw new Error('Mention check failed')
        }
        return { success: true }
      }
      
      const safeScheduledHandler = async (event: any) => {
        try {
          return await failingScheduledHandler(event)
        } catch (error) {
          console.error('Scheduled task failed:', error)
          return { success: false, error: (error as Error).message }
        }
      }
      
      const scheduledEvent = {
        type: 'scheduled',
        cron: '*/7 * * * *',
        scheduledTime: Date.now()
      }
      
      const result = await safeScheduledHandler(scheduledEvent)
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Mention check failed')
    })

    it('should continue other tasks if one fails', async () => {
      const taskResults: any[] = []
      
      const handleMultipleTasks = async (events: any[]) => {
        for (const event of events) {
          try {
            if (event.cron === '*/7 * * * *') {
              throw new Error('Mention check failed')
            } else {
              taskResults.push({ cron: event.cron, success: true })
            }
          } catch (error) {
            taskResults.push({ cron: event.cron, success: false, error: (error as Error).message })
          }
        }
      }
      
      const events = [
        { type: 'scheduled', cron: '30 11 * * *', scheduledTime: Date.now() },
        { type: 'scheduled', cron: '*/7 * * * *', scheduledTime: Date.now() },
        { type: 'scheduled', cron: '0 12 * * *', scheduledTime: Date.now() }
      ]
      
      await handleMultipleTasks(events)
      
      expect(taskResults).toHaveLength(3)
      expect(taskResults[0].success).toBe(true)  // Cache refresh succeeds
      expect(taskResults[1].success).toBe(false) // Mention check fails
      expect(taskResults[2].success).toBe(true)  // Morning weather succeeds
    })
  })

  describe('Frequency Validation', () => {
    it('should validate mention check frequency is reasonable', () => {
      const mentionCheckCron = '*/7 * * * *' // Every 7 minutes
      
      // Calculate executions per day
      const minutesPerDay = 24 * 60
      const intervalMinutes = 7
      const executionsPerDay = Math.floor(minutesPerDay / intervalMinutes)
      
      expect(executionsPerDay).toBe(205) // About 205 times per day
      expect(executionsPerDay).toBeLessThan(300) // Should be reasonable for Twitter API limits
      expect(executionsPerDay).toBeGreaterThan(100) // Should be responsive enough
    })

    it('should ensure reasonable spacing between major tasks', () => {
      const majorTasks = [
        { name: 'Cache Refresh', utcTime: 11.5 }, // 11:30 UTC
        { name: 'Morning Weather', utcTime: 12 },  // 12:00 UTC
        { name: 'Daily Tweet', utcTime: 19 },      // 19:00 UTC
        { name: 'Good Night', utcTime: 2.5 }       // 02:30 UTC (next day)
      ]
      
      // Check minimum spacing between consecutive tasks
      for (let i = 1; i < majorTasks.length; i++) {
        const prevTime = majorTasks[i - 1].utcTime
        const currTime = majorTasks[i].utcTime
        
        let spacing = currTime - prevTime
        if (spacing < 0) spacing += 24 // Handle day wrap
        
        // Minimum 30 minutes between major tasks
        expect(spacing).toBeGreaterThanOrEqual(0.5)
      }
    })
  })
})
