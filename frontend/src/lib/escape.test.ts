import { describe, it, expect } from 'vitest'
import { escapeHtml, validateThumbnailUrl } from './escape'

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;')
  })

  it('escapes ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("It's dangerous")).toBe('It&#39;s dangerous')
  })

  it('escapes all dangerous characters together', () => {
    expect(escapeHtml('<img src=x onerror="alert(\'xss\')">')).toBe('&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;')
  })

  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123')
  })

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('')
  })
})

describe('validateThumbnailUrl', () => {
  it('accepts valid JPEG data URIs', () => {
    const validJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABA...'
    expect(validateThumbnailUrl(validJpeg)).toBe(validJpeg)
  })

  it('accepts valid PNG data URIs', () => {
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANS...'
    expect(validateThumbnailUrl(validPng)).toBe(validPng)
  })

  it('rejects HTTP URLs', () => {
    expect(validateThumbnailUrl('https://example.com/image.jpg')).toBeUndefined()
  })

  it('rejects javascript: URLs', () => {
    expect(validateThumbnailUrl('javascript:alert(1)')).toBeUndefined()
  })

  it('rejects data URLs with other MIME types', () => {
    expect(validateThumbnailUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
  })

  it('rejects undefined', () => {
    expect(validateThumbnailUrl(undefined)).toBeUndefined()
  })

  it('rejects empty string', () => {
    expect(validateThumbnailUrl('')).toBeUndefined()
  })

  it('trims whitespace before validation', () => {
    const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANS...'
    expect(validateThumbnailUrl(`  ${validPng}  `)).toBe(validPng)
  })
})
