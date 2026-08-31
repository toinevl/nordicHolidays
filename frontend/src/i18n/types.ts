export type Locale = 'en' | 'nl' | 'de' | 'sv' | 'da' | 'no'

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
    tripStarting: string
    addStop: string
    confirmRemove: string
    confirmRemoveYes: string
    confirmRemoveKeep: string
    regenerateRoute: string
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
    demoIframeTitle: string
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
    business: string
  }
  hero: {
    flyRoute: string
    viewItinerary: string
    scrollCue: string
    badge: string
    subtitle: string
    metaDays: string
    metaKm: string
    metaDestinations: string
    metaFoodRegions: string
  }
  sections: {
    overviewLabel: string
    overviewTitle: string
    overviewDesc: string
    itineraryLabel: string
    itineraryTitle: string
    itineraryDesc: string
    culinaryLabel: string
    culinaryTitle: string
    culinaryDesc: string
    accomLabel: string
    accomTitle: string
    accomDesc: string
    accomTip: string
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
    tagline: string
    buildLocal: string
    colofon: string
    privacy: string
    cookies: string
  }
  consent: {
    bannerText: string
    accept: string
    decline: string
    readMore: string
  }
  loading: {
    generating: string
  }
  widget: {
    poweredBy: string
    planTrip: string
  }
  overview: {
    title: string
    subtitle: string
    columnDay: string
    columnDate: string
    columnRoute: string
    columnDistance: string
    columnDriveTime: string
    columnHighlights: string
    stayDay: string
    dayTrip: string
    dayTripShort: string
    totalDistance: string
    noData: string
    clickHint: string
  }
  validation: {
    selectStartCity: string
    selectFinishCity: string
    minDuration: string
    generationFailed: string
    rateLimit: string
    authFailed: string
  }
  culinary: {
    mustTry: string
  }
  accomPolicy: {
    free: string
    cond: string
    mod: string
  }
  tags: {
    offbeat: string
  }
  aria: {
    routeFilters: string
    /** Template: "Remove {city}" — aria-label on tag remove buttons */
    removeTag: string
    /** Template: "{city}, stop {n}" — aria-label on map stop markers */
    stopMarker: string
    /** Template: "Day trip near {base}" — aria-label on map day-trip markers */
    dayTripMarker: string
    /** Static: "Map legend" — aria-label on the map legend region */
    mapLegend: string
    /** Static: "Nordic road trip map" — aria-label on the 2D map container */
    mapLabel: string
    /** Static: "3D map of Nordic road trip" — aria-label on the 3D map container */
    map3dLabel: string
    /** Static: "Choose your language" — aria-label on the locale dropdown */
    localeDropdown: string
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
  | `consent.${keyof LocaleStrings['consent']}`
  | `loading.${keyof LocaleStrings['loading']}`
  | `widget.${keyof LocaleStrings['widget']}`
  | `overview.${keyof LocaleStrings['overview']}`
  | `validation.${keyof LocaleStrings['validation']}`
  | `culinary.${keyof LocaleStrings['culinary']}`
  | `accomPolicy.${keyof LocaleStrings['accomPolicy']}`
  | `tags.${keyof LocaleStrings['tags']}`
  | `aria.${keyof LocaleStrings['aria']}`
