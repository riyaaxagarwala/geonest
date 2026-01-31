const map = L.map("map").setView([1.2966, 103.7764], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// PROPERTY ICON
const propertyIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

// AMENITY ICONS
const icons = {
  school: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/167/167707.png", iconSize: [18,18] }),
  mrt: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png", iconSize: [18,18] }),
  hospital: L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/2967/2967350.png", iconSize: [18,18] })
};

const amenitiesLayer = L.layerGroup().addTo(map);
let propertyMarkers = [];

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2)**2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// PANEL
function updatePanel(listing, summary) {
  const panel = document.getElementById("info-panel");

  const imagesHTML = listing.images
    ? `<div class="image-strip">
        ${listing.images.map(img => `<img src="${img}?w=400&auto=format">`).join("")}
      </div>`
    : "";

  panel.innerHTML = `
    <h2>${listing.name}</h2>
    ${imagesHTML}
    <p><b>Address:</b><br>${listing.address}</p>

    <h3>On-site Facilities</h3>
    <p>
      🏊 Pool: ${listing.onsite_facilities.pool ? "Yes" : "No"}<br>
      🏋️ Gym: ${listing.onsite_facilities.gym ? "Yes" : "No"}
    </p>

    <h3>Amenity Summary</h3>
    <p>
      🏫 Schools: ${summary.schools}<br>
      🚆 Nearest MRT: ${summary.nearest_mrt_km || "N/A"} km<br>
      🏥 Nearest Hospital: ${summary.nearest_hospital_km} km
    </p>
  `;
}

// AMENITIES
function fetchAmenities(listing) {
  amenitiesLayer.clearLayers();

  const lat = listing.lat;
  const lng = listing.lng;

  const query = `
    [out:json];
    (
      node["amenity"="school"](around:800,${lat},${lng});
      node["railway"="station"](around:1000,${lat},${lng});
      node["railway"="subway_entrance"](around:1000,${lat},${lng});
      node["amenity"="hospital"](around:5000,${lat},${lng});
    );
    out;
  `;

  fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query
  })
    .then(r => r.json())
    .then(data => {
      let summary = { schools: 0, nearest_mrt_km: null, nearest_hospital_km: null };
      let closestHospital = { d: Infinity };

      data.elements.forEach(el => {
        const d = distanceKm(lat, lng, el.lat, el.lon);

        if (el.tags.amenity === "school") {
          summary.schools++;
          L.marker([el.lat, el.lon], { icon: icons.school })
            .addTo(amenitiesLayer)
            .bindPopup(`${el.tags.name || "School"}<br>${d.toFixed(2)} km`);
        }

        if (el.tags.railway) {
          summary.nearest_mrt_km = summary.nearest_mrt_km === null
            ? d.toFixed(2)
            : Math.min(summary.nearest_mrt_km, d).toFixed(2);
          L.marker([el.lat, el.lon], { icon: icons.mrt })
            .addTo(amenitiesLayer)
            .bindPopup(`${el.tags.name || "MRT Station"}<br>${d.toFixed(2)} km`);
        }

        if (el.tags.amenity === "hospital" && d < closestHospital.d) {
          closestHospital = { el, d };
        }
      });

      if (closestHospital.el) {
        summary.nearest_hospital_km = closestHospital.d.toFixed(2);
        L.marker([closestHospital.el.lat, closestHospital.el.lon], { icon: icons.hospital })
          .addTo(amenitiesLayer)
          .bindPopup(`${closestHospital.el.tags.name}<br>${closestHospital.d.toFixed(2)} km`);
      }

      updatePanel(listing, summary);
    });
}

// LOAD LISTINGS
fetch("data/listings.json")
  .then(r => r.json())
  .then(listings => {
    listings.forEach(listing => {
      const marker = L.marker([listing.lat, listing.lng], {
        icon: propertyIcon,
        zIndexOffset: 1000
      }).addTo(map);

      marker.on("click", () => {
        updatePanel(listing, { schools: "Loading...", nearest_mrt_km: null, nearest_hospital_km: "Loading..." });
        fetchAmenities(listing);
      });
    });
  });
