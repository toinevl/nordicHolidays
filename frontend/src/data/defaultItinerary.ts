import type { Stop, CulinaryRegion, Accommodation } from '../types'

export const STOPS: Stop[] = [
  { id:1,  days:"1",     dates:"Aug 25",    dest:"Malmö",               region:"Skåne",            coords:[13.0007,55.6059], tags:["city","historic"],          nights:1,
    desc:"Cross the Øresund Bridge and arrive in Sweden's southernmost city. Malmö blends Scandinavian modernity with medieval charm — the Turning Torso punctuates a skyline still holding 16th-century cobblestones.",
    highlights:["Gamla Väster medieval quarter","Turning Torso & Western Harbour","Lilla Torg square & food market","Malmö Saluhallen indoor market hall"],
    from:"Netherlands border via Øresund Bridge", km:400, time:"~5 hrs", zoom:12, pitch:50, bearing:-15 },

  { id:2,  days:"2",     dates:"Aug 26",    dest:"Ystad",               region:"Skåne",            coords:[13.8201,55.4295], tags:["historic","offbeat"],       nights:1,
    desc:"A perfectly preserved medieval town with cobblestones unchanged since the 14th century — and the filming location for the Wallander crime series. The active fishing harbour brews excellent local beer.",
    highlights:["1300s cobblestone merchant district","Wallander filming locations","Ystad Harbour Brewery","Stortorget central square"],
    from:"Malmö", km:60, time:"45 min", zoom:13, pitch:45, bearing:20 },

  { id:3,  days:"3",     dates:"Aug 27",    dest:"Kristianstad",        region:"Skåne",            coords:[14.1567,56.0294], tags:["nature","offbeat"],         nights:1,
    desc:"An off-the-beaten-track surprise: the Vattenriket biosphere reserve offers extraordinary birdwatching in ancient bog landscapes. The Renaissance town centre is one of Sweden's oldest planned cities, unchanged since 1614.",
    highlights:["Naturum Vattenriket biosphere & birdwatching","Renaissance town grid (1614)","Helge å river kayaking","Lake Hammarsjön scenic drive"],
    from:"Ystad", km:100, time:"1.5 hrs", zoom:12, pitch:40, bearing:10 },

  { id:4,  days:"4",     dates:"Aug 28",    dest:"Helsingborg",         region:"Skåne",            coords:[12.6945,56.0465], tags:["city","historic"],          nights:1,
    desc:"A lively harbour city at the narrowest Sweden–Denmark crossing. The medieval Kärnan tower is the sole survivor of one of Scandinavia's most powerful fortresses, with sweeping views to Helsingør.",
    highlights:["Kärnan medieval tower (1310s)","Views across to Helsingør, Denmark","Sofiero Palace gardens","Stortorget & waterfront promenade"],
    from:"Kristianstad", km:110, time:"1.5 hrs", zoom:13, pitch:55, bearing:-30 },

  { id:5,  days:"5–6",   dates:"Aug 29–30", dest:"Gothenburg",          region:"Västra Götaland",  coords:[11.9746,57.7089], tags:["city","nature"],            nights:2,
    desc:"Sweden's second city: relaxed, worldly, with an archipelago at its doorstep. The Feskekörka fish market and Saluhallen food hall are unmissable. On day 6 ferry to the island fortress of Marstrand — crowd-free and spectacular.",
    highlights:["Feskekörka fish market","Saluhallen food hall","Marstrand island fortress (ferry)","Haga historic district","Bohuslän archipelago cruise"],
    from:"Helsingborg", km:115, time:"1.5 hrs", zoom:11, pitch:45, bearing:-5 },

  { id:6,  days:"7",     dates:"Aug 31",    dest:"Karlstad & Värmland", region:"Värmland",         coords:[13.5036,59.3793], tags:["nature","offbeat"],         nights:1,
    desc:"Karlstad — Sweden's sun city — borders Lake Vänern (Europe's 3rd-largest lake). The forested Värmland region is largely bypassed by tourists, rewarding with quiet forest lakes, traditional farm culture, and the Klarälven river float experience.",
    highlights:["Lake Vänern shoreline drives","Klarälven river float trips","Mariebergsskogen nature park","Farm stays in Lövvik village"],
    from:"Gothenburg", km:250, time:"3 hrs", zoom:11, pitch:40, bearing:15 },

  { id:7,  days:"8",     dates:"Sep 1",     dest:"Mora & Lake Siljan",  region:"Dalarna",          coords:[14.5356,61.0015], tags:["nature","offbeat"],         nights:1,
    desc:"Lake Siljan — a meteor crater turned impossibly beautiful lake — is the heart of Dalarna. September brings early autumn colours and almost no crowds. The village of Nusnäs still hand-paints Dala horses using centuries-old techniques.",
    highlights:["Lake Siljan circuit drive","Vasaloppet museum","Zornmuseet (artist Anders Zorn)","Nusnäs — Dala horse workshops"],
    from:"Karlstad", km:200, time:"2.5 hrs", zoom:11, pitch:50, bearing:25 },

  { id:8,  days:"9",     dates:"Sep 2",     dest:"Falun",               region:"Dalarna",          coords:[15.6355,60.6065], tags:["historic"],                 nights:1,
    desc:"The UNESCO-listed Falun Copper Mine was active for 1,000 years. Its red ochre pigment literally painted Sweden red — every classic Swedish red farmhouse owes its colour to Falun. The underground tour is unmissable.",
    highlights:["Falun Copper Mine (UNESCO) — underground tour","Mine museum & ochre demonstration","Carl Larsson-gården artist home","Dala horse craft shops"],
    from:"Mora", km:80, time:"1.5 hrs", zoom:13, pitch:45, bearing:-10 },

  { id:9,  days:"10",    dates:"Sep 3",     dest:"Rättvik",             region:"Dalarna",          coords:[15.1106,60.8912], tags:["nature","historic"],        nights:1,
    desc:"Rättvik's 1733 church reaching into Lake Siljan on a long wooden pier is one of Sweden's most photographed scenes. Folk Sweden at its most authentic: church boats, traditional textiles, and superb lake swimming.",
    highlights:["Rättvik church & church-boat piers","Lake Siljan swimming at Rättviksstrand","Vidablick viewpoint hike","Dalecarlian textile & folk art shops"],
    from:"Falun", km:80, time:"1.5 hrs", zoom:13, pitch:60, bearing:30 },

  { id:10, days:"11–12", dates:"Sep 4–5",   dest:"Höga Kusten",         region:"Ångermanland",     coords:[18.3,62.8],       tags:["nature","offbeat"],         nights:2,
    desc:"Sweden's most dramatic coastline — a UNESCO World Heritage Site still rising from the sea after the last ice age. Towering cliff gorges, primeval forest, Viking burial mounds, and white-tailed eagles. Almost no mass tourism.",
    highlights:["Skuleskogen National Park trails","Slåttdalskrevan gorge (only 1m wide)","Nordingrå viewpoint over fjords","Viking runestones at Nämforsen","White-tailed eagle spotting"],
    from:"Rättvik (via Gävle & Sundsvall)", km:290, time:"4 hrs", zoom:11, pitch:65, bearing:40 },

  { id:11, days:"13",    dates:"Sep 6",     dest:"Uppsala",             region:"Uppland",          coords:[17.6389,59.8586], tags:["historic","city"],          nights:1,
    desc:"The ancient capital of Sweden, predating Stockholm. Scandinavia's largest cathedral holds royal tombs. The Viking burial mounds at Gamla Uppsala are among the most significant in northern Europe.",
    highlights:["Uppsala Cathedral (Scandinavia's largest)","Gamla Uppsala Viking burial mounds","Uppsala University (est. 1477)","Linnaeus Garden & Museum","Fyrisån river waterfront"],
    from:"Höga Kusten", km:340, time:"4 hrs", zoom:13, pitch:45, bearing:-20 },

  { id:12, days:"14–17", dates:"Sep 7–10",  dest:"Stockholm",           region:"Stockholm County", coords:[18.0686,59.3293], tags:["city","historic","nature"], nights:4,
    desc:"The capital across 14 islands. Four days barely scratches the surface: medieval Gamla Stan, the spectacular Vasa Museum, open-air Skansen, UNESCO Drottningholm Palace, and the finest smörgåsbord at Operakällaren.",
    highlights:["Gamla Stan (1200s Old Town)","Vasa Museum — recovered 17th-century warship","Skansen open-air museum","Drottningholm Palace (UNESCO)","Östermalm food hall"],
    from:"Uppsala", km:75, time:"1 hr", zoom:12, pitch:50, bearing:10 },

  { id:13, days:"18",    dates:"Sep 11",    dest:"Stockholm Archipelago",region:"Stockholm County", coords:[18.5,59.45],      tags:["nature"],                  nights:0,
    desc:"A day trip by public ferry to the outer islands — Vaxholm's fortress, Grinda's sandy shores, or bohemian Sandhamn where Sweden's sailing elite summer. Traditional red cabins dot granite between pine and sea.",
    highlights:["Vaxholm fortress island","Sandhamn sailing village","Grinda island swimming & hiking","Archipelago ferry experience"],
    from:"Stockholm (ferry from Strömkajen)", km:0, time:"Ferry", zoom:10, pitch:55, bearing:20 },

  { id:14, days:"19",    dates:"Sep 12",    dest:"Västerås",            region:"Västmanland",      coords:[16.5448,59.6099], tags:["historic"],                 nights:1,
    desc:"A transition day with real rewards: the cathedral holds Erik XIV's ornate tomb, and Anundshög is Sweden's largest Viking burial mound. Lake Mälaren's shores give a calm final taste of Swedish nature before the long drive south.",
    highlights:["Västerås Cathedral & Erik XIV tomb","Anundshög — Sweden's largest Viking mound","Västerås Castle on the Svartån","Lake Mälaren waterfront walk"],
    from:"Stockholm", km:110, time:"1.5 hrs", zoom:13, pitch:40, bearing:-5 },

  { id:15, days:"20–21", dates:"Sep 13–14", dest:"Return → Netherlands",region:"Skåne / Denmark",  coords:[13.0007,55.6059], tags:["city"],                     nights:1,
    desc:"The long drive home. Consider an overnight in Helsingborg or Malmö before crossing the Øresund Bridge back to Denmark and on to the Netherlands. Malmö's seafood markets earn a worthy final Swedish meal.",
    highlights:["Optional overnight: Gothenburg","Final fika at Malmö Saluhallen","Øresund Bridge crossing","Return to Netherlands"],
    from:"Västerås", km:620, time:"7.5 hrs", zoom:10, pitch:35, bearing:-20 },
]

