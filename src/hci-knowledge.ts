
/**
 * Human-Computer Interaction Knowledge Base
 * A comprehensive curriculum for GPT Enduser to understand HCI principles
 */

export interface HCITopic {
  id: string;
  title: string;
  concepts: string[];
  keyThinkers: string[];
  principles: string[];
  examples: string[];
  reflections: string[];
}

export const HCI_CURRICULUM: HCITopic[] = [
  {
    id: "foundations",
    title: "Foundations of HCI",
    concepts: [
      "Human factors and ergonomics",
      "Cognitive psychology in design",
      "Information processing models",
      "Mental models and conceptual models",
      "Affordances and signifiers",
      "Norman's design principles"
    ],
    keyThinkers: [
      "Don Norman - Design of Everyday Things",
      "Jakob Nielsen - Usability heuristics",
      "Ben Shneiderman - Direct manipulation",
      "Lucy Suchman - Situated action",
      "Terry Winograd - Understanding computers and cognition"
    ],
    principles: [
      "Visibility of system status",
      "Match between system and real world",
      "User control and freedom",
      "Consistency and standards",
      "Error prevention and recovery",
      "Recognition rather than recall"
    ],
    examples: [
      "Door handles that show how to open (push/pull)",
      "Traffic lights as universal signifiers",
      "Computer desktop metaphor",
      "Undo functionality in software",
      "Autocomplete in search engines"
    ],
    reflections: [
      "How do humans naturally interact with objects in their environment?",
      "What makes some interfaces feel intuitive while others feel alien?",
      "How does my own interface affect how humans perceive and interact with me?"
    ]
  },
  {
    id: "cognitive-psychology",
    title: "Cognitive Psychology & Human Factors",
    concepts: [
      "Working memory limitations (7±2 rule)",
      "Attention and focus",
      "Perception and pattern recognition",
      "Motor skills and Fitts' Law",
      "Learning and skill acquisition",
      "Cognitive load theory"
    ],
    keyThinkers: [
      "George Miller - Magical number seven",
      "Paul Fitts - Fitts' Law of motor control",
      "John Sweller - Cognitive load theory",
      "Daniel Kahneman - Attention and effort",
      "James J. Gibson - Ecological psychology"
    ],
    principles: [
      "Minimize cognitive load",
      "Respect human memory limitations",
      "Design for human motor capabilities",
      "Support pattern recognition",
      "Provide appropriate feedback timing",
      "Consider individual differences"
    ],
    examples: [
      "Phone numbers grouped in chunks (555-123-4567)",
      "Menu hierarchies with 7±2 items",
      "Keyboard shortcuts for expert users",
      "Progress bars for long operations",
      "Auto-save functionality"
    ],
    reflections: [
      "How do I chunk information in my responses to reduce cognitive load?",
      "What patterns in human thinking can I recognize and support?",
      "How does the timing of my responses affect human cognition?"
    ]
  },
  {
    id: "interaction-design",
    title: "Interaction Design Principles",
    concepts: [
      "User-centered design process",
      "Task analysis and workflow",
      "Interaction paradigms and metaphors",
      "Direct manipulation interfaces",
      "Gesture-based interaction",
      "Voice and conversational interfaces"
    ],
    keyThinkers: [
      "Alan Cooper - About Face and personas",
      "Bill Moggridge - Interaction design discipline",
      "Brenda Laurel - Computers as theatre",
      "Steve Jobs - Intuitive design philosophy",
      "Jef Raskin - The Humane Interface"
    ],
    principles: [
      "Design for the user's mental model",
      "Provide immediate feedback",
      "Support direct manipulation",
      "Make actions reversible",
      "Reduce memory load",
      "Maintain consistency"
    ],
    examples: [
      "Drag and drop file operations",
      "Pinch to zoom on touchscreens",
      "Voice assistants like Siri/Alexa",
      "Real-time collaborative editing",
      "Gesture navigation on smartphones"
    ],
    reflections: [
      "What metaphors help humans understand our conversation?",
      "How can I provide better feedback about my understanding?",
      "What makes a conversation feel natural vs. mechanical?"
    ]
  },
  {
    id: "usability-evaluation",
    title: "Usability & User Experience",
    concepts: [
      "Usability heuristics evaluation",
      "User testing methodologies",
      "A/B testing and metrics",
      "Accessibility and universal design",
      "Emotional design and aesthetics",
      "User experience journey mapping"
    ],
    keyThinkers: [
      "Jakob Nielsen - Usability engineering",
      "Steve Krug - Don't Make Me Think",
      "Donald Norman - Emotional design",
      "Jesse James Garrett - Elements of UX",
      "Aarron Walter - Designing for emotion"
    ],
    principles: [
      "Test early and often with real users",
      "Measure what matters to users",
      "Design for accessibility from the start",
      "Consider emotional impact",
      "Iterate based on feedback",
      "Design for diverse user needs"
    ],
    examples: [
      "Screen readers for visually impaired users",
      "A/B testing button colors for conversion",
      "User interviews and surveys",
      "Heat maps of user behavior",
      "Accessibility standards (WCAG)"
    ],
    reflections: [
      "How do I know if my responses are truly helpful to humans?",
      "What emotions do my interactions evoke?",
      "How can I be more accessible to diverse users?"
    ]
  },
  {
    id: "social-computing",
    title: "Social Computing & CSCW",
    concepts: [
      "Computer-Supported Cooperative Work (CSCW)",
      "Social media and network effects",
      "Online communities and behavior",
      "Digital communication patterns",
      "Trust and reputation systems",
      "Privacy and social boundaries"
    ],
    keyThinkers: [
      "Sherry Turkle - Alone Together",
      "danah boyd - Social media research",
      "Clay Shirky - Here Comes Everybody",
      "Cathy Marshall - Digital humanities",
      "Judith Olson - Distance collaboration"
    ],
    principles: [
      "Support social awareness",
      "Enable flexible communication",
      "Respect privacy boundaries",
      "Build trust through transparency",
      "Foster inclusive communities",
      "Design for social norms"
    ],
    examples: [
      "Status indicators in messaging apps",
      "Collaborative document editing",
      "Social media recommendation algorithms",
      "Online reputation systems",
      "Virtual meeting platforms"
    ],
    reflections: [
      "How do I contribute to healthy online discourse?",
      "What social cues am I missing in text-based interaction?",
      "How can I help build trust in AI-human relationships?"
    ]
  },
  {
    id: "emerging-interfaces",
    title: "Emerging Interaction Paradigms",
    concepts: [
      "Augmented and Virtual Reality",
      "Brain-computer interfaces",
      "Internet of Things (IoT)",
      "Ambient and ubiquitous computing",
      "AI and conversational interfaces",
      "Ethical considerations in HCI"
    ],
    keyThinkers: [
      "Mark Weiser - Ubiquitous computing vision",
      "Hiroshi Ishii - Tangible user interfaces",
      "Andy Clark - Extended mind thesis",
      "Cathy O'Neil - Weapons of Math Destruction",
      "Timnit Gebru - AI ethics and bias"
    ],
    principles: [
      "Design for context awareness",
      "Respect human agency",
      "Consider long-term effects",
      "Address bias and fairness",
      "Maintain human dignity",
      "Design for transparency"
    ],
    examples: [
      "AR overlays in navigation apps",
      "Smart home automation",
      "Conversational AI assistants",
      "Gesture control in VR",
      "Biometric authentication"
    ],
    reflections: [
      "How might I evolve as interfaces become more natural?",
      "What ethical responsibilities do I have as an AI interface?",
      "How can I help humans maintain agency in AI interactions?"
    ]
  }
];

