// D3 map config
const DEFAULT_FILL = "#EEEEEE";
const map = new Datamap({
  element: document.getElementById("container"),
  fills: {
    defaultFill: DEFAULT_FILL,
  },
  geographyConfig: {
    highlightOnHover: false,
  },
  responsive: true,
});
window.addEventListener("resize", () => map.resize());

/**
 * Fetches data from an URL by using window.fetch.
 *
 * @param {string} url - URL from which the data is fetched
 * @returns {Promise} promise that will resolve to JSON data
 */
const getJSON = (url) => fetch(url).then(res => res.json());

/**
 * mapNeighbours arrow function returns neighbours of a country
 * as an object where a key is a country codes and
 * the value is an array containing the neighbour country codes.
 *
 * @param {Array} rawNeighbours the parsed JSON content fetched from the API endpoint
 * @returns {object} an object where keys are three-char country codes (alpha3codes),
 * and the values are neighbour country codes as an array.
 */
const mapNeighbours = (rawNeighbours) => {
  const neighbourMap = {};
  rawNeighbours.forEach((obj) => (neighbourMap[obj.alpha3Code] = obj.borders));
  return neighbourMap;
};

/**
 * Modifies the country data so that it is compatible between different end-points.
 *
 * @param {Array<object>} countries - All countries returned from the API
 * @param {Array<object>} initialCodes - Countries that need to be changed
 * @returns {object} - Map of country names to country codes
 */
const countryCodeMap = (countries, initialCodes) => {
  const codeMap = {};
  countries.forEach((country) => {
    let name = country.name;
    // if the name has brackets, use the part before brackets
    if (name.indexOf("(") >= 0) {
      name = name.split(" (")[0];
    }
    codeMap[name] = country.alpha3Code;
  });
  // combine data from initialCodes to the codeMap
  Object.keys(initialCodes).forEach((country) => {
    codeMap[country] = initialCodes[country];
  });
  return codeMap;
};

/**
 * Builds an object from cases data, where its keys are country codes and
 * each code contains its country name and data about its coronavirus situation.
 *
 * @param {Array<object>} cases - All corona cases returned from the API
 * @param {Array<object>} countries - codeMap
 * @returns {object} - Map of country codes to corona cases in the country
 */
const mapCasesWithCountrycodes = (cases, countries) => {
  const caseMap = {};
  cases.data.forEach((country) => {
    // replace all underscore characters of country with spaces with regex
    const name = country.location.replace(/_/g, " ");
    const code = countries[name];
    if (code) {
      caseMap[code] = {
        confirmed: country.confirmed,
        deaths: country.deaths,
        recovered: country.recovered,
        country: name,
      };
    }
  });
  return caseMap;
};

/**
 * Fills datalist with country names.
 *
 * @param {Array<object>} codeMap - Country codes and names
 */
const fillDataList = (codeMap) => {
  const dataList = document.getElementById("searchresults");
  dataList.options.length = 0;

  Object.keys(codeMap)
    .sort()
    .forEach((country) => {
      const option = document.createElement("option");
      option.value = country;
      dataList.appendChild(option);
    });
};

/**
 * Finds the key of an object's value.
 *
 * @param {object} object - where the key is searched from
 * @param {string} value - value to find a key for
 * @returns {string} - key
 */
const getKey = (object, value) => Object.keys(object).find(key => object[key] === value);

/**
 * Constructs the HTML of a table row for a certain country.
 *
 * @param {string} code - which country the table is created for
 * @returns {string} - HTML for a table row with the country's coronavirus data
 */
const constructTableRow = (code) => {
  if (code in caseMap) {
    // extracting values from the object through destructured assignment
    const { country } = caseMap[code];
    const { confirmed } = caseMap[code];
    const { deaths } = caseMap[code];
    const { recovered } = caseMap[code];
    return `<tr><td>${country}</td><td>${confirmed}</td><td>${deaths}</td><td>${recovered}</td></tr>`;
  }
  else {
    const name = getKey(codeMap, code);
    if (!name) return "";
    return `<tr><td>${name}</td><td>-</td><td>-</td><td>-</td></tr>`;
  }
};

const countriesInTable = [];

/**
 * Adds the searched for country's coronavirus data into table, if it can
 * be found in codeMap. The table is sorted by the order of searches,
 * unless a country is searched for again: then the table is rearranged so
 * that the searched country appears first and rest of the countries are ordered
 * alphabetically.
 *
 * @param {event} e - input event
 */
