import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Itinerary } from '../types'
import {
  itineraryToGPX,
  itineraryToICS,
  itineraryToGoogleMapsUrl,
  itineraryToWazeUrl,
  downloadFile,
} from './export'

const sampleItinerary: Itinerary = {
  title: 'Nordic Adventure',
  totalDays: 7,
  startCity: 'Stockholm',
  endCity: 'Oslo',
  generatedAt: '2026-07-02T00:00:00Z',
  stops: [
    {
      day: 1,
      city: 'Stockholm',
      region: 'Uppland',
      lat: 59.3293,
      lng: 18.0686,
      nights: 2,
      highlights: ['Old Town', 'Vasa Museum'],
      accommodation: 'Hotel A',
      culinaryNotes: 'Swedish meatballs',
    },
    {
      day: 2,
      city: 'Uppsala',
      region: 'Uppland',
      lat: 59.8586,
      lng: 17.6389,
      nights: 1,
      highlights: ['Cathedral', 'University'],
      accommodation: 'Hotel B',
      culinaryNotes: 'Local cuisine',
    },
    {
      day: 4,
      city: 'Oslo',
      region: 'Oslo',
      lat: 59.9139,
      lng: 10.7522,
      nights: 0,
      highlights: ['Opera House', 'Vigeland Park'],
      accommodation: 'Hotel C',
      culinaryNotes: 'Norwegian fish',
    },
  ],
}

describe('GPX Export', () => {
  it('generates valid GPX 1.1 XML structure', () => {
    const gpx = itineraryToGPX(sampleItinerary)
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(gpx).toContain('<gpx version="1.1"')
    expect(gpx).toContain('</gpx>')
  })

  it('includes metadata with title and description', () => {
    const gpx = itineraryToGPX(sampleItinerary)
    expect(gpx).toContain('<name>Nordic Adventure</name>')
    expect(gpx).toContain('Stockholm to Oslo - 7 days')
  })

  it('creates waypoints for each stop', () => {
    const gpx = itineraryToGPX(sampleItinerary)
    const wptCount = (gpx.match(/<wpt /g) || []).length
    expect(wptCount).toBe(3)
  })

  it('includes correct coordinates in waypoints', () => {
    const gpx = itineraryToGPX(sampleItinerary)
    expect(gpx).toContain('lat="59.3293" lon="18.0686"')
    expect(gpx).toContain('lat="59.8586" lon="17.6389"')
    expect(gpx).toContain('lat="59.9139" lon="10.7522"')
  })

  it('includes city names in waypoint names', () => {
    const gpx = itineraryToGPX(sampleItinerary)
    expect(gpx).toContain('<name>Stockholm</name>')
    expect(gpx).toContain('<name>Uppsala</name>')
    expect(gpx).toContain('<name>Oslo</name>')
  })

  it('includes day information in waypoint descriptions', () => {
    const gpx = itineraryToGPX(sampleItinerary)
    expect(gpx).toContain('Day 1:')
    expect(gpx).toContain('Day 2:')
    expect(gpx).toContain('Day 4:')
  })

  it('includes highlights in descriptions', () => {
    const gpx = itineraryToGPX(sampleItinerary)
    expect(gpx).toContain('Old Town, Vasa Museum')
  })

  it('escapes XML special characters in city names', () => {
    const itinerary: Itinerary = {
      ...sampleItinerary,
      stops: [
        {
          ...sampleItinerary.stops[0],
          city: 'City & Town <Special>',
        },
      ],
    }
    const gpx = itineraryToGPX(itinerary)
    expect(gpx).toContain('City &amp; Town &lt;Special&gt;')
  })

  it('includes city symbol in waypoints', () => {
    const gpx = itineraryToGPX(sampleItinerary)
    expect(gpx).toContain('<sym>city</sym>')
  })
})