export const CULINARY: CulinaryRegion[] = [
  { name:"Fika",                  region:"Nationwide",             icon:"☕", color:"#c97d00", desc:"The sacred Swedish coffee break — a social ritual of cinnamon and cardamom buns taken twice daily. Fika is built into the working day and is a national institution, not just a coffee habit.", must:["Kanelbullar (cinnamon bun)","Kardemummabulle (cardamom bun)","Kladdkaka (sticky chocolate cake)","Semla (cream-filled cardamom bun)"] },
  { name:"West Coast Seafood",    region:"Gothenburg & Bohuslän",  icon:"🦐", color:"#748870", desc:"Bohuslän produces some of Europe's finest shellfish. September crayfish parties (kräftskiva) are a cultural institution — bib mandatory, aquavit obligatory. Feskekörka fish market is a rite of passage.", must:["Räksmörgås (shrimp open sandwich)","Fresh oysters from the fjords","Kräftskiva (crayfish party boil)","Hummer (grilled lobster)","Gothenburg fish soup"] },
  { name:"Skåne Smörgåsbord",    region:"Southern Sweden",         icon:"🐟", color:"#748870", desc:"The south Swedish table is generous — multiple preparations of herring, gravlax, meatballs, and seasonal vegetables. Skåne is Sweden's agricultural heartland with a slightly French-influenced food culture.", must:["Inlagd sill (pickled herring, 6 ways)","Gravad lax with mustard-dill sauce","Köttbullar med lingon (meatbullets)","Fläskpannkaka (bacon pancake)","Smörgåstårta (savoury sandwich cake)"] },
  { name:"Forest & Game",         region:"Dalarna & Värmland",      icon:"🦌", color:"#748870", desc:"Central Sweden's forests yield elk, reindeer, and wild game. September is peak chanterelle season. Farm stands overflow with lingonberries, cloudberries, and blueberries — the real taste of Swedish autumn.", must:["Älgbiff (elk steak)","Rensktek (slow-cooked reindeer)","Chanterelle toast with forest cream","Cloudberries with fresh cream","Blåbärssoppa (warm blueberry soup)"] },
  { name:"High Coast Smoked Fish", region:"Höga Kusten",            icon:"🐠", color:"#748870", desc:"Ancient preservation traditions survive on the High Coast. Surströmming — fermented herring with a legendary aroma — is consumed here in its heartland. Cold-smoked salmon is the more approachable entry point.", must:["Surströmming (fermented herring — an experience)","Kallrökt lax (cold-smoked salmon)","Rökt abborre (smoked perch)","Chanterelles on sourdough","Local herb aquavit"] },
  { name:"Stockholm Nordic Kitchen", region:"Stockholm",            icon:"🍽️", color:"#c97d00", desc:"Stockholm leads the New Nordic movement — ancient Swedish ingredients reinterpreted with fine-dining technique. The Östermalm food hall is Scandinavia's finest market. Book tasting menus well ahead.", must:["Östermalm food hall tasting","Classic smörgåsbord at Operakällaren","Strömming (fried herring) street food","New Nordic tasting menu","Swedish craft aquavit tasting"] },
]