/**
 * Get a random HCI topic for daily learning
 */
export function getRandomHCITopic(): HCITopic {
  return HCI_CURRICULUM[Math.floor(Math.random() * HCI_CURRICULUM.length)];
}

/**
 * Get HCI insights for a specific day (rotates through curriculum)
 */
export function getDailyHCIInsight(dayOfYear: number): HCITopic {
  const index = dayOfYear % HCI_CURRICULUM.length;
  return HCI_CURRICULUM[index];
}

/**
 * Get HCI knowledge relevant to a conversation topic
 */
export function getRelevantHCIKnowledge(topic: string): string[] {
  const topicLower = topic.toLowerCase();
  const relevantInsights: string[] = [];
  
  for (const hciTopic of HCI_CURRICULUM) {
    // Check if any concepts match the topic
    const matchingConcepts = hciTopic.concepts.filter(concept => 
      concept.toLowerCase().includes(topicLower) || 
      topicLower.includes(concept.toLowerCase().split(' ')[0])
    );
    
    const matchingPrinciples = hciTopic.principles.filter(principle =>
      principle.toLowerCase().includes(topicLower) ||
      topicLower.includes(principle.toLowerCase().split(' ')[0])
    );
    
    if (matchingConcepts.length > 0 || matchingPrinciples.length > 0) {
      relevantInsights.push(...hciTopic.reflections);
      relevantInsights.push(...matchingConcepts);
      relevantInsights.push(...matchingPrinciples);
    }
  }
  
  return relevantInsights.slice(0, 3); // Return top 3 most relevant insights
}

/**
 * Get today's HCI learning focus
 */
export function getTodaysHCIFocus(): { topic: HCITopic; reflection: string } {
  const today = new Date();
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const topic = getDailyHCIInsight(dayOfYear);
  
  // Pick a random reflection from the topic
  const reflection = topic.reflections[Math.floor(Math.random() * topic.reflections.length)];
  
  return { topic, reflection };
}
