import type { Itinerary } from '../types'

/**
 * Download a file to the user's device by creating a Blob and temporary anchor element.
 */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/**
 * Convert an Itinerary to GPX 1.1 format with waypoints for each stop.
 * Each stop becomes a waypoint with coordinates, name, and description.
 */
export function itineraryToGPX(itinerary: Itinerary): string {
  const now = new Date().toISOString()

  const waypoints = itinerary.stops
    .map((stop) => {
      const description = `Day ${stop.day}${stop.highlights.length > 0 ? ': ' + stop.highlights.join(', ') : ''}`
      return `  <wpt lat="${stop.lat}" lon="${stop.lng}">
    <name>${escapeXml(stop.city)}</name>
    <desc>${escapeXml(description)}</desc>
    <sym>city</sym>
  </wpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Nordic Holidays" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(itinerary.title)}</name>
    <desc>${escapeXml(itinerary.startCity)} to ${escapeXml(itinerary.endCity)} - ${itinerary.totalDays} days</desc>
    <time>${now}</time>
  </metadata>
${waypoints}
</gpx>`
}

/**
 * Convert an Itinerary to iCalendar (iCal) format with events for each stop.
 * Attempts to calculate dates based on generatedAt timestamp and day numbers.
 */
export function itineraryToICS(itinerary: Itinerary): string {
  // Parse the generatedAt date as the trip start date
  // If not available, use today
  let startDate: Date
  try {
    startDate = new Date(itinerary.generatedAt)
    // If parsing failed or date is invalid, use today
    if (isNaN(startDate.getTime())) {
      startDate = new Date()
    }
  } catch {
    startDate = new Date()
  }

  const events = itinerary.stops
    .map((stop) => {
      // Calculate the date for this stop based on the day number
      const eventDate = new Date(startDate)
      eventDate.setDate(eventDate.getDate() + stop.day - 1)

      const dateStr = formatIcsDate(eventDate)
      const summary = `${stop.city}${stop.nights > 0 ? ` (${stop.nights} night${stop.nights === 1 ? '' : 's'})` : ' (day trip)'}`
      const description = stop.highlights.join('; ')
      const uid = `stop-${stop.day}-${Math.random().toString(36).substr(2, 9)}@nordicholidays.local`

      return `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatIcsDateTime(new Date())}
DTSTART;VALUE=DATE:${dateStr}
SUMMARY:${escapeIcs(summary)}
DESCRIPTION:${escapeIcs(description)}
LOCATION:${escapeIcs(stop.city)}, ${escapeIcs(stop.region)}
END:VEVENT`
    })
    .join('\n')

  const now = formatIcsDateTime(new Date())
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nordic Holidays//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${escapeIcs(itinerary.title)}
X-WR-TIMEZONE:UTC
DTSTAMP:${now}
${events}
END:VCALENDAR`
}

/**
 * Escape special characters for iCalendar format.
 * Per RFC 5545, special characters in parameter and property values must be escaped.
 */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

/**
 * Escape XML special characters.
 */
function escapeXml(value: string): string {
  return value
    .replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }[char] ?? char))
}

/**
 * Format a Date object as iCalendar datetime string (YYYYMMDDTHHMMSSZ format).
 */
function formatIcsDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  )
}

/**
 * Format a Date object as iCalendar date string (YYYYMMDD format).
 */
function formatIcsDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate())
}
