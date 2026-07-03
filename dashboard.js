// =========================================
//  SafeRoute - Dashboard JS
// =========================================

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  const user = getUser();
  if (!user) return logout();

  // Populate user info
  const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
  document.getElementById('avatarInitial').textContent = initial;
  document.getElementById('sidebarName').textContent = user.name || 'User';

  // Greeting
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greetingText').textContent = `${greet}, ${user.name?.split(' ')[0] || 'there'} 👋`;
  document.getElementById('greetingDate').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Safety tips rotation
  const tips = [
    'Always share your travel plans with a trusted contact before leaving.',
    'Avoid walking alone late at night in poorly lit areas.',
    'Keep your phone charged before going out.',
    'Trust your instincts — if somewhere feels unsafe, leave immediately.',
    'Save emergency numbers (Police: 15, Ambulance: 1122) in your phone.',
    'Walk confidently and stay aware of your surroundings.',
    'Use SafeRoute to check incident heatmaps before travelling.',
  ];
  document.getElementById('safetyTip').textContent = tips[Math.floor(Math.random() * tips.length)];

  // Load data in parallel
  await Promise.all([
    loadStats(),
    loadNearbyIncidents(),
    updateLocation(),
  ]);

  setupSOS();
  setupQuickActions();
});

async function loadStats() {
  try {
    const [reportsRes, sosRes, contactsRes] = await Promise.all([
      fetch(`${API_BASE}/incidents/my`, { headers: authHeaders() }),
      fetch(`${API_BASE}/sos/history`, { headers: authHeaders() }),
      fetch(`${API_BASE}/contacts`, { headers: authHeaders() }),
    ]);

    if (reportsRes.ok) {
      const d = await reportsRes.json();
      document.getElementById('myReportsCount').textContent = d.count || 0;
    }
    if (sosRes.ok) {
      const d = await sosRes.json();
      document.getElementById('sosAlertsCount').textContent = d.count || 0;
    }
    if (contactsRes.ok) {
      const d = await contactsRes.json();
      document.getElementById('contactsCount').textContent = d.count || 0;
    }

    // Safety score
    const user = getUser();
    document.getElementById('safetyScore').textContent = user?.safetyScore || 85;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadNearbyIncidents() {
  const list = document.getElementById('incidentsList');

  navigator.geolocation?.getCurrentPosition(
    async ({ coords }) => {
      try {
        const res = await fetch(`${API_BASE}/incidents/nearby?lat=${coords.latitude}&lng=${coords.longitude}&radius=5`);
        const data = await res.json();

        if (!data.incidents || data.incidents.length === 0) {
          list.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8;font-size:0.875rem;"><i class="fa-solid fa-check-circle" style="font-size:1.5rem;color:#16a34a;margin-bottom:8px;display:block;"></i>No incidents reported nearby.<br>Your area looks safe!</div>`;
          return;
        }

        const iconMap = {
          harassment: { icon: 'fa-user-slash', color: '#e91e8c', bg: '#fce4ec' },
          theft: { icon: 'fa-hand', color: '#d97706', bg: '#fef3c7' },
          assault: { icon: 'fa-person-falling-burst', color: '#dc2626', bg: '#fee2e2' },
          suspicious_activity: { icon: 'fa-eye', color: '#7c3aed', bg: '#ede9fe' },
          poor_lighting: { icon: 'fa-moon', color: '#64748b', bg: '#f1f5f9' },
          other: { icon: 'fa-ellipsis', color: '#0891b2', bg: '#e0f2fe' },
        };

        list.innerHTML = data.incidents.slice(0, 6).map(inc => {
          const icon = iconMap[inc.incidentType] || iconMap.other;
          const ago = timeAgo(inc.createdAt);
          const severityColors = { high: '#dc2626', medium: '#d97706', low: '#16a34a' };
          return `
            <div class="incident-item">
              <div class="incident-type-icon" style="background:${icon.bg};color:${icon.color};">
                <i class="fa-solid ${icon.icon}"></i>
              </div>
              <div class="incident-info">
                <div class="incident-title">${formatType(inc.incidentType)}</div>
                <div class="incident-meta">
                  <span>${inc.location?.address || 'Unknown location'}</span> •
                  <span style="color:${severityColors[inc.severity]};">${cap(inc.severity)}</span> •
                  <span>${ago}</span>
                </div>
              </div>
            </div>`;
        }).join('');
      } catch (err) {
        list.innerHTML = `<div style="text-align:center;padding:20px;color:#94a3b8;font-size:0.875rem;">Failed to load incidents.</div>`;
      }
    },
    () => {
      list.innerHTML = `<div style="text-align:center;padding:20px;color:#94a3b8;font-size:0.875rem;"><i class="fa-solid fa-location-dot" style="margin-right:6px;"></i>Enable location to see nearby incidents</div>`;
    }
  );
}

function updateLocation() {
  const locText = document.getElementById('currentLocationText');

  if (!navigator.geolocation) {
    locText.textContent = 'Geolocation not supported';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const { latitude, longitude } = coords;
      locText.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (updating address...)`;

      // Reverse geocode using nominatim (free, no key needed for basic use)
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        const address = data.display_name?.split(',').slice(0, 3).join(',') || 'Location detected';
        locText.textContent = address;

        // Update location on backend
        fetch(`${API_BASE}/users/location`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ lat: latitude, lng: longitude, address }),
        }).catch(() => {});
      } catch {
        locText.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      }
    },
    () => {
      locText.textContent = 'Location access denied — enable in browser settings';
    }
  );
}

function setupSOS() {
  const btn = document.getElementById('sosBtn');
  const status = document.getElementById('sosStatus');
  let holdTimer = null;
  let holdProgress = 0;
  let isTriggered = false;

  const startHold = () => {
    if (isTriggered) return;
    holdProgress = 0;
    status.textContent = 'Hold for 2 seconds to send SOS...';
    btn.style.opacity = '0.8';

    holdTimer = setInterval(() => {
      holdProgress += 100;
      const pct = Math.min((holdProgress / 2000) * 100, 100);
      status.textContent = `Sending in ${((2000 - holdProgress) / 1000).toFixed(1)}s...`;
      if (holdProgress >= 2000) {
        clearInterval(holdTimer);
        triggerSOS();
      }
    }, 100);
  };

  const cancelHold = () => {
    if (holdTimer) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
    if (!isTriggered) {if (!isTR)
      btn.style.opacity = '1';
      status.textContent = 'Ready to trigger';
    }
  };

  btn.addEventListener('mousedown', startHold);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(); });
  btn.addEventListener('mouseup', cancelHold);
  btn.addEventListener('mouseleave', cancelHold);
  btn.addEventListener('touchend', cancelHold);
}

async function triggerSOS() {
  const btn = document.getElementById('sosBtn');
  const status = document.getElementById('sosStatus');

  navigator.geolocation?.getCurrentPosition(
    async ({ coords }) => {
      try {
        const res = await fetch(`${API_BASE}/sos/trigger`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            lat: coords.latitude,
            lng: coords.longitude,
            address: `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
          }),
        });
        const data = await res.json();

        if (data.success) {
          btn.classList.add('triggered');
          btn.innerHTML = '<i class="fa-solid fa-check" style="font-size:1.8rem;"></i><span>SENT</span>';
          status.textContent = `✅ SOS sent to ${data.contactsNotified} contact(s)!`;
          status.style.color = '#16a34a';
          showToast(`SOS alert sent to ${data.contactsNotified} emergency contact(s)!`, 'success');

          setTimeout(() => {
            btn.classList.remove('triggered');
            btn.innerHTML = '<i class="fa-solid fa-exclamation" style="font-size:1.8rem;"></i><span>SOS</span>';
            status.textContent = 'Ready to trigger';
            status.style.color = '';
          }, 10000);
        } else {
          showToast(data.message || 'Failed to send SOS', 'error');
          status.textContent = 'Failed. Try again.';
        }
      } catch {
        showToast('Cannot connect to server. Add emergency contacts first.', 'error');
        status.textContent = 'Error — check connection';
      }
    },
    () => {
      showToast('Location access needed for SOS. Please allow location.', 'warning');
    }
  );
}

function setupQuickActions() {
  document.getElementById('findHospitalBtn')?.addEventListener('click', () => {
    window.location.href = 'map.html?find=hospital';
  });
  document.getElementById('findPoliceBtn')?.addEventListener('click', () => {
    window.location.href = 'map.html?find=police';
  });
}

// ---- Helpers ----
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatType(type) {
  return type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown';
}

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const colors = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#0891b2' };
  toast.innerHTML = `<i class="fa-solid ${icons[type]}" style="color:${colors[type]};font-size:1.1rem;"></i><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100px)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
}
