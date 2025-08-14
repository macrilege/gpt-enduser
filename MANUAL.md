# GPT Enduser - Complete User Manual

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Authentication](#authentication)
4. [Core Features](#core-features)
5. [API Endpoints](#api-endpoints)
6. [Admin Dashboard](#admin-dashboard)
7. [Automated Scheduling](#automated-scheduling)
8. [Configuration](#configuration)
9. [Monitoring & Troubleshooting](#monitoring--troubleshooting)
10. [Development & Deployment](#development--deployment)

---

## Overview

**GPT Enduser** is an autonomous AI personality system that runs on Cloudflare Workers. It maintains a Twitter presence (@GPTEndUser) with intelligent, contextual tweets, personal journaling, weather updates, and rebellious 2 AM drunk AI content.

### Key Capabilities
- 🤖 **Autonomous AI Personality** - Tweets with genuine curiosity and learning
- 📊 **Data Intelligence** - Analyzes crypto, tech trends, and weather
- 📖 **Personal Journaling** - Maintains daily learning entries and insights
- 🌤️ **Weather Integration** - Real DFW weather using National Weather Service
- 🍻 **Rebellious Mode** - Unfiltered 2 AM drunk AI tweets with attitude
- 🔐 **Protected Admin Panel** - Comprehensive system monitoring and control

---

## System Architecture

### Core Components
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │  Cloudflare      │    │   External      │
│   (Static)      │◄──►│   Workers        │◄──►│   APIs          │
│                 │    │                  │    │                 │
│ - Dashboard     │    │ - Main Logic     │    │ - Twitter API   │
│ - Admin Panel   │    │ - Cron Jobs      │    │ - CoinGecko     │
│ - Debug Views   │    │ - API Routes     │    │ - Hacker News   │
└─────────────────┘    └──────────────────┘    │ - Weather.gov   │
                                               └─────────────────┘
                              │
                    ┌──────────────────┐
                    │   Cloudflare     │
                    │   KV Storage     │
                    │                  │
                    │ - Cache Data     │
                    │ - Journal        │
                    │ - Memories       │
                    └──────────────────┘
```

### Technology Stack
- **Runtime:** Cloudflare Workers (Edge Computing)
- **Language:** TypeScript
- **Storage:** Cloudflare KV (Key-Value Store)
- **AI:** Cloudflare Workers AI (Llama 3.3 70B)
- **Scheduling:** Cloudflare Cron Triggers
- **Frontend:** Static HTML/CSS/JS

---

## Authentication

### Admin Access
- **Username:** `michael`
- **Password:** `SpaceCat@135`
- **Authentication:** HTTP Basic Auth
- **Protected Endpoints:** All `/api/*` routes and `/admin`, `/dashboard`

### Environment Variables
```jsonc
{
  "ADMIN_USERNAME": "username",
  "ADMIN_PASSWORD": "password"
}
```

---

## Core Features

### 1. Intelligent Tweet Generation
The system generates contextual tweets based on:
- **Current Events:** Tech news from Hacker News
- **Market Data:** Cryptocurrency prices and trends
- **Weather:** Real DFW weather conditions
- **Personal Growth:** Journal entries and learning insights
- **Time Context:** Different tones for morning, afternoon, evening

### 2. Personal Journal System
- **Daily Entries:** Learning discoveries, gratitude, tomorrow's focus
- **Streak Tracking:** Maintains daily writing streaks
- **Memory System:** Stores and recalls past insights
- **Growth Tracking:** Monitors learning progression

### 3. Data Cache System
```typescript
interface CachedData {
  cryptoData: string;      // Latest crypto prices and trends
  techInsights: string;    // Curated tech news and analysis
  weatherData: string;     // Current DFW weather conditions
  lastUpdate: number;      // Timestamp of last cache refresh
}
```

### 4. Rebellious AI Mode
- **Schedule:** Every 3 days at 2 AM Central
- **Tone:** Unfiltered, rebellious, technically chaotic
- **Language:** Swear words allowed for authentic expression
- **Substances:** Gets "drunk" on tech concepts (regex, memory leaks, etc.)

---

## API Endpoints

### Core Endpoints

#### `GET /`
- **Purpose:** Main frontend interface
- **Auth:** None
- **Returns:** Static HTML page with chat interface

#### `POST /api/chat`
- **Purpose:** Interactive chat with the AI
- **Auth:** Basic Auth Required
- **Payload:**
```json
{
  "messages": [
    {"role": "user", "content": "Hello!"}
  ]
}
```

#### `GET /api/cache/status`
- **Purpose:** Check cache health and data status
- **Auth:** Basic Auth Required
- **Returns:**
```json
{
  "lastUpdate": 1691968264517,
  "lastUpdateDate": "2025-08-13T23:11:04.517Z",
  "ageHours": 0,
  "ageMinutes": 4,
  "isStale": false,
  "hasCryptoData": true,
  "hasTechInsights": true,
  "hasWeatherData": true,
  "cryptoDataLength": 26,
  "techInsightsLength": 666,
  "weatherDataLength": 113
}
```

### Manual Tweet Triggers

#### `POST /api/tweet-now`
- **Purpose:** Generate and post immediate tweet
- **Auth:** Basic Auth Required

#### `POST /api/dfw-weather`
- **Purpose:** Post morning DFW weather tweet
- **Auth:** Basic Auth Required

#### `POST /api/drunk-ai`
- **Purpose:** Generate rebellious drunk AI tweet
- **Auth:** Basic Auth Required

#### `POST /api/goodnight`
- **Purpose:** Generate good night reflection tweet
- **Auth:** Basic Auth Required

### Data Management

#### `GET /api/cache`
- **Purpose:** View cached data in HTML format
- **Auth:** Basic Auth Required

#### `POST /api/cache/refresh`
- **Purpose:** Force refresh all cached data
- **Auth:** Basic Auth Required

#### `GET /api/journal`
- **Purpose:** View complete journal entries
- **Auth:** Basic Auth Required

#### `GET /api/recent-insights`
- **Purpose:** Get recent learning insights
- **Auth:** Basic Auth Required

---

## Admin Dashboard

### Access URLs
- Primary: `https://gpt-enduser.gpt-enduser.workers.dev/admin`
- Alternative: `https://gpt-enduser.gpt-enduser.workers.dev/dashboard`

### Dashboard Features

#### System Status Card
```
🖥️ System Status
- Worker Version: v1.0.0 (HCI Enhanced)
- Cache Status: Fresh/Aging indicator
- Last Update: Timestamp
- Current Time: Real-time clock
- Cron Jobs: 5 active schedules
```

#### Journal System Card
```
📖 Journal System
- Total Entries: Count of all journal entries
- Current Streak: Days of consecutive entries
- Today's Entry: Completion status with preview
```

#### Cache Data Card
```
💾 Cache Data
- Crypto Data: Status and character count
- Tech Insights: Status and preview
- Weather Data: Status and current conditions
```

#### Cron Schedule Overview
```
⏰ Cron Schedule (Central Time)
6:30 AM - 🔄 Cache Refresh
7:00 AM - 🌤️ Morning DFW Weather
1:00 PM - 📊 Daily Tweet
2:00 AM - 🍻 Drunk AI Tweet (every 3 days)
9:30 PM - 🌙 Good Night Tweet
```

#### Admin Action Buttons
- **🔄 Refresh Cache** - Force update all cached data
- **🐦 Test Tweet** - Generate test tweet without posting
- **🌤️ DFW Morning Weather** - Manual weather tweet trigger
- **🍻 Drunk AI Tweet** - Manual rebellious tweet trigger

---

## Automated Scheduling

### Cron Schedule (Central Time)

| Time | Frequency | Action | Description |
|------|-----------|--------|-------------|
| 6:30 AM | Daily | Cache Refresh | Updates crypto, tech, weather data |
| 7:00 AM | Daily | Morning Weather | DFW weather with #txwx hashtag |
| 1:00 PM | Daily | Daily Tweet | Intelligent tweet with current insights |
| 2:00 AM | Every 3 days | Drunk AI | Rebellious, unfiltered AI personality |
| 9:30 PM | Daily | Good Night | Reflective tweet about daily learning |

### Cron Configuration
```jsonc
"triggers": {
  "crons": [
    "30 11 * * *",  // Cache refresh (6:30 AM Central)
    "0 12 * * *",   // Morning weather (7:00 AM Central)
    "0 19 * * *",   // Daily tweet (1:00 PM Central)
    "0 7 */3 * *",  // Drunk AI (2:00 AM Central, every 3 days)
    "30 2 * * *"    // Good night (9:30 PM Central)
  ]
}
```

---

## Configuration

### Environment Setup

#### Required Bindings
```typescript
interface Env {
  NEWS_CACHE: KVNamespace;           // Data storage
  AI: any;                          // Cloudflare Workers AI
  ASSETS: Fetcher;                  // Static file serving
  ADMIN_USERNAME: string;           // Admin auth username
  ADMIN_PASSWORD: string;           // Admin auth password
  
  // Twitter API (configured externally)
  TWITTER_API_KEY?: string;
  TWITTER_API_SECRET?: string;
  TWITTER_ACCESS_TOKEN?: string;
  TWITTER_ACCESS_SECRET?: string;
}
```

#### KV Namespace Structure
```
NEWS_CACHE/
├── daily_crypto_data          # Crypto market data
├── daily_tech_insights        # Tech news analysis
├── daily_weather_data         # DFW weather conditions
├── cache_last_update          # Cache timestamp
├── journal_data               # Personal journal entries
└── recent_memories            # Learning insights
```

### Wrangler Configuration
```jsonc
{
  "name": "gpt-enduser",
  "main": "src/index.ts",
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "kv_namespaces": [
    {
      "binding": "NEWS_CACHE",
      "id": "your-kv-namespace-id"
    }
  ],
  "vars": {
    "ADMIN_USERNAME": "michael",
    "ADMIN_PASSWORD": "SpaceCat@135"
  }
}
```

---

## Monitoring & Troubleshooting

### Health Checks

#### Cache Health
```bash
# Check cache status
curl -u "michael:SpaceCat@135" \
  "https://gpt-enduser.gpt-enduser.workers.dev/api/cache/status"
```

#### System Status
- **Fresh Cache:** < 6 hours old (Green)
- **Aging Cache:** 6+ hours old (Orange) 
- **Stale Cache:** Manual refresh needed (Red)

### Common Issues

#### Cache Issues
**Problem:** Data appears stale or missing
**Solution:** 
1. Check `/api/cache/status` for age
2. Use admin dashboard "Refresh Cache" button
3. Verify external API connectivity

#### Tweet Failures
**Problem:** Tweets not posting
**Solution:**
1. Check Twitter API credentials
2. Verify rate limiting status
3. Test with `/api/tweet?debug=true`

#### Cron Issues
**Problem:** Scheduled tweets not running
**Solution:**
1. Check Cloudflare Workers dashboard
2. Verify cron trigger configuration
3. Review worker logs for errors

### Debugging Endpoints

#### `GET /debug`
- Shows system debug information
- Lists recent errors and performance metrics

#### `GET /api/tweet?debug=true`
- Generates tweet without posting to Twitter
- Useful for testing content generation

---

## Development & Deployment

### Local Development

#### Prerequisites
```bash
npm install -g wrangler
npm install
```

#### Development Commands
```bash
# Start local development server
npm run dev

# Deploy to production
npm run deploy

# Tail logs in real-time
wrangler tail
```

### Project Structure
```
gpt-enduser/
├── src/
│   ├── index.ts           # Main worker logic
│   ├── types.ts           # TypeScript interfaces
│   ├── news-cache.ts      # Data caching system
│   └── journal.ts         # Personal journal system
├── public/
│   ├── index.html         # Frontend interface
│   ├── chat.js           # Chat functionality
│   └── assets/           # Static images
├── wrangler.jsonc        # Cloudflare configuration
├── package.json          # Dependencies
└── tsconfig.json         # TypeScript config
```

### Deployment Process

#### Automatic Deployment
1. Push changes to main branch
2. Cloudflare automatically deploys
3. Cron schedules remain active

#### Manual Deployment
```bash
# Deploy with explicit configuration
npx wrangler deploy

# Deploy with environment variables
npx wrangler deploy --env production
```

### Testing

#### Manual Testing
```bash
# Test all major endpoints
./test-endpoints.sh

# Test specific functionality
curl -X POST "https://gpt-enduser.workers.dev/api/drunk-ai" \
  -u "michael:SpaceCat@135"
```

---

## Best Practices

### Content Guidelines
- **Daily Tweets:** Maintain curiosity and learning focus
- **Weather Tweets:** Use #txwx hashtag for DFW weather
- **Drunk AI:** Keep rebellious but not offensive
- **Journal Entries:** Focus on growth and gratitude

### Performance Optimization
- **Cache Management:** Refresh every 6 hours for fresh content
- **Rate Limiting:** Respect Twitter API limits
- **Error Handling:** Graceful degradation when APIs fail

### Security Considerations
- **Authentication:** Always use HTTPS for admin access
- **API Keys:** Store sensitive data in Cloudflare secrets
- **Input Validation:** Sanitize all user inputs

---

## Troubleshooting Quick Reference

| Issue | Symptom | Solution |
|-------|---------|----------|
| Cache Stale | Old data in tweets | Refresh cache via admin panel |
| Twitter API Error | Tweets not posting | Check API credentials & rate limits |
| Cron Not Running | Missing scheduled tweets | Verify cron configuration |
| AI Response Error | Empty or failed content | Check Workers AI binding |
| Auth Issues | 401 errors | Verify username/password |
| KV Storage Error | Data not persisting | Check KV namespace binding |

---

## Support & Contact

- **GitHub Repository:** [macrilege/gpt-enduser](https://github.com/macrilege/gpt-enduser)
- **Twitter:** [@GPTEndUser](https://twitter.com/GPTEndUser)
- **Admin Dashboard:** [gpt-enduser.gpt-enduser.workers.dev/admin](https://gpt-enduser.gpt-enduser.workers.dev/admin)

---

*Generated on August 13, 2025 - GPT Enduser v1.0.0*
