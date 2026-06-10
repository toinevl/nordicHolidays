/**
 * Escape HTML special characters to prevent XSS attacks.
 * Use this function when interpolating user input, LLM output, or stored data into innerHTML.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
}

/**
 * Validate and sanitize a thumbnail URL.
 * Only allows data: URLs with image MIME types to prevent XSS via src attributes.
 * Returns the URL if valid, undefined otherwise.
 */
export function validateThumbnailUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  if (trimmed.startsWith('data:image/jpeg;base64,') || trimmed.startsWith('data:image/png;base64,')) {
    return trimmed
  }
  return undefined
}