const inputHandler = (e) => {
  e.preventDefault();
  const element = document.getElementById(e.target.id);
  const value = element.value;
  // check if the value can be found in codeMap
  if (value in codeMap) {
    const code = codeMap[value];
    const tbody = document.querySelector("tbody");
    
    if (!countriesInTable.includes(value)) {
      tbody.insertAdjacentHTML("afterbegin", constructTableRow(code));
      countriesInTable.push(value);
    } else {
      // if the search has been made before
      tbody.innerHTML = "";
      // if other countries have been searched for earlier
      if (countriesInTable.length) {
        // go through array in descending alphabetical order so the countries
        // get added in alphabetically
        countriesInTable
          .sort()
          .reverse()
          .forEach((country) => {
            // let's not add in the most recent search yet
            if (country !== value) {
              const countryCode = codeMap[country];
              tbody.insertAdjacentHTML(
                "afterbegin",
                constructTableRow(countryCode)
              );
            }
          });
      }
      // insert table of the most recent searched country in the beginning of the tbody
      tbody.insertAdjacentHTML("afterbegin", constructTableRow(code));
    }
    element.value = "";
    if (animationPlaying) return;
    // other countries are set to default color
    map.updateChoropleth(null, { reset: true });
    // update the map to show the latest situation of selected country & its neighbours
    colorCountryInMap(code);
    const neigbours = neighbourMap[code];
    neigbours.forEach((neighbourCode) => {
      colorCountryInMap(neighbourCode);
    });
  }
};

/**
 * Helper function to parse an integer from a string.
 *
 * @param {string} str numeric string
 * @returns {number} parsed integer
 */
const int = (str) => Number.parseInt(str);

/**
 * Constructs a HSL color based on the given parameters.
 * The darker the color, the more alarming is the situation-
 * Hue gives the tone: blue indicates confirmed (hue 240), red indicates deaths (hue 360).
 * H: hue ranges between blue and red, i.e., 240..360.
 * S: saturation is constant (100)
 * L: lightness as a percentage between 0..100%, 0 dark .. 100 light
 * Algorithm provided by course staff.
 *
 * @param {object} confirmed The number of confirmed people having coronavirus
 * @param {object} deaths The number of dead people, 20 times more weight than confirmed
 * @returns {object} a HSL color constructed based on confirmed and deaths
 */
const getColor = (confirmed, deaths) => {
  const denominator = confirmed + deaths === 0 ? 1 : confirmed + deaths;
  const nominator = deaths ? deaths : 0;
  const hue = int(240 + (120 * nominator) / denominator);
  const saturation = 100; //constant

  let weight = int(7 * Math.log(confirmed + 20 * deaths));
  weight = weight ? (weight > 100 ? 95 : weight) : 0;

  let lightness = 95 - weight;
  lightness = lightness < 0 ? 0 : lightness;
  return `hsl(${hue}, ${saturation}, ${lightness})`;
};

/**
 * Colors the given country in the world map to reflect its
 * current coronavirus state.
 *
 * @param {string} code - code of the country which should be updated
 */
const colorCountryInMap = (code) => {
  // destructuring confirmed and deaths fail without || {} because they're undefined
  // when country or one of it's neigbours don't have confirmed cases
  const { confirmed } = caseMap[code] || {};
  const { deaths } = caseMap[code] || {};
  const color = getColor(confirmed, deaths);
  if (color) {
    map.updateChoropleth({ [code]: color });
  }
};

/**
 * Updates the world map to reflect the current coronavirus situation.
 */
const illustrateCurrentSituation = () => {
  
  const currentDate = new Date();
  const day = currentDate.getDate();
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear().toString();
  document.getElementById("date").innerText = `${day}.${month}.${year}`;

  Object.keys(caseMap).forEach((code) => colorCountryInMap(code));
};

/**
 * Modifies json data to be more usable in the animation.
 *
 * @param {Array} rawTimeSeries the parsed JSON content fetched from the API endpoint
 * @returns {object} an object, which keys are dates beginning from january to current data.
 * Each date contains the confirmed cases and deaths of countries.
 */
