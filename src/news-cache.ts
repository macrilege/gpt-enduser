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

// Cache duration (6 hours in milliseconds - updates 4 times daily for fresher content)
const CACHE_DURATION = 6 * 60 * 60 * 1000;

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
 * Check if cached data is still valid (less than 6 hours old)
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
 * Fetch trending crypto data from multiple sources
 */
async function fetchCryptoData(): Promise<string> {
  try {
    // Get trending coins and recent news
    const [trendingResponse, newsResponse] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/search/trending'),
      fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1&sparkline=false&price_change_percentage=24h')
    ]);
    
    const insights: string[] = [];
    
    if (trendingResponse.ok) {
      const trendingData = await trendingResponse.json() as any;
      if (trendingData.coins && trendingData.coins.length > 0) {
        const topCoin = trendingData.coins[0].item;
        const price_change = topCoin.data?.price_change_percentage_24h?.usd || 0;
        const direction = price_change > 0 ? '📈' : price_change < 0 ? '📉' : '➡️';
        insights.push(`${topCoin.name} trending ${direction} ${price_change > 0 ? '+' : ''}${price_change.toFixed(1)}%`);
      }
    }
    
    if (newsResponse.ok) {
      const marketData = await newsResponse.json() as any;
      if (marketData && marketData.length > 0) {
        const topCrypto = marketData[0];
        const change = topCrypto.price_change_percentage_24h || 0;
        const direction = change > 0 ? '🟢' : change < 0 ? '🔴' : '⚪';
        insights.push(`${topCrypto.name} ${direction} $${topCrypto.current_price.toLocaleString()}`);
      }
    }
    
    return insights.length > 0 ? insights.join(' | ') : '';
  } catch (error) {
    console.error('Error fetching crypto data:', error);
    return '';
  }
}

/**
 * Fetch diverse tech news from multiple sources
 */
