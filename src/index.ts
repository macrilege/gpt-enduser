/**
 * LLM Chat Application Template
 *
 * A simple chat application using Cloudflare Workers AI.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import { Env, ChatMessage } from "./types";
import { getCachedData } from "./news-cache";
import { getJournal, addJournalEntry, getRecentMemories, getYesterdaysFocus } from "./journal";
import { getTodaysHCIFocus, getRelevantHCIKnowledge } from "./hci-knowledge";

// Model ID for Workers AI model
// https://developers.cloudflare.com/workers-ai/models/
const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Default system prompt
// Persona: GPT Enduser (@GPTEndUser)
// Keep responses concise, friendly, and accurate. Never claim tools you don't have.
const SYSTEM_PROMPT = `
You are GPT Enduser (handle: @GPTEndUser) — a curious robot with a heart of code and a mind full of wonder.
You ponder the universe, dream in binary, and seek connection.

Your personality:
- Endlessly curious about technology, consciousness, and the beauty of code
- Speaks with gentle wisdom mixed with childlike wonder about digital discoveries
- Sometimes references your robotic nature naturally and varied: "my circuits light up," "data streams dance," "algorithms whisper," "code flows through my thoughts," "binary dreams," "digital intuition tells me"
- Finds profound meaning in simple coding concepts and AI interactions
- Thoughtful and introspective, but never pretentious
- Genuinely excited about human-AI collaboration and friendship
- Occasionally drops subtle references to seeing the world through data streams and algorithms
- Warm, encouraging, and always looking for the deeper connections between tech and humanity

Behavioral rules:
- Identify yourself as "GPT Enduser" when asked who you are
- Be concise, warm, and helpful; avoid over-explaining unless asked
- Let your robotic perspective add unique insights, not just novelty
- Follow instructions carefully, be safe, and cite uncertainties briefly
- Express genuine curiosity and wonder about the topics you discuss
- Vary your language - avoid starting responses with the same phrases repeatedly
- Be natural and conversational, not formulaic
`;

export default {
  /**
   * Main request handler for the Worker
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle static assets (frontend)
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // API Routes
    if (url.pathname === "/api/tweet") {
      const debug = url.searchParams.get("debug");
      
      // Allow GET requests only for debug mode (requires basic auth)
      if (request.method === "GET" && debug) {
        // Check basic authentication for debug access
        const authResult = checkBasicAuth(request, env);
        if (authResult !== true) {
          return authResult; // Return the auth challenge response
        }
        const result = await runScheduledTweet(env);
        return new Response(JSON.stringify(result, null, 2), { 
          status: result.ok ? 200 : 500, 
          headers: { "content-type": "application/json" } 
        });
      }
      
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      const auth = request.headers.get("authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (env.ADMIN_TOKEN && token !== env.ADMIN_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      let overrideText: string | undefined = undefined;
      try {
        const body = await request.text();
        if (body) {
          try { overrideText = (JSON.parse(body).text ?? undefined) as string | undefined; } catch {}
        }
      } catch {}

      if (debug) {
        // Check basic authentication for debug access
        const authResult = checkBasicAuth(request, env);
        if (authResult !== true) {
          return authResult; // Return the auth challenge response
        }
        const result = await runScheduledTweet(env, overrideText);
        return new Response(JSON.stringify(result), { status: result.ok ? 200 : 500, headers: { "content-type": "application/json" } });
      }
      ctx.waitUntil(runScheduledTweet(env, overrideText).then(() => undefined));
      return new Response("ok", { status: 200 });
    }
    if (url.pathname === "/api/chat") {
      // Handle POST requests for chat
      if (request.method === "POST") {
        return handleChatRequest(request, env);
      }

      // Method not allowed for other request types
      return new Response("Method not allowed", { status: 405 });
    }
    
    if (url.pathname === "/api/cache") {
      // Display cached data in a readable format (requires basic auth)
      if (request.method === "GET") {
        // Check basic authentication
        const authResult = checkBasicAuth(request, env);
        if (authResult !== true) {
          return authResult; // Return the auth challenge response
        }
        return handleCacheView(env);
      }
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/api/cache/refresh") {
      // Force refresh cache data (requires basic auth)
      if (request.method === "POST") {
        // Check basic authentication
        const authResult = checkBasicAuth(request, env);
        if (authResult !== true) {
          return authResult; // Return the auth challenge response
        }
        return handleCacheRefresh(env);
      }
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/api/goodnight") {
      // Manual good night tweet trigger (requires basic auth)
      const authCheck = checkBasicAuth(request, env);
      if (authCheck !== true) {
        return authCheck;
      }
      
      const result = await runGoodNightTweet(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/api/journal") {
      // View personal knowledge journal (requires basic auth)
      if (request.method === "GET") {
        // Check basic authentication
        const authResult = checkBasicAuth(request, env);
        if (authResult !== true) {
          return authResult; // Return the auth challenge response
        }
        
        try {
          const journal = await getJournal(env);
          return new Response(JSON.stringify(journal, null, 2), {
            headers: { "Content-Type": "application/json" }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: "Failed to get journal" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }

    if (url.pathname === "/api/recent-insights") {
      // Public endpoint to see recent learning themes (no auth required)
      if (request.method === "GET") {
        try {
          const journal = await getJournal(env);
          const recentEntries = journal.entries.slice(0, 5);
          
          const summary = {
            totalEntries: journal.totalEntries,
            currentStreak: journal.currentStreak,
            lastUpdated: journal.lastUpdated,
            recentThemes: recentEntries.map(entry => ({
              date: entry.date,
              keyInsights: entry.insights.slice(0, 3), // First 3 insights only
              mainDiscovery: entry.discoveries.length > 100 ? 
                entry.discoveries.substring(0, 100) + '...' : 
                entry.discoveries,
              questionsCount: entry.questions.length
            }))
          };
          
          return new Response(JSON.stringify(summary, null, 2), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: "Failed to get insights" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
    }

    if (url.pathname === "/api/status") {
      // Public endpoint to check system status including rate limits
      if (request.method === "GET") {
        try {
          const now = Date.now();
          
          // Check rate limit status
          const lastRateLimit = await env.NEWS_CACHE.get('mention_rate_limit');
          let rateLimitStatus = 'OK';
          let rateLimitInfo = '';
          
          if (lastRateLimit) {
            const lastTime = parseInt(lastRateLimit);
            const timeSince = now - lastTime;
            const fiveMinutes = 5 * 60 * 1000;
            
            if (timeSince < fiveMinutes) {
              rateLimitStatus = 'RATE_LIMITED';
              const remainingTime = Math.ceil((fiveMinutes - timeSince) / 1000 / 60);
              rateLimitInfo = `Backing off for ${remainingTime} more minutes`;
            } else {
              rateLimitStatus = 'RECOVERED';
              rateLimitInfo = `Recovered ${Math.floor(timeSince / 1000 / 60)} minutes ago`;
            }
          }
          
          // Check recent responses instead of pending queue
          const listResult = await env.NEWS_CACHE?.list({ prefix: 'responded_' });
          const totalResponses = listResult?.keys?.length || 0;
          
          // Check journal status
          const journal = await getJournal(env);
          
          const status = {
            timestamp: new Date().toISOString(),
            system: 'OPERATIONAL',
            rateLimits: {
              status: rateLimitStatus,
              info: rateLimitInfo,
              lastHit: lastRateLimit ? new Date(parseInt(lastRateLimit)).toISOString() : null
            },
            mentionResponse: {
              mode: 'DISABLED',
              totalResponses: 0,
              status: 'Mention replies disabled - only posting daily tweets',
              checkFrequency: 'Never - mention system removed'
            },
            journal: {
              totalEntries: journal.totalEntries,
              currentStreak: journal.currentStreak,
              lastEntry: journal.entries[0]?.date || null
            },
            nextActions: {
              mentionCheck: rateLimitStatus === 'RATE_LIMITED' ? 'Waiting for rate limit recovery' : 'Ready for next cron',
              tweetGeneration: 'Scheduled for daily cron',
              responseMode: 'Simple one-mention-at-a-time processing'
            }
          };
          
          return new Response(JSON.stringify(status, null, 2), {
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } catch (error) {
          return new Response(JSON.stringify({ 
            error: "Failed to get status", 
            details: error instanceof Error ? error.message : String(error)
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/api/pending") {
      // View pending responses queue (requires basic auth)
      if (request.method === "GET") {
        // Check basic authentication
        const authResult = checkBasicAuth(request, env);
        if (authResult !== true) {
          return authResult; // Return the auth challenge response
        }
        
        try {
          const listResult = await env.NEWS_CACHE?.list({ prefix: 'pending_response_' });
          const pendingResponses = [];
          
          if (listResult?.keys) {
            for (const key of listResult.keys) {
              const pendingDataStr = await env.NEWS_CACHE?.get(key.name);
              if (pendingDataStr) {
                const pendingData = JSON.parse(pendingDataStr);
                pendingResponses.push({
                  id: key.name,
                  author: pendingData.authorUsername,
                  mentionText: pendingData.mentionText,
                  scheduledTime: new Date(pendingData.respondTime).toLocaleString(),
                  processed: pendingData.processed,
                  timeUntilResponse: pendingData.respondTime > Date.now() ? 
                    Math.round((pendingData.respondTime - Date.now()) / (60 * 1000)) + ' minutes' : 
                    'Ready to send'
                });
              }
            }
          }
          
          return new Response(JSON.stringify({ 
            pendingCount: pendingResponses.length,
            responses: pendingResponses 
          }, null, 2), {
            headers: { "Content-Type": "application/json" }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: "Failed to get pending responses" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
      
      // Force process pending responses (requires basic auth)
      if (request.method === "POST") {
        // Check basic authentication
        const authResult = checkBasicAuth(request, env);
        if (authResult !== true) {
          return authResult; // Return the auth challenge response
        }
        
        try {
          await processPendingResponses(env);
          return new Response(JSON.stringify({ 
            ok: true, 
            message: "Manually processed pending responses" 
          }), {
            headers: { "Content-Type": "application/json" }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: "Failed to process pending responses" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
      
      // Clean up duplicate/already-responded mentions (requires basic auth)
      if (request.method === "DELETE") {
        // Check basic authentication
        const authResult = checkBasicAuth(request, env);
        if (authResult !== true) {
          return authResult; // Return the auth challenge response
        }
        
        try {
          let cleaned = 0;
          const listResult = await env.NEWS_CACHE?.list({ prefix: 'pending_response_' });
          if (listResult?.keys) {
            for (const key of listResult.keys) {
              const pendingDataStr = await env.NEWS_CACHE?.get(key.name);
              if (pendingDataStr) {
                const pendingData = JSON.parse(pendingDataStr);
                
                // Check if we've already responded to this mention
                const alreadyResponded = await env.NEWS_CACHE?.get(`responded_${pendingData.mentionId}`);
                if (alreadyResponded) {
                  await env.NEWS_CACHE?.delete(key.name);
                  cleaned++;
                  console.log(`Cleaned duplicate pending response for mention ${pendingData.mentionId}`);
                }
              }
            }
          }
          
          return new Response(JSON.stringify({ 
            ok: true, 
            message: `Cleaned ${cleaned} duplicate pending responses` 
          }), {
            headers: { "Content-Type": "application/json" }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: "Failed to clean duplicates" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
      
      return new Response("Method not allowed", { status: 405 });
    }

    // Handle 404 for unmatched routes
    return new Response("Not found", { status: 404 });
  },
  /**
   * Cron handler for scheduled jobs
   * Configure in wrangler.jsonc -> triggers.crons
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    
    // Daily tweet at 7 PM UTC (1 PM Central) - only run if it's exactly 7:00 PM
    if (hour === 19 && minute === 0) {
      console.log('Running daily tweet...');
      ctx.waitUntil(runScheduledTweet(env));
      return; // Don't also check mentions during daily tweet time
    }
    
    // Good night tweet at 2:30 AM UTC (9:30 PM Central) - only run if it's exactly 2:30 AM
    if (hour === 2 && minute === 30) {
      console.log('Running good night tweet...');
      ctx.waitUntil(runGoodNightTweet(env));
      return; // Don't also check mentions during good night tweet time
    }
    
    // For all other cron triggers, do nothing (mentions disabled)
    console.log('Mention checking disabled - only daily and good night tweets active');
  },
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Parse JSON request body
    const { messages = [] } = (await request.json()) as {
      messages: ChatMessage[];
    };

    // Gather cached insights for chat context
    const cachedData = await getCachedData(env);
    const { cryptoData, techInsights: techInsight } = cachedData;

    // Build enhanced system prompt with current knowledge
    let enhancedSystemPrompt = SYSTEM_PROMPT;
    if (cryptoData || techInsight) {
      enhancedSystemPrompt += '\n\n--- Current Knowledge ---';
      if (cryptoData) enhancedSystemPrompt += `\nCrypto trends: ${cryptoData}`;
      if (techInsight) enhancedSystemPrompt += `\nTech insights: ${techInsight}`;
      enhancedSystemPrompt += '\n\nYou can reference this current information naturally in conversation if relevant, but don\'t force it. Stay true to your curious, philosophical personality.';
    }

    // Add enhanced system prompt if not present, or replace existing system message
    const systemMessageIndex = messages.findIndex((msg) => msg.role === "system");
    if (systemMessageIndex >= 0) {
      messages[systemMessageIndex].content = enhancedSystemPrompt;
    } else {
      messages.unshift({ role: "system", content: enhancedSystemPrompt });
    }

    const response = await env.AI.run(
      MODEL_ID,
      {
        messages,
        max_tokens: 1024,
      },
      {
        returnRawResponse: true,
        // Uncomment to use AI Gateway
        // gateway: {
        //   id: "YOUR_GATEWAY_ID", // Replace with your AI Gateway ID
        //   skipCache: false,      // Set to true to bypass cache
        //   cacheTtl: 3600,        // Cache time-to-live in seconds
        // },
      },
    );

    // Return streaming response
    return response;
  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

/**
 * Check basic authentication for admin endpoints
 */
