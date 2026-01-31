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

// -------- PANEL (SAFE) --------
function updatePanel(listing, summary = {}) {
  const panel = document.getElementById("info-panel");

  const images = Array.isArray(listing.images) ? listing.images : [];
  const facilities = listing.onsite_facilities || {};

  panel.innerHTML = `
    <h2>${listing.name || "Property"}</h2>

    ${images.length ? `
      <div class="image-strip">
        ${images.map(img => `<img src="${img}?w=400&auto=format">`).join("")}
      </div>
    ` : ""}

    <p><b>Address:</b><br>${listing.address || "N/A"}</p>
    <p><b>Price:</b> ${listing.price ? "$" + listing.price.toLocaleString() : "N/A"}</p>

    <h3>On-site Facilities</h3>
    <p>
      🏊 Pool: ${facilities.pool ? "Yes" : "No"}<br>
      🏋️ Gym: ${facilities.gym ? "Yes" : "No"}
    </p>

    <h3>Amenity Summary</h3>
    <p>
      🏫 Schools: ${summary.schools ?? "N/A"}<br>
      🚆 Nearest MRT: ${summary.nearest_mrt_km ?? "N/A"} km<br>
      🏥 Nearest Hospital: ${summary.nearest_hospital_km ?? "N/A"} km
    </p>
  `;
}

// -------- AMENITIES --------
function fetchAmenities(listing) {
  amenitiesLayer.clearLayers();

  const lat = listing.lat;
  const lng = listing.lng;

  if (!lat || !lng) return;

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

        if (el.tags?.amenity === "school") {
          summary.schools++;
          L.marker([el.lat, el.lon], { icon: icons.school })
            .addTo(amenitiesLayer)
            .bindPopup(`${el.tags.name || "School"}<br>${d.toFixed(2)} km`);
        }

        if (el.tags?.railway) {
          summary.nearest_mrt_km = summary.nearest_mrt_km === null
            ? d.toFixed(2)
            : Math.min(summary.nearest_mrt_km, d).toFixed(2);
          L.marker([el.lat, el.lon], { icon: icons.mrt })
            .addTo(amenitiesLayer)
            .bindPopup(`${el.tags.name || "MRT"}<br>${d.toFixed(2)} km`);
        }

        if (el.tags?.amenity === "hospital" && d < closestHospital.d) {
          closestHospital = { el, d };
        }
      });

      if (closestHospital.el) {
        summary.nearest_hospital_km = closestHospital.d.toFixed(2);
        L.marker(
          [closestHospital.el.lat, closestHospital.el.lon],
          { icon: icons.hospital }
        )
          .addTo(amenitiesLayer)
          .bindPopup(`${closestHospital.el.tags.name}<br>${closestHospital.d.toFixed(2)} km`);
      }

      updatePanel(listing, summary);
    });
}

// -------- LOAD LISTINGS (THIS WAS FAILING BEFORE) --------
fetch("data/listings.json")
  .then(r => r.json())
  .then(listings => {
    listings.forEach(listing => {
      if (!listing.lat || !listing.lng) return;

      const marker = L.marker([listing.lat, listing.lng], {
        icon: propertyIcon,
        zIndexOffset: 1000
      }).addTo(map);

      marker.on("click", () => {
        updatePanel(listing);
        fetchAmenities(listing);
      });
    });
  })
  .catch(err => console.error("Listings load error:", err));
