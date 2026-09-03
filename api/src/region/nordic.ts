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
   * City catalogue shared between frontend (autocomplete) and API
   * (start/end city coordinate correction in generate.ts). Every city
   * that can appear as a stop origin/destination needs lat/lng here
   * so the generation handler can override mismatched LLM coordinates.
   */
  cities: [
    { id: 'amsterdam-nl',   name: 'Amsterdam',    countryCode: 'NL', countryName: 'Netherlands', region: 'North Holland',  lat: 52.3676,   lng: 4.9041,    aliases: ['AMS'] },
    { id: 'copenhagen-dk',  name: 'Copenhagen',   countryCode: 'DK', countryName: 'Denmark',     region: 'Capital Region', lat: 55.6761,   lng: 12.5683,   aliases: ['Kobenhavn', 'København', 'CPH'] },
    { id: 'oslo-no',        name: 'Oslo',          countryCode: 'NO', countryName: 'Norway',      region: 'Oslo',            lat: 59.9139,   lng: 10.7522,   aliases: [] },
    { id: 'hamburg-de',     name: 'Hamburg',       countryCode: 'DE', countryName: 'Germany',     region: 'Hamburg',         lat: 53.5511,   lng: 9.9937,    aliases: [] },
    { id: 'berlin-de',      name: 'Berlin',        countryCode: 'DE', countryName: 'Germany',     region: 'Berlin',          lat: 52.52,     lng: 13.405,    aliases: [] },
    { id: 'brussels-be',    name: 'Brussels',      countryCode: 'BE', countryName: 'Belgium',     region: 'Brussels-Capital',lat: 50.8503,   lng: 4.3517,    aliases: ['Bruxelles', 'Brussel'] },
    { id: 'malmo-se',       name: 'Malmö',         countryCode: 'SE', countryName: 'Sweden',      region: 'Skåne',           lat: 55.605,    lng: 13.0038,   aliases: ['Malmo'] },
    { id: 'ystad-se',       name: 'Ystad',         countryCode: 'SE', countryName: 'Sweden',      region: 'Skåne',           lat: 55.4295,   lng: 13.82,     aliases: [] },
    { id: 'kristianstad-se',name: 'Kristianstad',  countryCode: 'SE', countryName: 'Sweden',      region: 'Skåne',           lat: 56.0294,   lng: 14.1567,   aliases: [] },
    { id: 'helsingborg-se', name: 'Helsingborg',   countryCode: 'SE', countryName: 'Sweden',      region: 'Skåne',           lat: 56.0465,   lng: 12.6945,   aliases: [] },
    { id: 'gothenburg-se',  name: 'Gothenburg',    countryCode: 'SE', countryName: 'Sweden',      region: 'Västra Götaland', lat: 57.7089,   lng: 11.9746,   aliases: ['Göteborg', 'Goteborg'] },
    { id: 'karlstad-se',    name: 'Karlstad',      countryCode: 'SE', countryName: 'Sweden',      region: 'Värmland',        lat: 59.4022,   lng: 13.5115,   aliases: [] },
    { id: 'falun-se',       name: 'Falun',         countryCode: 'SE', countryName: 'Sweden',      region: 'Dalarna',         lat: 60.6065,   lng: 15.6355,   aliases: [] },
    { id: 'mora-se',        name: 'Mora',          countryCode: 'SE', countryName: 'Sweden',      region: 'Dalarna',         lat: 61.0074,   lng: 14.543,    aliases: [] },
    { id: 'ostersund-se',   name: 'Östersund',     countryCode: 'SE', countryName: 'Sweden',      region: 'Jämtland',        lat: 63.1792,   lng: 14.6357,   aliases: ['Ostersund'] },
    { id: 'sundsvall-se',   name: 'Sundsvall',     countryCode: 'SE', countryName: 'Sweden',      region: 'Västernorrland',  lat: 62.3908,   lng: 17.3069,   aliases: [] },
    { id: 'umea-se',        name: 'Umeå',          countryCode: 'SE', countryName: 'Sweden',      region: 'Västerbotten',    lat: 63.8258,   lng: 20.263,    aliases: ['Umea'] },
    { id: 'lulea-se',       name: 'Luleå',         countryCode: 'SE', countryName: 'Sweden',      region: 'Norrbotten',      lat: 65.5848,   lng: 22.1547,   aliases: ['Lulea'] },
    { id: 'kiruna-se',      name: 'Kiruna',        countryCode: 'SE', countryName: 'Sweden',      region: 'Norrbotten',      lat: 67.8558,   lng: 20.2253,   aliases: [] },
    { id: 'abisko-se',      name: 'Abisko',        countryCode: 'SE', countryName: 'Sweden',      region: 'Norrbotten',      lat: 68.3495,   lng: 18.8314,   aliases: [] },
    { id: 'uppsala-se',     name: 'Uppsala',       countryCode: 'SE', countryName: 'Sweden',      region: 'Uppsala',         lat: 59.8586,   lng: 17.6389,   aliases: [] },
    { id: 'stockholm-se',   name: 'Stockholm',     countryCode: 'SE', countryName: 'Sweden',      region: 'Stockholm',       lat: 59.3293,   lng: 18.0686,   aliases: [] },
    { id: 'visby-se',       name: 'Visby',         countryCode: 'SE', countryName: 'Sweden',      region: 'Gotland',         lat: 57.6348,   lng: 18.2948,   aliases: [] },
    { id: 'kalmar-se',      name: 'Kalmar',        countryCode: 'SE', countryName: 'Sweden',      region: 'Kalmar',          lat: 56.6634,   lng: 16.3568,   aliases: [] },
    { id: 'vaxjo-se',       name: 'Växjö',         countryCode: 'SE', countryName: 'Sweden',      region: 'Kronoberg',       lat: 56.879,    lng: 14.8059,   aliases: ['Vaxjo', 'Växjo'] },
    { id: 'linkoping-se',   name: 'Linköping',     countryCode: 'SE', countryName: 'Sweden',      region: 'Östergötland',    lat: 58.4108,   lng: 15.6214,   aliases: ['Linkoping'] },
    { id: 'jonkoping-se',   name: 'Jönköping',     countryCode: 'SE', countryName: 'Sweden',      region: 'Jönköping',       lat: 57.7826,   lng: 14.1618,   aliases: ['Jonkoping'] },
    { id: 'vasteras-se',    name: 'Västerås',      countryCode: 'SE', countryName: 'Sweden',      region: 'Västmanland',     lat: 59.6099,   lng: 16.5448,   aliases: ['Vasteras'] },
    { id: 'orebro-se',      name: 'Örebro',        countryCode: 'SE', countryName: 'Sweden',      region: 'Örebro',          lat: 59.2753,   lng: 15.2134,   aliases: ['Orebro'] },
    { id: 'grisslehamn-se', name: 'Grisslehamn',   countryCode: 'SE', countryName: 'Sweden',      region: 'Uppland',         lat: 60.35,     lng: 18.37,     aliases: ['Gräslehamn', 'Grislehamn'] },
  ],

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
     * References this region's countries, seasonal context, border constraint,
     * and city catalogue names.
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
