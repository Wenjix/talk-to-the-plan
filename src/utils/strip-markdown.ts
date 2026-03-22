/**
 * Strip markdown formatting from text for clean TTS output.
 * Removes bold, italic, headings, code blocks, links, lists, blockquotes, etc.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // Fenced code blocks (``` ... ```)
      .replace(/```[\s\S]*?```/g, '')
      // Inline code
      .replace(/`([^`]+)`/g, '$1')
      // Headings (# ... ######)
      .replace(/^#{1,6}\s+/gm, '')
      // Bold + italic (***text*** or ___text___)
      .replace(/(\*{3}|_{3})(.+?)\1/g, '$2')
      // Bold (**text** or __text__)
      .replace(/(\*{2}|_{2})(.+?)\1/g, '$2')
      // Italic (*text* or _text_)
      .replace(/(\*|_)(.+?)\1/g, '$2')
      // Strikethrough (~~text~~)
      .replace(/~~(.+?)~~/g, '$1')
      // Links [text](url)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Images ![alt](url)
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Blockquotes
      .replace(/^>\s+/gm, '')
      // Unordered list markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      // Ordered list markers
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // HTML tags
      .replace(/<[^>]+>/g, '')
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
