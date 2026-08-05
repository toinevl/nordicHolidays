import type { ApiRegionConfig } from './types'

export const us: ApiRegionConfig = {
  countries: { US: 'United States' },

  defaultCountry: 'US',
  regionLabel: 'US',
  seasonalContext: {
    1:  'January — mid-winter. Snow and ice across northern states; mild and dry in the South and Southwest. Best destinations: Florida, southern Texas, desert Arizona, Hawaii. Peak ski season in the Rockies and Sierra Nevada. Many national park roads closed at elevation. Short days in the north.',
    2:  'February — late winter. Similar conditions to January but daylight increasing. Still excellent for Florida beaches, Southwest desert hiking, and Caribbean-warm Hawaii. Mardi Gras in New Orleans (variable dates). Ski season peaks in Colorado and Utah. Northern road trips require winter tyres and route planning.',
    3:  'March — spring transition. Southern states warming fast; wildflower season in Texas Hill Country and California deserts. Still snowy in the Rockies and northern plains. Spring break crowds flood Florida and Gulf Coast beaches. Excellent shoulder-season value in the Southwest.',
    4:  'April — spring. Pleasant across most of the country; Pacific Coast Highway clears up, Southwest deserts perfect before summer heat. Cherry blossoms in Washington, D.C. and NYC. Southern Appalachians and Texas wildflowers peak. Pack layers — weather swings are large, especially in the plains where severe storms begin.',
    5:  'May — late spring. One of the best months for road trips nationwide. Comfortable temperatures coast to coast; national parks uncrowded before summer rush. Pacific Northwest dries out. New Orleans Jazz Fest. Great Smoky and Blue Ridge Parkway rhododendron blooms. Tornado season peaks in Tornado Alley — monitor weather.',
    6:  'June — early summer. Warm everywhere; days are long. Pacific Northwest and Mountain West are peak. Desert Southwest becomes dangerously hot — plan early-morning activities. National parks busy but not yet at July peak. New England and Great Lakes perfect. Wildfire smoke can affect Western air quality.',
    7:  'July — peak summer. Hottest month; desert Southwest (Phoenix, Las Vegas) regularly exceeds 110°F. Peak national park crowds — book lodging months ahead. Best for New England, Pacific Northwest, Mountain West, and Alaska. Hurricane season begins in the Southeast and Gulf Coast. Fireworks and festivals nationwide.',
    8:  'August — late summer. Still hot, especially in the South and Southeast where humidity is high. Peak hurricane season risk for Florida, Gulf Coast, and Atlantic seaboard. Excellent for the Mountain West, Pacific Northwest, and New England coast. National parks still crowded. School holidays drive family travel.',
    9:  'September — early autumn. One of the best road-trip months: crowds thin, temperatures moderate, and the Southwest deserts cool enough to enjoy again. Fall foliage begins in New England and northern Rockies late in the month. Pacific Coast Highway at its best. Hurricane risk persists in the Southeast early in the month.',
    10: 'October — autumn. Peak fall foliage in New England, the Upper Midwest, and the Blue Ridge/Great Smoky Mountains. Southwest and Southeast at their most pleasant. Mountain West gets early snow; high-elevation park roads begin closing. Northern plains can see snow. Harvest festivals and state fairs. Shorter days everywhere.',
    11: 'November — late autumn. Foliacy gone; cold settling into the north. Good for the Southwest, Southeast, and Gulf Coast. First snow likely in the Rockies and northern plains. Thanksgiving travel is the busiest domestic travel period. Holiday lights begin late month. Hawaii and Florida remain warm and pleasant.',
    12: 'December — winter. Cold and snowy across the north; mild in the South, Southwest, and Hawaii. Excellent for desert Southwest, Florida, and Hawaiian road trips. Ski season in full swing out West. Holiday light displays in cities. Short daylight in northern states. Book holiday travel well ahead.',
  },
  borderConstraint:
    'stay within the United States — do not cross into Canada or Mexico unless explicitly starting from a border city',

  promptTemplate: {
    buildUserMessage(
      prefs: import('../types').Preferences,
      lang: 'en' | 'nl' | 'de',
      existingStops?: Array<{ city: string; nights: number }>,
    ) {
      const countryName = us.countries[prefs.country] ?? `${us.regionLabel} country`
      const parts: string[] = [
        `Create a ${prefs.tripDays}-day ${us.regionLabel} road trip itinerary in ${countryName}.`,
        `All stops must be within ${countryName} — ${us.borderConstraint}.`,
        `Start city: ${prefs.startCity}`,
        `End city: ${prefs.endCity}`,
      ]
      if (prefs.startDate) {
        const month = parseInt(prefs.startDate.slice(5, 7), 10)
        const seasonal = us.seasonalContext[month]
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