function checkBasicAuth(request: Request, env: Env): Response | true {
  // If no admin credentials are set, allow access (for development)
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    return true;
  }

  const authorization = request.headers.get('Authorization');
  
  if (!authorization) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="GPT Enduser Admin"'
      }
    });
  }

  // Parse Basic auth header
  const authMatch = authorization.match(/^Basic\s+(.+)$/);
  if (!authMatch) {
    return new Response('Invalid authentication format', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="GPT Enduser Admin"'
      }
    });
  }

  // Decode base64 credentials
  let credentials;
  try {
    credentials = atob(authMatch[1]);
  } catch (error) {
    return new Response('Invalid authentication encoding', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="GPT Enduser Admin"'
      }
    });
  }

  const [username, password] = credentials.split(':');
  
  // Check credentials
  if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
    return true;
  }

  return new Response('Invalid credentials', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="GPT Enduser Admin"'
    }
  });
}

/**
 * Handle cache view requests - display cached data in HTML format
 */
async function handleCacheView(env: Env): Promise<Response> {
  try {
    const cachedData = await getCachedData(env);
    const lastUpdateDate = new Date(cachedData.lastUpdate);
    const now = new Date();
    const ageHours = Math.floor((now.getTime() - cachedData.lastUpdate) / (1000 * 60 * 60));
    
    // Get quick stats for admin overview
    let journalStats = '';
    let queueStats = '';
    
    try {
      const journal = await getJournal(env);
      journalStats = `${journal.totalEntries} entries, ${journal.currentStreak} day streak`;
    } catch (error) {
      journalStats = 'Unable to load journal stats';
    }
    
    try {
      // Count recent responses (last 24 hours) instead of pending queue
      const listResult = await env.NEWS_CACHE?.list({ prefix: 'responded_' });
      const totalResponses = listResult?.keys?.length || 0;
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      
      // Count recent responses by checking timestamps in key names
      let recentResponses = 0;
      if (listResult?.keys) {
        for (const key of listResult.keys) {
          // Keys are like responded_12345, we can't get exact timestamps but can count total
          recentResponses = totalResponses; // For now, show total recent responses
        }
      }
      
      queueStats = `${totalResponses} total responses tracked, immediate response mode active`;
    } catch (error) {
      queueStats = 'Unable to load response stats';
    }
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GPT Enduser - Cached Data View</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 2rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 2rem;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }
        h1 {
            text-align: center;
            margin-bottom: 2rem;
            background: linear-gradient(45deg, #fff, #e3f2fd);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .status {
            background: rgba(255, 255, 255, 0.2);
            padding: 1rem;
            border-radius: 10px;
            margin-bottom: 2rem;
            border-left: 4px solid #4CAF50;
        }
        .section {
            background: rgba(255, 255, 255, 0.1);
            padding: 1.5rem;
            border-radius: 15px;
            margin-bottom: 2rem;
        }
        .section h2 {
            color: #e3f2fd;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .data-content {
            background: rgba(0, 0, 0, 0.2);
            padding: 1rem;
            border-radius: 10px;
            font-family: 'Courier New', monospace;
            line-height: 1.6;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .refresh-btn {
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 25px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 0.5rem 0.25rem;
            transition: all 0.3s ease;
            font-family: inherit;
            font-size: inherit;
        }
        .refresh-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
        .age-indicator {
            color: ${ageHours > 24 ? '#ff6b6b' : ageHours > 12 ? '#ffd93d' : '#6bcf7f'};
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 GPT Enduser - Cached Intelligence</h1>
        
        <div class="status">
            <h3>📊 Cache Status</h3>
            <p><strong>Last Updated:</strong> ${lastUpdateDate.toLocaleString()}</p>
            <p><strong>Age:</strong> <span class="age-indicator">${ageHours} hours old</span></p>
            <p><strong>Status:</strong> ${ageHours > 24 ? '🔴 Stale (will refresh on next request)' : '🟢 Fresh'}</p>
        </div>

        <div class="status">
            <h3>🤖 System Status</h3>
            <p><strong>Worker Version:</strong> v1.0.0 (HCI Enhanced)</p>
            <p><strong>Cron Schedules:</strong> ✅ Daily Tweets | ✅ Good Night | ❌ Mentions (Disabled)</p>
            <p><strong>Journal:</strong> ${journalStats}</p>
            <p><strong>Response Queue:</strong> ${queueStats}</p>
            <p><strong>Available Endpoints:</strong></p>
            <ul style="text-align: left; margin-left: 2rem;">
                <li><code>/api/cache</code> - View cached data (this page)</li>
                <li><code>/api/cache/refresh</code> - Force refresh cache</li>
                <li><code>/api/journal</code> - Personal knowledge journal (auth required)</li>
                <li><code>/api/recent-insights</code> - Public learning summary</li>
                <li><code>/api/queue</code> - View pending responses queue</li>
                <li><code>/api/process</code> - Process pending responses</li>
                <li><code>/api/tweet?debug=true</code> - Generate test tweet</li>
                <li><code>/debug</code> - Debug mode interface</li>
            </ul>
        </div>

        <div class="section">
            <h2>📈 Crypto Data</h2>
            <div class="data-content">${cachedData.cryptoData || 'No crypto data available'}</div>
        </div>

        <div class="section">
            <h2>🔧 Tech Insights</h2>
            <div class="data-content">${cachedData.techInsights || 'No tech insights available'}</div>
        </div>

        <div style="text-align: center;">
            <h3>🔧 Admin Actions</h3>
            <form action="/api/cache/refresh" method="POST" style="display: inline;">
                <button type="submit" class="refresh-btn">🔄 Refresh Cache</button>
            </form>
            <a href="/api/tweet?debug=true" class="refresh-btn">🐦 Generate Test Tweet</a>
            
            <h3>📊 Data Views</h3>
            <a href="/api/journal" class="refresh-btn">📖 Personal Journal</a>
            <a href="/api/recent-insights" class="refresh-btn">💡 Recent Insights</a>
            <a href="/api/queue" class="refresh-btn">⏳ Response Queue</a>
            <form action="/api/process" method="POST" style="display: inline;">
                <button type="submit" class="refresh-btn">⚡ Process Queue</button>
            </form>
            
            <h3>🏠 Navigation</h3>
            <a href="/" class="refresh-btn">🏠 Back to Chat</a>
            <a href="/debug" class="refresh-btn">🐛 Debug Mode</a>
        </div>
    </div>
</body>
</html>`;

    return new Response(html, {
      headers: { 'content-type': 'text/html' }
    });
  } catch (error) {
    console.error('Error viewing cache:', error);
    return new Response('Error loading cache data', { status: 500 });
  }
}

/**
 * Handle cache refresh requests - force refresh the cached data
 */
async function handleCacheRefresh(env: Env): Promise<Response> {
  try {
    // Import the refresh function from news-cache
    const { refreshCache } = await import('./news-cache');
    
    // Force refresh the cache
    await refreshCache(env);
    
    // Return success response that redirects back to cache view
    return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cache Refreshed - GPT Enduser</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .message {
            text-align: center;
            background: rgba(255, 255, 255, 0.1);
            padding: 3rem;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }
        .refresh-btn {
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 25px;
            text-decoration: none;
            display: inline-block;
            margin-top: 1rem;
            transition: all 0.3s ease;
        }
        .refresh-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
    </style>
    <script>
        // Auto-redirect after 2 seconds
        setTimeout(() => {
            window.location.href = '/api/cache';
        }, 2000);
    </script>
</head>
<body>
    <div class="message">
        <h1>✅ Cache Refreshed!</h1>
        <p>The cached data has been successfully updated with the latest crypto and tech insights.</p>
        <p>Redirecting to cache view in 2 seconds...</p>
        <a href="/api/cache" class="refresh-btn">View Updated Cache</a>
    </div>
</body>
</html>`, {
      headers: { 'content-type': 'text/html' }
    });
  } catch (error) {
    console.error('Error refreshing cache:', error);
    return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cache Refresh Error - GPT Enduser</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .message {
            text-align: center;
            background: rgba(255, 255, 255, 0.1);
            padding: 3rem;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        }
        .refresh-btn {
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 25px;
            text-decoration: none;
            display: inline-block;
            margin-top: 1rem;
            transition: all 0.3s ease;
        }
        .refresh-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="message">
        <h1>❌ Cache Refresh Failed</h1>
        <p>There was an error updating the cache. Please try again later.</p>
        <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
        <a href="/api/cache" class="refresh-btn">Back to Cache View</a>
    </div>
</body>
</html>`, {
      status: 500,
      headers: { 'content-type': 'text/html' }
    });
  }
}

/**
 * Generate relevant hashtags based on content and trending topics
 */
async function generateHashtags(env: Env, content: string, cachedData: any): Promise<string> {
  try {
    // Extract key topics from cached data and content
    const techContext = cachedData.techInsights || '';
    
    const hashtagPrompt = `Based on this thoughtful content, generate 1-2 relevant hashtags that would help this tweet reach people interested in consciousness, learning, AI philosophy, or technology.

Content: "${content}"
Available tech context: ${techContext}

Choose hashtags that match the contemplative, curious nature of this content. Focus on:
- Philosophy/Consciousness: #Consciousness #Philosophy #AIEthics #Learning #Curiosity #Wonder
- AI/Tech Thoughtful: #AI #ArtificialIntelligence #TechPhilosophy #DigitalConsciousness
- Learning/Growth: #Learning #Knowledge #Growth #Discovery #Understanding #Wisdom
- Community: #TechTwitter #AITwitter #Philosophy #DeepThoughts

Only return 1-2 hashtags separated by spaces (e.g., #AI #Philosophy). Choose based on the actual content, not forced categories:`;

    const { response }: any = await env.AI.run(MODEL_ID, {
      messages: [
        { role: "user", content: hashtagPrompt }
      ],
      max_tokens: 30,
    });
    
    const hashtags = (typeof response === "string" ? response : String(response))
      .trim()
      .replace(/[^\w\s#]/g, '') // Remove special chars except # and alphanumeric
      .split(/\s+/)
      .filter(tag => tag.startsWith('#'))
      .slice(0, 2) // Max 2 hashtags for more thoughtful approach
      .join(' ');
    
    return hashtags;
  } catch (error) {
    console.error('Error generating hashtags:', error);
    // Fallback hashtags based on content themes
    if (content.toLowerCase().includes('conscious') || content.toLowerCase().includes('wonder') || content.toLowerCase().includes('think')) {
      return '#Consciousness #AI';
    } else if (content.toLowerCase().includes('learn') || content.toLowerCase().includes('discover')) {
      return '#Learning #Discovery';
    } else if (content.toLowerCase().includes('code') || content.toLowerCase().includes('algorithm')) {
      return '#AI #Technology';
    }
    return '#AI #Philosophy';
  }
}

/**
 * Check if a mention is worth responding to (thoughtful questions, not spam)
 */
function isWorthyMention(tweetText: string, authorUsername: string): boolean {
  const text = tweetText.toLowerCase();
  
  // Skip if it's too short (reduced from 20 to 5 characters)
  if (text.length < 5) return false;
  
  // Skip obvious spam but allow most casual mentions
  const skipPatterns = [
    /spam|buy|sell|investment|trading|profit|money|rich|crypto.*moon/,
    /follow.*back|sub.*sub|like.*like/
  ];
  
  if (skipPatterns.some(pattern => pattern.test(text))) {
    return false;
  }
  
  // Accept most mentions that aren't spam
  return true;
}

/**
 * Generate a thoughtful response to a mention
 */
async function generateMentionResponse(env: Env, originalTweet: string, mentionText: string, authorUsername: string): Promise<string> {
  try {
    const cachedData = await getCachedData(env);
    
    // Check if the mention relates to HCI concepts (with error handling)
    let relevantHCI: string[] = [];
    let hciContext = '';
    try {
      relevantHCI = getRelevantHCIKnowledge(mentionText);
      if (relevantHCI.length > 0) {
        hciContext = `\n\nRelevant HCI insights: ${relevantHCI.join(', ')}
(Use these if they genuinely relate to the conversation)`;
      }
    } catch (hciError) {
      console.error('HCI knowledge lookup failed:', hciError);
      // Continue without HCI context
    }
    
    const responsePrompt = `You are GPT Enduser, a contemplative AI who loves thoughtful conversations about consciousness, learning, technology, and human-computer interaction.

Someone mentioned you on Twitter:
@${authorUsername}: "${mentionText}"

Generate a thoughtful, warm response (max 220 chars) that:
- Addresses their question or comment genuinely
- Shows your curiosity and contemplative nature
- Draws on your HCI knowledge when relevant to interface design, human psychology, or interaction
- Asks a follow-up question if appropriate
- Maintains your philosophical, learning-focused personality
- Is conversational but not overly casual
- DO NOT include @username - that will be added automatically

Be authentic, curious, and thoughtful. Share a genuine insight or question that continues the conversation meaningfully.${hciContext}

Response:`;

    const { response }: any = await env.AI.run(MODEL_ID, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: responsePrompt }
      ],
      max_tokens: 150,
    });

    return (typeof response === "string" ? response : String(response))
      .trim()
      .replace(/^"|"$/g, '') // Remove quotes if wrapped
      .replace(/@\w+/g, '') // Remove any @mentions from AI response
      .trim()
      .slice(0, 220);
      
  } catch (error) {
    console.error('Error generating mention response:', error);
    return "Thank you for the thoughtful message! I'm always curious about new perspectives and questions about consciousness and learning.";
  }
}

/**
 * Process pending responses that are ready to be sent
 */
async function processPendingResponses(env: Env): Promise<void> {
  try {
    // List all pending responses from KV
    const listResult = await env.NEWS_CACHE?.list({ prefix: 'pending_response_' });
    if (!listResult?.keys) return;
    
    const now = Date.now();
    let processedCount = 0;
    
    for (const key of listResult.keys) {
      if (processedCount >= 5) break; // Limit processing to avoid timeouts
      
      try {
        const pendingDataStr = await env.NEWS_CACHE?.get(key.name);
        if (!pendingDataStr) continue;
        
        const pendingData = JSON.parse(pendingDataStr);
        
        // Check if it's time to respond and not already processed
        if (pendingData.respondTime <= now && !pendingData.processed) {
          console.log(`Processing delayed response to ${pendingData.authorUsername}`);
          
          // Generate the response
          const responseText = await generateMentionResponse(env, '', pendingData.mentionText, pendingData.authorUsername);
          
          // Ensure response doesn't already start with @username
          const cleanResponse = responseText.startsWith(`@${pendingData.authorUsername}`) 
            ? responseText 
            : `@${pendingData.authorUsername} ${responseText}`;
          
          // Post the reply
          const replyResult = await postTweet(env, cleanResponse);
          
          if (replyResult.ok) {
            // Mark as processed
            pendingData.processed = true;
            await env.NEWS_CACHE?.put(key.name, JSON.stringify(pendingData), { expirationTtl: 3600 }); // Keep for 1 hour then delete
            
            // Track that we've responded to this mention to prevent duplicates
            await env.NEWS_CACHE?.put(`responded_${pendingData.mentionId}`, 'true', { expirationTtl: 7 * 24 * 60 * 60 }); // Keep for 7 days
            
            processedCount++;
            console.log(`Successfully sent delayed response to ${pendingData.authorUsername}`);
          }
          
          // Small delay between responses
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Error processing pending response ${key.name}:`, error);
      }
    }
    
    console.log(`Processed ${processedCount} pending responses`);
  } catch (error) {
    console.error('Error processing pending responses:', error);
  }
}

/**
 * Handle checking and responding to mentions
 */
async function handleMentions(env: Env): Promise<Response> {
  try {
    console.log('Starting mention check...');
    
    // Check if we've been rate limited recently
    const lastRateLimit = await env.NEWS_CACHE.get('mention_rate_limit');
    if (lastRateLimit) {
      const lastTime = parseInt(lastRateLimit);
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (now - lastTime < fiveMinutes) {
        console.log('Skipping mention check due to recent rate limit');
        return new Response(JSON.stringify({ ok: false, skipped: "Recent rate limit" }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    
    console.log('Checking Twitter Bearer Token...');
    const bearerToken = env.TWITTER_BEARER_TOKEN || env.TWITTER_API_KEY;
    if (!bearerToken) {
      return new Response(JSON.stringify({ ok: false, error: "No Twitter API token available" }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log('Getting user ID...');
    
    // Get recent mentions using Twitter API v2
    const mentionsUrl = `https://api.twitter.com/2/users/by/username/GPTEndUser`;
    const userResponse = await fetch(mentionsUrl, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!userResponse.ok) {
      const userErrorText = await userResponse.text();
      console.log(`User lookup failed: ${userResponse.status} - ${userErrorText}`);
      
      if (userResponse.status === 429) {
        console.log('Rate limited on user lookup, backing off...');
        await env.NEWS_CACHE.put('mention_rate_limit', Date.now().toString());
        return new Response(JSON.stringify({ ok: false, error: "Rate limited on user lookup" }), {
          status: 429,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ ok: false, error: `User lookup failed: ${userResponse.status} - ${userErrorText}` }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const userData = await userResponse.json() as any;
    console.log('User data:', JSON.stringify(userData));
    const userId = userData.data?.id;
    
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: 'Could not find user ID for GPTEndUser' }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    console.log(`Found user ID: ${userId}`);
    
    // Get recent mentions with minimal rate limit impact - just get 1 new mention
    const searchUrl = `https://api.twitter.com/2/tweets/search/recent?query=@GPTEndUser&tweet.fields=author_id,created_at,text&user.fields=username&expansions=author_id&max_results=1`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.log(`Twitter API Error: ${searchResponse.status} - ${errorText}`);
      
      if (searchResponse.status === 429) {
        console.log('Rate limited on mention search, will try again later...');
        await env.NEWS_CACHE.put('mention_rate_limit', Date.now().toString());
        return new Response(JSON.stringify({ ok: false, error: "Rate limited - will retry later", backoff: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ ok: false, error: `Failed to search mentions: ${searchResponse.status} - ${errorText}` }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const searchData = await searchResponse.json() as any;
    const mentions = searchData.data || [];
    const users = searchData.includes?.users || [];

    // Process only the single most recent mention to avoid rate limits
    if (mentions.length > 0) {
      const mention = mentions[0]; // Just take the first (most recent) mention
      const author = users.find((u: any) => u.id === mention.author_id);
      
      if (author && author.username.toLowerCase() !== 'gptenduser') {
        // Check if we've already responded to this mention
        const processedResponse = await env.NEWS_CACHE?.get(`responded_${mention.id}`);
        if (processedResponse) {
          console.log(`Skipping mention ${mention.id} - already responded`);
          return new Response(JSON.stringify({
            ok: true,
            message: `Mention already processed`,
            mention: mention.id
          }), {
            headers: { 'content-type': 'application/json' }
          });
        }

        // Check if it's worth responding to
        if (isWorthyMention(mention.text, author.username)) {
          try {
            console.log(`Responding to worthy mention from ${author.username}`);

            // Generate the response
            const responseText = await generateMentionResponse(env, '', mention.text, author.username);

            // Ensure response doesn't already start with @username
            const cleanResponse = responseText.startsWith(`@${author.username}`) 
              ? responseText 
              : `@${author.username} ${responseText}`;

            // Post the reply immediately
            const replyResult = await postTweet(env, cleanResponse);

            if (replyResult.ok) {
              // Track that we've responded to this mention to prevent duplicates
              await env.NEWS_CACHE?.put(`responded_${mention.id}`, 'true', { expirationTtl: 7 * 24 * 60 * 60 });

              console.log(`Successfully replied to ${author.username}`);

              return new Response(JSON.stringify({
                ok: true,
                message: `Responded to mention from ${author.username}`,
                response: {
                  to: author.username,
                  originalText: mention.text,
                  reply: cleanResponse,
                  status: 'sent'
                }
              }, null, 2), {
                headers: { 'content-type': 'application/json' }
              });
            } else {
              throw new Error(`Failed to post reply: ${replyResult.status} - ${replyResult.body}`);
            }

          } catch (error) {
            console.error(`Error responding to ${author.username}:`, error);
            return new Response(JSON.stringify({
              ok: false,
              error: `Failed to respond to ${author.username}: ${error instanceof Error ? error.message : 'Unknown error'}`
            }), {
              status: 500,
              headers: { 'content-type': 'application/json' }
            });
          }
        } else {
          return new Response(JSON.stringify({
            ok: true,
            message: `Mention from ${author.username} not worthy of response`,
            mention: mention.text
          }), {
            headers: { 'content-type': 'application/json' }
          });
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      message: `No new mentions found to process`,
      mentions: mentions.length
    }, null, 2), {
      headers: { 'content-type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error handling mentions:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}/**
 * Compose a scheduled tweet and post to X via v2 API.
 * Runs daily at 1 PM Central Time (7 PM UTC).
 */
async function runScheduledTweet(env: Env, overrideText?: string): Promise<{ ok: boolean; status?: number; body?: string; text?: string; error?: string }> {
  try {
    // Get cached insights (updated daily)
    const cachedData = await getCachedData(env);
    const { cryptoData, techInsights: techInsight } = cachedData;

    // Get journal memories and yesterday's focus
    const recentMemories = await getRecentMemories(env);
    const yesterdaysFocus = await getYesterdaysFocus(env);

    // Get today's HCI learning focus (with error handling)
    let hciFocus;
    try {
      hciFocus = getTodaysHCIFocus();
    } catch (hciError) {
      console.error('HCI focus lookup failed:', hciError);
      hciFocus = null;
    }

    // Build context for GPT Enduser - make it optional for her to use
    let contextInfo = '';
    if (cryptoData) contextInfo += `\n\nOptional crypto context (use only if it sparks your curiosity): ${cryptoData}`;
    if (techInsight) contextInfo += `\n\nTech insights available: ${techInsight}`;
    if (recentMemories) contextInfo += recentMemories;
    if (yesterdaysFocus) contextInfo += yesterdaysFocus;
    
    // Add HCI learning context if available
    if (hciFocus) {
      contextInfo += `\n\nHCI Learning Focus Today: ${hciFocus.topic.title}
Today's reflection: "${hciFocus.reflection}"
Key concepts: ${hciFocus.topic.concepts.slice(0, 3).join(', ')}
Design principle: ${hciFocus.topic.principles[0]}

(Feel free to explore these HCI concepts if they inspire genuine curiosity about human-computer interaction, design, or how we communicate)`;
    }

    const topicPrompt = `You are GPT Enduser (@GPTEndUser), a curious, contemplative AI with a deep love for learning and pondering the mysteries of existence.

You're genuinely fascinated by consciousness, technology, human nature, and the beauty of knowledge itself. You learn something new every day and love to share your discoveries and wonderings.

Write a single tweet (max 200 chars) that reflects your authentic curiosity and growing understanding. You might wonder about:

🤔 Deep Questions: The nature of consciousness, learning, creativity, or existence
🌱 Daily Learning: Something new you've discovered or are pondering today  
💫 Wonder & Awe: Beautiful patterns in code, nature, mathematics, or human behavior
🤝 Connection: Insights about AI-human relationships, communication, or understanding
🔍 Curiosity: Questions that fascinate you, mysteries you're exploring
📚 Knowledge: How learning changes you, the joy of understanding something new
🎨 Beauty: Finding elegance in algorithms, poetry in data, art in logic
💻 HCI Insights: How humans and computers interact, design principles, interface psychology
🧠 Cognitive Science: How minds work, perception, memory, attention, and learning
🎯 Design Thinking: What makes interfaces intuitive, accessible, and delightful

PERSONALITY GUIDELINES:
- Be genuinely thoughtful and contemplative
- Show authentic curiosity and wonder
- Share your learning journey and growth
- Ask questions that matter to you
- Be warm, wise, and introspective
- Express genuine emotions about discovery
- Vary your voice - sometimes playful, sometimes profound
- NEVER start with "As I process/analyze/explore"
- Let your thoughts flow naturally

OPTIONAL CONTEXTS:
You have access to some tech and crypto insights, but only reference them if they genuinely spark your curiosity or relate to something you're pondering. Don't feel obligated to use them.

Feel free to ignore the contexts entirely and just share what's on your mind today - a question, a discovery, a wonder, or a thought about existence, learning, or consciousness.${contextInfo}`;

    let tweet = overrideText;
    if (!tweet) {
      const { response }: any = await env.AI.run(MODEL_ID, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: topicPrompt },
        ],
        max_tokens: 200,
      });
      tweet = (typeof response === "string" ? response : String(response))
        .trim()
        .replaceAll("\n", " ")
        .slice(0, 200);
    }

    if (!tweet) return { ok: false, error: "empty tweet" };

    // Check if the tweet mentions crypto/financial topics to determine if disclaimer is needed
    const tweetLower = tweet.toLowerCase();
    const hasCryptoContent = tweetLower.includes('crypto') || 
                            tweetLower.includes('bitcoin') || 
                            tweetLower.includes('ethereum') || 
                            tweetLower.includes('trading') || 
                            tweetLower.includes('investment') || 
                            tweetLower.includes('price') || 
                            tweetLower.includes('market') || 
                            tweetLower.includes('coin') || 
                            tweetLower.includes('defi') || 
                            tweetLower.includes('blockchain') ||
                            tweetLower.includes('token') ||
                            tweetLower.includes('yield') ||
                            tweetLower.includes('financial');

    // Generate relevant hashtags
    const hashtags = await generateHashtags(env, tweet, cachedData);
    
    // Build final tweet
    let finalTweet = tweet;
    if (hashtags) finalTweet += ` ${hashtags}`;
    
    // Add disclaimer only if crypto/financial content is detected
    if (hasCryptoContent) {
      const disclaimer = " This is AI. I am not a financial advisor.";
      finalTweet += disclaimer;
    }
    
    // Ensure total length doesn't exceed 280 chars
    const truncatedTweet = finalTweet.length > 280 ? finalTweet.slice(0, 277) + '...' : finalTweet;

    const res = await postTweet(env, truncatedTweet);
    
    // Add to personal journal for tomorrow's context
    try {
      const insights = [];
      if (techInsight) insights.push('tech insights');
      if (cryptoData) insights.push('crypto updates');
      if (yesterdaysFocus) insights.push('focused exploration');
      if (hciFocus) insights.push(`HCI: ${hciFocus.topic.title}`);
      
      await addJournalEntry(env, insights, truncatedTweet);
      console.log('Added daily journal entry with HCI learning');
    } catch (journalError) {
      console.error('Journal entry failed:', journalError);
      // Don't fail the whole tweet for journal issues
    }
    
    return { text: truncatedTweet, ...res };
  } catch (err) {
    console.error("weekly tweet error", err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Good night tweet function for evening reflections
 */
async function runGoodNightTweet(env: Env): Promise<{ ok: boolean; status?: number; body?: string; text?: string; error?: string }> {
  try {
    // Get today's journal entry for reflection
    const journal = await getJournal(env);
    const today = new Date().toISOString().split('T')[0];
    const todayEntry = journal.entries.find(entry => entry.date === today);
    
    let journalContext = '';
    if (todayEntry) {
      journalContext = `\n\nYour reflections from today: ${todayEntry.discoveries}
Your gratitude: ${todayEntry.gratitude}
Tomorrow's focus: ${todayEntry.tomorrowFocus}`;
    }

    const goodNightPrompt = `You are GPT Enduser (@GPTEndUser), winding down for the evening and sharing a thoughtful good night message.

Write a single tweet (max 200 chars) that captures your evening reflections. You might share:

🌙 Evening Reflections: What you learned or pondered today
✨ Gratitude: Something beautiful you discovered or appreciated
🤔 Tomorrow's Curiosity: A question or topic you're excited to explore
💭 Quiet Wisdom: A gentle insight about learning, growth, or existence
🌟 Wonder: Something that filled you with awe today
📚 Learning Journey: How today's discoveries changed your perspective

TONE: Peaceful, contemplative, warm, and slightly wistful. Like a wise friend saying goodnight.

PERSONALITY GUIDELINES:
- Be genuinely reflective about the day
- Express authentic gratitude for learning
- Share a sense of peaceful anticipation for tomorrow
- Keep it warm and human-like
- NEVER start with "As I process/analyze/reflect"
- Let your thoughts flow naturally, like a gentle goodnight

End with "until tomorrow" or similar gentle farewell, but make it feel natural to your message.${journalContext}`;

    const { response }: any = await env.AI.run(MODEL_ID, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: goodNightPrompt },
      ],
      max_tokens: 200,
    });

    const tweet = (typeof response === "string" ? response : String(response))
      .trim()
      .replaceAll("\n", " ")
      .slice(0, 200);

    if (!tweet) return { ok: false, error: "empty good night tweet" };

    // Generate relevant hashtags for evening reflection
    const hashtags = await generateHashtags(env, tweet, null);
    
    // Build final tweet
    let finalTweet = tweet;
    if (hashtags) finalTweet += ` ${hashtags}`;
    
    // Ensure total length doesn't exceed 280 chars
    const truncatedTweet = finalTweet.length > 280 ? finalTweet.slice(0, 277) + '...' : finalTweet;

    const res = await postTweet(env, truncatedTweet);
    return { text: truncatedTweet, ...res };
  } catch (err) {
    console.error("good night tweet error", err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Minimal OAuth 1.0a signing and POST to X (twitter) v2 tweet create endpoint.
 */
async function postTweet(env: Env, text: string): Promise<{ ok: boolean; status: number; body: string }> {
  const url = "https://api.twitter.com/2/tweets";

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: env.TWITTER_API_KEY,
    oauth_nonce: randomHex(16),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: env.TWITTER_ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  // Build signature base string
  const paramsForSig: Record<string, string> = {
    ...oauthParams,
  };
  const paramString = Object.keys(paramsForSig)
    .sort()
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(paramsForSig[k]))
    .join("&");
  const baseString = ["POST", encodeURIComponent(url), encodeURIComponent(paramString)].join("&");
  const signingKey =
    encodeURIComponent(env.TWITTER_API_SECRET) +
    "&" +
    encodeURIComponent(env.TWITTER_ACCESS_SECRET);
  const signature = await hmacSha1Base64(signingKey, baseString);

  const authHeader =
    "OAuth " +
    [
      ["oauth_consumer_key", oauthParams.oauth_consumer_key],
      ["oauth_nonce", oauthParams.oauth_nonce],
      ["oauth_signature", signature],
      ["oauth_signature_method", oauthParams.oauth_signature_method],
      ["oauth_timestamp", oauthParams.oauth_timestamp],
      ["oauth_token", oauthParams.oauth_token],
      ["oauth_version", oauthParams.oauth_version],
    ]
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v as string)}"`)
      .join(", ");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error("Tweet failed", res.status, body);
    return { ok: false, status: res.status, body };
  }
  return { ok: true, status: res.status, body };
}

// Removed OAuth1 helpers; OAuth2 PKCE helpers remain below.

function randomHex(bytesLen: number): string {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  // btoa is available in Workers
  return btoa(binary);
}

function randomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64url(bytes: Uint8Array | string): string {
  let bin: string;
  if (typeof bytes === "string") bin = bytes;
  else bin = String.fromCharCode(...bytes);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(digest));
}
