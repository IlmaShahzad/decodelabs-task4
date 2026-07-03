// =========================================
//  SafeRoute - Map JS (Leaflet + OpenStreetMap)
//  100% Free - No API Key Required
// =========================================

let map, routingControl, heatLayer;
let incidentMarkers = [];
let placeMarkers = [];
let userMarker = null;
let userLocation = null;
let heatmapOn = false;
let markersOn = true;
let allIncidents = [];

// ---- Initialize Map ----
document.addEventListener('DOMContentLoaded', () => {
  initMap();
});

function initMap() {
  // Default center: Lahore, Pakistan
  map = L.map('leaflet-map', {
    center: [31.5204, 74.3587],
    zoom: 13,
    zoomControl: false,
  });

  // OpenStreetMap tiles (free, no key)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  // Custom zoom controls (top-right)
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Hide loading screen
  setTimeout(() => {
    document.getElementById('mapLoading').style.display = 'none';
  }, 800);

  // Get user location
  getUserLocation();

  // Load incidents from backend
  loadIncidentsOnMap();

  // Wire up buttons
  document.getElementById('getRouteBtn').addEventListener('click', getRoute);
  document.getElementById('clearRouteBtn').addEventListener('click', clearRoute);
  document.getElementById('myLocationBtn').addEventListener('click', centerOnUser);
  document.getElementById('refreshBtn').addEventListener('click', loadIncidentsOnMap);
  document.getElementById('heatmapToggle').addEventListener('click', toggleHeatmap);
  document.getElementById('markersToggle').addEventListener('click', toggleMarkers);

  // Destination search with autocomplete (Nominatim)
  let searchTimer;
  document.getElementById('destinationInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const val = e.target.value.trim();
    if (val.length < 3) {
      document.getElementById('destSuggestions').style.display = 'none';
      return;
    }
    searchTimer = setTimeout(() => searchPlaceNominatim(val), 400);
  });

  // URL params (from dashboard quick actions)
  const params = new URLSearchParams(window.location.search);
  if (params.get('find') === 'hospital') showToast('Zoom in to see hospitals on the map', 'info');
  if (params.get('find') === 'police') showToast('Zoom in to see police stations on the map', 'info');
}

// ---- Get User Location ----
function getUserLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported by your browser', 'warning');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      userLocation = [coords.latitude, coords.longitude];
      map.setView(userLocation, 14);

      // Pulsing user marker
      const pulseIcon = L.divIcon({
        className: '',
        html: '<div class="user-marker-pulse"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.marker(userLocation, { icon: pulseIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup('<b style="color:#e91e8c;">📍 Your Location</b><br><small>You are here</small>')
        .openPopup();

      document.getElementById('originInput').value = 'My Current Location';

      // Load nearby places from Overpass API
      loadNearbyPlaces(coords.latitude, coords.longitude);

      // Update location on backend (silent)
      reverseGeocode(coords.latitude, coords.longitude).then(address => {
        fetch(`${API_BASE}/users/location`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ lat: coords.latitude, lng: coords.longitude, address }),
        }).catch(() => {});
      });
    },
    () => {
      showToast('Location access denied — enable in browser settings', 'warning');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function centerOnUser() {
  if (userLocation) {
    map.setView(userLocation, 15);
    userMarker?.openPopup();
  } else {
    getUserLocation();
  }
}

// ---- Load Incidents from Backend ----
async function loadIncidentsOnMap() {
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i>';

  try {
    const res = await fetch(`${API_BASE}/incidents/all?limit=200`);
    const data = await res.json();
    allIncidents = data.incidents || [];

    clearIncidentMarkers();
    if (markersOn) renderIncidentMarkers(allIncidents);
    if (heatmapOn) renderHeatmap(allIncidents);

    showToast(`${allIncidents.length} incidents loaded on map`, 'info');
  } catch (err) {
    showToast('Could not load incidents — is the backend running?', 'error');
  } finally {
    refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i>';
  }
}

// ---- Render Incident Markers ----
function renderIncidentMarkers(incidents) {
  const severityColors = { high: '#dc2626', medium: '#f59e0b', low: '#16a34a' };
  const typeEmojis = {
    harassment: '😠', theft: '🤚', assault: '⚠️',
    suspicious_activity: '👁️', poor_lighting: '🌙', unsafe_area: '🚫', other: '📍'
  };

  incidents.forEach(inc => {
    if (!inc.location?.lat || !inc.location?.lng) return;

    const color = severityColors[inc.severity] || '#f59e0b';
    const size = inc.severity === 'high' ? 16 : inc.severity === 'medium' ? 12 : 9;

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });

    const marker = L.marker([inc.location.lat, inc.location.lng], { icon })
      .addTo(map)
      .bindPopup(`
        <div style="font-family:Inter,sans-serif;min-width:200px;padding:4px;">
          <div style="font-weight:700;font-size:0.9rem;margin-bottom:6px;">
            ${typeEmojis[inc.incidentType] || '📍'} ${formatType(inc.incidentType)}
          </div>
          <div style="font-size:0.8rem;color:#475569;margin-bottom:8px;line-height:1.5;">
            ${inc.description?.slice(0, 120)}${inc.description?.length > 120 ? '...' : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <span style="background:${color};color:white;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:700;">${cap(inc.severity)}</span>
            <span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:100px;font-size:0.7rem;">${cap(inc.status)}</span>
            <span style="font-size:0.72rem;color:#94a3b8;">${timeAgo(inc.createdAt)}</span>
          </div>
          ${inc.location.address ? `<div style="font-size:0.75rem;color:#94a3b8;margin-top:6px;">📍 ${inc.location.address}</div>` : ''}
        </div>
      `, { maxWidth: 260 });

    incidentMarkers.push(marker);
  });
}

