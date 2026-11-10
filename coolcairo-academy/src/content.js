// All teaching content. Numbers come from the CoolCairo methodology guide (v1.2) and the
// notebook audit; illustrative values in labs are marked as such on screen.

const ACTS = [
  { n: 1, name: "Foundations", sub: "What you need before CoolCairo makes sense: heat, light, pixels and thermal physics." },
  { n: 2, name: "From pixels to facts", sub: "How raw satellite scenes become one clean row of facts per 90 m block." },
  { n: 3, name: "The model", sub: "A recipe for block temperature, how to score it, and the exam that keeps it honest." },
  { n: 4, name: "Decisions and the frontier", sub: "Cooling plans, hyperspectral data, growing cities, and how to defend every number." },
];

const CHAPTERS = [
  // ------------------------------------------------------------------ ACT 1
  {
    id: 1, act: 1, title: "Urban heat islands", sub: "Why cities run hot, and why Cairo is a special case",
    brief: `
      <p>An <b>urban heat island</b> is a city that is hotter than its surroundings. Four things cause it:
      dark materials that soak up sunlight (asphalt, dark roofs), <b>too little vegetation</b> (plants cool the air by evaporating water),
      <b>street canyons</b> that trap heat between buildings, and <b>waste heat</b> from air-conditioners and traffic.</p>
      <p>There are two heat islands, and mixing them up is the most common mistake in this field:</p>
      <ul>
        <li><b>Surface heat island</b>: how hot roofs, roads and ground get. Satellites measure this. It is strongest on sunny days.</li>
        <li><b>Air heat island</b>: the air temperature people feel. Measured by weather stations, usually strongest at night.</li>
      </ul>
      <p>CoolCairo works with the <b>surface</b>. A summer roof at 45 °C is normal in Cairo while the air is far cooler.</p>
      <p><b>The desert twist.</b> In most of Europe the city is the hot spot. Around Cairo, open desert sand is often <span class="hl-heat">hotter</span>
      at the surface than the built, irrigated city. East Cairo's open desert averages <b>48.6 °C</b>; a typical built-up block <b>45.7 °C</b>.
      So the question is not "city versus countryside" but <b>which blocks</b>, made of what, are hottest, and where people live.</p>
      <p><b>Why it matters.</b> Heat is the deadliest weather hazard in many countries. It hits older people, young children and outdoor workers
      hardest, drives peak electricity demand for cooling, and gets worse as cities grow and the climate warms.</p>`,
    keys: [["45.66 °C", "Typical built-up block in east Cairo (summer morning surface)"], ["48.6 °C", "Open desert around east Cairo"], ["44.7 °C", "Nasr City average: mostly cooler than typical"]],
    note: { kind: "heat", html: "<b>Remember:</b> CoolCairo measures surface temperature at about 10:30 am. Air temperature changes far less when you cool a surface." },
    lab: "uhi", labTitle: "A summer day, surface by surface", labHint: "Move through the day. Watch how far surfaces rise above the air, and which surfaces cool fastest after sunset. Curves are illustrative.",
    field: [
      { where: "Ahmedabad, India · 2013", title: "South Asia's first heat action plan", text: "After a 2010 heat wave, the city combined early warnings, cooling centres, hospital readiness and later cool-roof programmes for slums. It became a template copied across India.", link: "CoolCairo adds the missing map: which blocks to cool first." },
      { where: "Phoenix, USA · 2021", title: "A city office just for heat", text: "Phoenix created the first publicly funded Office of Heat Response and Mitigation in the US, planning cool pavements, shade and tree canopy by neighbourhood.", link: "Same decision CoolCairo supports: where to put each measure." },
      { where: "Paris, France", title: "OASIS schoolyards", text: "Asphalt school playgrounds are being replaced with plants, soil and shade so children have cool islands nearby during heat waves.", link: "A pocket park in CoolCairo is the same idea at block scale." },
    ],
    quiz: [
      { q: "A Landsat surface temperature map of Cairo shows open desert hotter than the built city. What does that tell you?", opts: ["The data is wrong: cities are always hotter", "Surface heat depends on what the ground is made of; bare sand can be hotter than irrigated, shaded city blocks", "The satellite measured the air above the desert", "It only happens at night"], a: 1, why: "Surface temperature follows materials. Dry sand heats strongly in the sun; irrigated and shaded blocks stay cooler. East Cairo: open desert 48.6 °C vs typical built-up block 45.7 °C." },
      { q: "Which heat island does a satellite thermal sensor measure?", opts: ["The air heat island", "The surface heat island", "Both equally", "Neither: it measures humidity"], a: 1, why: "Thermal sensors see the heat glow of surfaces (roofs, roads, ground). Air temperature needs weather stations or sensors." },
      { q: "Which is NOT one of the main causes of urban heat islands?", opts: ["Dark, heat-absorbing materials", "Little vegetation", "Waste heat from air-conditioners and traffic", "More rainfall in cities"], a: 3, why: "The causes are dark materials, little vegetation (less evaporative cooling), street canyons and waste heat." },
      { q: "Who is hit hardest by extreme heat?", opts: ["Office workers in air-conditioned towers", "Older people, young children and outdoor workers", "Tourists", "Nobody in particular"], a: 1, why: "Vulnerability depends on age, health, housing and work. CoolCairo's heat exposure leaves vulnerability out for now, an honest limit." },
    ],
  },
  {
    id: 2, act: 1, title: "Light and the spectrum", sub: "How a satellite sees without touching anything",
    brief: `
      <p>Satellites like Landsat and Sentinel-2 are <b>passive</b>: they record energy that reaches them from the ground. Two kinds of energy matter:</p>
      <ul>
        <li><b>Reflected sunlight</b> (visible, near-infrared, short-wave infrared). It tells us <b>what a surface is made of</b>.</li>
        <li><b>Emitted heat</b> (thermal infrared, around 10 µm). It tells us <b>how hot a surface is</b>.</li>
      </ul>
      <p>Why two separate regions? Every object glows with a spectrum that depends on its temperature. <b>Wien's law</b>:
      peak wavelength = 2898 ÷ temperature (in kelvin), in micrometres. The Sun at about 5,800 K peaks near <b>0.5 µm</b> (green light).
      Cairo's ground at about 320 K (47 °C) peaks near <b>9 µm</b>. So daylight sensors use short wavelengths and heat sensors look around 10 µm.</p>
      <p>A <b>band</b> is one slice of the spectrum that a sensor records. CoolCairo uses six Sentinel-2 bands for materials:
      blue (490 nm), green (560), red (665), near-infrared (842), and two short-wave infrared (1,610 and 2,190 nm). Temperature comes from
      Landsat's thermal band 10 at about <b>10.9 µm</b>.</p>
      <p>The air is not transparent everywhere. Sensors use <b>atmospheric windows</b>, wavelengths where little is absorbed. Water vapour
      blocks some regions completely, which is why hyperspectral data drops those bands.</p>`,
    keys: [["0.5 µm", "Where sunlight peaks (5,800 K)"], ["≈ 9–10 µm", "Where a hot Cairo roof glows most"], ["6 + 1", "Sentinel-2 bands for materials + Landsat thermal band"]],
    lab: "spectrum", labTitle: "Two glows: the Sun and the city", labHint: "Change the surface temperature and watch its glow move. The shaded strips are the bands CoolCairo uses. The curves are real Planck curves, scaled to fit.",
    field: [
      { where: "Weather satellites", title: "Clouds at night", text: "Geostationary satellites like Meteosat image clouds day and night using thermal bands: cold cloud tops glow less than warm ground, so storms show up after sunset.", link: "Cold cloud tops are also why CoolCairo removes cloudy pixels." },
      { where: "European Union", title: "Checking farm subsidies from space", text: "The EU's farm policy now lets countries check what farmers grow with free Sentinel-2 images instead of only field visits.", link: "The same bands tell CoolCairo plants from sand and asphalt." },
      { where: "Everyday", title: "Your TV remote and night vision", text: "TV remotes use near-infrared; thermal cameras used by firefighters see the 8–14 µm glow of warm bodies through smoke.", link: "Near-infrared reveals plants; thermal infrared reveals heat." },
    ],
    quiz: [
      { q: "Why does a heat sensor look around 10 µm and not at visible light?", opts: ["Because visible light is too bright", "Because objects near Earth's temperature glow most strongly around 10 µm (Wien's law)", "Because 10 µm passes through clouds", "Because Landsat cannot see visible light"], a: 1, why: "Peak wavelength = 2898 ÷ T. For about 300–320 K that is 9–10 µm. The Sun (5,800 K) peaks near 0.5 µm." },
      { q: "Which energy tells you what a surface is made of?", opts: ["Reflected sunlight in visible, near- and short-wave infrared", "Emitted thermal infrared only", "Radio waves", "Gravity"], a: 0, why: "Materials reflect each band differently, like a fingerprint. Thermal tells you temperature." },
      { q: "What is a band?", opts: ["A group of satellites", "One slice of the spectrum a sensor records", "A strip of land", "A type of cloud"], a: 1, why: "Sentinel-2 has 13 bands; CoolCairo uses 6. EnMAP has more than 200 narrow ones." },
      { q: "Why are some wavelengths removed from hyperspectral data?", opts: ["They are copyrighted", "Water vapour in the air absorbs them, so they carry mostly noise", "They are too hot", "They show only clouds"], a: 1, why: "Outside the atmospheric windows the signal is mostly absorbed. EnMAP keeps 203 usable bands after removing them." },
    ],
  },
  {
    id: 3, act: 1, title: "Pixels and resolution", sub: "Four kinds of resolution, and why CoolCairo uses 90 m blocks",
    brief: `
      <p>"Resolution" means four different things, and every satellite trades them off:</p>
      <ul>
        <li><b>Spatial</b>: the size of one pixel on the ground. Sentinel-2 10–20 m, Landsat optical 30 m, Landsat thermal about <b>100 m</b>, EnMAP 30 m.</li>
        <li><b>Spectral</b>: how many bands and how narrow. Sentinel-2 has 13 wide bands; EnMAP more than 200 narrow ones.</li>
        <li><b>Temporal</b>: how often it returns. Landsat 8 and 9 each every 16 days, 8 days together; Sentinel-2 every 5 days with two satellites.</li>
        <li><b>Radiometric</b>: how finely it measures brightness (for example 12 bits = 4,096 levels).</li>
      </ul>
      <p><b>Why 90 m?</b> The heat sensor really sees about 100 m. A 90 m block is exactly <b>3 × 3</b> Landsat pixels (30 m) and <b>9 × 9</b>
      Sentinel-2 pixels (10 m), so every source fits neatly inside. Going smaller would claim detail the heat sensor cannot see.
      That is why CoolCairo never gives a temperature for one building.</p>
      <p>East Cairo's model area has <b>23,103</b> blocks. The app shows Nasr City: <b>576 blocks</b> (24 × 24, 2.2 × 2.2 km) with 1,901 buildings.</p>`,
    keys: [["90 m", "One block = 3 × 3 Landsat = 9 × 9 Sentinel-2 pixels"], ["~100 m", "What Landsat's heat sensor really resolves"], ["23,103", "Blocks in the east Cairo model area"]],
    lab: "resolution", labTitle: "Zoom out like a satellite", labHint: "The same (made-up) neighbourhood seen at different pixel sizes. At 100 m, single buildings vanish but the block pattern survives.",
    field: [
      { where: "Landsat · since 1972", title: "Fifty years of the same view", text: "Landsat's unbroken record shows the Aral Sea drying, Las Vegas and Cairo spreading into the desert, and forests cleared in the Amazon.", link: "CoolCairo uses Landsat 8 and 9 thermal: the core of the heat map." },
      { where: "Disaster response", title: "Choosing the right pixel", text: "After floods or earthquakes, agencies use coarse daily images to see the extent, then sharp 30 cm commercial images to count damaged buildings.", link: "Pick the resolution that matches the decision; for heat that is a block." },
      { where: "Wildfires", title: "Daily, coarse, but fast", text: "MODIS and VIIRS pass every day at 375 m–1 km, perfect for spotting new fires, too coarse for single houses.", link: "Temporal versus spatial resolution: always a trade-off." },
    ],
    quiz: [
      { q: "Why does CoolCairo use 90 m blocks?", opts: ["It looks nice on screen", "It matches the heat sensor's real detail (~100 m) and fits 3 × 3 Landsat and 9 × 9 Sentinel-2 pixels", "Because buildings are 90 m wide", "Because 90 m is the legal block size in Cairo"], a: 1, why: "Going smaller would claim detail the thermal sensor cannot see." },
      { q: "How often do Landsat 8 and 9 together revisit a place?", opts: ["Every day", "Every 5 days", "Every 8 days", "Every 30 days"], a: 2, why: "Each returns every 16 days; offset together, every 8 days. Sentinel-2's two satellites revisit every 5 days." },
      { q: "Which kind of resolution does hyperspectral data improve?", opts: ["Spatial", "Spectral", "Temporal", "Radiometric only"], a: 1, why: "Many narrow bands = high spectral resolution. EnMAP's pixels are still 30 m." },
      { q: "How many blocks does the Nasr City app area have?", opts: ["576 (24 × 24)", "2,538", "23,103", "1,901"], a: 0, why: "576 blocks. 2,538 are the built-up blocks used to fit the model, 23,103 the whole east Cairo area, 1,901 the buildings in Nasr City." },
    ],
  },
  {
    id: 4, act: 1, title: "Thermal infrared and LST", sub: "From a glow in space to a ground temperature",
    brief: `
      <p>Everything warmer than absolute zero glows. Hotter things glow more: the total energy rises with the fourth power of temperature
      (<b>Stefan–Boltzmann law</b>). Landsat's heat sensor measures this glow, called <b>radiance</b>, and from it we get
      <b>land surface temperature (LST)</b>.</p>
      <p>The raw signal is not yet the ground temperature, for two reasons:</p>
      <ul>
        <li><b>The air in between</b>. Water vapour absorbs part of the ground's glow and adds its own. On a humid day the sensor reads too cool or too warm.</li>
        <li><b>Emissivity</b>. Surfaces at the same temperature glow differently. Plants and water are near-perfect emitters (about 0.98);
        concrete about 0.92–0.95; shiny unpainted metal can be below 0.3 and looks much colder than it is.</li>
      </ul>
      <p>USGS, the US agency that runs Landsat with NASA, corrects both and publishes a ready-made surface temperature map for every scene:
      <b>Collection 2 Level-2 Surface Temperature</b>. CoolCairo uses that product directly, so anyone can reproduce the numbers.
      Converting the stored value is one line: value × 0.00341802 + 149.0 gives kelvin; subtract 273.15 for °C.</p>
      <p>Landsat passes about <b>10:30 am</b>. That is a typical summer morning, not the afternoon peak and not the night.</p>`,
    keys: [["Level-2", "USGS product: already corrected for air and emissivity"], ["10:30 am", "Landsat overpass time"], ["× 0.00341802 + 149", "Stored value → kelvin"]],
    lab: "thermal", labTitle: "Be the heat sensor", labHint: "Set the true roof temperature, its emissivity and the water vapour. See what reaches space, then apply the correction. Real Planck physics at 10.9 µm, simplified atmosphere.",
    field: [
      { where: "NASA FIRMS", title: "Active fire alerts in hours", text: "Thermal bands on MODIS and VIIRS spot fires worldwide; alerts reach firefighters and farmers within hours.", link: "Same physics: a hotter surface glows more at thermal wavelengths." },
      { where: "ECOSTRESS · on the ISS", title: "Heat at different hours", text: "Because the space station's orbit drifts, ECOSTRESS sees cities at different times of day, including night: exactly what heat-health studies need.", link: "A next step for CoolCairo: night heat, which matters most for health." },
      { where: "Buildings", title: "Finding heat leaks", text: "Thermal cameras show where buildings lose heat or where pipes leak, as long as the operator corrects for emissivity of glass and metal.", link: "Emissivity mistakes are why USGS's corrected product matters." },
    ],
    quiz: [
      { q: "Why is the raw thermal signal not the ground temperature?", opts: ["The sensor is broken", "The air absorbs and adds heat radiation, and surfaces differ in emissivity", "Clouds always block it", "The Sun interferes"], a: 1, why: "Atmosphere and emissivity. USGS Level-2 Surface Temperature corrects both." },
      { q: "A shiny metal roof and a concrete roof are both 50 °C. Which looks colder to the sensor before correction?", opts: ["Concrete", "The metal roof (low emissivity)", "They look the same", "Neither glows"], a: 1, why: "Low emissivity means it emits less than a perfect emitter at the same temperature." },
      { q: "Which product does CoolCairo use for temperature?", opts: ["Raw Landsat radiance", "USGS Collection 2 Level-2 Surface Temperature", "Weather station air temperature", "Sentinel-2 red band"], a: 1, why: "The standard, checked product, so anyone can reproduce the numbers." },
      { q: "What time of day is CoolCairo's temperature?", opts: ["Midnight", "About 10:30 am", "3 pm peak", "A daily average"], a: 1, why: "Landsat passes about 10:30 am local time." },
    ],
  },
  // ------------------------------------------------------------------ ACT 2
  {
    id: 5, act: 2, title: "Clouds and the median", sub: "Turning 65 noisy scenes into one typical summer morning",
    brief: `
      <p>Each Landsat scene comes with a <b>quality layer</b> that marks every pixel as clear, cloud, cloud shadow, cirrus and so on.
      CoolCairo removes the marked pixels (treats them as missing) because:</p>
      <ul>
        <li><b>Cloud</b>: the sensor sees the cold cloud top, not the ground. Far too cold.</li>
        <li><b>Cloud shadow</b>: the ground in shadow really is cooler than normal. Too cold as well.</li>
      </ul>
      <p>That leaves up to <b>65 clear summer readings</b> per pixel (June–August 2023–2025). They are combined with the <b>median</b>:
      sort the values and take the middle one.</p>
      <p><b>Example:</b> 46, 47, 45, 48 and 31 °C (the 31 is a cloud edge the quality layer missed). Sorted: 31, 45, <b>46</b>, 47, 48.
      The median is <b>46 °C</b>. The average would be 43.4 °C, dragged down by one bad value. The median ignores odd days.</p>
      <p>A map built this way is called a <b>median composite</b>. Sentinel-2 gets the same treatment with its own scene classification layer.</p>`,
    keys: [["65", "Clear summer Landsat scenes, Jun–Aug 2023–25"], ["< 10%", "Scene cloud cover allowed"], ["46 vs 43.4", "Median vs mean in the example"]],
    lab: "median", labTitle: "Clean up one pixel's summer", labHint: "Each bar is one date for a single pixel. Flag the readings you think are clouds or shadows, and watch how the mean and the median react.",
    field: [
      { where: "Google Earth", title: "The cloud-free planet", text: "The seamless, cloudless globe you see in Google Earth and Maps is a composite of many dates, keeping a typical clear value for each pixel.", link: "Exactly what CoolCairo does for temperature, with the median." },
      { where: "Statistics everywhere", title: "Why house prices use the median", text: "One mansion can pull the average house price up; official reports quote the median price because it ignores extremes.", link: "One missed cloud edge is CoolCairo's mansion." },
      { where: "Sentinel-2 cloudless", title: "A free global mosaic", text: "EOX publishes a cloudless Sentinel-2 mosaic of the whole Earth built from many scenes, widely used as a base map.", link: "Composites are a standard tool, not a CoolCairo trick." },
    ],
    quiz: [
      { q: "Readings: 46, 47, 45, 48, 31 °C. What is the median?", opts: ["43.4 °C", "45 °C", "46 °C", "47 °C"], a: 2, why: "Sorted 31, 45, 46, 47, 48: the middle one is 46. The mean (43.4) is dragged down by the 31." },
      { q: "Why are cloud-shadow pixels removed, not kept?", opts: ["They are too bright", "The shaded ground is cooler than on a normal sunny morning", "They are always missing", "Shadows make pixels hotter"], a: 1, why: "We want a typical sunny summer morning; shadowed ground reads too cold." },
      { q: "Why the median and not the mean?", opts: ["It is faster to compute", "It ignores odd days such as a missed cloud edge", "It always gives a hotter value", "The mean cannot be used with temperatures"], a: 1, why: "The median is robust to outliers." },
      { q: "How many summer scenes feed CoolCairo's temperature?", opts: ["1", "12", "65", "1,000"], a: 2, why: "65 Landsat 8/9 scenes, June–August 2023–2025, under 10% cloud." },
    ],
  },
  {
    id: 6, act: 2, title: "Spectral fingerprints", sub: "NDVI, brightness, the soil index and four simple rules",
    brief: `
      <p><b>Reflectance</b> is the share of sunlight a surface sends back in a band, from 0 (absorbs everything) to 1. Each material
      reflects the bands differently: a fingerprint. From six Sentinel-2 bands CoolCairo computes three numbers per 10 m pixel:</p>
      <ul>
        <li><b>NDVI = (NIR − red) ÷ (NIR + red)</b>. Plants absorb red to grow and reflect lots of near-infrared.
        Tree: NIR 0.40, red 0.05 → 0.35 ÷ 0.45 = <b>0.78</b>. Sand: 0.35 and 0.28 → 0.07 ÷ 0.63 = <b>0.11</b>.</li>
        <li><b>Visible brightness</b> = average of blue, green and red. 0.14 or less looks dark: asphalt, dark roofs, and unfortunately shadows.</li>
        <li><b>BSI (bare soil index)</b> = ((SWIR + red) − (NIR + blue)) ÷ ((SWIR + red) + (NIR + blue)). Sand and soil reflect lots of short-wave infrared and red.</li>
      </ul>
      <p>Each pixel goes through the rules <b>top to bottom</b> and takes the first label it matches:</p>
      <ol>
        <li><b>Vegetation</b> if NDVI is above 0.3</li>
        <li><b>Dark surface</b> if brightness is 0.14 or less</li>
        <li><b>Bare sand / soil</b> if BSI is above 0.137</li>
        <li><b>Pale surface</b> for everything left (light concrete, pale roofs, paving)</li>
      </ol>
      <p>The order matters: a dark, wet park would be "dark" if brightness came first. Rules anyone can check beat a black box when you must defend the result.</p>`,
    keys: [["NDVI > 0.3", "Vegetation"], ["≤ 0.14", "Dark: asphalt, dark roofs, shadow"], ["BSI > 0.137", "Bare sand / soil"]],
    lab: "spectra", labTitle: "Read the fingerprints, then classify", labHint: "Pick a material to see its fingerprint and its three numbers. Then play: label 8 mystery pixels with the four rules.",
    field: [
      { where: "FEWS NET · Africa", title: "Famine early warning", text: "The Famine Early Warning Systems Network watches NDVI across Africa every few days; failing vegetation warns of food shortages months ahead.", link: "The same index labels CoolCairo's green pixels." },
      { where: "Kenya", title: "Livestock insurance paid by satellite", text: "Index-based livestock insurance pays herders automatically when NDVI-based forage falls below normal: no inspector needs to visit.", link: "A simple, checkable index can carry real money decisions." },
      { where: "Vineyards", title: "Precision farming", text: "Growers map NDVI across fields to water, fertilise or harvest each zone differently.", link: "Fingerprints at 10 m let CoolCairo split each block into surfaces." },
    ],
    quiz: [
      { q: "A pixel has NIR 0.40 and red 0.05. What is its NDVI and label?", opts: ["0.11, sand", "0.78, vegetation", "0.35, pale", "0.05, dark"], a: 1, why: "(0.40 − 0.05) ÷ (0.40 + 0.05) = 0.78, above 0.3, so vegetation." },
      { q: "Why do shadows get labelled 'dark surface'?", opts: ["Shadows are made of asphalt", "They reflect little visible light, so brightness falls below 0.14", "NDVI is negative for shadows", "Because of the soil index"], a: 1, why: "Brightness cannot tell shade from asphalt. One reason the dark classes are uncertain." },
      { q: "Why does the order of the rules matter?", opts: ["It doesn't", "Each pixel takes the first rule it matches, so a dark vegetated pixel is called vegetation, not dark", "Later rules overwrite earlier ones", "To make it run faster"], a: 1, why: "Top-to-bottom, first match wins." },
      { q: "What makes the soil index (BSI) high?", opts: ["Lots of near-infrared", "High short-wave infrared and red compared with NIR and blue", "Low brightness", "Water"], a: 1, why: "Sand and soil reflect strongly in SWIR and red." },
    ],
  },
  {
    id: 7, act: 2, title: "Thresholds and balanced accuracy", sub: "How 0.137 was chosen, and what 75% really means",
    brief: `
      <p><b>The problem:</b> in Cairo, pale roofs and desert sand are equally bright, so brightness cannot separate them. The soil index can,
      if we pick the right <b>cut-off</b>. To choose it we need pixels whose true answer we already know:</p>
      <ul>
        <li><b>Known roofs</b>: pixels inside building outlines from OpenStreetMap.</li>
        <li><b>Known open ground</b>: pixels more than 300 m from any building.</li>
      </ul>
      <p>We try many cut-offs. For each, we count roofs correctly below it and open ground correctly above it, and keep the best: <b>0.137</b>.</p>
      <p><b>Balanced accuracy</b> = the average of "share of roofs labelled correctly" (sensitivity) and "share of open ground labelled correctly"
      (specificity). It treats both groups equally, which matters because desert pixels vastly outnumber roof pixels.</p>
      <p>Why not plain accuracy? If 95% of pixels are desert, a rule that calls <b>everything</b> desert is 95% "accurate" and useless.
      Balanced accuracy would give it 50%.</p>
      <p><b>75%</b> means about 1 pixel in 4 is still mislabelled, one reason the material labels are treated as approximate.</p>`,
    keys: [["0.137", "Best soil-index cut-off"], ["75%", "Balanced accuracy at that cut-off"], ["300 m", "Distance from buildings that counts as known open ground"]],
    lab: "threshold", labTitle: "Find the best cut-off", labHint: "Drag the cut-off. Roofs (blue) should fall below it, open ground (orange) above it. Compare plain and balanced accuracy. Distributions are illustrative, tuned to the real result.",
    field: [
      { where: "Medicine", title: "Screening tests", text: "A test for a rare disease is judged by sensitivity (sick people caught) and specificity (healthy people cleared), not raw accuracy, because a test saying 'healthy' to everyone would look 99% accurate.", link: "Roofs are CoolCairo's rare disease." },
      { where: "Email", title: "Spam filters", text: "Moving a filter's threshold trades missed spam against good mail in the junk folder; providers tune it on labelled examples.", link: "Same trade-off as moving the BSI cut-off." },
      { where: "Banks", title: "Fraud detection", text: "Fraud is rare, so models are tuned and reported with balanced measures; plain accuracy would reward ignoring fraud.", link: "Imbalanced classes need balanced scores." },
    ],
    quiz: [
      { q: "Why was balanced accuracy used instead of plain accuracy?", opts: ["It always gives higher numbers", "Desert pixels far outnumber roof pixels, so plain accuracy would reward calling everything desert", "Plain accuracy cannot be computed", "The judges asked for it"], a: 1, why: "Balanced accuracy averages the two groups' success rates, so the rare class counts equally." },
      { q: "Where did the 'known roofs' come from?", opts: ["A survey of every building", "Pixels inside OpenStreetMap building outlines", "Google Street View", "Guessing"], a: 1, why: "Known roofs: inside OSM footprints. Known open ground: more than 300 m from any building." },
      { q: "A rule labels every pixel 'desert' where 95% are desert. Balanced accuracy?", opts: ["95%", "50%", "100%", "5%"], a: 1, why: "Desert 100% correct, roofs 0% correct: (100 + 0) ÷ 2 = 50%." },
      { q: "What does 75% balanced accuracy mean in practice?", opts: ["The model is perfect", "About 1 pixel in 4 is still mislabelled", "75% of Cairo is sand", "The cut-off is 0.75"], a: 1, why: "So material shares are approximate, an honest limit." },
    ],
  },
  {
    id: 8, act: 2, title: "Blocks, buildings and people", sub: "Fusing five sources into one row per block",
    brief: `
      <p>For every 90 m block CoolCairo fills one row of facts, a process called <b>data fusion at block level</b>:</p>
      <ul>
        <li><b>Surfaces</b>: the 81 Sentinel-2 pixels inside the block give shares of vegetation, dark, pale and sand. OpenStreetMap
        outlines then split each label into <b>roof</b> or <b>ground</b>: dark roof, pale roof, dark ground, sand, vegetation.</li>
        <li><b>Temperature</b>: the median of the 9 Landsat pixels inside.</li>
        <li><b>Building height</b>, from the best source available: a height in OSM, else floors × 3.2 m, else Google's satellite estimate,
        else a default of 5 floors. In east Cairo 74% use Google heights; against 165 known heights the median error is 4.2 m.</li>
        <li><b>People</b>: WorldPop residents per block (2024, 100 m, modelled, not a census).</li>
      </ul>
      <p><b>Heat exposure</b> joins heat and people: residents × degrees above a typical block, in person·°C. The typical block is the median
      of east Cairo's built-up blocks, <b>45.66 °C</b>. A block at 47.66 °C with 100 residents scores 2 × 100 = <b>200 person·°C</b>.
      A block cooler than typical scores zero. Nasr City: <b>95,141 residents, 6,460 person·°C</b>.</p>
      <p><b>Mixed pixels.</b> A 10 m pixel is often half roof, half road. Simple rules give it one label. <b>Spectral unmixing</b> instead
      treats the pixel's spectrum as a blend of pure "endmember" spectra and solves for each share: a key topic for the hyperspectral course.</p>`,
    keys: [["81", "Sentinel-2 pixels per block (9 × 9)"], ["45.66 °C", "Typical block: the heat line"], ["6,460", "Nasr City person·°C today"]],
    lab: "fusion", labTitle: "Build a block, then unmix a pixel", labHint: "Paint the 9 × 9 pixels of one block and watch its row of facts update. Then try to unmix a mixed pixel by matching its spectrum.",
    field: [
      { where: "Nigeria · GRID3", title: "Population maps for vaccination", text: "Modelled population maps from satellite-detected settlements helped polio teams find communities missing from old lists.", link: "WorldPop, used by CoolCairo, comes from the same family of methods." },
      { where: "Humanitarian mapping", title: "Google Open Buildings", text: "Hundreds of millions of building outlines detected from imagery are used to plan aid, census work and electrification across Africa and Asia.", link: "CoolCairo takes its heights from Google's 2.5D version." },
      { where: "Insurance", title: "Exposure = hazard × people", text: "Catastrophe models multiply hazard maps by what is exposed (people, buildings) to price flood or storm risk.", link: "Person·°C is the same hazard × exposure idea for heat." },
    ],
    quiz: [
      { q: "A block is 47.66 °C with 100 residents; the typical block is 45.66 °C. Its heat exposure?", opts: ["100 person·°C", "200 person·°C", "4,766 person·°C", "0"], a: 1, why: "(47.66 − 45.66) × 100 = 200 person·°C." },
      { q: "A block at 44 °C with 3,000 residents has exposure…", opts: ["3,000", "0, because it is cooler than typical", "−5,000", "132,000"], a: 1, why: "Only degrees above the typical block count." },
      { q: "Building height comes first from…", opts: ["Google's estimate", "A height written in OpenStreetMap", "A default of 5 floors", "WorldPop"], a: 1, why: "OSM height → floors × 3.2 m → Google 2.5D → 5 floors." },
      { q: "What is spectral unmixing?", opts: ["Removing clouds", "Estimating the share of each pure material inside a mixed pixel from its spectrum", "Mixing bands into a colour image", "Averaging pixels into blocks"], a: 1, why: "A mixed pixel's spectrum ≈ a weighted blend of endmember spectra; unmixing finds the weights." },
    ],
  },
  // ------------------------------------------------------------------ ACT 3
  {
    id: 9, act: 3, title: "The heat model", sub: "Linear regression as a recipe",
    brief: `
      <p>The satellite tells us how hot every block is <b>today</b>. It cannot tell us what would happen <b>if</b> we changed the block.
      A formula can: change the block's ingredients, and the formula gives the new temperature. That is what the app does live.</p>
      <p><b>Linear regression</b> finds a formula that is a plain weighted sum. Each share is a fraction of the block (0.3 = 30%):</p>
      <p class="mono" style="background:var(--bg-2);border:1px solid var(--line);border-radius:10px;padding:12px">Temperature = 45.83 − 3.15·veg + 3.36·sand + 0.12·asphalt<br>+ 2.29·roofs − 11.28·dark roofs − 0.062·height (m)</p>
      <p>Pale ground is the starting point: a block of only pale ground is 45.83 °C. Each coefficient is the change if the <b>whole</b> block
      switched to that surface: all plants 3.15 °C cooler, all sand 3.36 °C hotter. Half a block of sand adds half.</p>
      <p><b>Where the numbers come from:</b> 2,538 built-up blocks (at least 10% roof) with known Landsat temperatures. The computer picks
      the coefficients that make the squared misses as small as possible: <b>ordinary least squares</b>.</p>
      <p><b>Sign check.</b> Dark roofs come out 11.28 °C <i>cooler</i>, which is physically impossible. An automatic check catches it and cool
      roofs use published physics instead. The cause is not confirmed: shadow, rooftop clutter or trees in the 10 m "dark" class are candidates,
      and dark roofs cover only about 0.5% of an urban block, so the number rests on very little data.</p>`,
    keys: [["45.83 °C", "A block of only pale ground"], ["2,538", "Built-up blocks the model learned from"], ["−11.28", "Dark-roof coefficient: wrong sign, not used"]],
    lab: "recipe", labTitle: "Cook a block, then fit a line", labHint: "Mix a block from its ingredients and see each one's contribution. Then fit a line by hand and race the computer's least squares.",
    field: [
      { where: "Real estate", title: "Pricing a house by its features", text: "Hedonic price models are regressions: price = base + value per bedroom + value per square metre + location effects. Tax offices and banks use them.", link: "Same structure: block temperature = base + effect per surface." },
      { where: "Public health", title: "Heat and mortality", text: "Epidemiologists regress daily deaths on temperature to find how many extra deaths each degree above a threshold brings.", link: "Coefficients turn 'more heat' into 'how much more harm'." },
      { where: "Marketing", title: "What drives sales", text: "Marketing-mix models estimate how much each channel (TV, search, shelf space) adds to sales, to plan budgets.", link: "Regression supports what-if planning, exactly like the app." },
    ],
    quiz: [
      { q: "Turn half of a pale-ground block into sand. Predicted temperature?", opts: ["45.83 °C", "47.51 °C", "49.19 °C", "42.47 °C"], a: 1, why: "45.83 + 3.36 × 0.5 = 47.51 °C." },
      { q: "What does 'ordinary least squares' minimise?", opts: ["The number of inputs", "The sum of squared misses between predictions and real temperatures", "The largest error", "The coefficients"], a: 1, why: "It searches for coefficients that make squared misses as small as possible." },
      { q: "Why is the dark-roof coefficient not used for cool roofs?", opts: ["It is too small", "Its sign is impossible (dark roofs cooler), so a sign check switches to published physics", "Nobody has dark roofs", "It was never computed"], a: 1, why: "Cause not confirmed; dark roofs are only ~0.5% of an urban block, so the number rests on little data." },
      { q: "Why keep the formula simple and linear?", opts: ["Linear models are always the most accurate", "The app recomputes it instantly while painting, and anyone can read and check every number", "Computers cannot fit other models", "It was required by Landsat"], a: 1, why: "Speed and transparency. Every measure's effect is a clear number of °C." },
    ],
  },
  {
    id: 10, act: 3, title: "Scoring a model", sub: "R², MAE, and the lazy guess",
    brief: `
      <p><b>MAE (mean absolute error)</b> is the average size of a miss. CoolCairo's <b>±1.2 °C</b> means a prediction is on average
      1.2 °C above or below the real temperature.</p>
      <p><b>R²</b> compares the model with a lazy guess: "every block has the average temperature". It measures how much of the lazy
      guess's error the model removes:</p>
      <p class="mono" style="background:var(--bg-2);border:1px solid var(--line);border-radius:10px;padding:12px">R² = 1 − (model's squared misses ÷ lazy guess's squared misses)</p>
      <p>R² = 1 is perfect, 0 is no better than the lazy guess. <b>R² = 0.25</b>: the model removes a quarter of the lazy guess's error. In words,
      it explains a quarter of the differences between blocks.</p>
      <p>Built-up blocks typically differ from the average by about <b>1.9 °C</b>; the model misses by 1.2 °C. So it is <b>good for ranking</b>
      blocks and comparing measures, <b>not for the exact temperature of one block</b>.</p>
      <p>Two more things to notice. Tested on the blocks it learned from, R² is 0.38; on hidden areas 0.25 (next mission). And its predictions are
      <b>squeezed towards the average</b>: hot blocks predicted a bit too cool, cool ones a bit too hot. That is normal for a modest model.</p>`,
    keys: [["0.25", "R² on hidden areas"], ["±1.2 °C", "Mean absolute error"], ["1.9 °C", "Typical spread between blocks"]],
    lab: "score", labTitle: "Watch R² and MAE move", labHint: "Each dot is a block: real temperature against prediction. Make the model better or worse and see both scores. The orange bars are the lazy guess's misses, blue the model's.",
    field: [
      { where: "Weather services", title: "Grading forecasts", text: "Met offices publish the mean absolute error of their temperature forecasts and how much skill they add over climatology (the 'lazy guess' of the usual value for that day).", link: "Skill over a lazy guess is exactly what R² measures." },
      { where: "Sports analytics", title: "Expected goals", text: "Models that predict goals from shot position are scored by how much better they do than assuming every shot has the average chance.", link: "Low R² can still rank chances usefully." },
      { where: "Credit scoring", title: "Ranking, not certainty", text: "A score that cannot say exactly who will default can still rank borrowers well enough to set fair rates.", link: "CoolCairo's model ranks blocks; it does not promise one block's exact temperature." },
    ],
    quiz: [
      { q: "R² = 0.25 means…", opts: ["The model is right 25% of the time", "It removes a quarter of the lazy guess's squared error: it explains a quarter of the differences between blocks", "The error is 0.25 °C", "25% of blocks are hot"], a: 1, why: "R² = 1 − model error ÷ lazy-guess error." },
      { q: "MAE ±1.2 °C with a 1.9 °C typical spread. What is the model good for?", opts: ["Exact temperature of one block", "Ranking blocks and comparing measures", "Predicting air temperature", "Nothing"], a: 1, why: "Errors are smaller than the spread, enough to rank; not enough for one exact block." },
      { q: "What is the 'lazy guess' in R²?", opts: ["A random number", "Every block has the average temperature", "The hottest block", "Yesterday's temperature"], a: 1, why: "R² = 0 means no better than predicting the average everywhere." },
      { q: "Why is R² lower on hidden areas (0.25) than on training blocks (0.38)?", opts: ["A bug", "A model always looks better on data it learned from; hidden areas give the honest score", "The hidden areas are hotter", "Different satellites"], a: 1, why: "Testing on unseen areas removes the advantage of memorising." },
    ],
  },
  {
    id: 11, act: 3, title: "The hidden-areas exam", sub: "Spatial cross-validation and why random tests cheat",
    brief: `
      <p>To know if a model works you must test it on blocks it did <b>not</b> learn from. <b>Cross-validation</b> splits the data into groups,
      learns from some, tests on the rest, and rotates so every group is tested once.</p>
      <p><b>The trap:</b> with random groups, a hidden block usually has a neighbour in the learning set, and neighbours are almost identical.
      The model "copies" from next door and the score looks far better than it is. Geographers call this <b>Tobler's first law</b>:
      near things are more related than distant things.</p>
      <p><b>The fix, spatial cross-validation:</b> hide <b>whole areas</b>. The map is cut into <b>1 km × 1 km</b> squares (about 11 × 11 blocks).
      All blocks in a square stay together, and the squares are split into <b>5 groups</b>. Learn from 4, test on the 5th, repeat until every
      square has been hidden once.</p>
      <p>Like testing a student on a whole chapter they never studied instead of questions next to the ones they practised. The score is lower
      but honest, and it is the same situation as using the model in a new district. For the hyperspectral test, 2 km and 3 km squares made the exam even harder.</p>`,
    keys: [["1 km", "Hidden squares (~11 × 11 blocks)"], ["5", "Groups; each hidden once"], ["0.38 → 0.25", "R² on learned blocks → hidden areas"]],
    lab: "spatialcv", labTitle: "Run both exams on a toy city", labHint: "A model that copies its nearest learned neighbour is tested two ways. Random folds leak; spatial folds don't. Run the rounds and compare the scores.",
    field: [
      { where: "Ecology", title: "Where species live", text: "Species distribution models are now tested with spatially blocked cross-validation, after studies showed random folds badly overstated their accuracy.", link: "Same fix CoolCairo uses: hide whole areas." },
      { where: "Agriculture", title: "Crop yield from space", text: "Yield models must be tested on regions or years they never saw; otherwise they look great in the lab and fail in a new province.", link: "A new district is CoolCairo's new province." },
      { where: "Finance", title: "No peeking at the future", text: "Trading models are validated on later time periods only. Testing on shuffled dates leaks tomorrow's information into today.", link: "Leakage through space or time: same mistake, same cure." },
    ],
    quiz: [
      { q: "Why do random test groups overstate accuracy on maps?", opts: ["They are too small", "Neighbouring blocks are nearly identical, so the model copies from next door", "They hide too many blocks", "Random numbers are biased"], a: 1, why: "Spatial autocorrelation (Tobler's law) leaks information into the test." },
      { q: "How big are CoolCairo's hidden squares?", opts: ["90 m", "1 km × 1 km (~11 × 11 blocks)", "10 km", "One block each"], a: 1, why: "1 km squares in 5 groups; 2 km and 3 km for the hyperspectral test." },
      { q: "Why is the lower, spatial score the one to report?", opts: ["It sounds modest", "It matches using the model in a new district it never saw", "The judges prefer low numbers", "It is easier to compute"], a: 1, why: "The honest score for real use." },
      { q: "A model scores R² 0.9 with random folds and 0.25 with spatial folds. Most likely?", opts: ["Spatial CV is broken", "The random score is inflated by leakage", "The model is excellent", "Both are equally valid"], a: 1, why: "The gap is the leak." },
    ],
  },
  // ------------------------------------------------------------------ ACT 4
  {
    id: 12, act: 4, title: "Cooling measures and targeting", sub: "Albedo, four measures, and why knowing where pays",
    brief: `
      <p><b>Albedo</b> is how much sunlight a surface reflects (0 = all absorbed, 1 = all reflected). Raise it and the surface heats less.
      A block's satellite temperature is close to the average of its surfaces, so a measure's effect is:
      <b>effect per fully treated block × share of the block treated</b>.</p>
      <div class="table-wrap"><table class="t"><tr><th>Measure</th><th>What changes</th><th class="n">Whole block</th><th>Source</th></tr>
      <tr><td>Cool roofs</td><td>Roofs painted white (albedo → 0.70)</td><td class="n">−4.64 dark / −3.60 pale</td><td>Published: −8 °C per unit albedo (Wang et al. 2020)</td></tr>
      <tr><td>Street trees</td><td>Up to 25% of asphalt planted</td><td class="n">−3.28</td><td>Our model: vegetation minus dark ground</td></tr>
      <tr><td>Cool pavements</td><td>Asphalt albedo 0.12 → 0.40</td><td class="n">−2.24</td><td>Same physics as roofs</td></tr>
      <tr><td>Pocket parks</td><td>Up to 50% of sand turned green</td><td class="n">−6.51</td><td>Our model: vegetation minus sand</td></tr></table></div>
      <p>Example: a block that is 40% sand gets a park on half that sand, so 20% of the block changes: 6.51 × 0.2 = about <b>1.3 °C cooler</b>.</p>
      <p><b>Results in Nasr City</b> (one measure on every block): cool roofs −41%, trees −24%, pavements −52%, parks −60% heat exposure.
      Cool roofs + pocket parks on the riskiest third (192 blocks): <b>6,460 → 1,686 person·°C, −74%</b>.</p>
      <p><b>The expert reading.</b> Exposure only counts degrees above 45.66 °C, and only <b>106 of 576</b> blocks are above it. So the same two measures on
      <b>every</b> block also give −74%, and on just those 106 blocks too, with <b>82% less area</b> (23 ha instead of 126 ha). On a random third they give
      about <b>−25%</b>. Targeting does not cut more; it cuts the same with far less work. "Knowing where pays."</p>
      <p>Keep the numbers honest: this is a <b>model scenario</b> for surface temperature, not a measurement. City-wide cool roofs lower <b>air</b> temperature by roughly
      0.1–0.33 °C per +0.1 albedo. The park effect is probably overstated: allowing for sand in neighbouring blocks roughly halves it.</p>`,
    keys: [["−74%", "Same cut on 106 hot blocks, the riskiest third or every block"], ["82%", "Less area when only the hot blocks are treated"], ["−25%", "Same measures on a random third"]],
    lab: "targeting", labTitle: "Plan a toy district", labHint: "First feel albedo. Then place cool roofs and parks on a toy district and compare targeted, random and everywhere. Toy numbers, real arithmetic.",
    field: [
      { where: "Los Angeles · 2017–", title: "Cool pavement streets", text: "The city coated streets with a grey reflective sealant; crews measured road surfaces several degrees cooler than untreated asphalt in summer.", link: "CoolCairo's cool pavements: albedo 0.12 → 0.40, −2.24 °C per fully treated block." },
      { where: "New York · 2009–", title: "NYC CoolRoofs", text: "The city has coated millions of square feet of rooftops white with trained local workers, cutting roof temperatures and building cooling costs.", link: "Same −8 °C per unit albedo physics CoolCairo uses." },
      { where: "Medellín, Colombia · 2016–2019", title: "Green Corridors", text: "Thirty planted corridors along roads and streams were reported to lower local temperatures by around 2 °C and won an international design award.", link: "Street trees and pocket parks in the app." },
      { where: "Ahmedabad, India", title: "Cool roofs for the poorest", text: "Women-led groups painted tin and concrete roofs in informal settlements with reflective coatings, lowering indoor temperatures.", link: "Targeting where people are most exposed." },
    ],
    quiz: [
      { q: "A block is 40% sand; a park greens half of it. Cooling?", opts: ["About 0.65 °C", "About 1.3 °C", "About 2.6 °C", "About 6.5 °C"], a: 1, why: "20% of the block changes: 6.51 × 0.2 ≈ 1.3 °C." },
      { q: "Why do the same measures on every block also give −74%?", opts: ["A bug", "Exposure only counts heat above the typical block; cooling blocks already below it removes nothing", "Every block is hot", "Parks are free"], a: 1, why: "106 of 576 blocks carry all the exposure. Targeting saves area, not extra cuts." },
      { q: "Which cooling numbers come from published physics, not the team's model?", opts: ["Trees and parks", "Cool roofs and cool pavements", "All four", "None"], a: 1, why: "Roofs and pavements: −8 °C per unit albedo (Wang et al. 2020). Trees and parks: the regression." },
      { q: "How should you describe the −74%?", opts: ["A measured result from Nasr City", "A model scenario for surface temperature that a pilot would need to measure on the ground", "An air-temperature forecast", "A guarantee"], a: 1, why: "Honest framing wins trust in a pitch." },
    ],
  },
  {
    id: 13, act: 4, title: "Hyperspectral data", sub: "203 bands, a fair test, and a control",
    brief: `
      <p><b>Multispectral</b> sensors (Sentinel-2) record a few wide bands. <b>Hyperspectral</b> sensors record hundreds of narrow, contiguous bands, a full
      spectrum per pixel. <b>EnMAP</b>, the German hyperspectral satellite launched in 2022, gives 30 m pixels and, after removing water-vapour bands,
      <b>203 usable bands</b>. DLR delivers it atmospherically corrected (L2A).</p>
      <p><b>The research test</b> (separate from the app's model) ran the same hidden-areas exam three times:</p>
      <div class="table-wrap"><table class="t"><tr><th>Inputs</th><th class="n">R² (hidden areas)</th></tr>
      <tr><td>Model ingredients only</td><td class="n">0.25</td></tr><tr><td>Ingredients + Sentinel-2 (6 bands)</td><td class="n">0.40</td></tr>
      <tr><td>Ingredients + EnMAP (203 bands)</td><td class="n">0.58</td></tr></table></div>
      <p>The unexplained part drops from 60% to 42%. With hundreds of inputs a plain regression becomes unstable, so the test uses
      <b>ridge regression</b>, which shrinks coefficients to stay stable.</p>
      <p><b>The control.</b> EnMAP and Sentinel-2 also differ in date, satellite and pixel size. So the team built a "fake Sentinel-2" from EnMAP itself by
      averaging its narrow bands into Sentinel-2's six. Same date, same pixels, only the number of bands differs. Spectra alone: real Sentinel-2
      <b>0.31</b>, cut-down EnMAP <b>0.33</b>, full EnMAP <b>0.53</b>. The gain comes from the <b>spectral detail</b>.</p>
      <p>Not everything improves: for telling buildings from desert, 58 days of Sentinel-2 (0.86) beat one EnMAP date (0.82). EnMAP is not in the app
      yet because Cairo has only one April scene. Next: <b>PCA</b> to compress bands, <b>endmember unmixing</b>, and Satellite 813 data.</p>`,
    keys: [["203", "Usable EnMAP bands"], ["0.40 → 0.58", "R² adding Sentinel-2 vs adding EnMAP"], ["0.31 · 0.33 · 0.53", "The control: S-2, EnMAP cut to S-2, full EnMAP"]],
    lab: "hyper", labTitle: "Six wide bands versus 203 narrow ones", labHint: "Two roof materials look the same through six wide bands but not through narrow ones. Then run the control experiment and squeeze bands with PCA.",
    field: [
      { where: "Mining", title: "Mapping minerals from the air", text: "NASA's AVIRIS instrument mapped minerals at Cuprite, Nevada, from their narrow absorption features, a classic that founded hyperspectral geology.", link: "Narrow features separate materials that wide bands blur together." },
      { where: "Climate", title: "Catching methane super-emitters", text: "Imaging spectrometers like EMIT on the space station and airborne AVIRIS-NG detect methane plumes from leaking oil, gas and landfill sites so operators can fix them.", link: "Hundreds of bands see gases and materials invisible in six." },
      { where: "Food and recycling", title: "Sorting on a conveyor belt", text: "Factories use hyperspectral cameras to reject bruised fruit or sort plastics by polymer type at high speed.", link: "The same fingerprint idea could separate Cairo's pale roofs from sand." },
    ],
    quiz: [
      { q: "What did cutting EnMAP down to Sentinel-2's six bands prove?", opts: ["EnMAP is broken", "The gain comes from spectral detail, not the date or satellite (0.33 vs 0.31, full 0.53)", "Sentinel-2 is better", "Nothing"], a: 1, why: "A control changes only one thing: the number of bands." },
      { q: "Why use ridge regression for the hyperspectral test?", opts: ["It is newer", "It stays stable with hundreds of correlated inputs", "It predicts yes/no", "It removes clouds"], a: 1, why: "Ridge shrinks coefficients so many bands don't blow up the fit." },
      { q: "Why is EnMAP not in the app's model yet?", opts: ["It made results worse", "Only one April scene over Cairo; strong signal, not yet a production input", "It is too expensive to view", "It has no thermal band"], a: 1, why: "Main upgrade path: summer scenes and Satellite 813." },
      { q: "Why 0.25 in the app but 0.58 in the test?", opts: ["Two different things: the app's simple model vs a research test adding raw spectra", "A typo", "Different cities", "0.58 was on training data"], a: 0, why: "0.25 = simple app model; 0.40 vs 0.58 compares satellites on the same blocks and hidden areas." },
    ],
  },
  {
    id: 17, act: 4, title: "Clean bands, better shares", sub: "Band cleaning and all-band ridge: CoolCairo's hyperspectral upgrade path",
    brief: `
      <p>A team experiment tested what actually improves results with hyperspectral data. Two steps came out on top, and both are now
      CoolCairo's recommended path for EnMAP and, later, Satellite 813.</p>
      <p><b>Step 1: clean the bands.</b> Some bands carry almost no ground signal, so they add only noise:</p>
      <ul>
        <li><b>Water-vapour bands</b> around 1.35–1.45 µm and 1.80–1.95 µm, where the air absorbs the light.</li>
        <li><b>Detector edges</b>: at the ends of each detector's range the detector, the optics and the sunlight all weaken, so the
        <b>signal-to-noise ratio (SNR)</b> collapses.</li>
        <li><b>The VNIR/SWIR junction</b> (about 900–1,000 nm), where EnMAP's two detectors overlap, both are at their weak edge, water vapour absorbs
        near 940 nm and the two spectra can join with a small step. Keep one clean copy, not two noisy ones.</li>
      </ul>
      <p>You can measure SNR from the image itself. Real spectra are smooth from one band to the next; noise is not. So the residual
      <b>r = x<sub>b</sub> − (x<sub>b−1</sub> + x<sub>b+1</sub>) ÷ 2</b> is mostly noise. SNR ≈ mean signal ÷ spread of r. Flag bands below a threshold
      (for example 20), then <b>review the list</b>: bands beside a water-vapour gap or on a sharp real absorption feature can be flagged by mistake.
      EnMAP's 224 bands become CoolCairo's 203 usable ones this way.</p>
      <p><b>Step 2: keep every clean band, and let ridge regression do the work.</b> Instead of labelling each pixel, predict the <b>share</b> of each
      material directly from its full spectrum. With hundreds of correlated bands, plain least squares overreacts to noise. <b>Ridge regression</b>
      adds a penalty, λ × (sum of squared coefficients), that shrinks the coefficients. Neighbouring bands then share the weight instead of fighting.
      λ is chosen on training data only, and the predicted shares are clipped at zero and rescaled to add up to one.</p>
      <p><b>What the experiment found</b> (HYDICE Urban, 400–2500 nm, hidden tiles):</p>
      <ul>
        <li>Share error per 90 m block: <b>1.8 points</b> with all clean bands + ridge, against <b>6.5</b> with Sentinel-2-like bands: about <b>3.5× smaller</b>.</li>
        <li>Roof-vs-dirt error, CoolCairo's pale-roof-or-sand problem: <b>8.0 → 5.0 points</b> per 10 m pixel.</li>
        <li>Picking 20 "best" bands did worse (7.3 points per 10 m pixel vs 5.3), and so did a layered model (6.2).</li>
        <li>With noisy edge bands left in, all-band ridge barely changed; models that <b>select</b> bands collapsed until the noisy bands were removed
        (layered: 0.74 → 0.93 balanced accuracy).</li>
      </ul>
      <p>These were airborne benchmark scenes at 2 m, not Cairo. EnMAP's 30 m pixels mix more surfaces, so the next step is to confirm the same ranking on the Cairo EnMAP scene.</p>`,
    keys: [["203 of 224", "EnMAP bands left after cleaning"], ["≈ 3.5×", "Smaller block-share error than Sentinel-2-like bands"], ["SNR < 20", "Flag, then review before dropping"]],
    note: { kind: "gold", html: "<b>The recipe:</b> clean the bands → keep everything that is left → ridge regression for material shares → shares per 90 m block → the heat model. Band selection is for understanding which wavelengths matter, not for scoring." },
    lab: "cleanridge", labTitle: "Clean a scene, then predict shares", labHint: "First find the noisy bands from the image itself and clean them. Then train ridge regression to predict roof and sand shares, and compare it with Sentinel-2-like bands and with a handful of selected bands. Simulated spectra, real arithmetic; the last chart shows the real experiment.",
    field: [
      { where: "Weather forecasting", title: "Blacklisting noisy channels", text: "Forecast centres feed thousands of channels from hyperspectral sounders such as IASI and AIRS into their models, but first monitor each channel and leave out the noisy or unreliable ones.", link: "The same step as CoolCairo's band cleaning: measure each band, drop what is mostly noise." },
      { where: "Food and pharma labs", title: "Predicting protein and moisture from spectra", text: "Near-infrared analysers predict a sample's protein, fat or moisture from hundreds of correlated wavelengths using regularised regression (ridge, PLS) rather than a few hand-picked bands.", link: "Exactly the ridge-on-all-bands idea, applied to grain instead of city blocks." },
      { where: "Genetics", title: "Thousands of correlated inputs", text: "Models that predict traits from thousands of genetic markers rely on ridge-type penalties, because the inputs far outnumber the samples and are strongly correlated.", link: "When inputs are many and correlated, shrink the weights instead of throwing inputs away." },
    ],
    quiz: [
      { q: "Why is the residual x_b − (x_{b−1} + x_{b+1}) ÷ 2 a good way to measure a band's noise?", opts: ["It removes clouds", "Real spectra are smooth across neighbouring bands, so what is left is mostly noise", "It equals the signal", "It only works for vegetation"], a: 1, why: "Signal changes slowly from band to band; noise is independent in each band, so it survives the subtraction." },
      { q: "What does the ridge penalty do?", opts: ["Deletes bands", "Shrinks the coefficients so many correlated bands share the weight instead of overreacting to noise", "Adds more bands", "Makes the model classify instead of predict shares"], a: 1, why: "Least squares + λ × (sum of squared coefficients). λ is chosen on training data only." },
      { q: "In the experiment, how did all clean bands + ridge compare with Sentinel-2-like bands for shares per 90 m block?", opts: ["About the same", "About 3.5× smaller error (1.8 vs 6.5 points)", "Worse", "Only better for vegetation"], a: 1, why: "And roof-vs-dirt error fell from 8.0 to 5.0 points per 10 m pixel." },
      { q: "Your SNR check flags a band right beside the 1.94 µm water-vapour gap. What should you do?", opts: ["Always drop every flagged band automatically", "Review it: the estimator can flag bands at gap edges or sharp real features, so check the wavelength before dropping", "Keep all bands, never clean", "Replace it with Sentinel-2"], a: 1, why: "Flag, then review. Most flagged bands go, but the decision is checked against the wavelength." },
    ],
  },
  {
    id: 14, act: 4, title: "Growth and other cities", sub: "Desert expansion and whether the method travels",
    brief: `
      <p>Google Open Buildings 2.5D Temporal maps building presence every year at 4 m. East Cairo's building area grew from
      <b>37.1 to 39.2 km²</b> between 2016 and 2023 (+5.7%). <b>988 blocks</b> turned from open land into built-up blocks, with 61,145 residents in 2024.</p>
      <p>New blocks average <b>46.9 °C</b>, older built blocks 46.0 °C, open desert 48.6 °C. Building on sand cools it somewhat, but new districts
      stay about 1 °C hotter than mature ones with trees and shade.</p>
      <p><b>The expert reading.</b> Most of that 1 °C is because new blocks are still sandy and less built up. Allowing for building cover, sand and
      vegetation, the gap shrinks to about <b>+0.2 °C</b>. The lesson stays: design cooling in <b>while</b> areas are being built, when it is cheapest.
      (This compares places, not one place over time.)</p>
      <p><b>Does it travel?</b> The same pipeline ran unchanged in four more cities:</p>
      <div class="table-wrap"><table class="t"><tr><th>City</th><th class="n">Model R²</th><th class="n">Typical block</th><th class="n">S-2 → EnMAP</th></tr>
      <tr><td>Cairo (Nasr City)</td><td class="n">0.25</td><td class="n">44.6 °C</td><td class="n">0.40 → 0.58</td></tr>
      <tr><td>Algiers (Bab El Oued)</td><td class="n">0.16</td><td class="n">40.3 °C</td><td class="n">0.26 → 0.49</td></tr>
      <tr><td>Casablanca (Hay Mohammadi)</td><td class="n">0.20</td><td class="n">42.3 °C</td><td class="n">no cloud-free scene</td></tr>
      <tr><td>Dubai (Al Karama)</td><td class="n">0.17</td><td class="n">49.5 °C</td><td class="n">0.31 → 0.63</td></tr>
      <tr><td>Riyadh (Al Malaz)</td><td class="n">0.25</td><td class="n">52.2 °C</td><td class="n">0.37 → 0.52</td></tr></table></div>
      <p>Two lessons: the model works at a similar, modest level everywhere, and EnMAP beat Sentinel-2 in every city tested, with scenes from
      different seasons and years. These cities are not locally validated yet.</p>`,
    keys: [["+5.7%", "Building area 2016 → 2023"], ["46.9 vs 46.0 °C", "New vs older blocks (+0.2 °C after controls)"], ["4/4", "Cities where EnMAP beat Sentinel-2"]],
    lab: "growth", labTitle: "Watch a city grow, compare five cities", labHint: "Slide through the years on a toy desert edge. Then compare the five test cities.",
    field: [
      { where: "EU · Global Human Settlement Layer", title: "Every town on Earth, 1975–2030", text: "The JRC maps built-up areas worldwide from Landsat and Sentinel data to track urbanisation for UN goals.", link: "Growth maps tell planners where heat risk is about to appear." },
      { where: "Egypt", title: "New cities on the desert", text: "Egypt is building new cities such as the New Administrative Capital east of Cairo, on exactly the kind of sand CoolCairo finds hottest.", link: "The cheapest time to design in shade, trees and cool roofs is before the concrete." },
      { where: "Riyadh", title: "Planting a desert capital", text: "Riyadh has announced a programme to plant millions of trees across the city to cool streets and improve air.", link: "Riyadh's typical block was 52.2 °C, the hottest of the five test cities." },
    ],
    quiz: [
      { q: "Why does the new-vs-old gap shrink from about 1 °C to 0.2 °C after controls?", opts: ["The data changed", "New blocks are sandier and less built up; allowing for that explains most of the gap", "Old blocks got hotter", "Different satellites"], a: 1, why: "Controls separate 'new' from 'sandy'." },
      { q: "In how many of the test cities with an EnMAP scene did it beat Sentinel-2?", opts: ["None", "Half", "All of them", "Only Cairo"], a: 2, why: "Cairo, Algiers, Dubai and Riyadh, with different seasons and years: not one lucky image." },
      { q: "Which test city had the hottest typical block?", opts: ["Cairo", "Algiers", "Dubai", "Riyadh"], a: 3, why: "Riyadh 52.2 °C; Dubai 49.5 °C." },
      { q: "What is the practical lesson of the growth result?", opts: ["Stop building", "Design cooling in while new areas are being built", "Move to the desert", "Paint the desert white"], a: 1, why: "It is cheapest to build shade and cool surfaces in from the start." },
    ],
  },
  {
    id: 15, act: 4, title: "Honest limits and verification", sub: "How to check work and say only what the data supports",
    brief: `
      <p><b>How CoolCairo checks its work:</b> every score uses hidden areas; a sign check runs on every fit; building heights are compared with 165 known
      heights (median error 4.2 m); the app checks the exact satellite scenes against the live archives at start-up; 24 code tests and 90 in-app checks pass;
      a material spot check found 89% agreement at 18 points.</p>
      <p><b>Honest limits:</b></p>
      <ul>
        <li><b>Surface, not air.</b> Roofs and roads at 10:30 am. Air cools less.</li>
        <li><b>Blocks only.</b> The heat sensor sees ~100 m; no single-building temperatures.</li>
        <li><b>Modest model.</b> R² 0.25: rank and compare, not one block exactly.</li>
        <li><b>Approximate materials.</b> Shadow can look like a dark roof; dusty surfaces like sand. The spot check was <b>not blind</b>: the checker could see the labels.</li>
        <li><b>One EnMAP scene per city.</b> A strong, repeated signal, not yet a production model.</li>
        <li><b>Heat risk is a screen.</b> No vulnerability (age, housing, cooling access); WorldPop is modelled.</li>
        <li><b>Pocket parks likely overstated</b> and water for planting is not modelled.</li>
      </ul>
      <p>Measures researched but left out: green roofs (cost, water, structure), shade sails (the satellite sees the hot top of the sail) and water features (local, scarce water).</p>
      <p><b>Your role as verifier:</b> separate what was measured, what was modelled and what was assumed; prefer blind checks; report the honest score;
      and phrase claims so they survive a hostile question.</p>`,
    keys: [["89%", "Spot-check agreement (18 points, not blind)"], ["4.2 m", "Median height error vs 165 known heights"], ["24 + 90", "Code tests + in-app checks"]],
    lab: "claims", labTitle: "Claim checker", labHint: "Each statement could appear in a pitch. Decide whether it is supported or an overclaim. Every answer explains why.",
    field: [
      { where: "Medicine", title: "Double-blind trials", text: "Neither patients nor doctors know who gets the real drug, because knowing changes what people see.", link: "Why CoolCairo's next spot check should hide the labels." },
      { where: "IPCC", title: "Calibrated confidence", text: "Climate reports use fixed words ('likely' = 66–100%) so readers know exactly how sure the scientists are.", link: "Say 'model scenario', not 'proven', for the 74%." },
      { where: "Science", title: "The reproducibility push", text: "Many published results failed to replicate; journals now ask for shared code and data so anyone can rerun the work.", link: "CoolCairo's open code, locked environment and tests do exactly that." },
    ],
    quiz: [
      { q: "Which claim is supported by the data?", opts: ["CoolCairo proves cool roofs lower Cairo's air temperature by 4 °C", "In a model scenario, cool roofs and parks on the riskiest blocks cut Nasr City's surface heat exposure 74%", "Every building's temperature is known", "The materials are 100% correct"], a: 1, why: "Model scenario, surface temperature, block level." },
      { q: "Why does it matter that the spot check was not blind?", opts: ["It doesn't", "A checker who sees the labels tends to agree with them, so 89% may be optimistic", "Blind checks are illegal", "It used the wrong satellite"], a: 1, why: "Redo it with the 'pipeline says' column hidden." },
      { q: "Why were shade sails left out?", opts: ["Too cheap", "The satellite sees the hot top of the sail, not the cool ground under it", "They block traffic", "Wind"], a: 1, why: "We can only model what the sensor can measure." },
      { q: "Heat exposure leaves out…", opts: ["Temperature", "Residents", "Vulnerability: age, housing, access to cooling", "The heat line"], a: 2, why: "It is a screening number that shows where to look first." },
    ],
  },
  {
    id: 16, act: 4, title: "The judges' drill", sub: "Defend the project under pressure",
    brief: `
      <p>These questions came up at the final judging, plus the hard ones a remote-sensing or urban-climate expert is most likely to press.
      Each answer leads with a number and fits in about 30 seconds.</p>
      <p>Flip each card, answer out loud first, then compare. Mark it <b>Mastered</b> only when you could say it without looking.
      When you have mastered most of them, take the checkpoint and then the <b>final exam</b>.</p>`,
    keys: [["30 s", "Target length of each answer"], ["Number first", "Lead with the figure, then the reason"], ["Honest", "Say what is measured, modelled or assumed"]],
    lab: "flash", labTitle: "Flashcards", labHint: "Tap a card to flip it. Mark Mastered or Again.",
    field: [
      { where: "Pitching", title: "Lead with the number", text: "Investors and judges remember one figure and one reason. '0.25, tested on whole 1 km areas the model never saw' beats a paragraph.", link: "Every card here starts with a number." },
      { where: "Peer review", title: "Answer the strongest objection", text: "Reviewers trust work that names its own weaknesses and shows what was done about them.", link: "The 74% framing and the dark-roof sign are your strongest objections: own them." },
      { where: "Incubation", title: "What comes next", text: "Incubation judges a working deployment, documentation, a business plan and clear outputs.", link: "Know your gaps: web deployment, costs, blind validation, ground sensors." },
    ],
    quiz: [
      { q: "A judge asks 'R² 0.25 is low, why trust it?' Best answer?", opts: ["'It's good enough.'", "'It is tested on whole 1 km areas the model never saw; errors of ±1.2 °C against a 1.9 °C spread are enough to rank blocks; spectra lift it to 0.40–0.58.'", "'We will fix it later.'", "'R² doesn't matter.'"], a: 1, why: "Number, reason, path to improve." },
      { q: "'Did you preprocess EnMAP?' Best answer?", opts: ["'No.'", "'DLR delivers it atmospherically corrected (L2A); we removed water-vapour bands, leaving 203; shadow masking and unmixing are next.'", "'We used it raw.'", "'Only the visible bands.'"], a: 1, why: "Precise, honest, with next steps." },
      { q: "'How did you handle different resolutions?'", opts: ["'We didn't.'", "'Everything is averaged into 90 m blocks: 3 × 3 pixels at 30 m, 9 × 9 at 10 m, close to Landsat's 100 m heat sensor.'", "'We resampled to 1 m.'", "'We used only Landsat.'"], a: 1, why: "Block-level fusion." },
      { q: "'Isn't the −74% circular?'", opts: ["'Yes, ignore it.'", "'Blocks below the line can't count; that's the point: knowing which ones. The 106 hot blocks give −74% with 82% less area; a random third only −25%.'", "'No, it's measured.'", "'It's an air-temperature result.'"], a: 1, why: "Turn the objection into the message." },
    ],
  },
];

