/**
 * News and Data Caching System
 * 
 * This module handles fetching, analyzing, and caching of:
 * - Tech articles from Hacker News
 * - Cryptocurrency data from CoinGecko
 * 
 * Data is cached once daily and shared between tweet generation and chat.
 */

import { Env } from "./types";

// Model ID for Workers AI
const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Cache keys
const CACHE_KEYS = {
  CRYPTO_DATA: 'daily_crypto_data',
  TECH_INSIGHTS: 'daily_tech_insights',
  LAST_UPDATE: 'cache_last_update'
};

// Cache duration (12 hours in milliseconds - updates twice daily)
const CACHE_DURATION = 12 * 60 * 60 * 1000;

// Hacker News API types
interface HackerNewsStory {
  id: number;
  type: string;
  title: string;
  url?: string;
  text?: string;
  score: number;
  descendants?: number;
  time: number;
  deleted?: boolean;
}

export interface CachedData {
  cryptoData: string;
  techInsights: string;
  lastUpdate: number;
}

/**
 * Check if cached data is still valid (less than 12 hours old)
 */
async function isCacheValid(env: Env): Promise<boolean> {
  try {
    const lastUpdateStr = await env.NEWS_CACHE?.get(CACHE_KEYS.LAST_UPDATE);
    if (!lastUpdateStr) return false;
    
    const lastUpdate = parseInt(lastUpdateStr);
    const now = Date.now();
    return (now - lastUpdate) < CACHE_DURATION;
  } catch (error) {
    console.log('Cache validity check failed:', error);
    return false;
  }
}

/**
 * Fetch trending crypto data from CoinGecko API
 */
async function fetchCryptoData(): Promise<string> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/search/trending');
    const data = await response.json() as any;
    
    if (data.coins && data.coins.length > 0) {
      const topCoin = data.coins[0].item;
      const price_change = topCoin.data?.price_change_percentage_24h?.usd || 0;
      const direction = price_change > 0 ? '📈' : price_change < 0 ? '📉' : '➡️';
      
      return `Today's trending crypto: ${topCoin.name} (${topCoin.symbol}) ${direction} ${price_change > 0 ? '+' : ''}${price_change.toFixed(2)}% (24h)`;
    }
  } catch (error) {
    console.error('Error fetching crypto data:', error);
  }
  return '';
}

/**
 * Fetch and analyze the latest tech articles from Hacker News API
 * Gets diverse content from top stories, ask HN, and show HN for comprehensive tech coverage
 */
