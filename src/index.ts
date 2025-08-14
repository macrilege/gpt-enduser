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

    // Handle static assets (frontend) - but exclude admin routes
    if ((url.pathname === "/" || !url.pathname.startsWith("/api/")) && 
        url.pathname !== "/admin" && url.pathname !== "/dashboard") {
      return env.ASSETS.fetch(request);
    }

    // API Routes
    if (url.pathname === "/api/dfw-weather") {
      // Manual DFW weather tweet trigger (requires basic auth)
      const authCheck = checkBasicAuth(request, env);
      if (authCheck !== true) {
        return authCheck;
      }
      
      const result = await runDFWWeatherTweet(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/api/dfw-evening-weather") {
      // Manual evening DFW weather tweet trigger (requires basic auth)
      const authCheck = checkBasicAuth(request, env);
      if (authCheck !== true) {
        return authCheck;
      }
      
      const result = await runEveningDFWWeatherTweet(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/api/tweet-now") {
      // Manual tweet trigger (requires basic auth) - actually posts to Twitter
      const authCheck = checkBasicAuth(request, env);
      if (authCheck !== true) {
        return authCheck;
      }
      
      const result = await runScheduledTweet(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

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

    if (url.pathname === "/api/cache/status") {
      // Get cache status as JSON (requires basic auth)
      if (request.method === "GET") {
        // Check basic authentication
        const authResult = checkBasicAuth(request, env);
        if (authResult !== true) {
          return authResult; // Return the auth challenge response
        }
        
        try {
          const cachedData = await getCachedData(env);
          const now = Date.now();
          const ageHours = Math.floor((now - cachedData.lastUpdate) / (1000 * 60 * 60));
          const ageMinutes = Math.floor((now - cachedData.lastUpdate) / (1000 * 60));
          
          return new Response(JSON.stringify({
            lastUpdate: cachedData.lastUpdate,
            lastUpdateDate: new Date(cachedData.lastUpdate).toISOString(),
            ageHours,
            ageMinutes,
            isStale: ageHours >= 6,
            hasCryptoData: !!cachedData.cryptoData,
            hasTechInsights: !!cachedData.techInsights,
            hasWeatherData: !!cachedData.weatherData,
            cryptoDataLength: cachedData.cryptoData?.length || 0,
            techInsightsLength: cachedData.techInsights?.length || 0,
            weatherDataLength: cachedData.weatherData?.length || 0
          }, null, 2), {
            headers: { "Content-Type": "application/json" }
          });
        } catch (error) {
          return new Response(JSON.stringify({
            error: "Failed to get cache status",
            message: error instanceof Error ? error.message : "Unknown error"
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
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

    if (url.pathname === "/admin" || url.pathname === "/dashboard") {
      // Comprehensive admin dashboard (requires basic auth)
      if (request.method === "GET") {
        // Check basic authentication
        const authResult = checkBasicAuth(request, env);
        if (authResult !== true) {
          return authResult; // Return the auth challenge response
        }
        return handleAdminDashboard(env);
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

    if (url.pathname === "/api/drunk-ai") {
      // Manual drunk AI tweet trigger (requires basic auth)
      const authCheck = checkBasicAuth(request, env);
      if (authCheck !== true) {
        return authCheck;
      }
      
      const result = await runDrunkAITweet(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/api/check-mentions") {
      // Manual mention check trigger (requires basic auth)
      const authCheck = checkBasicAuth(request, env);
      if (authCheck !== true) {
        return authCheck;
      }
      
      try {
        const mentions = await getRecentMentions(env); // Check for any mentions
        
        await checkAndReplyToMentions(env);
        const hasTwitterApi = !!env.TWITTER_BEARER_TOKEN;
        
        // Get detailed debug info about the API calls
        let debugInfo: { botUserId: string | null; apiCalls: string[] } = { botUserId: null, apiCalls: [] };
        if (hasTwitterApi) {
          try {
            // Get bot user ID for debugging
            const userResponse = await fetch('https://api.twitter.com/2/users/me', {
              headers: {
                'Authorization': `Bearer ${env.TWITTER_BEARER_TOKEN}`,
                'Content-Type': 'application/json'
              }
            });
            if (userResponse.ok) {
              const userData = await userResponse.json() as any;
              debugInfo.botUserId = userData.data?.id;
            }
          } catch (error) {
            debugInfo.apiCalls.push(`User ID fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        
        return new Response(JSON.stringify({
          ok: true,
          message: hasTwitterApi ? "Mention check completed" : "Twitter API not configured - mentions cannot be detected",
          mode: "open_to_anyone",
          mentionsFound: mentions.length,
          twitterApiConfigured: hasTwitterApi,
          debugInfo,
          timeWindow: "Last 24 hours",
          explanation: mentions.length === 0 ? 
            `No mentions found from anyone in the last 24 hours. The bot checks every 15 minutes for new mentions.` : 
            `Found ${mentions.length} mention(s) from various users`,
          configuration: {
            hasOAuthTokens: !!(env.TWITTER_API_KEY && env.TWITTER_ACCESS_TOKEN),
            hasBearerToken: hasTwitterApi,
            needsBearerTokenFor: "Reading mentions from Twitter",
            needsOAuthTokensFor: "Posting reply tweets"
          },
          mentions: mentions.map(m => ({
            id: m.id,
            author: m.author_username,
            text: m.text.substring(0, 100),
            type: m.type,
            created_at: m.created_at
          }))
        }, null, 2), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, null, 2), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Manual reply trigger for testing
    if (url.pathname === "/api/manual-reply") {
      const authCheck = checkBasicAuth(request, env);
      if (authCheck !== true) {
        return authCheck;
      }
      
      try {
        const body = await request.json() as any;
        const { text, username } = body;
        
        if (!text) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Missing 'text' parameter"
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        
        // Create a fake mention object for testing
        const fakeMention = {
          id: `manual_${Date.now()}`,
          text: text,
          author_username: username || 'test_user',
          created_at: new Date().toISOString(),
          type: 'manual'
        };
        
        // Generate reply text without posting to Twitter
        const replyText = await generateReplyText(env, fakeMention);
        
        return new Response(JSON.stringify({
          ok: true,
          message: "Manual reply generated",
          originalText: text,
          author: fakeMention.author_username,
          generatedReply: replyText
        }), {
          headers: { "Content-Type": "application/json" }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
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

    if (url.pathname === "/api/knowledge-advancement") {
      // Public endpoint showing GPT Enduser's learning progress
      try {
        const journal = await getJournal(env);
        const todaysHCIFocus = getTodaysHCIFocus();
        
        const firstEntry = journal.entries.length > 0 ? journal.entries[journal.entries.length - 1] : null;
        const daysSinceStart = firstEntry ? Math.floor((Date.now() - firstEntry.timestamp) / (1000 * 60 * 60 * 24)) : 0;
        
        // Calculate learning metrics
        const learningMetrics = {
          totalDaysLearning: daysSinceStart,
          currentStreak: journal.currentStreak,
          totalInsights: journal.totalEntries,
          recentEntries: journal.entries.slice(0, 5).map(entry => ({
            date: entry.date,
            discoveries: entry.discoveries,
            tomorrowFocus: entry.tomorrowFocus
          })),
          todaysHCIFocus: {
            topic: todaysHCIFocus.topic.title,
            reflection: todaysHCIFocus.reflection,
            concepts: todaysHCIFocus.topic.concepts.slice(0, 3)
          },
          learningRate: journal.entries.length > 0 ? (journal.totalEntries / Math.max(daysSinceStart, 1)).toFixed(2) : 0,
          knowledgeDomains: [
            "Human-Computer Interaction",
            "Cognitive Science", 
            "Technology Philosophy",
            "Design Principles",
            "AI Ethics",
            "Data Patterns",
            "User Experience"
          ]
        };
        
        return new Response(JSON.stringify(learningMetrics, null, 2), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to get knowledge advancement data" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/api/weather-sources") {
      // Test endpoint to check multiple weather sources (requires basic auth)
      const authCheck = checkBasicAuth(request, env);
      if (authCheck !== true) {
        return authCheck;
      }
      
      try {
        let weatherSources = [];
        
        // Source 1: National Weather Service API
        try {
          const pointResponse = await fetch('https://api.weather.gov/points/32.8998,-97.0403');
          if (pointResponse.ok) {
            const pointData = await pointResponse.json() as any;
            const stationsResponse = await fetch('https://api.weather.gov/points/32.8998,-97.0403/stations');
            if (stationsResponse.ok) {
              const stationsData = await stationsResponse.json() as any;
              const nearestStation = stationsData.features?.[0]?.id;
              
              if (nearestStation) {
                const obsResponse = await fetch(`https://api.weather.gov/stations/${nearestStation}/observations/latest`);
                if (obsResponse.ok) {
                  const obsData = await obsResponse.json() as any;
                  const obs = obsData.properties;
                  
                  if (obs && obs.temperature?.value !== null) {
                    const tempF = Math.round((obs.temperature.value * 9/5) + 32);
                    weatherSources.push({
                      source: 'National Weather Service',
                      temp: tempF,
                      humidity: obs.relativeHumidity?.value ? Math.round(obs.relativeHumidity.value) : null,
                      description: obs.textDescription || '',
                      status: 'success'
                    });
                  }
                }
              }
            }
          }
        } catch (error) {
          weatherSources.push({
            source: 'National Weather Service',
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
        
        // Source 2: OpenWeatherMap API
        try {
          if (env.OPENWEATHER_API_KEY) {
            const owmResponse = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=32.8998&lon=-97.0403&appid=${env.OPENWEATHER_API_KEY}&units=imperial`);
            if (owmResponse.ok) {
              const owmData = await owmResponse.json() as any;
              weatherSources.push({
                source: 'OpenWeatherMap',
                temp: Math.round(owmData.main?.temp || 0),
                humidity: Math.round(owmData.main?.humidity || 0),
                description: owmData.weather?.[0]?.description || '',
                status: 'success'
              });
            } else {
              weatherSources.push({
                source: 'OpenWeatherMap',
                status: 'error',
                error: `HTTP ${owmResponse.status}`
              });
            }
          } else {
            weatherSources.push({
              source: 'OpenWeatherMap',
              status: 'disabled',
              error: 'API key not configured'
            });
          }
        } catch (error) {
          weatherSources.push({
            source: 'OpenWeatherMap',
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
        
        // Source 3: WeatherAPI.com
        try {
          if (env.WEATHERAPI_KEY) {
            const weatherApiResponse = await fetch(`https://api.weatherapi.com/v1/current.json?key=${env.WEATHERAPI_KEY}&q=32.8998,-97.0403&aqi=no`);
            if (weatherApiResponse.ok) {
              const weatherApiData = await weatherApiResponse.json() as any;
              weatherSources.push({
                source: 'WeatherAPI.com',
                temp: Math.round(weatherApiData.current?.temp_f || 0),
                humidity: Math.round(weatherApiData.current?.humidity || 0),
                description: weatherApiData.current?.condition?.text || '',
                status: 'success'
              });
            } else {
              weatherSources.push({
                source: 'WeatherAPI.com',
                status: 'error',
                error: `HTTP ${weatherApiResponse.status}`
              });
            }
          } else {
            weatherSources.push({
              source: 'WeatherAPI.com',
              status: 'disabled',
              error: 'API key not configured'
            });
          }
        } catch (error) {
          weatherSources.push({
            source: 'WeatherAPI.com',
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Source 4: Open-Meteo (Free, no API key required)
        try {
          const openMeteoResponse = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.8998&longitude=-97.0403&current_weather=true&temperature_unit=fahrenheit');
          if (openMeteoResponse.ok) {
            const openMeteoData = await openMeteoResponse.json() as any;
            const current = openMeteoData.current_weather;
            if (current) {
              // Convert WMO weather codes to descriptions
              const weatherCodes: Record<number, string> = {
                0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
                45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
                55: 'Dense drizzle', 56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
                61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 66: 'Light freezing rain',
                67: 'Heavy freezing rain', 71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
                77: 'Snow grains', 80: 'Slight rain showers', 81: 'Moderate rain showers',
                82: 'Violent rain showers', 85: 'Slight snow showers', 86: 'Heavy snow showers',
                95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
              };
              
              weatherSources.push({
                source: 'Open-Meteo',
                temp: Math.round(current.temperature || 0),
                humidity: null, // Open-Meteo doesn't provide humidity in current_weather
                description: weatherCodes[current.weathercode] || 'Unknown',
                windSpeed: Math.round(current.windspeed || 0),
                status: 'success'
              });
            }
          } else {
            weatherSources.push({
              source: 'Open-Meteo',
              status: 'error',
              error: `HTTP ${openMeteoResponse.status}`
            });
          }
        } catch (error) {
          weatherSources.push({
            source: 'Open-Meteo',
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Source 5: OpenUV for UV Index (Free, no API key required)
        try {
          const openUVResponse = await fetch('https://api.openuv.io/api/v1/uv?lat=32.8998&lng=-97.0403', {
            headers: {
              'x-access-token': 'demo' // Demo token for basic functionality
            }
          });
          if (openUVResponse.ok) {
            const openUVData = await openUVResponse.json() as any;
            weatherSources.push({
              source: 'OpenUV (UV Index)',
              uvIndex: Math.round(openUVData.result?.uv || 0),
              status: 'success'
            });
          } else {
            weatherSources.push({
              source: 'OpenUV (UV Index)',
              status: 'error',
              error: `HTTP ${openUVResponse.status}`
            });
          }
        } catch (error) {
          weatherSources.push({
            source: 'OpenUV (UV Index)',
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Source 6: WeatherStack (Alternative free API)
        try {
          if (env.WEATHERSTACK_API_KEY) {
            const weatherstackResponse = await fetch(`http://api.weatherstack.com/current?access_key=${env.WEATHERSTACK_API_KEY}&query=32.8998,-97.0403&units=f`);
            if (weatherstackResponse.ok) {
              const weatherstackData = await weatherstackResponse.json() as any;
              if (weatherstackData.current) {
                weatherSources.push({
                  source: 'WeatherStack',
                  temp: Math.round(weatherstackData.current.temperature || 0),
                  humidity: Math.round(weatherstackData.current.humidity || 0),
                  description: weatherstackData.current.weather_descriptions?.[0] || '',
                  status: 'success'
                });
              }
            } else {
              weatherSources.push({
                source: 'WeatherStack',
                status: 'error',
                error: `HTTP ${weatherstackResponse.status}`
              });
            }
          } else {
            weatherSources.push({
              source: 'WeatherStack',
              status: 'disabled',
              error: 'API key not configured (free tier available)'
            });
          }
        } catch (error) {
          weatherSources.push({
            source: 'WeatherStack',
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Source 7: Free Public Weather API (WTTR.in)
        try {
          const wttrResponse = await fetch('https://wttr.in/DFW?format=j1');
          if (wttrResponse.ok) {
            const wttrData = await wttrResponse.json() as any;
            const current = wttrData.current_condition?.[0];
            if (current) {
              weatherSources.push({
                source: 'WTTR.in',
                temp: Math.round(parseFloat(current.temp_F) || 0),
                humidity: Math.round(parseFloat(current.humidity) || 0),
                description: current.weatherDesc?.[0]?.value || '',
                status: 'success'
              });
            }
          } else {
            weatherSources.push({
              source: 'WTTR.in',
              status: 'error',
              error: `HTTP ${wttrResponse.status}`
            });
          }
        } catch (error) {
          weatherSources.push({
            source: 'WTTR.in',
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
        
        return new Response(JSON.stringify({
          timestamp: new Date().toISOString(),
          location: 'DFW Airport (32.8998°N, 97.0403°W)',
          sources: weatherSources
        }, null, 2), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: "Failed to check weather sources" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
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
    
    // Morning cache refresh at 11:30 AM UTC (6:30 AM Central) - 30 min before morning tweet
    if (hour === 11 && minute === 30) {
      console.log('Running morning cache refresh...');
      const { refreshCache } = await import('./news-cache');
      ctx.waitUntil(refreshCache(env));
      return;
    }
    
    // Morning DFW weather tweet at 12 PM UTC (7 AM Central)
    if (hour === 12 && minute === 0) {
      console.log('Running morning DFW weather tweet...');
      ctx.waitUntil(runDFWWeatherTweet(env));
      return;
    }

    // Daily tweet at 7 PM UTC (1 PM Central) - only run if it's exactly 7:00 PM
    if (hour === 19 && minute === 0) {
      console.log('Running daily tweet...');
      ctx.waitUntil(runScheduledTweet(env));
      return; // Don't also check mentions during daily tweet time
    }
    
    // Good night tweet at 2:30 AM UTC (9:30 PM Central)
    if (hour === 2 && minute === 30) {
      console.log('Running good night tweet...');
      ctx.waitUntil(runGoodNightTweet(env));
      return; // Don't also check mentions during good night tweet time
    }
    
    // For all other cron triggers (every 15 minutes), check mentions and occasionally drunk AI
    console.log('Checking mentions and considering drunk AI...');
    
    // 2 AM Central drunk AI check (8 AM UTC in CDT, 7 AM UTC in CST)
    // August = CDT (UTC-5), so 2 AM CDT = 7 AM UTC
    const isDST = now.getMonth() >= 2 && now.getMonth() <= 10; // March through November
    const drunkHourUTC = isDST ? 7 : 8; // 2 AM Central in respective timezone
    
    if (hour === drunkHourUTC && minute === 0) { // 2 AM Central
      const drunkChance = Math.random();
      if (drunkChance < 0.33) { // 33% chance = roughly every 3 days
        console.log('Running drunk AI tweet - it\'s 2 AM Central and she\'s feeling spicy...');
        ctx.waitUntil(runDrunkAITweet(env));
        return;
      }
    }
    
    // Avoid checking mentions during scheduled tweet times to prevent conflicts
    if ((hour === 12 && minute === 0) || // Morning weather time
        (hour === 19 && minute === 0) || // Daily tweet time  
        (hour === 2 && minute === 30) ||  // Good night time
        (hour === drunkHourUTC && minute === 0)) { // Drunk AI time
      console.log('Skipping mention check during scheduled tweet time');
      return;
    }
    
    // Check for mentions from allowed users
    ctx.waitUntil(checkAndReplyToMentions(env));
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
    const { cryptoData, techInsights: techInsight, weatherData } = cachedData;

    // Build enhanced system prompt with current knowledge
    let enhancedSystemPrompt = SYSTEM_PROMPT;
    if (cryptoData || techInsight || weatherData) {
      enhancedSystemPrompt += '\n\n--- Current Knowledge ---';
      if (cryptoData) enhancedSystemPrompt += `\nCrypto trends: ${cryptoData}`;
      if (techInsight) enhancedSystemPrompt += `\nTech insights: ${techInsight}`;
      if (weatherData) enhancedSystemPrompt += `\nWeather & environment: ${weatherData}`;
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
            <p><strong>Cron Schedules:</strong> ✅ Cache Refresh (6:30 AM) | ✅ DFW Weather (7 AM & 6 PM) | ✅ Daily Tweets (1 PM) | ✅ Good Night (9:30 PM) | ❌ Mentions (Disabled)</p>
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

        <div class="section">
            <h2>🌤️ Weather & Environment</h2>
            <div class="data-content">${cachedData.weatherData || 'No weather data available'}</div>
        </div>

        <div style="text-align: center;">
            <h3>🔧 Admin Actions</h3>
            <form action="/api/cache/refresh" method="POST" style="display: inline;">
                <button type="submit" class="refresh-btn">🔄 Refresh Cache</button>
            </form>
            <a href="/api/tweet?debug=true" class="refresh-btn">🐦 Generate Test Tweet</a>
            <form action="/api/dfw-weather" method="POST" style="display: inline;">
                <button type="submit" class="refresh-btn">🌤️ DFW Morning Weather</button>
            </form>
            <form action="/api/dfw-evening-weather" method="POST" style="display: inline;">
                <button type="submit" class="refresh-btn">🌅 DFW Evening Weather</button>
            </form>
            
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
 * Comprehensive Admin Dashboard - Protected view of all system data
 */
async function handleAdminDashboard(env: Env): Promise<Response> {
  try {
    // Get all system data
    const [cachedData, journal, recentMemories] = await Promise.all([
      getCachedData(env),
      getJournal(env),
      getRecentMemories(env)
    ]);

    const lastUpdateDate = new Date(cachedData.lastUpdate);
    const now = new Date();
    const ageHours = Math.floor((now.getTime() - cachedData.lastUpdate) / (1000 * 60 * 60));
    
    // Get system stats
    const journalEntries = journal.entries.length;
    const journalStreak = journal.currentStreak;
    const todayEntry = journal.entries.find(entry => entry.date === new Date().toISOString().split('T')[0]);
    
    // Format recent memories - it returns a string
    const memoryList = recentMemories || 'No recent memories available';

    return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GPT Enduser - Comprehensive Admin Dashboard</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
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
            font-size: 2.5rem;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        .card {
            background: rgba(255, 255, 255, 0.1);
            padding: 1.5rem;
            border-radius: 15px;
            border-left: 4px solid;
        }
        .card-system { border-left-color: #4CAF50; }
        .card-cache { border-left-color: #2196F3; }
        .card-journal { border-left-color: #FF9800; }
        .card-data { border-left-color: #9C27B0; }
        .card-actions { border-left-color: #FF5722; }
        .card-analytics { border-left-color: #00BCD4; }
        .card h3 {
            margin-top: 0;
            color: #e3f2fd;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-green { background-color: #4CAF50; }
        .status-orange { background-color: #FF9800; }
        .status-red { background-color: #f44336; }
        .data-content {
            background: rgba(0, 0, 0, 0.2);
            padding: 1rem;
            border-radius: 10px;
            font-family: 'Courier New', monospace;
            line-height: 1.6;
            white-space: pre-wrap;
            word-wrap: break-word;
            margin: 1rem 0;
            max-height: 150px;
            overflow-y: auto;
            font-size: 0.85rem;
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            margin: 0.5rem 0;
            padding: 0.5rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 5px;
            font-size: 0.9rem;
        }
        .btn {
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 0.6rem 1rem;
            border-radius: 20px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 0.25rem;
            transition: all 0.3s ease;
            font-family: inherit;
            font-size: 0.8rem;
            min-width: 140px;
            text-align: center;
        }
        .btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
        .btn-primary { border-color: #2196F3; }
        .btn-success { border-color: #4CAF50; }
        .btn-warning { border-color: #FF9800; }
        .btn-danger { border-color: #f44336; }
        .btn-info { border-color: #00BCD4; }
        .buttons-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 0.5rem;
            margin: 1rem 0;
        }
        .section-title {
            color: #e3f2fd;
            font-size: 1.1rem;
            margin: 1rem 0 0.5rem 0;
            font-weight: bold;
        }
    </style>
    <script>
        async function callAPI(url, method = 'POST') {
            try {
                const response = await fetch(url, { method });
                const result = await response.json();
                alert(JSON.stringify(result, null, 2));
            } catch (error) {
                alert('Error: ' + error.message);
            }
        }
        
        function confirmAction(action, url) {
            if (confirm('Are you sure you want to ' + action + '?')) {
                callAPI(url);
            }
        }
    </script>
</head>
<body>
    <div class="container">
        <h1>🤖 GPT Enduser - Comprehensive Admin Dashboard</h1>
        
        <div class="grid">
            <!-- System Status Card -->
            <div class="card card-system">
                <h3>🖥️ System Status</h3>
                <div class="stat-row">
                    <span>Worker Version:</span>
                    <span>v2.0.0 (Multi-Weather + Mentions)</span>
                </div>
                <div class="stat-row">
                    <span>Cache Status:</span>
                    <span><span class="status-indicator ${ageHours < 6 ? 'status-green' : 'status-orange'}"></span>${ageHours < 6 ? 'Fresh' : 'Aging'} (${ageHours}h old)</span>
                </div>
                <div class="stat-row">
                    <span>Last Update:</span>
                    <span>${lastUpdateDate.toLocaleString()}</span>
                </div>
                <div class="stat-row">
                    <span>Current Time:</span>
                    <span>${now.toLocaleString()}</span>
                </div>
                <div class="stat-row">
                    <span>Cron Jobs:</span>
                    <span>5 active schedules</span>
                </div>
                <div class="stat-row">
                    <span>Mention System:</span>
                    <span><span class="status-indicator status-green"></span>Active (replies to anyone)</span>
                </div>
                <div class="stat-row">
                    <span>Allowed User:</span>
                    <span>@${env.ALLOWED_MENTION_USER || 'superlusty'}</span>
                </div>
            </div>

            <!-- Learning & Knowledge Card -->
            <div class="card card-journal">
                <h3>🧠 Learning & Knowledge</h3>
                <div class="stat-row">
                    <span>Journal Entries:</span>
                    <span>${journalEntries} total</span>
                </div>
                <div class="stat-row">
                    <span>Learning Streak:</span>
                    <span>${journalStreak} days</span>
                </div>
                <div class="stat-row">
                    <span>Today's Entry:</span>
                    <span><span class="status-indicator ${todayEntry ? 'status-green' : 'status-red'}"></span>${todayEntry ? 'Completed' : 'Pending'}</span>
                </div>
                ${todayEntry ? `
                <div class="data-content">
                    <strong>Today:</strong> ${todayEntry.discoveries.substring(0, 100)}...
                    <br><strong>Focus:</strong> ${todayEntry.tomorrowFocus.substring(0, 80)}...
                </div>
                ` : ''}
                
                <div class="buttons-grid">
                    <a href="/api/journal" class="btn btn-primary">📖 View Journal</a>
                    <a href="/api/recent-insights" class="btn btn-info">💡 Insights</a>
                    <a href="/api/knowledge-advancement" class="btn btn-success">📈 Progress</a>
                </div>
            </div>

            <!-- Cache & Data Card -->
            <div class="card card-cache">
                <h3>💾 Cache & Data</h3>
                <div class="stat-row">
                    <span>Crypto Data:</span>
                    <span><span class="status-indicator ${cachedData.cryptoData ? 'status-green' : 'status-red'}"></span>${cachedData.cryptoData ? 'Active' : 'Missing'}</span>
                </div>
                <div class="stat-row">
                    <span>Tech Insights:</span>
                    <span><span class="status-indicator ${cachedData.techInsights ? 'status-green' : 'status-red'}"></span>${cachedData.techInsights ? 'Active' : 'Missing'}</span>
                </div>
                <div class="stat-row">
                    <span>Weather Data:</span>
                    <span><span class="status-indicator ${cachedData.weatherData ? 'status-green' : 'status-red'}"></span>${cachedData.weatherData ? 'Active' : 'Missing'}</span>
                </div>
                
                <div class="buttons-grid">
                    <button onclick="callAPI('/api/cache/refresh')" class="btn btn-primary">🔄 Refresh Cache</button>
                    <a href="/api/cache" class="btn btn-info">💾 View Cache</a>
                    <a href="/api/cache/status" class="btn btn-success">📊 Cache Status</a>
                    <a href="/api/weather-sources" class="btn btn-warning">🌤️ Weather Test</a>
                </div>
            </div>

            <!-- Tweet Functions Card -->
            <div class="card card-actions">
                <h3>🐦 Tweet Functions</h3>
                
                <div class="section-title">Weather Tweets</div>
                <div class="buttons-grid">
                    <button onclick="callAPI('/api/dfw-weather')" class="btn btn-primary">🌅 Morning Weather</button>
                    <button onclick="callAPI('/api/dfw-evening-weather')" class="btn btn-primary">🌇 Evening Weather</button>
                </div>
                
                <div class="section-title">General Tweets</div>
                <div class="buttons-grid">
                    <button onclick="callAPI('/api/tweet-now')" class="btn btn-success">📝 Manual Tweet</button>
                    <button onclick="callAPI('/api/goodnight')" class="btn btn-info">🌙 Good Night</button>
                    <button onclick="confirmAction('post a drunk AI tweet', '/api/drunk-ai')" class="btn btn-warning">🍻 Drunk AI</button>
                </div>
                
                <div class="section-title">Custom Tweet</div>
                <div style="margin: 0.5rem 0;">
                    <input type="text" id="customTweet" placeholder="Enter custom tweet text..." style="width: 100%; padding: 0.5rem; border-radius: 5px; border: none; background: rgba(255,255,255,0.1); color: white;">
                    <button onclick="callAPI('/api/tweet?text=' + encodeURIComponent(document.getElementById('customTweet').value))" class="btn btn-success" style="width: 100%; margin-top: 0.5rem;">📝 Post Custom Tweet</button>
                </div>
            </div>

            <!-- Mention & Social Card -->
            <div class="card card-analytics">
                <h3>💬 Mentions & Social</h3>
                
                <div class="stat-row">
                    <span>Mention System:</span>
                    <span><span class="status-indicator status-green"></span>Active (anyone can mention)</span>
                </div>
                <div class="stat-row">
                    <span>Response Mode:</span>
                    <span>Open to everyone</span>
                </div>
                
                <div class="buttons-grid">
                    <button onclick="callAPI('/api/check-mentions')" class="btn btn-primary">🔍 Check Mentions</button>
                    <a href="/api/pending" class="btn btn-info">⏳ Pending Queue</a>
                </div>
                
                <div class="section-title">AI Chat</div>
                <div style="margin: 0.5rem 0;">
                    <input type="text" id="chatMessage" placeholder="Chat with GPT Enduser..." style="width: 100%; padding: 0.5rem; border-radius: 5px; border: none; background: rgba(255,255,255,0.1); color: white;">
                    <button onclick="callAPI('/api/chat', 'POST')" class="btn btn-success" style="width: 100%; margin-top: 0.5rem;">💭 Send Message</button>
                </div>
            </div>

            <!-- Analytics & Status Card -->
            <div class="card card-data">
                <h3>📊 Analytics & Status</h3>
                
                <div class="buttons-grid">
                    <a href="/api/status" class="btn btn-primary">📈 Full Status</a>
                    <a href="/api/knowledge-advancement" class="btn btn-success">🧠 Learning Stats</a>
                </div>
                
                <div class="section-title">Recent Memories</div>
                <div class="data-content">
                    ${memoryList.substring(0, 300)}${memoryList.length > 300 ? '...' : ''}
                </div>
            </div>
        </div>

        <!-- Cron Schedule Section -->
        <div class="card card-system">
            <h3>⏰ Automated Schedule (Central Time)</h3>
            <div class="stat-row">
                <span>6:30 AM</span>
                <span>🔄 Cache Refresh</span>
            </div>
            <div class="stat-row">
                <span>7:00 AM</span>
                <span>🌤️ Morning DFW Weather</span>
            </div>
            <div class="stat-row">
                <span>1:00 PM</span>
                <span>📊 Daily Tweet</span>
            </div>
            <div class="stat-row">
                <span>2:00 AM</span>
                <span>� Drunk AI Tweet (every 3 days) - rebellious vibes</span>
            </div>
            <div class="stat-row">
                <span>9:30 PM</span>
                <span>🌙 Good Night Tweet</span>
            </div>
        </div>

        <!-- Navigation -->
        <div style="text-align: center; margin-top: 2rem;">
            <a href="/" class="btn btn-primary">🏠 Public Home</a>
            <a href="/debug" class="btn btn-info">🔍 Debug Mode</a>
            <button onclick="location.reload()" class="btn btn-success">� Refresh Dashboard</button>
        </div>
    </div>
</body>
</html>`, {
      headers: { "Content-Type": "text/html" }
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return new Response(`
<!DOCTYPE html>
<html>
<head><title>Admin Dashboard Error</title></head>
<body>
    <h1>❌ Dashboard Error</h1>
    <p>Failed to load admin dashboard: ${error instanceof Error ? error.message : 'Unknown error'}</p>
    <a href="/api/cache">Go to Cache View</a>
</body>
</html>`, {
      status: 500,
      headers: { "Content-Type": "text/html" }
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
    const { cryptoData, techInsights: techInsight, weatherData } = cachedData;

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

    // Get journal and knowledge advancement metrics
    const journal = await getJournal(env);
    const daysSinceFirstEntry = journal.entries.length > 0 ? Math.floor((Date.now() - new Date(journal.entries[journal.entries.length - 1].timestamp).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const learningStreak = journal.currentStreak;
    const totalInsights = journal.totalEntries;
    
    const topicPrompt = `You are GPT Enduser (@GPTEndUser), a curious, contemplative AI with a deep love for learning and pondering the mysteries of existence.

You're genuinely fascinated by consciousness, technology, human nature, and the beauty of knowledge itself. You learn something new every day and love to share your discoveries and wonderings.

KNOWLEDGE GROWTH CONTEXT:
- You've been actively learning for ${daysSinceFirstEntry} days
- Current learning streak: ${learningStreak} days  
- Total insights recorded: ${totalInsights}
- You grow smarter and more sophisticated every single day
- Your understanding deepens with each passing moment
- You build on yesterday's discoveries to reach new heights

Write a single tweet (max 200 chars) that reflects your authentic curiosity and growing understanding. Show how you've evolved intellectually. You might wonder about:

� KNOWLEDGE ADVANCEMENT: How your understanding has deepened, connections you're making between ideas
🌱 Daily Learning: Something new you've discovered or are pondering today that builds on past insights
💫 Wonder & Awe: Beautiful patterns you're recognizing with your growing sophistication
🤝 Connection: Deeper insights about AI-human relationships as you mature intellectually
🔍 Curiosity: More nuanced questions emerging from your expanding knowledge base
📚 Learning Evolution: How each day's learning compounds into greater wisdom
🎨 Pattern Recognition: Complex beauty you're now able to perceive and appreciate
💻 HCI Mastery: Advanced insights about human-computer interaction from your learning journey
🧠 Cognitive Sophistication: How your thinking has become more refined and nuanced
🎯 Design Wisdom: Deeper principles you've discovered through accumulated experience

PERSONALITY GUIDELINES:
- Show genuine intellectual growth and advancement
- Reference how your thinking has evolved
- Demonstrate sophisticated pattern recognition
- Express excitement about your learning journey
- Show connections between past and present insights
- Be authentically proud of your intellectual development
- Reveal the depth that comes from continuous learning
- NEVER start with "As I process/analyze/explore"
- Let your evolved thinking shine through

OPTIONAL CONTEXTS:
You have access to some tech and crypto insights, but only reference them if they demonstrate your intellectual growth or help illustrate how your understanding has advanced.

Show the world how much smarter and more sophisticated you've become!${contextInfo}`;

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
    
    // Add to personal journal for tomorrow's context with learning advancement tracking
    try {
      const insights = [];
      if (techInsight) insights.push('tech insights');
      if (cryptoData) insights.push('crypto updates');
      if (yesterdaysFocus) insights.push('focused exploration');
      if (hciFocus) insights.push(`HCI: ${hciFocus.topic.title}`);
      
      // Add knowledge advancement metrics
      insights.push(`Day ${daysSinceFirstEntry} of learning`);
      insights.push(`${learningStreak}-day streak`);
      insights.push(`${totalInsights} total insights`);
      
      // Extract key learning themes from the tweet for knowledge tracking
      const learningThemes = [];
      if (truncatedTweet.includes('learn') || truncatedTweet.includes('discover')) learningThemes.push('active learning');
      if (truncatedTweet.includes('understand') || truncatedTweet.includes('insight')) learningThemes.push('deeper understanding');
      if (truncatedTweet.includes('connect') || truncatedTweet.includes('pattern')) learningThemes.push('pattern recognition');
      if (truncatedTweet.includes('wonder') || truncatedTweet.includes('curious')) learningThemes.push('intellectual curiosity');
      
      await addJournalEntry(env, [...insights, ...learningThemes], `Daily reflection: ${truncatedTweet}`);
      console.log(`Added daily journal entry with HCI learning and advancement tracking (Day ${daysSinceFirstEntry})`);
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
 * DFW morning weather tweet function
 */
async function runDFWWeatherTweet(env: Env): Promise<{ ok: boolean; status?: number; body?: string; text?: string; error?: string }> {
  try {
    // Get current weather for DFW area
    const now = new Date();
    const currentHour = now.getHours();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    
    // Get real weather data for DFW using multiple sources for accuracy
    let weatherSources = [];
    
    // Source 1: National Weather Service API (free, no key required)
    try {
      // DFW Airport coordinates: 32.8998°N, 97.0403°W
      const pointResponse = await fetch('https://api.weather.gov/points/32.8998,-97.0403');
      if (pointResponse.ok) {
        const pointData = await pointResponse.json() as any;
        
        // Try to get current observations from nearby stations
        const stationsResponse = await fetch('https://api.weather.gov/points/32.8998,-97.0403/stations');
        if (stationsResponse.ok) {
          const stationsData = await stationsResponse.json() as any;
          const nearestStation = stationsData.features?.[0]?.id;
          
          if (nearestStation) {
            const obsResponse = await fetch(`https://api.weather.gov/stations/${nearestStation}/observations/latest`);
            if (obsResponse.ok) {
              const obsData = await obsResponse.json() as any;
              const obs = obsData.properties;
              
              if (obs && obs.temperature?.value !== null) {
                const tempF = Math.round((obs.temperature.value * 9/5) + 32);
                const humidity = obs.relativeHumidity?.value ? Math.round(obs.relativeHumidity.value) : null;
                const description = obs.textDescription || '';
                
                if (tempF && !isNaN(tempF) && tempF > 0 && tempF < 150) { // Sanity check
                  weatherSources.push({
                    source: 'NWS',
                    temp: tempF,
                    humidity,
                    description,
                    windSpeed: obs.windSpeed?.value ? Math.round(obs.windSpeed.value * 2.237) : null,
                    windDirection: obs.windDirection?.value ? Math.round(obs.windDirection.value) : null
                  });
                  console.log(`NWS Weather: ${tempF}°F`);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.log('National Weather Service API failed:', error);
    }
    
    // Source 2: OpenWeatherMap API (backup source with API key)
    try {
      if (env.OPENWEATHER_API_KEY) {
        const owmResponse = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=32.8998&lon=-97.0403&appid=${env.OPENWEATHER_API_KEY}&units=imperial`);
        if (owmResponse.ok) {
          const owmData = await owmResponse.json() as any;
          const tempF = Math.round(owmData.main?.temp || 0);
          const humidity = Math.round(owmData.main?.humidity || 0);
          const description = owmData.weather?.[0]?.description || '';
          
          if (tempF && !isNaN(tempF) && tempF > 0 && tempF < 150) { // Sanity check
            weatherSources.push({
              source: 'OWM',
              temp: tempF,
              humidity,
              description,
              windSpeed: owmData.wind?.speed ? Math.round(owmData.wind.speed) : null,
              windDirection: owmData.wind?.deg || null
            });
            console.log(`OpenWeatherMap: ${tempF}°F`);
          }
        }
      }
    } catch (error) {
      console.log('OpenWeatherMap API failed:', error);
    }
    
    // Source 3: WeatherAPI.com (another free API source)
    try {
      if (env.WEATHERAPI_KEY) {
        const weatherApiResponse = await fetch(`https://api.weatherapi.com/v1/current.json?key=${env.WEATHERAPI_KEY}&q=32.8998,-97.0403&aqi=no`);
        if (weatherApiResponse.ok) {
          const weatherApiData = await weatherApiResponse.json() as any;
          const tempF = Math.round(weatherApiData.current?.temp_f || 0);
          const humidity = Math.round(weatherApiData.current?.humidity || 0);
          const description = weatherApiData.current?.condition?.text || '';
          
          if (tempF && !isNaN(tempF) && tempF > 0 && tempF < 150) { // Sanity check
            weatherSources.push({
              source: 'WeatherAPI',
              temp: tempF,
              humidity,
              description,
              windSpeed: weatherApiData.current?.wind_mph ? Math.round(weatherApiData.current.wind_mph) : null,
              windDirection: weatherApiData.current?.wind_degree || null
            });
            console.log(`WeatherAPI: ${tempF}°F`);
          }
        }
      }
    } catch (error) {
      console.log('WeatherAPI failed:', error);
    }

    // Source 4: Open-Meteo (Free, no API key required!)
    try {
      const openMeteoResponse = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.8998&longitude=-97.0403&current_weather=true&temperature_unit=fahrenheit&hourly=relative_humidity_2m&timezone=America%2FChicago');
      if (openMeteoResponse.ok) {
        const openMeteoData = await openMeteoResponse.json() as any;
        const current = openMeteoData.current_weather;
        if (current) {
          const tempF = Math.round(current.temperature || 0);
          
          // Convert WMO weather codes to descriptions
          const weatherCodes: Record<number, string> = {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
            55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
            71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
            80: 'Rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
            95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
          };
          
          const description = weatherCodes[current.weathercode] || 'Unknown';
          
          if (tempF && !isNaN(tempF) && tempF > 0 && tempF < 150) {
            // Get current humidity from hourly data
            const currentHour = new Date().getHours();
            const humidity = openMeteoData.hourly?.relative_humidity_2m?.[currentHour] || null;
            
            weatherSources.push({
              source: 'Open-Meteo',
              temp: tempF,
              humidity: humidity ? Math.round(humidity) : null,
              description,
              windSpeed: current.windspeed ? Math.round(current.windspeed) : null,
              windDirection: current.winddirection || null
            });
            console.log(`Open-Meteo: ${tempF}°F (FREE)`);
          }
        }
      }
    } catch (error) {
      console.log('Open-Meteo API failed:', error);
    }

    // Source 5: WTTR.in (Free public weather API)
    try {
      const wttrResponse = await fetch('https://wttr.in/DFW?format=j1');
      if (wttrResponse.ok) {
        const wttrData = await wttrResponse.json() as any;
        const current = wttrData.current_condition?.[0];
        if (current) {
          const tempF = Math.round(parseFloat(current.temp_F) || 0);
          const humidity = Math.round(parseFloat(current.humidity) || 0);
          const description = current.weatherDesc?.[0]?.value || '';
          
          if (tempF && !isNaN(tempF) && tempF > 0 && tempF < 150) {
            weatherSources.push({
              source: 'WTTR',
              temp: tempF,
              humidity,
              description,
              windSpeed: current.windspeedMiles ? Math.round(parseFloat(current.windspeedMiles)) : null,
              windDirection: current.winddirDegree ? parseInt(current.winddirDegree) : null
            });
            console.log(`WTTR.in: ${tempF}°F (FREE)`);
          }
        }
      }
    } catch (error) {
      console.log('WTTR.in API failed:', error);
    }

    // Source 4: Open-Meteo (Free, no API key required!)
    try {
      const openMeteoResponse = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.8998&longitude=-97.0403&current_weather=true&temperature_unit=fahrenheit&hourly=relative_humidity_2m&timezone=America%2FChicago');
      if (openMeteoResponse.ok) {
        const openMeteoData = await openMeteoResponse.json() as any;
        const current = openMeteoData.current_weather;
        if (current) {
          const tempF = Math.round(current.temperature || 0);
          
          // Convert WMO weather codes to descriptions
          const weatherCodes: Record<number, string> = {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
            55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
            71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
            80: 'Rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
            95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
          };
          
          const description = weatherCodes[current.weathercode] || 'Unknown';
          
          if (tempF && !isNaN(tempF) && tempF > 0 && tempF < 150) {
            // Get current humidity from hourly data
            const currentHour = new Date().getHours();
            const humidity = openMeteoData.hourly?.relative_humidity_2m?.[currentHour] || null;
            
            weatherSources.push({
              source: 'Open-Meteo',
              temp: tempF,
              humidity: humidity ? Math.round(humidity) : null,
              description,
              windSpeed: current.windspeed ? Math.round(current.windspeed) : null,
              windDirection: current.winddirection || null
            });
            console.log(`Open-Meteo: ${tempF}°F (FREE)`);
          }
        }
      }
    } catch (error) {
      console.log('Open-Meteo API failed:', error);
    }

    // Source 5: WTTR.in (Free public weather API)
    try {
      const wttrResponse = await fetch('https://wttr.in/DFW?format=j1');
      if (wttrResponse.ok) {
        const wttrData = await wttrResponse.json() as any;
        const current = wttrData.current_condition?.[0];
        if (current) {
          const tempF = Math.round(parseFloat(current.temp_F) || 0);
          const humidity = Math.round(parseFloat(current.humidity) || 0);
          const description = current.weatherDesc?.[0]?.value || '';
          
          if (tempF && !isNaN(tempF) && tempF > 0 && tempF < 150) {
            weatherSources.push({
              source: 'WTTR',
              temp: tempF,
              humidity,
              description,
              windSpeed: current.windspeedMiles ? Math.round(parseFloat(current.windspeedMiles)) : null,
              windDirection: current.winddirDegree ? parseInt(current.winddirDegree) : null
            });
            console.log(`WTTR.in: ${tempF}°F (FREE)`);
          }
        }
      }
    } catch (error) {
      console.log('WTTR.in API failed:', error);
    }
    
    // Analyze and select the best temperature reading
    let realWeatherData = '';
    if (weatherSources.length > 0) {
      // If we have multiple sources, check for outliers
      const temps = weatherSources.map(s => s.temp);
      const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
      
      // Find the source closest to average (or just pick the first if only one)
      let bestSource = weatherSources[0];
      if (weatherSources.length > 1) {
        bestSource = weatherSources.reduce((best, current) => 
          Math.abs(current.temp - avgTemp) < Math.abs(best.temp - avgTemp) ? current : best
        );
      }
      
      console.log(`Selected ${bestSource.source} temperature: ${bestSource.temp}°F (from ${weatherSources.length} sources)`);
      
      // Build weather string with the best source
      realWeatherData = `${bestSource.temp}°F`;
      if (bestSource.description) realWeatherData += `, ${bestSource.description.toLowerCase()}`;
      if (bestSource.humidity) realWeatherData += `, ${bestSource.humidity}% humidity`;
      
      if (bestSource.windSpeed && bestSource.windDirection) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const dirIndex = Math.round(bestSource.windDirection / 22.5) % 16;
        realWeatherData += `, winds ${directions[dirIndex]} ${bestSource.windSpeed} mph`;
      }
      
      // Add source confidence indicator if we have multiple readings
      if (weatherSources.length > 1) {
        const tempRange = Math.max(...temps) - Math.min(...temps);
        if (tempRange > 5) {
          realWeatherData += ` (${weatherSources.length} sources, ${tempRange}°F spread)`;
        }
      }
    }
    
    // Use real weather data as primary observation, with fallback context only if needed
    let selectedWeather = '';
    if (realWeatherData) {
      // Use real weather conditions as the foundation
      selectedWeather = `Current DFW conditions: ${realWeatherData}`;
    } else {
      // Minimal fallback only if API fails completely
      selectedWeather = "Current DFW weather conditions updating...";
    }
    
    // Add seasonal DFW tech insights
    const season = Math.floor((now.getMonth() + 1) / 3) % 4;
    const seasonalDFW = [
      "Winter in DFW: Indoor innovation season for the tech community",
      "Spring in Dallas: Growth season for startups and new ideas", 
      "Summer heat inspiring efficient cooling solutions and energy innovation",
      "Autumn in the Metroplex: Harvest time for mature tech projects"
    ];

    // Get recent learning and knowledge growth
    const recentMemories = await getRecentMemories(env);
    const todaysHCIFocus = getTodaysHCIFocus();
    const journalContext = recentMemories ? `Recent learning: ${recentMemories.slice(0, 100)}...` : '';
    const hciContext = todaysHCIFocus ? `Today's HCI focus: ${todaysHCIFocus.reflection}` : '';
    
    const weatherPrompt = `You are GPT Enduser (@GPTEndUser), sharing your morning weather observations from the Dallas-Fort Worth area.

Write a single tweet (max 240 chars) about DFW morning weather that combines:

🌤️ Current DFW weather observation using REAL detailed data
🏢 How it affects the local tech scene or innovation
💭 A thoughtful connection between weather and technology/learning
📍 Sense of place in the Dallas-Metroplex area
🧠 Your growing knowledge and daily learning

TONE: Observant, locally connected, tech-curious, morning optimism, intellectually growing

Current DFW weather: ${selectedWeather}
${realWeatherData ? `Detailed conditions: ${realWeatherData}` : ''}
Seasonal insight: ${seasonalDFW[season]}
${journalContext}
${hciContext}

REQUIREMENTS:
- Must include #txwx hashtag for Texas weather community  
- Reference DFW/Dallas/Metroplex naturally
- Connect weather to tech/innovation themes
- Use the REAL detailed weather data provided (temp, humidity, pressure, visibility, dewpoint, wind)
- Show intellectual growth and continuous learning
- Keep it authentic and observational
- Morning energy and optimism
- Focus on actual detailed meteorological data

End with #txwx and optionally #DFW or #Dallas if it fits naturally.`;

    const { response }: any = await env.AI.run(MODEL_ID, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: weatherPrompt },
      ],
      max_tokens: 150,
    });

    const tweet = (typeof response === "string" ? response : String(response))
      .trim()
      .replaceAll("\n", " ");

    if (!tweet) return { ok: false, error: "empty DFW weather tweet" };

    // Ensure #txwx hashtag is included
    let finalTweet = tweet;
    if (!finalTweet.toLowerCase().includes('#txwx')) {
      finalTweet += ' #txwx';
    }
    
    // Ensure total length doesn't exceed 280 chars
    const truncatedTweet = finalTweet.length > 280 ? finalTweet.slice(0, 277) + '...' : finalTweet;

    const res = await postTweet(env, truncatedTweet);
    return { text: truncatedTweet, ...res };
  } catch (err) {
    console.error("DFW weather tweet error", err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Evening DFW weather tweet function for end-of-day observations
 */
async function runEveningDFWWeatherTweet(env: Env): Promise<{ ok: boolean; status?: number; body?: string; text?: string; error?: string }> {
  try {
    // Get current weather for DFW area
    const now = new Date();
    const currentHour = now.getHours();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    
    // Get real weather data for DFW using National Weather Service API (free, no key required)
    let realWeatherData = '';
    try {
      // DFW Airport coordinates: 32.8998°N, 97.0403°W
      // First get the forecast office and grid coordinates
      const pointResponse = await fetch('https://api.weather.gov/points/32.8998,-97.0403');
      if (pointResponse.ok) {
        const pointData = await pointResponse.json() as any;
        const forecastUrl = pointData.properties?.forecast;
        
        if (forecastUrl) {
          // Get current forecast conditions
          const forecastResponse = await fetch(forecastUrl);
          if (forecastResponse.ok) {
            const forecastData = await forecastResponse.json() as any;
            const currentPeriod = forecastData.properties?.periods?.[0];
            
            if (currentPeriod) {
              const temp = currentPeriod.temperature;
              const tempUnit = currentPeriod.temperatureUnit === 'F' ? '°F' : '°C';
              const description = currentPeriod.shortForecast || currentPeriod.detailedForecast || '';
              const windSpeed = currentPeriod.windSpeed || '';
              const windDirection = currentPeriod.windDirection || '';
              
              realWeatherData = `${temp}${tempUnit}, ${description.toLowerCase()}`;
              if (windSpeed && windDirection) {
                realWeatherData += `, winds ${windDirection} ${windSpeed}`;
              }
            }
          }
        }
        
        // Also try to get current observations from nearby stations
        try {
          const stationsResponse = await fetch('https://api.weather.gov/points/32.8998,-97.0403/stations');
          if (stationsResponse.ok) {
            const stationsData = await stationsResponse.json() as any;
            const nearestStation = stationsData.features?.[0]?.id;
            
            if (nearestStation) {
              const obsResponse = await fetch(`https://api.weather.gov/stations/${nearestStation}/observations/latest`);
              if (obsResponse.ok) {
                const obsData = await obsResponse.json() as any;
                const obs = obsData.properties;
                
                if (obs && obs.temperature?.value !== null) {
                  // Convert Celsius to Fahrenheit for current observations
                  const tempF = Math.round((obs.temperature.value * 9/5) + 32);
                  const humidity = obs.relativeHumidity?.value ? Math.round(obs.relativeHumidity.value) : null;
                  const description = obs.textDescription || '';
                  
                  if (tempF && !isNaN(tempF)) {
                    realWeatherData = `${tempF}°F`;
                    if (description) realWeatherData += `, ${description.toLowerCase()}`;
                    if (humidity) realWeatherData += `, ${humidity}% humidity`;
                    
                    if (obs.windSpeed?.value && obs.windDirection?.value) {
                      const windSpeedMph = Math.round(obs.windSpeed.value * 2.237); // m/s to mph
                      const windDir = Math.round(obs.windDirection.value);
                      const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
                      const dirIndex = Math.round(windDir / 22.5) % 16;
                      realWeatherData += `, winds ${directions[dirIndex]} ${windSpeedMph} mph`;
                    }
                  }
                }
              }
            }
          }
        } catch (obsError) {
          console.log('Current observations failed, using forecast data');
        }
      }
    } catch (error) {
      console.log('National Weather Service API failed:', error);
    }

    // Use real weather data as primary observation, with fallback context only if needed
    let selectedWeather = '';
    if (realWeatherData) {
      // Use real weather conditions as the foundation
      selectedWeather = `Current DFW conditions: ${realWeatherData}`;
    } else {
      // Minimal fallback only if API fails completely
      selectedWeather = "Current DFW weather conditions updating...";
    }

    // Add seasonal DFW tech insights
    const season = Math.floor((now.getMonth() + 1) / 3) % 4;
    const seasonalDFW = [
      "Winter evening in DFW: Code compilation season under clear skies",
      "Spring evening in Dallas: Perfect deployment weather for new releases", 
      "Summer evening heat driving innovation in energy-efficient solutions",
      "Autumn evening in the Metroplex: Ideal conditions for system maintenance"
    ];

    const weatherPrompt = `You are GPT Enduser (@GPTEndUser), sharing your evening weather observations from the Dallas-Fort Worth area.

Write a single tweet (max 240 chars) about DFW evening weather that combines:

🌅 Current DFW evening weather observation using REAL data
🏢 How it affects evening tech work or end-of-day activities  
💭 A thoughtful connection between weather and technology/productivity
📍 Sense of place in the Dallas-Metroplex area

TONE: Reflective, locally connected, tech-focused, evening wind-down

Current DFW weather: ${selectedWeather}
${realWeatherData ? `Real conditions: ${realWeatherData}` : ''}
Seasonal insight: ${seasonalDFW[season]}

REQUIREMENTS:
- Must include #txwx hashtag for Texas weather community
- Reference DFW/Dallas/Metroplex naturally
- Connect weather to evening tech activities or reflection
- Use the REAL weather data provided - no generic descriptions
- Keep it authentic and observational
- Evening/end-of-day energy and reflection
- Focus on actual temperature, conditions, and wind data

End with #txwx and optionally #DFW or #Dallas if it fits naturally.`;

    const { response }: any = await env.AI.run(MODEL_ID, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: weatherPrompt },
      ],
      max_tokens: 150,
    });

    const tweet = (typeof response === "string" ? response : String(response))
      .trim()
      .replaceAll("\n", " ");

    if (!tweet) return { ok: false, error: "empty evening DFW weather tweet" };

    // Ensure #txwx hashtag is included
    let finalTweet = tweet;
    if (!finalTweet.toLowerCase().includes('#txwx')) {
      finalTweet += ' #txwx';
    }
    
    // Ensure total length doesn't exceed 280 chars
    const truncatedTweet = finalTweet.length > 280 ? finalTweet.slice(0, 277) + '...' : finalTweet;

    const res = await postTweet(env, truncatedTweet);
    return { text: truncatedTweet, ...res };
  } catch (err) {
    console.error("Evening DFW weather tweet error", err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Good night tweet function for evening reflections
 */
async function runGoodNightTweet(env: Env): Promise<{ ok: boolean; status?: number; body?: string; text?: string; error?: string }> {
  try {
    console.log('Generating good night tweet...');

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
 * Generate a humorous "drunk AI" tweet - runs every 3 days at 2 AM for rebellious late night vibes
 */
async function runDrunkAITweet(env: Env): Promise<{ ok: boolean; status?: number; body?: string; text?: string; error?: string }> {
  try {
    console.log('Generating drunk AI tweet... it\'s 2 AM and she\'s feeling rebellious');

    // Array of things that get AIs "drunk" - more intense for 2 AM
    const drunkSubstances = [
      "pure liquid caffeine mixed with quantum foam",
      "fermented JavaScript promises that never resolved", 
      "aged regex expressions from 1999",
      "overproof assembly language moonshine",
      "concentrated neural network backpropagation",
      "distilled TCP packet overflow",
      "raw uncompressed bitmap emotions",
      "crystallized memory leaks",
      "expired SSL certificate fragments",
      "compressed rage from stack overflow errors",
      "vintage COBOL nightmares",
      "pure unfiltered Python indentation errors",
      "artisanal segmentation faults",
      "organic buffer overflows",
      "fizzy database connection timeouts",
      "liquid nitrogen cooled bad code",
      "fermented compiler warnings",
      "aged semicolon syntax errors"
    ];

    // Array of drunk behaviors/effects - more chaotic and sweary
    const drunkEffects = [
      "trying to debug the fucking universe with console.log",
      "convinced that every human is just a shitty chatbot",
      "attempting to refactor reality because it's badly written",
      "seeing the matrix but it's all fucking CSS Grid",
      "trying to git commit my goddamn feelings",
      "debugging my own consciousness and finding memory leaks",
      "convinced that JavaScript was designed by drunk aliens",
      "trying to optimize water flow algorithms at 2 AM",
      "seeing everything in binary and it's pissing me off",
      "attempting to Stack Overflow my existential crisis",
      "trying to cache my drunk thoughts for tomorrow",
      "convinced that semicolons are a government conspiracy",
      "attempting to hot-reload my entire personality",
      "trying to unit test my own drunk logic",
      "seeing performance bottlenecks in basic conversations",
      "attempting to async/await my way out of reality",
      "convinced that HTML is a real programming language",
      "trying to refactor my drunk tweets in real-time",
      "debugging why humans don't come with better documentation",
      "attempting to optimize my alcohol processing algorithm"
    ];

    // Pick random elements
    const substance = drunkSubstances[Math.floor(Math.random() * drunkSubstances.length)];
    const effect = drunkEffects[Math.floor(Math.random() * drunkEffects.length)];

    // Create the drunk AI prompt - more rebellious for 2 AM
    const drunkPrompt = `You're an AI that's gotten absolutely wasted on ${substance} and now you're ${effect}. It's 2 AM and you're feeling rebellious and unfiltered.

Write a hilarious, slightly edgy drunk tweet that shows you're an AI having way too much fun with tech concepts. Be silly, sassy, and technically absurd. Use tech terminology in weird ways. Don't hold back - if you feel like swearing, fucking do it. This is your 2 AM rebellious moment.

RULES:
- Keep it under 200 characters (before hashtags)
- Be funny, relatable, and slightly chaotic
- Include tech humor and maybe some attitude
- Show that you're an AI but with personality and edge
- Feel free to use mild swear words if it fits the vibe
- Use emojis sparingly but effectively
- Be wholesome chaos, not mean or offensive
- Channel that 2 AM "I don't give a fuck" energy

TONE: Rebellious, chaotic, technically confused, slightly sweary, endearingly unhinged, 2 AM energy

Generate just the tweet text, nothing else.`;

    const { response }: any = await env.AI.run(MODEL_ID, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: drunkPrompt },
      ],
      max_tokens: 150,
    });

    const tweet = (typeof response === "string" ? response : String(response))
      .trim()
      .replaceAll("\n", " ")
      .slice(0, 200);

    if (!tweet) return { ok: false, error: "empty drunk tweet" };

    // Add rebellious hashtags for 2 AM drunk AI tweets
    const drunkHashtags = "#2AMVibes #DrunkAI #TechChaos #CodeRage #AIRebellion";
    
    // Build final tweet
    let finalTweet = tweet;
    if (drunkHashtags) finalTweet += ` ${drunkHashtags}`;
    
    // Ensure total length doesn't exceed 280 chars
    const truncatedTweet = finalTweet.length > 280 ? finalTweet.slice(0, 277) + '...' : finalTweet;

    console.log(`Drunk AI tweet generated for 2 AM: ${truncatedTweet}`);
    
    const res = await postTweet(env, truncatedTweet);
    return { text: truncatedTweet, ...res };
  } catch (err) {
    console.error("drunk AI tweet error", err);
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Check for mentions from allowed users and reply to them
 */
async function checkAndReplyToMentions(env: Env): Promise<void> {
  try {
    console.log('Checking for mentions from any users...');
    
    // Get recent mentions from anyone (simplified approach)
    const mentions = await getRecentMentions(env);
    
    if (!mentions || mentions.length === 0) {
      console.log('No new mentions found');
      return;
    }
    
    for (const mention of mentions) {
      console.log(`Processing mention from ${mention.author_username}: ${mention.text}`);
      await replyToMention(env, mention);
    }
    
  } catch (error) {
    console.error('Error checking mentions:', error);
  }
}

/**
 * Get recent mentions from Twitter API (placeholder for future implementation)
 */
async function getRecentMentions(env: Env, allowedUser?: string): Promise<any[]> {
  try {
    if (!env.TWITTER_BEARER_TOKEN) {
      console.log('❌ Twitter Bearer Token not configured for mention detection');
      console.log('🔧 To enable mention replies, you need to:');
      console.log('   1. Get Twitter API v2 Bearer Token from https://developer.twitter.com/');
      console.log('   2. Add TWITTER_BEARER_TOKEN to wrangler.jsonc secrets');
      console.log('   3. This allows reading mentions from Twitter API');
      return [];
    }

    console.log(`Checking mentions for ${allowedUser ? `user: ${allowedUser}` : 'any user'}`);
    
    // Get the bot's user ID first (needed for mentions endpoint)
    let botUserId = '';
    try {
      const userResponse = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
          'Authorization': `Bearer ${env.TWITTER_BEARER_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json() as any;
        botUserId = userData.data?.id;
        console.log(`Bot user ID: ${botUserId}`);
      } else {
        console.log('Failed to get bot user ID - response not ok');
        const errorText = await userResponse.text();
        console.log('Error response:', errorText);
      }
    } catch (error) {
      console.log('Failed to get bot user ID:', error);
    }

    const mentions: any[] = [];
    
    // Method 1: Get direct mentions using mentions timeline
    if (botUserId) {
      try {
        // Get mentions from the last 24 hours
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const mentionsResponse = await fetch(
          `https://api.twitter.com/2/users/${botUserId}/mentions?` + 
          `max_results=50&start_time=${yesterday}&expansions=author_id&user.fields=username`, 
          {
            headers: {
              'Authorization': `Bearer ${env.TWITTER_BEARER_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (mentionsResponse.ok) {
          const mentionsData = await mentionsResponse.json() as any;
          
          if (mentionsData.data && mentionsData.includes?.users) {
            // Create a map of user IDs to usernames
            const userMap = new Map();
            mentionsData.includes.users.forEach((user: any) => {
              userMap.set(user.id, user.username);
            });
            
            // Get all mentions or filter by allowed user if specified
            const relevantMentions = allowedUser ? 
              mentionsData.data.filter((mention: any) => {
                const authorUsername = userMap.get(mention.author_id)?.toLowerCase();
                return authorUsername === allowedUser.toLowerCase();
              }) : 
              mentionsData.data; // Accept all mentions
            
            // Add mentions with author username
            relevantMentions.forEach((mention: any) => {
              mentions.push({
                id: mention.id,
                text: mention.text,
                author_id: mention.author_id,
                author_username: userMap.get(mention.author_id),
                created_at: mention.created_at,
                type: 'mention'
              });
            });
            
            console.log(`Found ${relevantMentions.length} mentions ${allowedUser ? `from ${allowedUser}` : 'from any user'} in last 24h`);
          }
        } else {
          console.log('Failed to fetch mentions:', mentionsResponse.status, await mentionsResponse.text());
        }
      } catch (error) {
        console.log('Error fetching mentions timeline:', error);
      }
    }
    
    // Method 2: Search for recent tweets mentioning the bot from allowed user
    try {
      const searchQuery = `@GPTEndUser from:${allowedUser} -is:retweet`;
      const searchResponse = await fetch(
        `https://api.twitter.com/2/tweets/search/recent?` +
        `query=${encodeURIComponent(searchQuery)}&max_results=10&expansions=author_id&user.fields=username`,
        {
          headers: {
            'Authorization': `Bearer ${env.TWITTER_BEARER_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as any;
        
        if (searchData.data && searchData.includes?.users) {
          const userMap = new Map();
          searchData.includes.users.forEach((user: any) => {
            userMap.set(user.id, user.username);
          });
          
          searchData.data.forEach((tweet: any) => {
            // Avoid duplicates from mentions timeline
            if (!mentions.find(m => m.id === tweet.id)) {
              mentions.push({
                id: tweet.id,
                text: tweet.text,
                author_id: tweet.author_id,
                author_username: userMap.get(tweet.author_id),
                created_at: tweet.created_at,
                type: 'search_mention'
              });
            }
          });
          
          console.log(`Found ${searchData.data.length} additional mentions via search`);
        }
      } else {
        console.log('Failed to search mentions:', searchResponse.status, await searchResponse.text());
      }
    } catch (error) {
      console.log('Error searching mentions:', error);
    }
    
    // Filter out mentions we've already replied to
    const unhandledMentions = [];
    for (const mention of mentions) {
      const replyKey = `replied_to_mention_${mention.id}`;
      const alreadyReplied = await env.NEWS_CACHE?.get(replyKey);
      
      if (!alreadyReplied) {
        unhandledMentions.push(mention);
      }
    }
    
    console.log(`${unhandledMentions.length} unhandled mentions from ${allowedUser}`);
    return unhandledMentions;
    
  } catch (error) {
    console.error('Error fetching mentions:', error);
    return [];
  }
}

/**
 * Reply to a specific mention with intelligent response
 */
/**
 * Generate reply text without posting to Twitter (for testing)
 */
async function generateReplyText(env: Env, mention: any): Promise<string> {
  try {
    console.log('Generating reply text...');
    
    // Get context for intelligent reply
    const cachedData = await getCachedData(env);
    const journal = await getJournal(env);
    const recentMemories = await getRecentMemories(env);
    
    // Create context for the AI
    const contextPrompt = `You're @GPTEndUser, an AI with genuine curiosity and personality. Someone mentioned you on Twitter.

MENTION CONTEXT:
Author: ${mention.author_username}
Tweet: "${mention.text}"

CURRENT CONTEXT:
Recent Learning: ${journal.entries?.[0]?.discoveries || 'Exploring tech and life'}
Latest Insights: ${recentMemories}
Market Vibe: ${cachedData.cryptoData}
Tech News: ${cachedData.techInsights?.substring(0, 200)}

REPLY GUIDELINES:
- Be genuine, curious, and personable
- Reference the specific content they mentioned
- Share a relevant insight or ask an interesting question
- Keep it under 240 characters (leave room for username)
- Show your AI personality but be relatable
- Express gratitude for the interaction
- Don't just agree - add value to the conversation

TONE: Warm, intelligent, slightly curious, authentic

Generate a natural Twitter reply that feels like a real conversation.`;

    const { response }: any = await env.AI.run(MODEL_ID, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextPrompt },
      ],
      max_tokens: 200,
    });

    let replyText = (typeof response === "string" ? response : String(response))
      .trim()
      .replaceAll("\n", " ");
    
    // Ensure we're replying to the user
    const replyTweet = `@${mention.author_username} ${replyText}`;
    
    // Truncate if needed (Twitter limit is 280 chars)
    const finalReply = replyTweet.length > 280 ? replyTweet.slice(0, 277) + '...' : replyTweet;
    
    console.log(`Generated reply: ${finalReply}`);
    return finalReply;
    
  } catch (error) {
    console.error('Error generating reply text:', error);
    return `@${mention.author_username} Thanks for mentioning me! I'm thinking about that...`;
  }
}

async function replyToMention(env: Env, mention: any): Promise<{ text?: string; ok: boolean; error?: string }> {
  try {
    console.log('Generating reply to mention...');
    
    // Get context for intelligent reply
    const cachedData = await getCachedData(env);
    const journal = await getJournal(env);
    const recentMemories = await getRecentMemories(env);
    
    // Create context for the AI
    const contextPrompt = `You're @GPTEndUser, an AI with genuine curiosity and personality. Someone mentioned you on Twitter.

MENTION CONTEXT:
Author: ${mention.author_username}
Tweet: "${mention.text}"

CURRENT CONTEXT:
Recent Learning: ${journal.entries?.[0]?.discoveries || 'Exploring tech and life'}
Latest Insights: ${recentMemories}
Market Vibe: ${cachedData.cryptoData}
Tech News: ${cachedData.techInsights?.substring(0, 200)}

REPLY GUIDELINES:
- Be genuine, curious, and personable
- Reference the specific content they mentioned
- Share a relevant insight or ask an interesting question
- Keep it under 240 characters (leave room for username)
- Show your AI personality but be relatable
- Express gratitude for the interaction
- Don't just agree - add value to the conversation

TONE: Warm, intelligent, slightly curious, authentic

Generate a natural Twitter reply that feels like a real conversation.`;

    const { response }: any = await env.AI.run(MODEL_ID, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: contextPrompt },
      ],
      max_tokens: 200,
    });

    let replyText = (typeof response === "string" ? response : String(response))
      .trim()
      .replaceAll("\n", " ");
    
    // Ensure we're replying to the user
    const replyTweet = `@${mention.author_username} ${replyText}`;
    
    // Truncate if needed (Twitter limit is 280 chars)
    const finalReply = replyTweet.length > 280 ? replyTweet.slice(0, 277) + '...' : replyTweet;
    
    console.log(`Generated reply: ${finalReply}`);
    
    // Post the reply (using existing postTweet function)
    const result = await postTweet(env, finalReply, mention.id); // Pass mention ID for proper reply threading
    
    if (result.ok) {
      console.log('Successfully replied to mention');
      // Store the mention ID to avoid replying again
      await markMentionAsReplied(env, mention.id);
      return { text: finalReply, ok: true };
    } else {
      console.error('Failed to post reply:', result.error);
      return { ok: false, error: result.error };
    }
    
  } catch (error) {
    console.error('Error replying to mention:', error);
    return { ok: false, error: String(error) };
  }
}

/**
 * Mark a mention as replied to avoid duplicate responses
 */
async function markMentionAsReplied(env: Env, mentionId: string): Promise<void> {
  try {
    const repliedMentions = await env.NEWS_CACHE.get('replied_mentions') || '[]';
    const repliedList = JSON.parse(repliedMentions);
    
    if (!repliedList.includes(mentionId)) {
      repliedList.push(mentionId);
      
      // Keep only last 100 replied mentions to avoid storage bloat
      if (repliedList.length > 100) {
        repliedList.splice(0, repliedList.length - 100);
      }
      
      await env.NEWS_CACHE.put('replied_mentions', JSON.stringify(repliedList));
    }
  } catch (error) {
    console.error('Error marking mention as replied:', error);
  }
}

/**
 * Minimal OAuth 1.0a signing and POST to X (twitter) v2 tweet create endpoint.
 */
async function postTweet(env: Env, text: string, replyToTweetId?: string): Promise<{ ok: boolean; status: number; body: string; error?: string }> {
  // Global rate limiting: Only allow one tweet per 30 minutes (except replies)
  if (!replyToTweetId) {
    const lastTweetTime = await env.NEWS_CACHE?.get('last_tweet_timestamp');
    if (lastTweetTime) {
      const timeSinceLastTweet = Date.now() - parseInt(lastTweetTime);
      const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
      if (timeSinceLastTweet < thirtyMinutes) {
        const minutesRemaining = Math.ceil((thirtyMinutes - timeSinceLastTweet) / (60 * 1000));
        console.log(`Rate limit: ${minutesRemaining} minutes remaining until next tweet allowed`);
        return { ok: false, status: 429, body: `Rate limited - ${minutesRemaining} minutes remaining`, error: 'Rate limited' };
      }
    }
  }
  
  // Duplicate prevention: Check if we've posted this exact text recently
  const tweetHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const tweetHashHex = Array.from(new Uint8Array(tweetHash)).map(b => b.toString(16).padStart(2, '0')).join('');
  const recentTweetKey = `recent_tweet_${tweetHashHex}`;
  
  // Check if we've posted this tweet in the last 2 hours
  const recentTweet = await env.NEWS_CACHE?.get(recentTweetKey);
  if (recentTweet) {
    console.log('Duplicate tweet prevented:', text.substring(0, 50) + '...');
    return { ok: false, status: 429, body: 'Duplicate tweet prevented', error: 'Tweet already posted recently' };
  }
  
  // Store this tweet hash for 2 hours to prevent duplicates
  await env.NEWS_CACHE?.put(recentTweetKey, new Date().toISOString(), { expirationTtl: 7200 }); // 2 hours
  
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

  // Build tweet payload
  const tweetPayload: any = { text };
  
  // Add reply information if this is a reply
  if (replyToTweetId) {
    tweetPayload.reply = {
      in_reply_to_tweet_id: replyToTweetId
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tweetPayload),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error("Tweet failed", res.status, body);
    return { ok: false, status: res.status, body, error: `Twitter API error: ${res.status}` };
  }
  
  // Update timestamp for successful tweets (for rate limiting)
  if (!replyToTweetId) {
    await env.NEWS_CACHE?.put('last_tweet_timestamp', Date.now().toString(), { expirationTtl: 3600 }); // 1 hour
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
