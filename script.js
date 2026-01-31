// ---------------- MAP SETUP ----------------
const map = L.map("map").setView([1.2966, 103.7764], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// ---------------- ICONS ----------------

// PROPERTY ICON (blue pin)
const propertyIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  shadowSize: [41, 41]
});

// AMENITY ICONS
const icons = {
  school: L.icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/167/167707.png",
    iconSize: [18, 18]
  }),
  mrt: L.icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png", // train
    iconSize: [18, 18]
  }),
  hospital: L.icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/2967/2967350.png",
    iconSize: [18, 18]
  })
};

// ---------------- LAYERS ----------------
const amenitiesLayer = L.layerGroup().addTo(map);
let propertyMarkers = [];

// ---------------- DISTANCE ----------------
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------------- PANEL ----------------
function updatePanel(listing, summary) {
  const panel = document.getElementById("info-panel");

  panel.innerHTML = `
    <h2>${listing.name}</h2>

    <p><b>Address:</b><br>${listing.address || "N/A"}</p>

    <p><b>Price:</b> ${listing.price ? "$" + listing.price.toLocaleString() : "N/A"}</p>

    <h3>On-site Facilities</h3>
    <p>
      🏊 Pool: ${listing.onsite_facilities?.pool ? "Yes" : "No"}<br>
      🏋️ Gym: ${listing.onsite_facilities?.gym ? "Yes" : "No"}
    </p>

    <h3>Amenity Summary</h3>
    <p>
      🏫 Schools nearby: ${summary.schools}<br>
      🚆 Nearest MRT: ${summary.nearest_mrt_km ? summary.nearest_mrt_km + " km" : "N/A"}<br>
      🏥 Nearest Hospital: ${summary.nearest_hospital_km} km
    </p>

    <p><em>Click amenity icons on the map for details</em></p>
  `;
}

// ---------------- FETCH AMENITIES ----------------
function fetchAmenities(listing) {
  amenitiesLayer.clearLayers();

  const lat = listing.lat;
  const lng = listing.lng;

  // Step 1: schools + MRT (local)
  const baseQuery = `
    [out:json];
    (
      node["amenity"="school"](around:800,${lat},${lng});
      node["railway"="station"](around:1000,${lat},${lng});
      node["railway"="subway_entrance"](around:1000,${lat},${lng});
      node["public_transport"="station"](around:1000,${lat},${lng});
    );
    out;
  `;

  // Step 2: hospitals (expanded radius)
  const hospitalQuery = `
    [out:json];
    node["amenity"="hospital"](around:5000,${lat},${lng});
    out;
  `;

  let summary = {
    schools: 0,
    nearest_mrt_km: null,
    nearest_hospital_km: null
  };

  // Fetch schools + MRT
  fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: baseQuery
  })
    .then(res => res.json())
    .then(data => {
      data.elements.forEach(el => {
        let icon = null;
        let label = "";

        if (el.tags.amenity === "school") {
          icon = icons.school;
          label = el.tags.name || "School";
          summary.schools += 1;
        }
        else if (
          el.tags.railway === "station" ||
          el.tags.railway === "subway_entrance" ||
          el.tags.public_transport === "station"
        ) {
          const d = distanceKm(lat, lng, el.lat, el.lon);
          if (!summary.nearest_mrt_km || d < summary.nearest_mrt_km) {
            summary.nearest_mrt_km = d.toFixed(2);
          }
          icon = icons.mrt;
          label = el.tags.name || "MRT Station";
        }

        if (!icon) return;

        L.marker([el.lat, el.lon], { icon })
          .addTo(amenitiesLayer)
          .bindPopup(`${label}<br>${distanceKm(lat, lng, el.lat, el.lon).toFixed(2)} km`);
      });

      // Fetch hospitals (always at least one)
      return fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: hospitalQuery
      });
    })
    .then(res => res.json())
    .then(data => {
      let closestHospital = null;
      let minDist = Infinity;

      data.elements.forEach(el => {
        const d = distanceKm(lat, lng, el.lat, el.lon);
        if (d < minDist) {
          minDist = d;
          closestHospital = el;
        }
      });

      if (closestHospital) {
        summary.nearest_hospital_km = minDist.toFixed(2);

        L.marker([closestHospital.lat, closestHospital.lon], {
          icon: icons.hospital
        })
          .addTo(amenitiesLayer)
          .bindPopup(
            `${closestHospital.tags.name || "Hospital"}<br>${minDist.toFixed(2)} km away`
          );
      }

      // Update panel with FINAL summary
      updatePanel(listing, summary);
    });
}

// ---------------- LOAD LISTINGS ----------------
fetch("data/listings.json")
  .then(res => res.json())
  .then(listings => {
    listings.forEach(listing => {

      const marker = L.marker([listing.lat, listing.lng], {
        icon: propertyIcon,
        zIndexOffset: 1000
      }).addTo(map);

      propertyMarkers.push(marker);

      marker.on("click", () => {
        // Immediate panel update (no waiting)
        updatePanel(listing, {
          schools: "Loading...",
          nearest_mrt_km: null,
          nearest_hospital_km: "Loading..."
        });

        fetchAmenities(listing);
      });
    });
  });

// ---------------- FILTERS ----------------
document.getElementById("budgetFilter").addEventListener("input", applyFilters);
document.getElementById("buyerFilter").addEventListener("change", applyFilters);

function applyFilters() {
  const maxBudget = document.getElementById("budgetFilter").value;
  const buyerType = document.getElementById("buyerFilter").value;

  propertyMarkers.forEach(marker => {
    const l = marker.listing;
    let show = true;

    if (maxBudget && l.price && l.price > maxBudget) show = false;
    if (buyerType === "family" && l.bedrooms && l.bedrooms < 2) show = false;

    show ? marker.addTo(map) : map.removeLayer(marker);
  });
}