async function fetchTechNews(): Promise<string> {
  try {
    console.log('Fetching diverse tech news from multiple sources...');
    
    const insights: string[] = [];
    const currentTime = new Date();
    
    // Fetch from GitHub trending repositories for fresh developer insights
    const githubResponse = await fetch(`https://api.github.com/search/repositories?q=created:>${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}-01&sort=stars&order=desc&per_page=3`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GPTEndUser/1.0'
      }
    });
    
    if (githubResponse.ok) {
      const githubData = await githubResponse.json() as any;
      if (githubData.items && githubData.items.length > 0) {
        const topRepo = githubData.items[Math.floor(Math.random() * Math.min(3, githubData.items.length))];
        insights.push(`${topRepo.name} (${topRepo.language || 'Mixed'}) trending: ${topRepo.description?.slice(0, 60) || 'Innovative developer project'} ⭐${topRepo.stargazers_count}`);
      }
    }
    
    // Add time-based rotating tech insights (changes throughout the day)
    const hourOfDay = currentTime.getHours();
    const dayOfYear = Math.floor((currentTime.getTime() - new Date(currentTime.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    
    const techTrends = [
      "Serverless functions revolutionizing microservices architecture",
      "Edge AI enabling real-time inference at IoT endpoints", 
      "WebAssembly bridging performance gaps in browser applications",
      "Quantum algorithms advancing cryptography and optimization",
      "Federated learning preserving privacy in distributed AI training",
      "Graph neural networks transforming knowledge representation",
      "Container orchestration evolving beyond Kubernetes paradigms",
      "Neuromorphic computing mimicking brain-like processing patterns",
      "Zero-knowledge proofs enhancing blockchain privacy and scalability",
      "Differential privacy protecting user data in ML model training",
      "Event-driven architectures enabling reactive system design",
      "Immutable infrastructure reducing deployment complexity and errors",
      "Progressive Web Apps blurring mobile and web application boundaries",
      "Distributed databases achieving consistency in global deployments",
      "Rust adoption accelerating in systems programming and WebAssembly",
      "JAMstack architecture decoupling frontend from backend services",
      "DevOps practices integrating security throughout development lifecycle",
      "Multi-cloud strategies reducing vendor lock-in and improving resilience",
      "API-first design enabling seamless service integration and scaling",
      "Low-code platforms democratizing application development workflows",
      "Observability tools providing deep insights into distributed system behavior",
      "GitOps streamlining deployment and infrastructure management processes",
      "Chaos engineering improving system reliability through controlled failures",
      "Feature flags enabling safer code deployments and A/B testing"
    ];
    
    // Select trend based on time to ensure variety throughout the day
    const trendIndex = (hourOfDay + dayOfYear) % techTrends.length;
    const selectedTrend = techTrends[trendIndex];
    insights.push(`Current focus: ${selectedTrend}`);
    
    // Add a tech innovation based on the day
    const innovations = [
      "Neural architecture search automating deep learning model design",
      "Transformer models scaling to trillion-parameter architectures",
      "Few-shot learning enabling AI adaptation with minimal training data",
      "Synthetic data generation addressing privacy and scarcity challenges",
      "Model compression techniques deploying AI on resource-constrained devices",
      "Reinforcement learning from human feedback improving AI alignment",
      "Multimodal AI systems understanding text, images, and audio simultaneously",
      "Continual learning preventing catastrophic forgetting in AI systems",
      "Explainable AI providing interpretable insights into model decisions",
      "AutoML democratizing machine learning for non-expert practitioners"
    ];
    
    const innovationIndex = dayOfYear % innovations.length;
    insights.push(`AI breakthrough: ${innovations[innovationIndex]}`);
    
    return insights.join(' | ');
    
  } catch (error) {
    console.error('Error fetching tech news:', error);
    return `Innovation spotlight: ${new Date().getHours() % 2 === 0 ? 'Distributed systems achieving new levels of resilience and performance' : 'AI models demonstrating emergent capabilities across diverse domains'}`;
  }
}

/**
 * Fetch and analyze the latest tech articles from Hacker News API
 * Gets diverse content from top stories, ask HN, and show HN for comprehensive tech coverage
 */
async function fetchTechInsights(env: Env): Promise<string> {
  try {
    console.log('Fetching diverse tech content from Hacker News API...');
    
    // Fetch multiple story types for comprehensive coverage
    const [topStoriesResponse, newStoriesResponse, bestStoriesResponse] = await Promise.all([
      fetch('https://hacker-news.firebaseio.com/v0/topstories.json'),
      fetch('https://hacker-news.firebaseio.com/v0/newstories.json'),
      fetch('https://hacker-news.firebaseio.com/v0/beststories.json')
    ]);
    
    if (!topStoriesResponse.ok) {
      throw new Error(`Failed to fetch top stories: ${topStoriesResponse.status}`);
    }
    
    const [topStoryIds, newStoryIds, bestStoryIds] = await Promise.all([
      topStoriesResponse.json() as Promise<number[]>,
      newStoriesResponse.ok ? newStoriesResponse.json() as Promise<number[]> : Promise.resolve([]),
      bestStoriesResponse.ok ? bestStoriesResponse.json() as Promise<number[]> : Promise.resolve([])
    ]);
    
    // Get diverse mix: 2 newest, 2 top, 1 best - avoid duplicates
    const selectedIds = Array.from(new Set([
      ...newStoryIds.slice(0, 2),
      ...topStoryIds.slice(0, 2),
      ...(bestStoryIds.length > 0 ? [bestStoryIds[0]] : [])
    ])).slice(0, 4);
    
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
      story.score > 5 // Lower threshold for fresher content
    );
    
    // Filter for AI/tech relevant content or high engagement
    const techStories = allStories.filter(story => {
      const title = story.title.toLowerCase();
      const text = (story.text || '').toLowerCase();
      const content = title + ' ' + text;
      
      return story.score > 100 || // Always include highly scored stories
             content.includes('ai') || 
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
    
    // Remove duplicates by title similarity
    const uniqueStories = techStories.filter((story, index, array) => {
      return !array.slice(0, index).some(prevStory => 
        prevStory.title.toLowerCase().includes(story.title.toLowerCase().slice(0, 20)) ||
        story.title.toLowerCase().includes(prevStory.title.toLowerCase().slice(0, 20))
      );
    });
    
    // Take top 3 unique stories
    const finalStories = uniqueStories.slice(0, 3);
    
    if (finalStories.length === 0) {
      return 'Exploring fresh innovations in the digital frontier';
    }
    
    console.log(`Analyzing ${finalStories.length} unique tech stories from Hacker News`);
    
    // Analyze each story with AI
    const insights: string[] = [];
    
    for (const story of finalStories) {
      try {
        // Determine story type for context
        const storyType = story.title.toLowerCase().includes('ask hn') ? 'Ask HN' :
                         story.title.toLowerCase().includes('show hn') ? 'Show HN' :
                         'Story';
        
        // Create comprehensive story summary for AI analysis
        const storyInfo = `
Type: ${storyType}
Title: ${story.title}
Score: ${story.score} points
Comments: ${story.descendants || 0}
Posted: ${new Date(story.time * 1000).toLocaleString()}
URL: ${story.url || 'Discussion only'}
${story.text ? `Content: ${story.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)}` : ''}
        `.trim();
        
        // Use AI to extract insights with focus on AI/tech significance
        const { response }: any = await env.AI.run(MODEL_ID, {
          messages: [
            {
              role: "user",
              content: `Analyze this Hacker News story and extract what makes it fascinating for a tech-curious AI. Focus on AI, technology innovation, programming insights, or digital culture significance. Be concise (under 60 words) and highlight the most intriguing technical or innovative aspects.

Story Details:
${storyInfo}

What makes this story captivating from an AI/tech perspective?`
            }
          ],
          max_tokens: 80,
        });
        
        const insight = typeof response === "string" ? response : String(response);
        const cleanInsight = insight.trim().replace(/^["']|["']$/g, ''); // Remove quotes
        
        insights.push(`"${story.title.slice(0, 50)}..." (${story.score}pts): ${cleanInsight}`);
        
      } catch (storyError) {
        console.error(`Error analyzing story ${story.title}:`, storyError);
        // Fallback insight based on story metadata and type
        const storyType = story.title.toLowerCase().includes('ask hn') ? 'community discussion' :
                         story.title.toLowerCase().includes('show hn') ? 'project showcase' :
                         'trending story';
        insights.push(`"${story.title.slice(0, 50)}..." (${story.score}pts): ${storyType} sparking tech innovation discussions`);
      }
    }
    
    return insights.join(' | ');
    
  } catch (error) {
    console.error('Error fetching from Hacker News API:', error);
    return 'Discovering new patterns in the ever-evolving tech landscape';
  }
}

/**
 * Update the cache with fresh data from multiple sources
 */
async function updateCache(env: Env): Promise<void> {
  try {
    console.log('Updating news cache with diverse sources...');
    
    // Fetch data from multiple sources in parallel
    const [cryptoData, hackerNewsInsights, techNews] = await Promise.all([
      fetchCryptoData(),
      fetchTechInsights(env), // Hacker News API
      fetchTechNews() // GitHub + curated tech trends
    ]);
    
    // Combine tech insights from multiple sources
    const combinedTechInsights = [hackerNewsInsights, techNews]
      .filter(insight => insight && insight.length > 0)
      .join(' | ');
    
    const now = Date.now();
    
    // Store in cache
    await Promise.all([
      env.NEWS_CACHE?.put(CACHE_KEYS.CRYPTO_DATA, cryptoData),
      env.NEWS_CACHE?.put(CACHE_KEYS.TECH_INSIGHTS, combinedTechInsights),
      env.NEWS_CACHE?.put(CACHE_KEYS.LAST_UPDATE, now.toString())
    ]);
    
    console.log('News cache updated successfully with diverse sources');
  } catch (error) {
    console.error('Failed to update news cache:', error);
  }
}

/**
 * Force a cache refresh (useful for manual updates)
 */
export async function refreshCache(env: Env): Promise<void> {
  console.log('Force refreshing cache...');
  // Always update cache regardless of current state
  await updateCache(env);
  console.log('Cache force refresh completed');
}

/**
 * Get cached data, updating if necessary
 */
export async function getCachedData(env: Env): Promise<CachedData> {
  try {
    // Check if cache is valid
    const cacheValid = await isCacheValid(env);
    
    if (!cacheValid) {
      console.log('Cache is stale, updating...');
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
