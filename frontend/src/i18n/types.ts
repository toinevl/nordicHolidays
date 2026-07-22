export type Locale = 'en' | 'nl' | 'de'

export interface LocaleStrings {
  generator: {
    panelTitle: string
    startCity: string
    finishCity: string
    searchCity: string
    customCity: string
    tripLength: string
    startDate: string
    mustVisit: string
    pressEnter: string
    addPlace: string
    avoid: string
    generateBtn: string
    regenerateBtn: string
    preferencesSaved: string
    generating: string
    country: string
  }
  saved: {
    title: string
    close: string
    namePlaceholder: string
    save: string
    saving: string
    load: string
    loadingTrip: string
    empty: string
    loading: string
    errorLoading: string
    saveFailed: string
    loadFailed: string
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
    saved: string
    shareCopied: string
    shareFailed: string
    sharedItineraryLoaded: string
    sharedItineraryFailed: string
    saveNoteFirst: string
    saveNoteFailed: string
    undone: string
    undoFailed: string
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
    dayTripFrom: string
    oneNight: string
    nights: string
    flyHere: string
    noStopsMatch: string
    print: string
    notes: string
    notesPlaceholder: string
    saveNote: string
    savingNote: string
    exportGPX: string
    exportICS: string
    exportGoogleMaps: string
    exportWaze: string
    tripIndex: string
    undoLastEdit: string
    findHotels: string
    findActivities: string
    rentCar: string
  }
  map: {
    legendOvernight: string
    legendDayTrip: string
    legendRoute: string
    legendExcursion: string
    loadFailedTitle: string
    loadFailedBody: string
  }
  b2b: {
    kicker: string
    title: string
    subtitle: string
    feature1Title: string
    feature1Body: string
    feature2Title: string
    feature2Body: string
    feature3Title: string
    feature3Body: string
    demoLabel: string
    pricingLabel: string
    pilotBadge: string
    perMonth: string
    pilotDuration: string
    pilotFeature1: string
    pilotFeature2: string
    pilotFeature3: string
    pilotFeature4: string
    pilotSubject: string
    startPilot: string
    standardBadge: string
    standardDuration: string
    standardFeature1: string
    standardFeature2: string
    standardFeature3: string
    standardFeature4: string
    standardFeature5: string
    standardSubject: string
    bookDemo: string
    caseStudiesLabel: string
    caseStudiesEmpty: string
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
  auth: {
    signIn: string
    signOut: string
    profileSaved: string
  }
  country: {
    se: string
    no: string
    dk: string
    fi: string
  }
  nav: {
    itinerary: string
    food: string
    stay: string
    map3d: string
  }
  hero: {
    flyRoute: string
    viewItinerary: string
  }
  sections: {
    itineraryLabel: string
    itineraryTitle: string
    culinaryLabel: string
    culinaryTitle: string
    accomLabel: string
    accomTitle: string
    filterTitle: string
  }
  accom: {
    colDestination: string
    colType: string
    colCancellation: string
    colBathroom: string
    colTerrace: string
    colNotes: string
  }
  map3d: {
    hint: string
  }
  footer: {
    days: string
    kilometres: string
    destinations: string
    foodRegions: string
  }
  loading: {
    generating: string
  }
  widget: {
    poweredBy: string
    planTrip: string
  }
}

export type LocaleKey =
  | `generator.${keyof LocaleStrings['generator']}`
  | `saved.${keyof LocaleStrings['saved']}`
  | `status.${keyof LocaleStrings['status']}`
  | `toast.${keyof LocaleStrings['toast']}`
  | `itinerary.${keyof LocaleStrings['itinerary']}`
  | `season.${keyof LocaleStrings['season']}`
  | `auth.${keyof LocaleStrings['auth']}`
  | `country.${keyof LocaleStrings['country']}`
  | `nav.${keyof LocaleStrings['nav']}`
  | `hero.${keyof LocaleStrings['hero']}`
  | `sections.${keyof LocaleStrings['sections']}`
  | `accom.${keyof LocaleStrings['accom']}`
  | `map.${keyof LocaleStrings['map']}`
  | `map3d.${keyof LocaleStrings['map3d']}`
  | `b2b.${keyof LocaleStrings['b2b']}`
  | `footer.${keyof LocaleStrings['footer']}`
  | `loading.${keyof LocaleStrings['loading']}`
  | `widget.${keyof LocaleStrings['widget']}`
