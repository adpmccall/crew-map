// Pay data for the Fire Season Pay Calculator (/pay).
//
// UPDATE THIS FILE EVERY JANUARY. OPM publishes new pay tables and locality
// percentages each year. Everything the calculator needs that changes year to
// year lives here, and nothing else in the app hard-codes a rate. The math is
// in lib/pay.js and the page is components/PayCalculator.js, and neither of
// those should need touching for a routine yearly update. After editing, run
// `npm test` and update the expected values in lib/pay.test.mjs to match OPM's
// new tables.
//
// WHY "GW": federal wildland firefighters are paid from the GW table (special
// base rates). Job postings may still say "GS-4", and the GW tables use the
// same grade numbers, so the calculator just says "Grade 4".

// RUS (GW) 2026 hourly basic rates, grades 3-12, steps 1-10 (OPM, locality 17.06%)
// Source: OPM 2026 RUS (GW) hourly table (link in the page's sources list).
// Each array is steps 1 through 10, so RATES[4][0] is grade 4 step 1.
export const RATES = {
  3: [21.14, 21.84, 22.55, 23.25, 23.96, 24.66, 25.37, 26.07, 26.78, 27.48],
  4: [23.2, 23.98, 24.75, 25.52, 26.3, 27.07, 27.84, 28.62, 29.39, 30.17],
  5: [25.37, 26.22, 27.07, 27.91, 28.76, 29.6, 30.45, 31.3, 32.14, 32.99],
  6: [27.63, 28.55, 29.47, 30.4, 31.32, 32.24, 33.16, 34.08, 35.0, 35.92],
  7: [29.98, 30.98, 31.98, 32.98, 33.98, 34.98, 35.98, 36.98, 37.98, 38.98],
  8: [32.4, 33.48, 34.56, 35.64, 36.72, 37.8, 38.88, 39.96, 41.04, 42.12],
  9: [34.9, 36.06, 37.23, 38.39, 39.55, 40.72, 41.88, 43.04, 44.21, 45.37],
  10: [37.45, 38.7, 39.95, 41.2, 42.45, 43.69, 44.94, 46.19, 47.44, 48.69],
  11: [40.08, 41.41, 42.75, 44.09, 45.42, 46.76, 48.09, 49.43, 50.77, 52.1],
  12: [46.75, 48.31, 49.86, 51.42, 52.98, 54.54, 56.1, 57.66, 59.22, 60.77],
};

// The locality percentage already built into RATES above. Other areas are
// calculated by scaling from this, so they can differ from OPM's own per-area
// tables by a few cents.
export const RUS_PCT = 17.06;

// 2026 locality pay areas, as [name, percent]. Rest of U.S. first, then
// alphabetical. These came from a third-party list; only Rest of U.S. and
// Denver have been checked against OPM. Don't change a value without an OPM
// source for it.
export const LOCALITIES = [
  ["Rest of United States", 17.06],
  ["Albany-Schenectady, NY-MA", 20.77], ["Albuquerque-Santa Fe-Las Vegas, NM", 18.33], ["Atlanta-Athens-Clarke County-Sandy Springs, GA-AL", 23.79],
  ["Austin-Round Rock-Georgetown, TX", 20.35], ["Birmingham-Hoover-Talladega, AL", 18.24], ["Boston-Worcester-Providence, MA-RI-NH-CT-ME-VT", 32.58],
  ["Buffalo-Cheektowaga-Olean, NY", 22.41], ["Burlington-South Burlington-Barre, VT", 19.45], ["Charlotte-Concord, NC-SC", 19.67],
  ["Chicago-Naperville, IL-IN-WI", 30.86], ["Cincinnati-Wilmington-Maysville, OH-KY-IN", 21.93], ["Cleveland-Akron-Canton, OH-PA", 22.23],
  ["Colorado Springs, CO", 20.15], ["Columbus-Marion-Zanesville, OH", 22.15], ["Corpus Christi-Kingsville-Alice, TX", 17.63],
  ["Dallas-Fort Worth, TX-OK", 27.26], ["Davenport-Moline, IA-IL", 18.93], ["Dayton-Springfield-Kettering, OH", 21.42],
  ["Denver-Aurora, CO", 30.52], ["Des Moines-Ames-West Des Moines, IA", 18.01], ["Detroit-Warren-Ann Arbor, MI", 29.12],
  ["Fresno-Madera-Hanford, CA", 17.65], ["Harrisburg-Lebanon, PA", 19.43], ["Hartford-East Hartford, CT-MA", 32.08],
  ["Houston-The Woodlands, TX", 35.0], ["Huntsville-Decatur, AL-TN", 21.91], ["Indianapolis-Carmel-Muncie, IN", 18.15],
  ["Kansas City-Overland Park-Kansas City, MO-KS", 18.97], ["Laredo, TX", 21.59], ["Las Vegas-Henderson, NV-AZ", 19.57],
  ["Los Angeles-Long Beach, CA", 36.47], ["Miami-Port St. Lucie-Fort Lauderdale, FL", 24.67], ["Milwaukee-Racine-Waukesha, WI", 22.42],
  ["Minneapolis-St. Paul, MN-WI", 27.62], ["New York-Newark, NY-NJ-CT-PA", 37.95], ["Omaha-Council Bluffs-Fremont, NE-IA", 18.23],
  ["Palm Bay-Melbourne-Titusville, FL", 17.93], ["Philadelphia-Reading-Camden, PA-NJ-DE-MD", 28.99], ["Phoenix-Mesa, AZ", 22.45],
  ["Pittsburgh-New Castle-Weirton, PA-OH-WV", 21.03], ["Portland-Vancouver-Salem, OR-WA", 26.13], ["Raleigh-Durham-Cary, NC", 22.24],
  ["Reno-Fernley, NV", 17.52], ["Richmond, VA", 22.28], ["Rochester-Batavia-Seneca Falls, NY", 17.88],
  ["Sacramento-Roseville, CA-NV", 29.76], ["San Antonio-New Braunfels-Pearsall, TX", 18.78], ["San Diego-Chula Vista-Carlsbad, CA", 33.72],
  ["San Jose-San Francisco-Oakland, CA", 46.34], ["Seattle-Tacoma, WA", 31.57], ["Spokane-Spokane Valley-Coeur d'Alene, WA-ID", 17.67],
  ["St. Louis-St. Charles-Farmington, MO-IL", 20.03], ["State of Alaska", 32.36], ["State of Hawaii", 22.21], ["Tucson-Nogales, AZ", 19.28],
  ["Virginia Beach-Norfolk, VA-NC", 18.8], ["Washington-Baltimore-Arlington, DC-MD-VA-WV-PA", 33.94],
];

// Incident Response Premium Pay annual cap, in dollars.
// 2025 figure; verify current year. (The page's notes say the same.)
export const IRP_ANNUAL_CAP = 9000;

// Shown at the bottom of the page. Change it whenever this file is re-checked.
export const LAST_REVIEWED = "November 20, 2026";
