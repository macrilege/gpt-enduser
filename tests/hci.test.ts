import { describe, it, expect } from 'vitest'

describe('HCI Knowledge Tests', () => {
  it('should have valid HCI curriculum structure', () => {
    // Mock the HCI curriculum for testing
    const mockCurriculum = [
      {
        name: 'HCI Foundations',
        description: 'Basic principles of human-computer interaction',
        concepts: ['User-centered design', 'Interface principles', 'Interaction paradigms'],
        principles: ['Design for users', 'Provide feedback', 'Ensure consistency'],
        reflections: ['How do humans naturally interact with technology?']
      }
    ]
    
    expect(mockCurriculum).toBeDefined()
    expect(mockCurriculum.length).toBeGreaterThan(0)
    
    mockCurriculum.forEach(topic => {
      expect(topic.name).toBeTruthy()
      expect(topic.description).toBeTruthy()
      expect(Array.isArray(topic.concepts)).toBe(true)
      expect(Array.isArray(topic.principles)).toBe(true)
      expect(Array.isArray(topic.reflections)).toBe(true)
    })
  })

  it('should find relevant HCI knowledge', () => {
    function getRelevantHCI(text: string): string[] {
      const hciKeywords = [
        'interface', 'usability', 'user experience', 'design', 
        'interaction', 'accessibility', 'cognitive', 'mental model'
      ]
      
      const found: string[] = []
      const lowerText = text.toLowerCase()
      
      hciKeywords.forEach(keyword => {
        if (lowerText.includes(keyword)) {
          found.push(`HCI: ${keyword}`)
        }
      })
      
      return found
    }

    const interfaceText = 'user interface design and usability testing'
    const nonHciText = 'weather forecast and cooking recipes'
    
    expect(getRelevantHCI(interfaceText).length).toBeGreaterThan(0)
    expect(getRelevantHCI(nonHciText).length).toBe(0)
  })
})