// Flashcards for the judges' drill: the judges' questions from the guide plus the verification role.
const FLASHCARDS = [
  ["Why hyperspectral data?", "More, narrower bands give each surface a fuller fingerprint. EnMAP alone explains block heat at R² 0.53 vs 0.31 for Sentinel-2, and only 0.33 when cut to Sentinel-2's bands: the gain is the spectral detail."],
  ["You used only one scene?", "One April scene over Cairo, yes. We repeated the test in Algiers, Dubai and Riyadh with scenes from other seasons and years, and EnMAP won every time. Next: summer scenes and Satellite 813."],
  ["R² 0.25 is low. Why, and how will you improve it?", "Low because the test is strict: whole 1 km areas are hidden. ±1.2 °C against a 1.9 °C spread is enough to rank. To improve: spectra (0.40 → 0.58), neighbouring-sand context (0.37), shadow masking, ground sensors."],
  ["Why 0.58 there but 0.25 in the app?", "Two different things. 0.25 is the simple app model. 0.40 vs 0.58 is a research test adding raw spectra to the same inputs, comparing the satellites on the same blocks and hidden areas."],
  ["How did you handle the different resolutions?", "Everything is averaged into 90 m blocks: 3 × 3 pixels at 30 m (Landsat, EnMAP), 9 × 9 at 10 m (Sentinel-2), close to Landsat's ~100 m heat sensor."],
  ["Did you use Landsat?", "Yes, it is the core: Landsat 8/9 thermal gives the temperature the model learns from, the median of 65 summer scenes, June–August 2023–25."],
  ["Fusion or layer by layer?", "Fusion at block level: materials (Sentinel-2), heights (Google, OSM), people (WorldPop) and temperature (Landsat) join into one table per block; heat risk combines heat with people."],
  ["Did you preprocess EnMAP?", "DLR delivers it atmospherically corrected (L2A). We removed the water-vapour bands, leaving 203. Shadow masking and endmember unmixing are next."],
  ["What is the evidence for the 74%?", "A model scenario, not a measurement: person·°C above a typical block falls from 6,460 to 1,686. Effects come from the tested model and published cool-roof physics. A pilot would measure it on the ground."],
  ["Isn't the 74% circular?", "Blocks below the heat line can't count, which is the point: knowing which blocks. The 106 hot blocks give −74% with 82% less area; a random third gives −25%; across reasonable heat lines the plan cuts 65–84%."],
  ["How do you know the temperatures are right?", "USGS Level-2 Surface Temperature, already corrected for atmosphere and emissivity; clouds and shadows masked per pixel; median of 65 scenes removes odd days."],
  ["How did you check the materials?", "Spot check of 20 random points against high-resolution imagery: 16 of 18 judgeable agree (89%). Misses: dusty asphalt and a dusty roof read as sand. Not blind yet; a blind repeat is next."],
  ["Are the building heights reliable?", "Google Open Buildings against 165 OSM buildings with known height: median error 4.2 m, average 6.2 m, bias −1.4 m."],
  ["Your model says dark roofs are cooler?", "We don't use that number. A sign check switches cool roofs to published physics (Wang et al. 2020). Dark roofs cover only ~0.5% of a block, so the coefficient rests on little data; cause not confirmed."],
  ["Is the pocket-park effect just the desert next door?", "Partly. Adding neighbouring sand lifts R² from 0.25 to 0.37 and roughly halves the park effect. The targeted plan still cuts exposure by about two thirds."],
  ["Surface or air temperature?", "Surface, at about 10:30 am. City-wide cool roofs lower air by roughly 0.1–0.33 °C per +0.1 albedo. Night heat and ground sensors are next steps."],
  ["Where do the population numbers come from?", "WorldPop 2024, 100 m, modelled, not a census. Heat exposure is a screening number; vulnerability is not yet included."],
  ["How do you handle noisy bands?", "Drop the water-vapour bands, then estimate each band's SNR from the image (the spectral-neighbour residual) and review bands below 20 before dropping them. EnMAP's 224 bands become 203 usable ones."],
  ["What is your hyperspectral upgrade path?", "Clean the bands, keep all that remain, and predict material shares with ridge regression. On a benchmark it gave about 3.5× smaller block-level share error than Sentinel-2-like bands; next we confirm it on Cairo's EnMAP scene."],
  ["Did you try band selection or layering?", "Yes, on two real scenes with hidden-area testing. Picking a few bands never beat all clean bands with ridge; a careful layered design gained under one point. We use selection to explain which wavelengths matter, not to score."],
  ["Are new neighbourhoods built hot?", "New blocks average 46.9 °C vs 46.0 °C, but most of the gap is sand: allowing for cover and sand it is +0.2 °C. They are where cooling is cheapest to build in."],
];