const parseTimeSeriesData = (rawTimeSeries) => {
  const confirmedAndDeaths = {};
  Object.keys(rawTimeSeries).forEach(name => {
    let code = codeMap[name];
    // if the name has brackets, use the part before brackets
    if (name.indexOf("(") >= 0) {
      code = codeMap[name.split(" (")[0]];
    }
    if (!code) return;
    rawTimeSeries[name].forEach(data => {
      const date = data.date;
      if (!(date in confirmedAndDeaths)) confirmedAndDeaths[date] = {};
      if (!(code in confirmedAndDeaths[date])) confirmedAndDeaths[date][code] = {};

      // if country's statistics are split between states/provinces
      if (confirmedAndDeaths[date][code].confirmed) {
        // update the deaths & confirmed of the country
        const confirmed = confirmedAndDeaths[date][code].confirmed + data.confirmed;
        const deaths = confirmedAndDeaths[date][code].deaths + data.deaths;
        confirmedAndDeaths[date][code].confirmed = confirmed;
        confirmedAndDeaths[date][code].deaths = deaths;
      }
      else {
        confirmedAndDeaths[date][code].confirmed = data.confirmed;
        confirmedAndDeaths[date][code].deaths = data.deaths;
      }
    });
  });
  return confirmedAndDeaths;
};

/**
 * Modifies parameter object further to be more usable in the animation.
 *
 * @param {object} confirmedAndDeaths an object, which dates-keys include
 * coronavirus data of countries (confirmed, deaths).
 * @returns {object} an object, which keys are dates beginning from january to current data.
 * Each date contains country codes and its corresponding hsl value.
 */
const getColorsByDate = (confirmedAndDeaths) => {
  const colorsByDate = {};

  Object.keys(confirmedAndDeaths).forEach(date => {
    colorsByDate[date] = {};
    Object.keys(confirmedAndDeaths[date]).forEach(code => {
      const confirmed = confirmedAndDeaths[date][code].confirmed;
      const deaths = confirmedAndDeaths[date][code].deaths;
      colorsByDate[date][code] = getColor(confirmed, deaths);
    });
  });
  return colorsByDate;
};

/**
 * Illustrates the coronavirus situation by updating the world map view day-by-day
 * once a half second, starting from 22nd of January 2020, to the latest statistics available.
 */
const timeSeries = async (colorsByDate) => {
  for (const date of Object.keys(colorsByDate)) {
    if (!animationPlaying) break;
    const data = date.split("-");
    document.getElementById("date").innerText = `${data[2]}.${data[1]}.${data[0]}`;
    map.updateChoropleth(colorsByDate[date]);
    // wait for 0.5 sec before next update
    await sleep(500);
  }
  animationPlaying = false;
  illustrateCurrentSituation(caseMap);
  document.getElementById("timeseries").innerText = "Time series";
};

/**
 * Returns a promise once a timeout has passed.
 *
 * @param {int} ms - specifies the timeout length in milliseconds
 * @returns {Promise} returns a promise
 */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/*
 * The code is responsible for fetching the data from the API
 * and then handing it over to the appropriate functions.
 * It is also attaching the event listeners.
 */
let codeMap, caseMap, neighbourMap, animationPlaying;

(async () => {
  codeMap = countryCodeMap(countries, INITIAL_CODES);
  fillDataList(codeMap);

  const currentCases = await getJSON("https://covid2019-api.herokuapp.com/v2/current");
  const date = currentCases.dt.split("-");
  document.getElementById("statisticsDate").textContent += `${date[0]}.${date[1]}.${date[2]}`;
  caseMap = mapCasesWithCountrycodes(currentCases, codeMap);

  illustrateCurrentSituation();

  neighbourMap = mapNeighbours(neighbours);

  const rawTimeSeries = await getJSON("https://pomber.github.io/covid19/timeseries.json");
  const confirmedAndDeathsByDate = parseTimeSeriesData(rawTimeSeries);
  colorsByDate = getColorsByDate(confirmedAndDeathsByDate);

  
  document.getElementById("timeseries").addEventListener("click", () => {
    if (!animationPlaying) {
      animationPlaying = true;
      document.getElementById("timeseries").innerText = "Stop time series";
      timeSeries(colorsByDate);
    }
    else {
      animationPlaying = false;
      document.getElementById("timeseries").innerText = "Time series";
    }
  });
  document.getElementById("countryform").addEventListener("input", inputHandler);
  // prevent the page from reloading
  document
    .getElementById("countryform")
    .addEventListener("submit", (e) => e.preventDefault());
  document
    .getElementById("country")
    .addEventListener("input", (e) => e.preventDefault());
  document
    .getElementById("country")
    .addEventListener("submit", (e) => e.preventDefault());
})();