const express = require("express"); // <-- add this
const app = express();
const path = require("path");

// ==== CONFIG ====
const OPENTRIPMAP_API_KEY = "5ae2e3f221c38a28845f05b6c58e72985efc420d9e671389753ce144"; // OpenTripMap free API

const DAY_START_HOUR = 9;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));

// Utility: get dates in range
function getDates(start, end) {
  let result = [];
  let current = new Date(start);
  let last = new Date(end);
  while (current <= last) {
    result.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function addMinutes(timeStr, minsToAdd) {
  let [h, m] = timeStr.split(":").map(Number);
  let date = new Date();
  date.setHours(h, m, 0);
  date.setMinutes(date.getMinutes() + minsToAdd);
  return date.toTimeString().slice(0, 5);
}

// Step 1: Get city coordinates
async function getCityCoords(city) {
  const url = `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(
    city
  )}&apikey=${OPENTRIPMAP_API_KEY}`;
  const res = await fetch(url);
  return res.json();
}

// Step 2: Get places by category
async function getPlaces(lat, lon, category, radius = 10000, limit = 10) {
  const url = `https://api.opentripmap.com/0.1/en/places/radius?radius=${radius}&lon=${lon}&lat=${lat}&kinds=${category}&limit=${limit}&apikey=${OPENTRIPMAP_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.features;
}

// Step 3: Calculate travel time
async function getTravelTime(fromLat, fromLng, toLat, toLng) {
  const url = `http://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.routes && data.routes[0]) {
    return Math.ceil(data.routes[0].duration / 60);
  }
  return 15;
}

// Step 4: Generate itinerary
async function generateItinerary(cityName, startDate, endDate, totalBudget, currency) {
  const city = await getCityCoords(cityName);

  const sightseeing = await getPlaces(city.lat, city.lon, "interesting_places", 10000, 20);
  const restaurants = await getPlaces(city.lat, city.lon, "foods", 10000, 10);
  const cultural = await getPlaces(city.lat, city.lon, "cultural", 10000, 10);

  const days = getDates(startDate, endDate);
  let itineraryDays = [];

  for (let idx = 0; idx < days.length; idx++) {
    let places = [];

    if (cultural[idx]) {
      places.push({
        id: `cul_${idx}`,
        name: cultural[idx].properties.name || "Cultural Spot",
        lat: cultural[idx].geometry.coordinates[1],
        lng: cultural[idx].geometry.coordinates[0],
        durationMinutes: 120,
        estimatedCost: 200,
        category: "Cultural",
        notes: `Experience cultural vibes.`,
      });
    }

    let sights = sightseeing.slice(idx * 2, idx * 2 + 2);
    sights.forEach((p) => {
      places.push({
        id: `sight_${idx}_${Math.random().toString(36).substr(2, 5)}`,
        name: p.properties.name || "Sightseeing Spot",
        lat: p.geometry.coordinates[1],
        lng: p.geometry.coordinates[0],
        durationMinutes: 90,
        estimatedCost: 100,
        category: "Historical",
        notes: `Explore ${p.properties.name || "this attraction"}.`,
      });
    });

    if (restaurants[idx]) {
      places.push({
        id: `rest_${idx}`,
        name: restaurants[idx].properties.name || "Restaurant",
        lat: restaurants[idx].geometry.coordinates[1],
        lng: restaurants[idx].geometry.coordinates[0],
        durationMinutes: 90,
        estimatedCost: 600,
        category: "Restaurant",
        notes: `Enjoy local meal.`,
      });
    }

    let currentTime = `${DAY_START_HOUR}:00`;
    for (let i = 0; i < places.length; i++) {
      places[i].arrivalTime = currentTime;
      if (i < places.length - 1) {
        const travelTime = await getTravelTime(
          places[i].lat,
          places[i].lng,
          places[i + 1].lat,
          places[i + 1].lng
        );
        currentTime = addMinutes(currentTime, places[i].durationMinutes + travelTime);
      }
    }

    itineraryDays.push({
      dayIndex: idx + 1,
      date: days[idx],
      summary: `Day ${idx + 1} in ${cityName}`,
      places,
      dailyEstimatedCost: places.reduce((a, b) => a + b.estimatedCost, 0),
      travelDistanceKm: Math.floor(Math.random() * 25) + 5,
    });
  }

  return {
    tripTitle: `Trip to ${cityName}`,
    destination: cityName,
    startDate,
    endDate,
    totalBudget,
    currency,
    days: itineraryDays,
    generatedBy: {
      tool: "OpenTripMap + Node.js + OSRM",
      timestamp: new Date().toISOString(),
    },
  };
}

// ===== ROUTES =====

// Form page
app.get("/", (req, res) => {
  res.render("search");
});

// Handle form submit
app.post("/itinerary", async (req, res) => {
  const { city, startDate, endDate, budget, currency } = req.body;
  const itinerary = await generateItinerary(city, startDate, endDate, budget, currency);
  res.render("result", { itinerary: JSON.stringify(itinerary, null, 2) });
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

