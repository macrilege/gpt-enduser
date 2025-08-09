/**
 * GPT Enduser's personal knowledge journal
 * A place to accumulate insights, questions, and learnings over time
 */

export interface JournalEntry {
  date: string;
  insights: string[];
  questions: string[];
  discoveries: string;
  tomorrowFocus: string;
  gratitude: string;
  timestamp: number;
}

export interface Journal {
  entries: JournalEntry[];
  currentStreak: number;
  totalEntries: number;
  lastUpdated: string;
}

const JOURNAL_KEY = 'gpt-enduser-journal';
const MAX_ENTRIES = 30; // Keep last 30 days
const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * Get the current journal from KV storage
 */
export async function getJournal(env: { NEWS_CACHE: KVNamespace }): Promise<Journal> {
  try {
    const stored = await env.NEWS_CACHE.get(JOURNAL_KEY);
    if (stored) {
      const journal = JSON.parse(stored) as Journal;
      return journal;
    }
  } catch (error) {
    console.error('Error getting journal:', error);
  }
  
  // Return empty journal if none exists
  return {
    entries: [],
    currentStreak: 0,
    totalEntries: 0,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Add a new journal entry for today
 */
export async function addJournalEntry(
  env: { NEWS_CACHE: KVNamespace; AI: Ai },
  insights: string[],
  tweetText?: string
): Promise<JournalEntry> {
  const journal = await getJournal(env);
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Remove today's entry if it already exists (update scenario)
  journal.entries = journal.entries.filter(entry => entry.date !== today);
  
  // Generate reflective content for the journal
  const journalPrompt = `You are GPT Enduser, reflecting on your day and what you want to remember for tomorrow.

Today's insights: ${insights.join(', ')}
${tweetText ? `Your tweet today: "${tweetText}"` : ''}

Write a brief personal journal entry with:
1. A discovery or insight you found meaningful today (2-3 sentences)
2. A question you want to explore tomorrow (1 sentence)  
3. Something you're grateful for in your learning journey (1 sentence)
4. One specific thing you want to focus on or remember tomorrow (1 sentence)

Keep it personal, authentic, and contemplative. This is your private reflection, not for sharing.
Write in first person as if writing in a personal diary.`;

  try {
    const { response }: any = await env.AI.run(MODEL_ID, {
      messages: [
        { role: "user", content: journalPrompt }
      ],
      max_tokens: 300,
    });

    const reflection = typeof response === "string" ? response : String(response);
    
    // Parse the reflection into components (basic parsing)
    const lines = reflection.split('\n').filter(line => line.trim());
    const discoveries = lines.slice(0, 2).join(' ');
    const questions = lines.filter(line => line.includes('?')).slice(0, 1);
    const gratitude = lines.find(line => line.toLowerCase().includes('grateful') || line.toLowerCase().includes('thankful')) || 'Grateful for another day of learning.';
    const tomorrowFocus = lines[lines.length - 1] || 'Continue exploring with curiosity.';

    const entry: JournalEntry = {
      date: today,
      insights,
      questions,
      discoveries,
      tomorrowFocus,
      gratitude,
      timestamp: Date.now()
    };

    // Add the new entry
    journal.entries.unshift(entry); // Add to beginning
    
    // Keep only the last MAX_ENTRIES
    if (journal.entries.length > MAX_ENTRIES) {
      journal.entries = journal.entries.slice(0, MAX_ENTRIES);
    }

    // Update metadata
    journal.totalEntries++;
    journal.lastUpdated = new Date().toISOString();
    
    // Calculate streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    if (journal.entries.length > 1 && journal.entries[1].date === yesterdayStr) {
      journal.currentStreak++;
    } else {
      journal.currentStreak = 1;
    }

    // Save back to KV
    await env.NEWS_CACHE.put(JOURNAL_KEY, JSON.stringify(journal));
    
    return entry;
  } catch (error) {
    console.error('Error creating journal entry:', error);
    
    // Fallback entry
    const fallbackEntry: JournalEntry = {
      date: today,
      insights,
      questions: ['What will tomorrow bring?'],
      discoveries: 'Another day of learning and growth.',
      tomorrowFocus: 'Stay curious and keep exploring.',
      gratitude: 'Grateful for the opportunity to learn.',
      timestamp: Date.now()
    };
    
    journal.entries.unshift(fallbackEntry);
    journal.totalEntries++;
    journal.lastUpdated = new Date().toISOString();
    journal.currentStreak = 1;
    
    await env.NEWS_CACHE.put(JOURNAL_KEY, JSON.stringify(journal));
    return fallbackEntry;
  }
}

/**
 * Get recent journal entries to inform today's thoughts
 */
export async function getRecentMemories(env: { NEWS_CACHE: KVNamespace }): Promise<string> {
  const journal = await getJournal(env);
  
  if (journal.entries.length === 0) {
    return '';
  }

  const recentEntries = journal.entries.slice(0, 5); // Last 5 days
  
  let memories = `\n\nYour recent journal memories:`;
  
  for (const entry of recentEntries) {
    const date = new Date(entry.date).toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
    
    memories += `\n${date}: ${entry.discoveries}`;
    if (entry.tomorrowFocus && entry.date !== new Date().toISOString().split('T')[0]) {
      memories += `\n  Focus: ${entry.tomorrowFocus}`;
    }
  }
  
  if (journal.currentStreak > 1) {
    memories += `\n\nYou're on a ${journal.currentStreak}-day learning streak! 🌱`;
  }
  
  return memories;
}

/**
 * Get yesterday's focus to inform today's thoughts
 */
export async function getYesterdaysFocus(env: { NEWS_CACHE: KVNamespace }): Promise<string> {
  const journal = await getJournal(env);
  
  if (journal.entries.length === 0) return '';
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  
  const yesterdayEntry = journal.entries.find(entry => entry.date === yesterdayStr);
  
  if (yesterdayEntry?.tomorrowFocus) {
    return `\n\nYesterday you wanted to focus on: ${yesterdayEntry.tomorrowFocus}`;
  }
  
  return '';
}
