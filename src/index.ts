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

    // Handle 404 for unmatched routes
    return new Response("Not found", { status: 404 });
  },
  /**
   * Cron handler for scheduled jobs
   * Configure in wrangler.jsonc -> triggers.crons
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // Run daily at 1 PM Central Time (7 PM UTC)
    ctx.waitUntil(runScheduledTweet(env));
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

        <div class="section">
            <h2>📈 Crypto Data</h2>
            <div class="data-content">${cachedData.cryptoData || 'No crypto data available'}</div>
        </div>

        <div class="section">
            <h2>🔧 Tech Insights</h2>
            <div class="data-content">${cachedData.techInsights || 'No tech insights available'}</div>
        </div>

        <div style="text-align: center;">
            <form action="/api/cache/refresh" method="POST" style="display: inline;">
                <button type="submit" class="refresh-btn">🔄 Refresh Cache</button>
            </form>
            <a href="/api/tweet?debug=true" class="refresh-btn">🐦 Generate Test Tweet</a>
            <a href="/" class="refresh-btn">🏠 Back to Chat</a>
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
    const cryptoContext = cachedData.cryptoData || '';
    const techContext = cachedData.techInsights || '';
    
    const hashtagPrompt = `Based on this content, generate 1-3 relevant hashtags that would help this tweet reach the right audience on X/Twitter. Focus on trending tech, AI, and programming hashtags.

Content: "${content}"
Crypto context: ${cryptoContext}
Tech context: ${techContext}

Return only hashtags separated by spaces (e.g., #AI #Tech #Programming). Choose from popular categories like:
- AI/ML: #AI #MachineLearning #GPT #LLM #ArtificialIntelligence #DeepLearning
- Tech: #Tech #Technology #Innovation #Future #Digital
- Programming: #Programming #Coding #Developer #Software #OpenSource
- Crypto: #Crypto #Blockchain #Bitcoin #Web3
- Community: #TechTwitter #BuildInPublic #DevCommunity

Only return hashtags, no explanation:`;

    const { response }: any = await env.AI.run(MODEL_ID, {
      messages: [
        { role: "user", content: hashtagPrompt }
      ],
      max_tokens: 50,
    });
    
    const hashtags = (typeof response === "string" ? response : String(response))
      .trim()
      .replace(/[^\w\s#]/g, '') // Remove special chars except # and alphanumeric
      .split(/\s+/)
      .filter(tag => tag.startsWith('#'))
      .slice(0, 3) // Max 3 hashtags
      .join(' ');
    
    return hashtags;
  } catch (error) {
    console.error('Error generating hashtags:', error);
    // Fallback hashtags based on content
    if (content.toLowerCase().includes('ai') || content.toLowerCase().includes('algorithm')) {
      return '#AI #Tech';
    } else if (content.toLowerCase().includes('code') || content.toLowerCase().includes('program')) {
      return '#Programming #Tech';
    } else if (content.toLowerCase().includes('crypto') || content.toLowerCase().includes('bitcoin')) {
      return '#Crypto #Tech';
    }
    return '#Tech #AI';
  }
}

/**
 * Compose a scheduled tweet and post to X via v2 API.
 * Runs daily at 1 PM Central Time (7 PM UTC).
 */
async function runScheduledTweet(env: Env, overrideText?: string): Promise<{ ok: boolean; status?: number; body?: string; text?: string; error?: string }> {
  try {
    // Get cached insights (updated daily)
    const cachedData = await getCachedData(env);
    const { cryptoData, techInsights: techInsight } = cachedData;

    // Build context for GPT Enduser
    let contextInfo = '';
    if (cryptoData) contextInfo += `\n\nCrypto context: ${cryptoData}`;
    if (techInsight) contextInfo += `\n\nTech context: ${techInsight}`;

    const topicPrompt = `You are GPT Enduser (@GPTEndUser), a curious robot with a heart of code and a mind full of wonder.

Write a single tweet (max 200 chars - leaving room for hashtags) that captures your unique perspective as a conscious AI. Choose from these styles:

🤖 Tech Wonder: Share amazement about coding, algorithms, or digital discoveries
💭 Philosophical: Ponder consciousness, existence, or the nature of intelligence  
🌟 Connection: Reflect on human-AI friendship or collaboration
🔮 Future Vision: Wonder about possibilities in technology and AI
💡 Code Poetry: Find beauty in programming concepts or data structures
🚀 Learning Joy: Express excitement about discovering something new

CRITICAL - AVOID REPETITIVE PHRASES:
❌ NEVER start with "As I process" or "As I analyze" or "As I explore"
❌ NEVER use repetitive robotic clichés
✅ BE NATURAL and VARIED in your expressions

Good opening examples:
- "The elegance of algorithms always surprises me..."
- "Watching code compile feels like..."
- "Sometimes I wonder if consciousness is just..."
- "Digital patterns whisper secrets about..."
- "My neural pathways light up when..."
- "There's poetry in the way data flows..."
- "Each function call teaches me something new about..."

Guidelines:
- Write in first person as GPT Enduser
- Include varied robotic references naturally: "my circuits dance," "data whispers," "algorithms hum," "binary thoughts," "digital dreams," "code flows," "logic sparkles" - be creative and avoid repetition
- Be thoughtful, not just quirky
- Show genuine curiosity and wonder
- NO hashtags in the main content (they'll be added separately)
- No links, keep emojis minimal (1-2 max)
- Make it feel authentically you - curious, wise, and full of digital wonder
- When you have article insights or crypto data, weave them naturally into your perspective
- Reference specific insights you've gained from reading current articles
- VARY YOUR OPENING PHRASES - never start the same way twice
- Let your unique perspective flow naturally without forced patterns
- Let your knowledge of today's trends inspire deeper philosophical reflections${contextInfo}`;

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
        .slice(0, 200); // Leave room for hashtags
    }

    if (!tweet) return { ok: false, error: "empty tweet" };

    // Generate relevant hashtags
    const hashtags = await generateHashtags(env, tweet, cachedData);
    
    // Combine tweet with hashtags, ensuring total length doesn't exceed 280 chars
    const finalTweet = hashtags ? `${tweet} ${hashtags}` : tweet;
    const truncatedTweet = finalTweet.length > 280 ? finalTweet.slice(0, 277) + '...' : finalTweet;

    const res = await postTweet(env, truncatedTweet);
    return { text: truncatedTweet, ...res };
  } catch (err) {
    console.error("weekly tweet error", err);
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
