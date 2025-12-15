/**
 * Utility functions for detecting and parsing @username mentions in chat messages
 */

/**
 * Detects if a message contains a mention of the given username
 * @param message - The chat message text
 * @param username - The username to check for (case-insensitive)
 * @returns true if message contains @username
 */
export function containsMention(message: string, username: string): boolean {
  if (!username || !message || username.trim() === '') {
    return false;
  }
  
  // Escape special regex characters in username
  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Case-insensitive regex: @username (word boundary to avoid partial matches)
  // Word boundary ensures @greg doesn't match @gregory
  const mentionPattern = new RegExp(`@${escapedUsername}\\b`, 'i');
  return mentionPattern.test(message);
}

/**
 * Extracts all @mentions from a message
 * @param message - The chat message text
 * @returns Array of mentioned usernames (without @)
 */
export function extractMentions(message: string): string[] {
  if (!message) return [];
  
  const mentionPattern = /@(\w+)/g;
  const mentions: string[] = [];
  let match;
  
  while ((match = mentionPattern.exec(message)) !== null) {
    mentions.push(match[1]);
  }
  
  return [...new Set(mentions)]; // Remove duplicates
}
