import type { ApiRegionConfig } from './types'

/**
 * Nordic region configuration.
 *
 * Extracted from the original hardcoded values in generate.ts so that
 * additional regions (e.g. US) can be added without touching the
 * generation handler.
 */
export const nordicConfig: ApiRegionConfig = {
  countries: {
    SE: 'Sweden',
    NO: 'Norway',
    DK: 'Denmark',
    FI: 'Finland',
  },

  defaultCountry: 'SE',

  regionLabel: 'Nordic',

  borderConstraint: 'do not cross international borders',

  /**
   * Seasonal context for Nordic countries by month.
   * Gives the LLM concrete conditions to tailor recommendations against,
   * instead of a hardcoded "September is peak season" line.
   */
  seasonalContext: {
    1:  'January — mid-winter. Short daylight (5-7h in south, polar night in north). Snow and ice throughout; winter tyres required, some mountain passes closed. Activities: skiing, aurora viewing, ice hotels, dog sledding. Many seasonal attractions closed.',
    2:  'February — late winter. Still cold and snowy; daylight increasing. Good for winter sports, aurora (north), snow festivals. Mountain roads remain closed.',
    3:  'March — late winter / early spring. Longer days (9-11h). Peak skiing season. Snow still covers most of the north; roads may still have winter conditions. Southern coasts beginning to thaw.',
    4:  'April — spring transition. Variable weather; snow melting in lowlands, still present in mountains. Some roads and ferries start opening. Early spring flowers in south. Unpredictable — pack layers.',
    5:  'May — spring. Long daylight (15-18h). Trees leafing out, mild days, cool nights. Most roads open. Ferry routes resuming. Good for hiking and city breaks; still quiet before peak season.',
    6:  'June — early summer. Near-maximum daylight (18-20h south, midnight sun north). Everything open. Peak for hiking, coastal drives, island hopping. Long days; book accommodations early.',
    7:  'July — peak summer. Warmest month, long daylight. All attractions, ferries, and mountain roads open. Peak tourist season. Festivals, swimming, outdoor dining. Reserve accommodations well ahead.',
    8:  'August — late summer. Still warm with long days (15-17h). Berry picking, seafood season. Slightly fewer crowds. Good for coastal trips and national parks.',
    9:  'September — early autumn. Crisp days, cooling nights, 12-14h daylight. Autumn colours (especially in Lapland/forest regions). Mushroom and berry foraging. Fewer tourists. Some ferries reduce schedules late in the month.',
    10: 'October — autumn. Shortening days (9-11h). Fall colours in early month, then bare. Cool and wet. Some attractions and mountain roads begin closing. Good for city breaks and northern lights (late month).',
    11: 'November — late autumn / early winter. Short days (6-8h), cold, dark. First snow likely. Many seasonal closures. Low season — limited ferry schedules, some mountain roads close. Aurora visible.',
    12: 'December — winter. Very short days (5-6h south, polar night north). Snow and ice. Christmas markets in cities. Aurora season. Many attractions closed; winter activities (skiing, ice hotels) begin opening. Dress for sub-zero.',
  },

  promptTemplate: {
    /**
     * Builds the user message for the LLM from travel preferences.
     * References this region's countries, seasonal context, label, and
     * border constraint.
     */
    buildUserMessage(prefs, lang, existingStops) {
      const countryName = nordicConfig.countries[prefs.country] ?? `${nordicConfig.regionLabel} country`
      const parts: string[] = [
        `Create a ${prefs.tripDays}-day ${nordicConfig.regionLabel} road trip itinerary in ${countryName}.`,
        `All stops must be within ${countryName} — ${nordicConfig.borderConstraint}.`,
        `Start city: ${prefs.startCity}`,
        `End city: ${prefs.endCity}`,
      ]
      if (prefs.startDate) {
        const month = parseInt(prefs.startDate.slice(5, 7), 10)
        const seasonal = nordicConfig.seasonalContext[month]
        if (seasonal) {
          parts.push(`The trip starts on ${prefs.startDate}. ${seasonal}`)
        }
      }
      if (prefs.mustVisit.length > 0) parts.push(`Must include: ${prefs.mustVisit.join(', ')}`)
      if (prefs.avoid.length > 0) parts.push(`Avoid: ${prefs.avoid.join(', ')}`)
      if (existingStops && existingStops.length > 0) {
        const stopList = existingStops.map(s => `${s.city} (${s.nights === 0 ? 'day trip' : s.nights + 'n'})`).join(' → ')
        parts.push(`The current route includes these stops — respect their order and include all of them: ${stopList}`)
      }
      parts.push('Plan logical routing, mix of famous and off-the-beaten-track stops, with authentic local recommendations.')
      const langInstruction =
        lang === 'nl' ? 'Genereer de reisroute in het Nederlands.'
        : lang === 'de' ? 'Erstelle die Reiseroute auf Deutsch.'
        : 'Generate the itinerary in English.'
      parts.push(langInstruction)
      return parts.join('\n')
    },
  },
}