// ---- Heatmap ----
function renderHeatmap(incidents) {
  if (heatLayer) map.removeLayer(heatLayer);

  const points = incidents
    .filter(inc => inc.location?.lat && inc.location?.lng)
    .map(inc => [
      inc.location.lat,
      inc.location.lng,
      inc.severity === 'high' ? 1.0 : inc.severity === 'medium' ? 0.6 : 0.3,
    ]);

  if (points.length === 0) return;

  heatLayer = L.heatLayer(points, {
    radius: 35,
    blur: 25,
    maxZoom: 17,
    max: 1.0,
    gradient: { 0.2: '#22c55e', 0.4: '#eab308', 0.6: '#f97316', 0.8: '#ef4444', 1.0: '#991b1b' },
  }).addTo(map);
}

function toggleHeatmap() {
  heatmapOn = !heatmapOn;
  document.getElementById('heatmapToggle').classList.toggle('on', heatmapOn);

  if (heatmapOn) {
    renderHeatmap(allIncidents);
    showToast('Safety heatmap enabled', 'info');
  } else {
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    showToast('Safety heatmap disabled', 'info');
  }
}

function toggleMarkers() {
  markersOn = !markersOn;
  document.getElementById('markersToggle').classList.toggle('on', markersOn);

  if (markersOn) {
    renderIncidentMarkers(allIncidents);
    showToast('Incident markers shown', 'info');
  } else {
    clearIncidentMarkers();
    showToast('Incident markers hidden', 'info');
  }
}

function clearIncidentMarkers() {
  incidentMarkers.forEach(m => map.removeLayer(m));
  incidentMarkers = [];
}

// ---- Nominatim Search (Free Geocoding) ----
async function searchPlaceNominatim(query) {
  const suggestBox = document.getElementById('destSuggestions');
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=pk&limit=5&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const results = await res.json();

    if (!results.length) {
      suggestBox.style.display = 'none';
      return;
    }

    suggestBox.innerHTML = results.map((r, i) => `
      <div data-idx="${i}" data-lat="${r.lat}" data-lng="${r.lon}" data-name="${r.display_name}"
        style="padding:10px 14px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid #f1f5f9;color:#1e293b;transition:background 0.15s;"
        onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''"
        onclick="selectDestination(${r.lat}, ${r.lon}, '${r.display_name.replace(/'/g, "\\'")}')">
        <i class="fa-solid fa-location-dot" style="color:#e91e8c;margin-right:6px;"></i>
        ${r.display_name.length > 60 ? r.display_name.slice(0, 60) + '...' : r.display_name}
      </div>
    `).join('');

    suggestBox.style.display = 'block';
  } catch {
    suggestBox.style.display = 'none';
  }
}