async function fetchTechInsights(env: Env): Promise<string> {
  try {
    console.log('Fetching diverse tech content from Hacker News API...');
    
    // Fetch multiple story types for comprehensive coverage
    const [topStoriesResponse, askStoriesResponse, showStoriesResponse] = await Promise.all([
      fetch('https://hacker-news.firebaseio.com/v0/topstories.json'),
      fetch('https://hacker-news.firebaseio.com/v0/askstories.json'),
      fetch('https://hacker-news.firebaseio.com/v0/showstories.json')
    ]);
    
    if (!topStoriesResponse.ok) {
      throw new Error(`Failed to fetch top stories: ${topStoriesResponse.status}`);
    }
    
    const [topStoryIds, askStoryIds, showStoryIds] = await Promise.all([
      topStoriesResponse.json() as Promise<number[]>,
      askStoriesResponse.ok ? askStoriesResponse.json() as Promise<number[]> : Promise.resolve([]),
      showStoriesResponse.ok ? showStoriesResponse.json() as Promise<number[]> : Promise.resolve([])
    ]);
    
    // Get diverse mix: 2 top stories, 1 Ask HN, 1 Show HN
    const selectedIds = [
      ...topStoryIds.slice(0, 2),
      ...(askStoryIds.length > 0 ? [askStoryIds[0]] : []),
      ...(showStoryIds.length > 0 ? [showStoryIds[0]] : [])
    ];
    
    // Fetch story details
    const storyPromises = selectedIds.map(async (id) => {
      const storyResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (storyResponse.ok) {
        return storyResponse.json() as Promise<HackerNewsStory>;
      }
      return null;
    });
    
    const allStories = (await Promise.all(storyPromises)).filter((story): story is HackerNewsStory => 
      story !== null && 
      story.type === 'story' && 
      Boolean(story.title) && 
      !Boolean(story.deleted) &&
      story.score > 10 // Lower threshold for more diverse content
    );
    
    // Filter for AI/tech relevant content
    const techStories = allStories.filter(story => {
      const title = story.title.toLowerCase();
      const text = (story.text || '').toLowerCase();
      const content = title + ' ' + text;
      
      return content.includes('ai') || 
             content.includes('artificial intelligence') ||
             content.includes('machine learning') ||
             content.includes('neural') ||
             content.includes('gpt') ||
             content.includes('llm') ||
             content.includes('tech') ||
             content.includes('programming') ||
             content.includes('software') ||
             content.includes('startup') ||
             content.includes('algorithm') ||
             content.includes('data') ||
             content.includes('computer') ||
             content.includes('developer') ||
             content.includes('crypto') ||
             content.includes('blockchain') ||
             content.includes('security') ||
             content.includes('web') ||
             content.includes('app') ||
             content.includes('cloud') ||
             content.includes('api') ||
             content.includes('open source') ||
             content.includes('github') ||
             story.title.toLowerCase().includes('show hn') ||
             story.title.toLowerCase().includes('ask hn');
    });
    
    // If we don't have enough tech-specific stories, take the highest scored ones
    const finalStories = techStories.length >= 2 ? 
      techStories.slice(0, 3) : 
      allStories.sort((a, b) => b.score - a.score).slice(0, 3);
    
    if (finalStories.length === 0) {
      return 'Unable to fetch quality tech stories from Hacker News at this time';
    }
    
    console.log(`Analyzing ${finalStories.length} tech-relevant stories from Hacker News`);
    
    // Analyze each story with AI
    const insights: string[] = [];
    
    for (const story of finalStories) {
      try {
        // Determine story type for context
        const storyType = story.title.toLowerCase().includes('ask hn') ? 'Ask HN' :
                         story.title.toLowerCase().includes('show hn') ? 'Show HN' :
                         'Top Story';
        
        // Create comprehensive story summary for AI analysis
        const storyInfo = `
Type: ${storyType}
Title: ${story.title}
Score: ${story.score} points
Comments: ${story.descendants || 0}
Posted: ${new Date(story.time * 1000).toLocaleString()}
URL: ${story.url || 'Discussion only'}
${story.text ? `Content: ${story.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600)}` : ''}
        `.trim();
        
        // Use AI to extract insights with focus on AI/tech significance
        const { response }: any = await env.AI.run(MODEL_ID, {
          messages: [
            {
              role: "user",
              content: `Analyze this Hacker News story and extract what makes it fascinating for a tech-curious AI. Focus on AI, technology innovation, programming insights, or digital culture significance. Be concise (under 70 words) and highlight the most intriguing technical or innovative aspects.

Story Details:
${storyInfo}

What makes this story captivating from an AI/tech perspective?`
            }
          ],
          max_tokens: 100,
        });
        
        const insight = typeof response === "string" ? response : String(response);
        const cleanInsight = insight.trim().replace(/^["']|["']$/g, ''); // Remove quotes
        
        insights.push(`"${story.title}" (${story.score}pts): ${cleanInsight}`);
        
      } catch (storyError) {
        console.error(`Error analyzing story ${story.title}:`, storyError);
        // Fallback insight based on story metadata and type
        const storyType = story.title.toLowerCase().includes('ask hn') ? 'community discussion' :
                         story.title.toLowerCase().includes('show hn') ? 'community project showcase' :
                         'trending tech story';
        insights.push(`"${story.title}" (${story.score}pts): ${storyType} gaining significant tech community attention`);
      }
    }
    
    return `Latest tech insights from Hacker News: ${insights.join(' | ')}`;
    
  } catch (error) {
    console.error('Error fetching from Hacker News API:', error);
    return 'Unable to fetch latest tech stories at this time';
  }
}

/**
 * Update the cache with fresh data
 */
async function updateCache(env: Env): Promise<void> {
  try {
    console.log('Updating news cache...');
    
    // Fetch fresh data
    const [cryptoData, techInsights] = await Promise.all([
      fetchCryptoData(),
      fetchTechInsights(env)
    ]);
    
    const now = Date.now();
    
    // Store in cache
    await Promise.all([
      env.NEWS_CACHE?.put(CACHE_KEYS.CRYPTO_DATA, cryptoData),
      env.NEWS_CACHE?.put(CACHE_KEYS.TECH_INSIGHTS, techInsights),
      env.NEWS_CACHE?.put(CACHE_KEYS.LAST_UPDATE, now.toString())
    ]);
    
    console.log('News cache updated successfully');
  } catch (error) {
    console.error('Failed to update news cache:', error);
  }
}

/**
 * Get cached data, updating if necessary
 */
export async function getCachedData(env: Env): Promise<CachedData> {
  try {
    // Check if cache is valid
    const cacheValid = await isCacheValid(env);
    
    if (!cacheValid) {
      // Update cache if invalid or missing
      await updateCache(env);
    }
    
    // Retrieve cached data
    const [cryptoData, techInsights, lastUpdateStr] = await Promise.all([
      env.NEWS_CACHE?.get(CACHE_KEYS.CRYPTO_DATA),
      env.NEWS_CACHE?.get(CACHE_KEYS.TECH_INSIGHTS),
      env.NEWS_CACHE?.get(CACHE_KEYS.LAST_UPDATE)
    ]);
    
    return {
      cryptoData: cryptoData || '',
      techInsights: techInsights || '',
      lastUpdate: parseInt(lastUpdateStr || '0')
    };
  } catch (error) {
    console.error('Error getting cached data:', error);
    // Return empty data if cache fails
    return {
      cryptoData: '',
      techInsights: '',
      lastUpdate: 0
    };
  }
}

/**
 * Force a cache refresh (useful for manual updates)
 */
export async function refreshCache(env: Env): Promise<void> {
  await updateCache(env);
}
