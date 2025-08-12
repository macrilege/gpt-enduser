// Simple script to fetch @GPTEndUser's journal
// Run this in browser console or Node.js

async function getGPTEndUserJournal() {
  try {
    const response = await fetch('https://gpt-enduser.gpt-enduser.workers.dev/api/journal', {
      headers: {
        // Basic auth with provided credentials
        'Authorization': 'Basic ' + btoa('michael:SpaceCat@135')
      }
    });
    
    if (response.ok) {
      const journal = await response.json();
      console.log('📖 GPT Enduser Journal:');
      console.log(`📊 Total Entries: ${journal.totalEntries}`);
      console.log(`🔥 Current Streak: ${journal.currentStreak} days`);
      console.log(`📅 Last Updated: ${journal.lastUpdated}`);
      console.log('\n--- Recent Entries ---\n');
      
      journal.entries.slice(0, 5).forEach((entry, index) => {
        console.log(`\n📖 ${entry.date} (${index + 1} days ago):`);
        console.log(`💡 Discovery: ${entry.discoveries}`);
        console.log(`❓ Questions: ${entry.questions.join(', ')}`);
        console.log(`🎯 Tomorrow Focus: ${entry.tomorrowFocus}`);
        console.log(`🙏 Gratitude: ${entry.gratitude}`);
      });
      
      return journal;
    } else {
      console.error('Failed to fetch journal:', response.status);
    }
  } catch (error) {
    console.error('Error fetching journal:', error);
  }
}

// Call the function
getGPTEndUserJournal();