function selectDestination(lat, lng, name) {
  document.getElementById('destinationInput').value = name.split(',').slice(0, 2).join(',');
  document.getElementById('destSuggestions').style.display = 'none';
  // Store for routing
  window._destLatLng = [parseFloat(lat), parseFloat(lng)];
  // Pan map to destination
  map.setView([parseFloat(lat), parseFloat(lng)], 14);
}

// ---- Routing ----
async function getRoute() {
  const destInput = document.getElementById('destinationInput').value.trim();

  if (!destInput) {
    showToast('Please enter a destination', 'warning');
    return;
  }

  if (!userLocation) {
    showToast('Waiting for your location — please allow location access', 'warning');
    getUserLocation();
    return;
  }

  const btn = document.getElementById('getRouteBtn');
  btn.innerHTML = '<span class="spinner"></span> Calculating...';
  btn.disabled = true;

  try {
    // Geocode destination if not already selected from suggestions
    let destLatLng = window._destLatLng;
    if (!destLatLng) {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destInput)}&countrycodes=pk&limit=1`
      );
      const data = await res.json();
      if (!data.length) {
        showToast('Destination not found. Try a more specific address.', 'error');
        return;
      }
      destLatLng = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }

    // Remove existing route
    if (routingControl) {
      map.removeControl(routingControl);
      routingControl = null;
    }

    // Draw route using OSRM (free routing engine)
    routingControl = L.Routing.control({
      waypoints: [
        L.latLng(userLocation[0], userLocation[1]),
        L.latLng(destLatLng[0], destLatLng[1]),
      ],
      routeWhileDragging: false,
      showAlternatives: false,
      fitSelectedRoutes: true,
      lineOptions: {
        styles: [
          { color: '#e91e8c', weight: 5, opacity: 0.85 },
          { color: 'white', weight: 8, opacity: 0.3 },
        ],
      },
      createMarker: (i, wp) => {
        const isStart = i === 0;
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:14px;height:14px;background:${isStart ? '#16a34a' : '#e91e8c'};border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        return L.marker(wp.latLng, { icon })
          .bindPopup(isStart ? '<b>📍 Start</b>' : '<b>🏁 Destination</b>');
      },
    }).addTo(map);

    // When route is found
    routingControl.on('routesfound', (e) => {
      const route = e.routes[0];
      const distKm = (route.summary.totalDistance / 1000).toFixed(1);
      const distM = route.summary.totalDistance;
      const walkMins = Math.round(route.summary.totalTime / 60);
      const hours = Math.floor(walkMins / 60);
      const mins = walkMins % 60;
      const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

      document.getElementById('routeDistance').textContent = `${distKm} km`;
      document.getElementById('routeDuration').textContent = durationText;

      // Count incidents near route
      const nearbyCount = countNearbyIncidents(route.coordinates, distM);
      document.getElementById('routeIncidents').textContent = nearbyCount;
      document.getElementById('routeInfoBox').style.display = 'block';

      // Safety score
      const score = Math.max(0, 100 - (nearbyCount * 12));
      updateSafetyScore(score, nearbyCount);

      showToast(`Route found — ${distKm} km, ~${durationText} walk`, 'success');
    });

    routingControl.on('routingerror', () => {
      showToast('Could not calculate route. Try a different destination.', 'error');
    });

  } catch (err) {
    showToast('Routing failed. Check your internet connection.', 'error');
  } finally {
    btn.innerHTML = '<i class="fa-solid fa-route"></i> Get Safe Route';
    btn.disabled = false;
    window._destLatLng = null;
  }
}

function countNearbyIncidents(routeCoords, totalDistM) {
  const threshold = Math.min(300, totalDistM * 0.1); // 300m or 10% of route
  let count = 0;

  allIncidents.forEach(inc => {
    if (!inc.location?.lat) return;
    for (const coord of routeCoords) {
      const dist = haversineDistance(
        coord.lat, coord.lng,
        inc.location.lat, inc.location.lng
      );
      if (dist < threshold) { count++; break; }
    }
  });

  return count;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateSafetyScore(score, nearbyCount) {
  const card = document.getElementById('safetyScoreCard');
  const val = document.getElementById('safetyScoreVal');
  const desc = document.getElementById('safetyScoreDesc');

  val.textContent = score;
  card.className = 'safety-score-card';

  if (score >= 70) {
    card.classList.add('safe');
    desc.textContent = `✅ Safe route — ${nearbyCount} incident(s) nearby`;
  } else if (score >= 40) {
    card.classList.add('moderate');
    desc.textContent = `⚠️ Moderate risk — ${nearbyCount} incident(s) nearby`;
  } else {
    card.classList.add('unsafe');
    desc.textContent = `🚨 High risk — ${nearbyCount} incidents nearby`;
  }
}

function clearRoute() {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  document.getElementById('routeInfoBox').style.display = 'none';
  document.getElementById('safetyScoreVal').textContent = '--';
  document.getElementById('safetyScoreDesc').textContent = 'Enter a route to see safety score';
  document.getElementById('safetyScoreCard').className = 'safety-score-card safe';
  document.getElementById('destinationInput').value = '';
  document.getElementById('destSuggestions').style.display = 'none';
  window._destLatLng = null;
  showToast('Route cleared', 'info');
}

// ---- Nearby Places via Overpass API (Free) ----
async function loadNearbyPlaces(lat, lng) {
  const radius = 3000; // 3km

  // Hospitals
  fetchOverpassPlaces(lat, lng, radius, 'hospital', 'hospitalsList', '#dc2626', 'fa-hospital');
  // Police
  fetchOverpassPlaces(lat, lng, radius, 'police', 'policeList', '#0891b2', 'fa-shield-halved');
}

async function fetchOverpassPlaces(lat, lng, radius, amenity, listId, color, icon) {
  const list = document.getElementById(listId);
  list.innerHTML = `<div style="font-size:0.8rem;color:#94a3b8;padding:8px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Searching nearby...</div>`;

  const query = `
    [out:json][timeout:10];
    node["amenity"="${amenity}"](around:${radius},${lat},${lng});
    out 5;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    const data = await res.json();
    const places = data.elements || [];

    if (!places.length) {
      list.innerHTML = `<div style="font-size:0.8rem;color:#94a3b8;padding:8px 0;">No ${amenity}s found within 3km</div>`;
      return;
    }

    list.innerHTML = places.slice(0, 5).map(p => {
      const name = p.tags?.name || cap(amenity);
      const dist = Math.round(haversineDistance(lat, lng, p.lat, p.lon));
      const distText = dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${dist} m`;

      // Add marker to map
      const placeIcon = L.divIcon({
        className: '',
        html: `<div style="width:10px;height:10px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>`,
        iconSize: [10, 10], iconAnchor: [5, 5],
      });
      const m = L.marker([p.lat, p.lon], { icon: placeIcon })
        .addTo(map)
        .bindPopup(`<b>${name}</b><br><small style="color:${color};">${cap(amenity)}</small>`);
      placeMarkers.push(m);

      return `
        <div class="place-item" onclick="panToPlace(${p.lat},${p.lon},'${name.replace(/'/g,"\\'")}')">
          <div class="place-icon ${amenity === 'hospital' ? 'hospital' : 'police'}">
            <i class="fa-solid ${icon}"></i>
          </div>
          <div>
            <div class="place-name">${name}</div>
            <div class="place-distance">${distText} away</div>
          </div>
        </div>`;
    }).join('');

  } catch {
    list.innerHTML = `<div style="font-size:0.8rem;color:#94a3b8;padding:8px 0;">Could not load ${amenity}s — check internet connection</div>`;
  }
}

function panToPlace(lat, lng, name) {
  map.setView([lat, lng], 17);
  showToast(`Navigated to ${name}`, 'info');
}

// ---- Reverse Geocode (Nominatim) ----
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    return data.display_name?.split(',').slice(0, 3).join(',') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

// ---- Helpers ----
function formatType(type) {
  return type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown';
}

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const colors = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#0891b2' };
  toast.innerHTML = `<i class="fa-solid ${icons[type]}" style="color:${colors[type]};font-size:1.1rem;flex-shrink:0;"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(110px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 320);
  }, 4000);
}
