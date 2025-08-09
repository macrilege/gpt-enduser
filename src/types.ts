/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
  /**
   * Binding for the Workers AI API.
   */
  AI: Ai;

  /**
   * Binding for static assets.
   */
  ASSETS: { fetch: (request: Request) => Promise<Response> };

  /**
   * KV storage for caching news and crypto data.
   */
  NEWS_CACHE: KVNamespace;

  /**
   * Twitter/X OAuth 1.0a (User context) - required for posting tweets
   */
  TWITTER_API_KEY: string; // Consumer Key
  TWITTER_API_SECRET: string; // Consumer Secret
  TWITTER_ACCESS_TOKEN: string; // Access Token
  TWITTER_ACCESS_SECRET: string; // Access Token Secret

  /**
   * Optional admin token for protected manual triggers.
   */
  ADMIN_TOKEN?: string;

  /**
   * Basic authentication credentials for admin pages.
   */
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

/**
 * Represents a chat message.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