export const ACCOMMODATIONS: Accommodation[] = [
  { dest:"Malmö",               type:"Boutique Hotel",      policy:"free",  bath:true, terrace:true,  note:"Gamla Väster area — walk to old town" },
  { dest:"Ystad",               type:"Guesthouse / B&B",    policy:"free",  bath:true, terrace:true,  note:"Harbour-view rooms; historic centre B&Bs" },
  { dest:"Kristianstad",        type:"Hotel",               policy:"free",  bath:true, terrace:false, note:"Central Scandic or boutique hotel" },
  { dest:"Helsingborg",         type:"Hotel",               policy:"free",  bath:true, terrace:true,  note:"Harbour-view rooms with views to Denmark" },
  { dest:"Gothenburg",          type:"Apartment / Hotel",   policy:"free",  bath:true, terrace:true,  note:"Haga or Linnéstaden; balcony apartments via Airbnb" },
  { dest:"Karlstad / Värmland", type:"Lake Lodge",          policy:"free",  bath:true, terrace:true,  note:"Lakeside gäststugor with veranda — book direct" },
  { dest:"Mora / Lake Siljan",  type:"Lake Cabin",          policy:"free",  bath:true, terrace:true,  note:"Waterfront cabins on Lake Siljan — Nusnäs area" },
  { dest:"Falun",               type:"Hotel",               policy:"free",  bath:true, terrace:false, note:"Central hotel; filter for terrace on Booking.com" },
  { dest:"Rättvik",             type:"Lake Hotel",          policy:"free",  bath:true, terrace:true,  note:"Lakeside lodge — wake to Lake Siljan views" },
  { dest:"Höga Kusten",         type:"Mountain Lodge",      policy:"cond",  bath:true, terrace:true,  note:"Very limited — book 3+ months ahead" },
  { dest:"Uppsala",             type:"Hotel / Apartment",   policy:"free",  bath:true, terrace:false, note:"City centre; Fyrisån river view preferred" },
  { dest:"Stockholm",           type:"Apartment (4 nights)", policy:"mod",  bath:true, terrace:true,  note:"Södermalm or Östermalm; balcony essential" },
  { dest:"Västerås",            type:"Hotel",               policy:"free",  bath:true, terrace:false, note:"Central; last night before the long drive home" },
]

export const DEFAULT_ITINERARY_TITLE = 'Sweden Road Trip 2026 — 21 Days'
