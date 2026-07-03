// =========================================
//  SafeRoute - Report Incident JS
// =========================================

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  setupTypeSelector();
  setupSeveritySelector();
  setupLocationDetection();
  setupPhotoUpload();
  setupAnonymousToggle();
  setupCharCount();
  loadMyReports();
});

function setupTypeSelector() {
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('selectedType').value = btn.dataset.type;
    });
  });
}

function setupSeveritySelector() {
  document.querySelectorAll('.severity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.severity-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('selectedSeverity').value = btn.dataset.sev;
    });
  });
}

function setupLocationDetection() {
  document.getElementById('detectLocationBtn').addEventListener('click', () => {
    const status = document.getElementById('locationStatus');
    status.textContent = '📍 Detecting your location...';

    navigator.geolocation?.getCurrentPosition(
      async ({ coords }) => {
        document.getElementById('lat').value = coords.latitude.toFixed(6);
        document.getElementById('lng').value = coords.longitude.toFixed(6);

        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`);
          const data = await res.json();
          const address = data.display_name || `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
          document.getElementById('locationAddress').value = address;
          status.textContent = '✅ Location detected successfully';
          status.style.color = '#16a34a';
        } catch {
          document.getElementById('locationAddress').value = `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
          status.textContent = '✅ Coordinates captured';
          status.style.color = '#16a34a';
        }
      },
      () => {
        status.textContent = '❌ Location access denied. Please enter address manually.';
        status.style.color = '#dc2626';
      }
    );
  });

  // Auto-detect on load
  document.getElementById('detectLocationBtn').click();
}

function setupPhotoUpload() {
  const dropZone = document.getElementById('photoDropZone');
  const input = document.getElementById('photoInput');

  dropZone.addEventListener('click', () => input.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#e91e8c';
    dropZone.style.background = '#fce4ec30';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#e2e8f0';
    dropZone.style.background = '#f8fafc';
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#e2e8f0';
    dropZone.style.background = '#f8fafc';
    handleFiles(e.dataTransfer.files);
  });

  input.addEventListener('change', () => handleFiles(input.files));
}

function handleFiles(files) {
  const preview = document.getElementById('photoPreview');
  Array.from(files).slice(0, 3).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.className = 'preview-img';
      img.src = e.target.result;
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

function setupAnonymousToggle() {
  const toggle = document.getElementById('anonToggle');
  const input = document.getElementById('isAnonymous');

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('on');
    input.value = toggle.classList.contains('on') ? 'true' : 'false';
  });
}

function setupCharCount() {
  const desc = document.getElementById('description');
  const counter = document.getElementById('charCount');
  desc.addEventListener('input', () => {
    counter.textContent = `${desc.value.length} / 1000 characters`;
    counter.style.color = desc.value.length > 900 ? '#dc2626' : '#94a3b8';
  });
}

document.getElementById('reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const type = document.getElementById('selectedType').value;
  const description = document.getElementById('description').value.trim();
  const lat = parseFloat(document.getElementById('lat').value);
  const lng = parseFloat(document.getElementById('lng').value);
  const address = document.getElementById('locationAddress').value.trim();
  const severity = document.getElementById('selectedSeverity').value;
  const isAnonymous = document.getElementById('isAnonymous').value === 'true';
  const alertBox = document.getElementById('alertBox');
  const btn = document.getElementById('submitBtn');
  const submitText = document.getElementById('submitText');
  const submitLoader = document.getElementById('submitLoader');

  alertBox.innerHTML = '';

  if (!type) {
    alertBox.innerHTML = '<div class="alert alert-danger"><i class="fa-solid fa-circle-xmark"></i> Please select an incident type.</div>';
    return;
  }
  if (!description) {
    alertBox.innerHTML = '<div class="alert alert-danger"><i class="fa-solid fa-circle-xmark"></i> Please enter a description.</div>';
    return;
  }
  if (isNaN(lat) || isNaN(lng)) {
    alertBox.innerHTML = '<div class="alert alert-warning"><i class="fa-solid fa-triangle-exclamation"></i> Please detect or enter a location first.</div>';
    return;
  }

  submitText.classList.add('hidden');
  submitLoader.classList.remove('hidden');
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/incidents/report`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        incidentType: type,
        description,
        location: { lat, lng, address },
        severity,
        isAnonymous,
      }),
    });

    const data = await res.json();

    if (data.success) {
      alertBox.innerHTML = '<div class="alert alert-success"><i class="fa-solid fa-check-circle"></i> Incident reported successfully! Thank you for helping keep your community safe.</div>';
      document.getElementById('reportForm').reset();
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.severity-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.severity-btn.low').classList.add('active');
      document.getElementById('selectedSeverity').value = 'low';
      document.getElementById('selectedType').value = '';
      document.getElementById('photoPreview').innerHTML = '';
      loadMyReports();
    } else {
      alertBox.innerHTML = `<div class="alert alert-danger"><i class="fa-solid fa-circle-xmark"></i> ${data.message}</div>`;
    }
  } catch {
    alertBox.innerHTML = '<div class="alert alert-danger"><i class="fa-solid fa-wifi"></i> Cannot connect to server. Make sure the backend is running.</div>';
  } finally {
    submitText.classList.remove('hidden');
    submitLoader.classList.add('hidden');
    btn.disabled = false;
  }
});

async function loadMyReports() {
  const list = document.getElementById('myReportsList');
  try {
    const res = await fetch(`${API_BASE}/incidents/my`, { headers: authHeaders() });
    const data = await res.json();

    if (!data.incidents || data.incidents.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:32px;color:#94a3b8;font-size:0.875rem;"><i class="fa-solid fa-file-circle-xmark" style="font-size:2rem;margin-bottom:10px;display:block;"></i>You have not submitted any reports yet.</div>`;
      return;
    }

    const statusColors = { pending: 'warning', verified: 'success', rejected: 'danger' };
    const severityColors = { high: '#dc2626', medium: '#d97706', low: '#16a34a' };

    list.innerHTML = data.incidents.map(inc => `
      <div style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #f1f5f9;">
        <div style="flex:1;">
          <div style="font-size:0.875rem;font-weight:700;color:#0f172a;">${formatType(inc.incidentType)}</div>
          <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">${inc.description?.slice(0, 80)}...</div>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">${timeAgo(inc.createdAt)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="badge badge-${statusColors[inc.status] || 'gray'}">${cap(inc.status)}</span>
          <span style="font-size:0.75rem;font-weight:600;color:${severityColors[inc.severity]};">${cap(inc.severity)}</span>
        </div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<div style="text-align:center;padding:24px;color:#94a3b8;font-size:0.875rem;">Failed to load reports.</div>';
  }
}

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