// Glossary: Part B of the guide, extended with foundation terms. [term, meaning, mission]
const GLOSSARY = [
  ["Urban heat island", "A city hotter than its surroundings, from dark materials, little vegetation, street canyons and waste heat.", 1],
  ["Surface vs air temperature", "Surface: how hot roofs and roads get (satellites). Air: what people feel (weather stations).", 1],
  ["Electromagnetic spectrum", "All wavelengths of light, from visible through infrared; sensors record slices of it.", 2],
  ["Wien's law", "Peak glow wavelength = 2898 ÷ temperature (K), in µm. Sun ≈ 0.5 µm, Cairo ground ≈ 9 µm.", 2],
  ["Band / spectrum", "A band is one slice of light a sensor measures; the spectrum is all bands together, a surface's fingerprint.", 2],
  ["Atmospheric window", "Wavelengths the air lets through; sensors are designed around them.", 2],
  ["Resolution", "Spatial (pixel size), spectral (bands), temporal (revisit) and radiometric (brightness levels).", 3],
  ["Multispectral vs hyperspectral", "A few wide bands (Sentinel-2: 6 used) vs hundreds of narrow ones (EnMAP: 203 usable).", 3],
  ["LST (land surface temperature)", "How hot the ground or roof surface is, measured from space by its heat glow.", 4],
  ["Emissivity", "How efficiently a surface emits heat compared with a perfect emitter (0–1).", 4],
  ["Stefan–Boltzmann law", "Total emitted energy rises with the fourth power of temperature.", 4],
  ["L2A / Level-2", "A product already corrected for the atmosphere: surface reflectance or surface temperature.", 4],
  ["Quality layer (QA)", "A per-pixel flag for clear, cloud, cloud shadow, cirrus and so on.", 5],
  ["Median composite", "For each pixel, the middle value over many dates; removes odd days.", 5],
  ["Reflectance", "The share of sunlight a surface sends back in a band, 0 to 1.", 6],
  ["NDVI", "(NIR − red) ÷ (NIR + red). High when plants are present; > 0.3 = vegetation in CoolCairo.", 6],
  ["BSI (bare soil index)", "((SWIR + red) − (NIR + blue)) ÷ ((SWIR + red) + (NIR + blue)). High for sand and soil; cut-off 0.137.", 6],
  ["Albedo / reflectivity", "How much sunlight a surface reflects (0 = all absorbed, 1 = all reflected).", 12],
  ["Threshold / cut-off", "The value that splits one class from another, e.g. BSI 0.137.", 7],
  ["Balanced accuracy", "Average of the success rates of each class; fair when one class is rare.", 7],
  ["Sensitivity / specificity", "Share of the target class caught / share of the other class correctly cleared.", 7],
  ["Mixed pixel", "A pixel that contains several surfaces, e.g. half roof, half road.", 8],
  ["Endmember / unmixing", "The pure fingerprint of one material; unmixing estimates each material's share in a mixed pixel.", 8],
  ["Data fusion", "Joining several sources into one consistent table; CoolCairo fuses at block level.", 8],
  ["Person·°C", "Heat exposure unit: residents × degrees above the typical block (45.66 °C).", 8],
  ["WorldPop", "Modelled population maps at 100 m (not a census).", 8],
  ["Linear regression", "A formula that adds up weighted inputs to predict a number.", 9],
  ["Coefficient", "The weight of one input in the formula, e.g. −3.15 °C for vegetation.", 9],
  ["Ordinary least squares", "Fitting method that makes the sum of squared misses as small as possible.", 9],
  ["Sign check", "An automatic test that a coefficient has a physically possible sign.", 9],
  ["R²", "Share of the differences the model explains: 1 = perfect, 0 = no better than the average.", 10],
  ["MAE", "Mean absolute error: the typical size of a mistake, in °C.", 10],
  ["Cross-validation", "Learn on some groups, test on the rest, rotate so every group is tested once.", 11],
  ["Spatial cross-validation", "Testing on whole hidden areas the model never saw.", 11],
  ["Tobler's first law", "Near things are more related than distant things: why random map tests leak.", 11],
  ["Model scenario", "A what-if result from a model, not a measurement; needs a pilot to confirm.", 12],
  ["Ridge regression", "Regression that stays stable with many correlated inputs by shrinking coefficients.", 13],
  ["Control (experiment)", "A comparison where everything is the same except one thing, e.g. EnMAP cut to six bands.", 13],
  ["PCA", "Squeezes many correlated bands into a few summary ones.", 13],
  ["Signal-to-noise ratio (SNR)", "How much real signal a band carries compared with the sensor's own noise; low at detector edges and in water-vapour bands.", 17],
  ["Band cleaning", "Removing water-vapour, detector-edge and duplicate overlap bands before modelling; EnMAP 224 → 203 usable bands.", 17],
  ["Spectral-neighbour residual", "x_b − (x_{b−1} + x_{b+1}) ÷ 2: what is left after removing the smooth spectrum, used to estimate each band's noise.", 17],
  ["Regularisation", "A penalty that keeps a model's coefficients small so it does not chase noise; ridge regression is one form.", 17],
  ["STAC / Planetary Computer", "A standard catalogue of satellite images, and Microsoft's free archive Landsat and Sentinel-2 stream from.", 3],
];