describe('iCalendar Export', () => {
  it('generates valid iCalendar structure', () => {
    const ics = itineraryToICS(sampleItinerary)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
  })

  it('includes required iCalendar headers', () => {
    const ics = itineraryToICS(sampleItinerary)
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('PRODID:-//Fjordvia//EN')
    expect(ics).toContain('CALSCALE:GREGORIAN')
    expect(ics).toContain('METHOD:PUBLISH')
  })

  it('includes calendar name from itinerary title', () => {
    const ics = itineraryToICS(sampleItinerary)
    expect(ics).toContain('X-WR-CALNAME:Nordic Adventure')
  })

  it('creates events for each stop', () => {
    const ics = itineraryToICS(sampleItinerary)
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length
    expect(eventCount).toBe(3)
  })

  it('each event has required fields', () => {
    const ics = itineraryToICS(sampleItinerary)
    const events = ics.split('BEGIN:VEVENT')
    // Check each event has required fields (skip the first split which is before any event)
    for (let i = 1; i < events.length; i++) {
      expect(events[i]).toContain('UID:')
      expect(events[i]).toContain('DTSTAMP:')
      expect(events[i]).toContain('DTSTART;VALUE=DATE:')
      expect(events[i]).toContain('SUMMARY:')
      expect(events[i]).toContain('END:VEVENT')
    }
  })

  it('includes city names in event summaries', () => {
    const ics = itineraryToICS(sampleItinerary)
    expect(ics).toContain('SUMMARY:Stockholm')
    expect(ics).toContain('SUMMARY:Uppsala')
    expect(ics).toContain('SUMMARY:Oslo')
  })

  it('includes night information in summaries', () => {
    const ics = itineraryToICS(sampleItinerary)
    expect(ics).toContain('Stockholm (2 nights)')
    expect(ics).toContain('Uppsala (1 night)')
    expect(ics).toContain('Oslo (day trip)')
  })

  it('includes highlights in descriptions', () => {
    const ics = itineraryToICS(sampleItinerary)
    expect(ics).toContain('DESCRIPTION:Old Town\\; Vasa Museum')
    expect(ics).toContain('DESCRIPTION:Cathedral\\; University')
  })

  it('includes location with city and region', () => {
    const ics = itineraryToICS(sampleItinerary)
    expect(ics).toContain('LOCATION:Stockholm, Uppland')
    expect(ics).toContain('LOCATION:Uppsala, Uppland')
  })

  it('calculates correct dates based on day numbers', () => {
    const ics = itineraryToICS(sampleItinerary)
    // Day 1 should be 2026-07-02 (the generatedAt date)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260702')
    // Day 2 should be 2026-07-03
    expect(ics).toContain('DTSTART;VALUE=DATE:20260703')
    // Day 4 should be 2026-07-05
    expect(ics).toContain('DTSTART;VALUE=DATE:20260705')
  })

  it('escapes special characters in ICS format', () => {
    const itinerary: Itinerary = {
      ...sampleItinerary,
      stops: [
        {
          ...sampleItinerary.stops[0],
          city: 'City; with, special\\chars',
        },
      ],
    }
    const ics = itineraryToICS(itinerary)
    expect(ics).toContain('City\\; with\\, special\\\\chars')
  })

  it('handles itineraries without generatedAt gracefully', () => {
    const itinerary: Itinerary = {
      ...sampleItinerary,
      generatedAt: 'invalid-date',
    }
    const ics = itineraryToICS(itinerary)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
  })

  it('generates unique UIDs for each event', () => {
    const ics = itineraryToICS(sampleItinerary)
    const uids = (ics.match(/UID:[^\n]+/g) || []).map((u) => u.replace('UID:', ''))
    expect(uids.length).toBe(3)
    expect(new Set(uids).size).toBe(3) // All unique
  })
})

