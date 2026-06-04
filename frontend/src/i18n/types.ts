export type Locale = 'en' | 'nl'

export interface LocaleStrings {
  generator: {
    panelTitle: string
    startCity: string
    finishCity: string
    searchCity: string
    customCity: string
    tripLength: string
    mustVisit: string
    pressEnter: string
    addPlace: string
    avoid: string
    generateBtn: string
    regenerateBtn: string
    preferencesSaved: string
    generating: string
  }
  saved: {
    title: string
    close: string
    namePlaceholder: string
    save: string
    load: string
    delete: string
    empty: string
    loading: string
    errorLoading: string
    confirmDelete: string
    saveFailed: string
    loadFailed: string
    deleteFailed: string
  }
  status: {
    myTrips: string
    myTripsTitle: string
    generate: string
    generateTitle: string
    share: string
    shareTitle: string
    saved: string
    unsaved: string
    defaultTripName: string
  }
  toast: {
    generated: string
    generationFailed: string
    loaded: string
    shareCopied: string
    shareFailed: string
    sharedItineraryLoaded: string
    sharedItineraryFailed: string
  }
  itinerary: {
    plannedNights: string
    roadKilometres: string
    overnightStops: string
    longestDriveTo: string
    allStops: string
    selectedStop: string
    dayPrefix: string
    dayTrip: string
    oneNight: string
    nights: string
    flyHere: string
    noStopsMatch: string
    print: string
  }
  season: {
    skane: string
    blekinge: string
    gotland: string
    halland: string
    bohuslan: string
    gothenburg: string
    vastraGotaland: string
    stockholm: string
    uppland: string
    ostergotland: string
    smaland: string
    varmland: string
    dalarna: string
    jamtland: string
    harjedalen: string
    lapland: string
    norrbotten: string
    vasternorrland: string
  }
}

export type LocaleKey =
  | `generator.${keyof LocaleStrings['generator']}`
  | `saved.${keyof LocaleStrings['saved']}`
  | `status.${keyof LocaleStrings['status']}`
  | `toast.${keyof LocaleStrings['toast']}`
  | `itinerary.${keyof LocaleStrings['itinerary']}`
  | `season.${keyof LocaleStrings['season']}`