describe('itineraryToGoogleMapsUrl', () => {
  it('returns the Google Maps homepage for an empty itinerary', () => {
    const empty: Itinerary = { ...sampleItinerary, stops: [] }
    expect(itineraryToGoogleMapsUrl(empty)).toBe('https://www.google.com/maps')
  })

  it('uses the first stop as origin and last as destination', () => {
    const url = itineraryToGoogleMapsUrl(sampleItinerary)
    expect(url).toContain('origin=59.3293%2C18.0686')
    expect(url).toContain('destination=59.9139%2C10.7522')
  })

  it('includes middle stops as pipe-separated waypoints', () => {
    const url = itineraryToGoogleMapsUrl(sampleItinerary)
    // Uppsala is the sole middle stop
    expect(url).toContain('waypoints=59.8586%2C17.6389')
  })

  it('omits waypoints when there are exactly two stops', () => {
    const twoStop: Itinerary = {
      ...sampleItinerary,
      stops: [sampleItinerary.stops[0], sampleItinerary.stops[2]],
    }
    const url = itineraryToGoogleMapsUrl(twoStop)
    expect(url).not.toContain('waypoints')
    expect(url).toContain('origin=59.3293%2C18.0686')
    expect(url).toContain('destination=59.9139%2C10.7522')
  })

  it('omits waypoints when there is only one stop', () => {
    const oneStop: Itinerary = {
      ...sampleItinerary,
      stops: [sampleItinerary.stops[0]],
    }
    const url = itineraryToGoogleMapsUrl(oneStop)
    expect(url).not.toContain('waypoints')
    // origin and destination are the same stop
    expect(url).toContain('origin=59.3293%2C18.0686')
    expect(url).toContain('destination=59.3293%2C18.0686')
  })

  it('uses the driving travelmode', () => {
    const url = itineraryToGoogleMapsUrl(sampleItinerary)
    expect(url).toContain('travelmode=driving')
  })

  it('builds a URL with the /dir/ path and query string', () => {
    const url = itineraryToGoogleMapsUrl(sampleItinerary)
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/)
  })

  it('joins multiple waypoints with encoded pipe characters', () => {
    const fourStop: Itinerary = {
      ...sampleItinerary,
      stops: [
        { ...sampleItinerary.stops[0], city: 'A' },
        { ...sampleItinerary.stops[1], city: 'B' },
        {
          day: 3,
          city: 'Gävle',
          region: 'Gävleborg',
          lat: 60.6745,
          lng: 17.1413,
          nights: 1,
          highlights: [],
          accommodation: 'Hotel D',
          culinaryNotes: '',
        },
        { ...sampleItinerary.stops[2], city: 'D' },
      ],
    }
    const url = itineraryToGoogleMapsUrl(fourStop)
    // Two middle stops → waypoints joined by %7C (encoded pipe)
    expect(url).toContain('waypoints=59.8586%2C17.6389%7C60.6745%2C17.1413')
  })
})

describe('itineraryToWazeUrl', () => {
  it('returns the Waze homepage for an empty itinerary', () => {
    const empty: Itinerary = { ...sampleItinerary, stops: [] }
    expect(itineraryToWazeUrl(empty)).toBe('https://waze.com')
  })

  it('navigates to the last stop coordinates', () => {
    const url = itineraryToWazeUrl(sampleItinerary)
    expect(url).toContain('ll=59.9139%2C10.7522')
    expect(url).toContain('navigate=yes')
  })

  it('uses the waze.com/ul deep-link format', () => {
    const url = itineraryToWazeUrl(sampleItinerary)
    expect(url).toMatch(/^https:\/\/waze\.com\/ul\?/)
  })

  it('only targets the final destination, ignoring earlier stops', () => {
    const url = itineraryToWazeUrl(sampleItinerary)
    // Stockholm (first stop) should not appear in the URL
    expect(url).not.toContain('59.3293')
    expect(url).not.toContain('18.0686')
  })

  it('handles a single-stop itinerary by navigating to that stop', () => {
    const oneStop: Itinerary = {
      ...sampleItinerary,
      stops: [sampleItinerary.stops[0]],
    }
    const url = itineraryToWazeUrl(oneStop)
    expect(url).toContain('ll=59.3293%2C18.0686')
    expect(url).toContain('navigate=yes')
  })
})

describe('downloadFile', () => {
  beforeEach(() => {
    // Mock URL.createObjectURL and URL.revokeObjectURL for testing
    ;(global.URL as any).createObjectURL = vi.fn(() => 'blob:mock-url')
    ;(global.URL as any).revokeObjectURL = vi.fn()
  })

  it('does not throw when called with valid parameters', () => {
    expect(() => {
      downloadFile('test.gpx', 'test content', 'application/gpx+xml')
    }).not.toThrow()
  })

  it('handles different MIME types', () => {
    expect(() => {
      downloadFile('test.ics', 'test content', 'text/calendar')
    }).not.toThrow()

    expect(() => {
      downloadFile('test.gpx', 'test content', 'application/gpx+xml')
    }).not.toThrow()
  })

  it('accepts filenames with various characters', () => {
    expect(() => {
      downloadFile('my-nordic-trip_2024.gpx', 'content', 'application/gpx+xml')
    }).not.toThrow()

    expect(() => {
      downloadFile('Nordic Adventure 2024.ics', 'content', 'text/calendar')
    }).not.toThrow()
  })

  it('calls URL.createObjectURL to create blob URL', () => {
    downloadFile('test.gpx', 'test content', 'application/gpx+xml')
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('calls URL.revokeObjectURL to clean up', () => {
    downloadFile('test.gpx', 'test content', 'application/gpx+xml')
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
})
