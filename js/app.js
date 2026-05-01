/* ═══════════════════════════════════════════════════
   Water Benders IITH – Main Application
   ═══════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────
const state = {
  bowls: [],
  benders: {},      // bowlId → [bender, …]
  isAdmin: false,
  currentView: 'map',
  currentFilter: 'all',
  activeBowlId: null,
  map: null,
  pickerMap: null,
  pickerMarker: null,
  markers: {},      // bowlId → Leaflet marker
  pendingPhotoData: null,
  pendingPhotoMime: null,
  editingBowlId: null,
  refreshTimer: null,
  notificationsEnabled: false,
  notifiedBowls: new Set(),
};

// ── Helpers ──────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  $('toast-container').prepend(toast);
  setTimeout(() => toast.remove(), duration);
}

function formatTimeAgo(isoString) {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) return 'Just now';
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 2)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatCountdown(isoString, timerHours) {
  if (!isoString) return { text: 'Never filled', cls: 'urgent' };
  const elapsed = Date.now() - new Date(isoString).getTime();
  const total   = timerHours * 3_600_000;
  const remain  = total - elapsed;
  if (remain <= 0) {
    const overdue = Math.floor(-remain / 3_600_000);
    return { text: `Overdue by ${overdue}h`, cls: 'urgent' };
  }
  const h = Math.floor(remain / 3_600_000);
  const m = Math.floor((remain % 3_600_000) / 60_000);
  if (h === 0) return { text: `Refill in ${m}m`, cls: '' };
  return { text: `Refill in ${h}h ${m}m`, cls: '' };
}

function getBowlStatus(bowl) {
  if (!bowl.last_filled) return 'grey';
  const ratio = (Date.now() - new Date(bowl.last_filled).getTime())
                / (bowl.timer_hours * 3_600_000);
  if (ratio < CONFIG.STATUS_ORANGE_THRESHOLD) return 'green';
  if (ratio < CONFIG.STATUS_RED_THRESHOLD)    return 'orange';
  return 'red';
}

function getProgress(bowl) {
  if (!bowl.last_filled) return 100;
  const ratio = (Date.now() - new Date(bowl.last_filled).getTime())
                / (bowl.timer_hours * 3_600_000);
  return Math.min(ratio * 100, 100);
}

function progressColor(pct) {
  if (pct < CONFIG.STATUS_ORANGE_THRESHOLD * 100) return '#22c55e';
  if (pct < CONFIG.STATUS_RED_THRESHOLD * 100)    return '#f97316';
  return '#ef4444';
}

function badgeHtml(status) {
  const map = {
    green:  ['badge-green',  'Fresh'],
    orange: ['badge-orange', 'Getting dry'],
    red:    ['badge-red',    'Needs water'],
    grey:   ['badge-grey',   'Unknown'],
  };
  const [cls, label] = map[status] || map.grey;
  return `<span class="bowl-card-badge ${cls}">${label}</span>`;
}

function statusBadgeStyle(status) {
  const map = {
    green:  'background:rgba(34,197,94,.85);color:#fff;',
    orange: 'background:rgba(249,115,22,.85);color:#fff;',
    red:    'background:rgba(239,68,68,.85);color:#fff;',
    grey:   'background:rgba(148,163,184,.85);color:#fff;',
  };
  return map[status] || map.grey;
}

function statusLabel(status) {
  return { green: 'Fresh', orange: 'Getting dry', red: 'Needs water', grey: 'Never filled' }[status] || 'Unknown';
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Modal helpers ─────────────────────────────────────
function openModal(id) {
  const el = $(id);
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const el = $(id);
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => {
    m.classList.add('hidden');
    m.setAttribute('aria-hidden', 'true');
  });
  document.body.style.overflow = '';
}

// ── Map ───────────────────────────────────────────────
function initMap() {
  state.map = L.map('map', { zoomControl: false }).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(state.map);
  L.control.zoom({ position: 'topright' }).addTo(state.map);
}

function createDivIcon(status) {
  const colors = { green: '#22c55e', orange: '#f97316', red: '#ef4444', grey: '#94a3b8' };
  const c = colors[status] || colors.grey;
  const pulse = status === 'red'
    ? 'animation:pulse-marker 1.5s ease-in-out infinite;'
    : '';
  return L.divIcon({
    html: `<div class="map-marker ${status}" style="background:${c};${pulse}">🐾</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function renderMapMarkers() {
  const { map, markers, bowls } = state;
  if (!map) return;

  // Remove stale markers
  Object.keys(markers).forEach(id => {
    if (!bowls.find(b => b.id === id)) {
      map.removeLayer(markers[id]);
      delete markers[id];
    }
  });

  bowls.forEach(bowl => {
    const lat = parseFloat(bowl.latitude);
    const lng = parseFloat(bowl.longitude);
    if (!lat || !lng) return;

    const status = getBowlStatus(bowl);
    const icon   = createDivIcon(status);

    if (markers[bowl.id]) {
      markers[bowl.id].setIcon(icon);
    } else {
      const marker = L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(buildPopupHtml(bowl), { closeButton: false });
      marker.on('click', () => openBowlDetail(bowl.id));
      markers[bowl.id] = marker;
    }
  });
}

function buildPopupHtml(bowl) {
  const status = getBowlStatus(bowl);
  const cd = formatCountdown(bowl.last_filled, bowl.timer_hours);
  return `<div class="map-popup">
    <div class="map-popup-name">${escHtml(bowl.name)}</div>
    <div class="map-popup-status" style="color:${progressColor(getProgress(bowl))}">${cd.text}</div>
    <button class="map-popup-btn" onclick="openBowlDetail('${bowl.id}')">View details</button>
  </div>`;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Bowl List ─────────────────────────────────────────
function renderList() {
  const grid = $('bowls-grid');
  const filter = state.currentFilter;

  const visible = state.bowls.filter(b => {
    if (filter === 'all') return true;
    return getBowlStatus(b) === filter;
  });

  $('list-stats').textContent = `${state.bowls.length} bowl${state.bowls.length !== 1 ? 's' : ''}`;

  if (visible.length === 0) {
    grid.innerHTML = '';
    $('empty-state').classList.remove('hidden');
    return;
  }
  $('empty-state').classList.add('hidden');

  grid.innerHTML = visible.map(bowl => buildCardHtml(bowl)).join('');
  grid.querySelectorAll('.bowl-card').forEach(card => {
    card.addEventListener('click', () => openBowlDetail(card.dataset.id));
  });
}

function buildCardHtml(bowl) {
  const status   = getBowlStatus(bowl);
  const pct      = getProgress(bowl);
  const color    = progressColor(pct);
  const cd       = formatCountdown(bowl.last_filled, bowl.timer_hours);
  const benders  = state.benders[bowl.id] || [];
  const benderChips = benders.slice(0, 3).map(b =>
    `<span class="bender-chip">
      <span class="bender-avatar">${initials(b.name)}</span>${escHtml(b.name)}
    </span>`
  ).join('');

  const photoHtml = bowl.photo_url
    ? `<img class="bowl-card-photo" src="${escHtml(bowl.photo_url)}" alt="${escHtml(bowl.name)}" loading="lazy">`
    : `<div class="bowl-card-photo-placeholder">🐶</div>`;

  return `<div class="bowl-card" data-id="${bowl.id}">
    ${photoHtml}
    <div class="bowl-card-status-strip" style="background:${color}"></div>
    <div class="bowl-card-body">
      <div class="bowl-card-header">
        <div class="bowl-card-name">${escHtml(bowl.name)}</div>
        ${badgeHtml(status)}
      </div>
      ${bowl.location_name ? `<div class="bowl-card-location">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${escHtml(bowl.location_name)}
      </div>` : ''}
      <div class="bowl-card-progress-wrap">
        <div class="bowl-card-progress-bg">
          <div class="bowl-card-progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
      <div class="bowl-card-timer">
        <span>${formatTimeAgo(bowl.last_filled)}</span>
        <span class="${cd.cls}">${cd.text}</span>
      </div>
      ${benders.length > 0 ? `<div class="bowl-card-benders">${benderChips}</div>` : ''}
    </div>
  </div>`;
}

// ── Bowl Detail ───────────────────────────────────────
async function openBowlDetail(id) {
  const bowl = state.bowls.find(b => b.id === id);
  if (!bowl) return;
  state.activeBowlId = id;

  // Photo
  const photo = $('detail-photo');
  const placeholder = $('detail-photo-placeholder');
  if (bowl.photo_url) {
    photo.src = bowl.photo_url;
    photo.alt = bowl.name;
    photo.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    photo.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }

  // Status badge
  const status = getBowlStatus(bowl);
  const badge = $('detail-status-badge');
  badge.textContent = statusLabel(status);
  badge.style.cssText = statusBadgeStyle(status);

  // Header
  $('detail-name').textContent = bowl.name;
  $('detail-location').textContent = bowl.location_name || (bowl.latitude ? `${bowl.latitude}, ${bowl.longitude}` : 'No location set');

  // Timer card
  const pct  = getProgress(bowl);
  const cd   = formatCountdown(bowl.last_filled, bowl.timer_hours);
  $('detail-last-filled').textContent = bowl.last_filled
    ? `${formatTimeAgo(bowl.last_filled)}${bowl.last_filled_by ? ` by ${bowl.last_filled_by}` : ''}`
    : 'Never';
  const fill = $('detail-progress');
  fill.style.width           = `${pct}%`;
  fill.style.backgroundColor = progressColor(pct);
  const countdownEl = $('detail-countdown');
  countdownEl.textContent = cd.text;
  countdownEl.className = `timer-countdown ${cd.cls}`;
  $('detail-interval').textContent = bowl.timer_hours || 8;

  // Admin controls
  const adminEls = document.querySelectorAll('.admin-only');
  adminEls.forEach(el => el.classList.toggle('hidden', !state.isAdmin));

  // Load benders
  await loadAndRenderBenders(id);

  // Reset history
  $('history-list').classList.add('hidden');
  $('toggle-history-btn').textContent = 'Show';
  $('history-list').innerHTML = '';

  openModal('bowl-detail-modal');
}

async function loadAndRenderBenders(bowlId) {
  let benders = state.benders[bowlId];
  if (!benders) {
    try {
      benders = await API.getBenders(bowlId);
      state.benders[bowlId] = benders;
    } catch {
      benders = [];
    }
  }

  const list = $('benders-list');
  const noMsg = $('no-benders-msg');
  if (benders.length === 0) {
    list.innerHTML = '';
    list.appendChild(noMsg);
    noMsg.classList.remove('hidden');
    return;
  }
  noMsg.classList.add('hidden');
  list.innerHTML = benders.map(b => `
    <div class="bender-item" data-id="${b.id}">
      <div class="bender-avatar-lg">${initials(b.name)}</div>
      <div class="bender-info">
        <div class="bender-name">${escHtml(b.name)}</div>
        <div class="bender-phone">
          ${b.phone ? `<a href="tel:${escHtml(b.phone)}">${escHtml(b.phone)}</a>` : '<span class="muted-text">No phone</span>'}
        </div>
      </div>
      ${state.isAdmin ? `<button class="bender-remove" data-id="${b.id}" title="Remove">✕</button>` : ''}
    </div>
  `).join('');

  if (state.isAdmin) {
    list.querySelectorAll('.bender-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        removeBender(btn.dataset.id, bowlId);
      });
    });
  }
}

async function removeBender(benderId, bowlId) {
  if (!confirm('Remove this water bender?')) return;
  try {
    await API.removeBender(benderId);
    delete state.benders[bowlId];
    await loadAndRenderBenders(bowlId);
    showToast('Water bender removed', 'info');
  } catch {
    showToast('Failed to remove bender', 'error');
  }
}

// ── Fill Bowl ─────────────────────────────────────────
function openFillModal() {
  $('fill-name-input').value  = '';
  $('fill-notes-input').value = '';
  openModal('fill-modal');
  setTimeout(() => $('fill-name-input').focus(), 300);
}

async function confirmFill() {
  const bowlId   = state.activeBowlId;
  const filledBy = $('fill-name-input').value.trim() || 'Anonymous';
  const notes    = $('fill-notes-input').value.trim();
  const btn      = $('fill-confirm-btn');

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const res = await API.fillBowl(bowlId, filledBy, notes);
    if (res.error) throw new Error(res.error);

    // Optimistic update
    const bowl = state.bowls.find(b => b.id === bowlId);
    if (bowl) {
      bowl.last_filled    = res.timestamp || new Date().toISOString();
      bowl.last_filled_by = filledBy;
    }
    delete state.benders[bowlId];
    closeModal('fill-modal');
    await openBowlDetail(bowlId);
    renderList();
    renderMapMarkers();
    showToast('Bowl marked as filled! 💧', 'success');
    state.notifiedBowls.delete(bowlId);
  } catch (err) {
    showToast('Failed to record fill. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Fill 💧';
  }
}

// ── Fill History ──────────────────────────────────────
async function toggleHistory() {
  const list = $('history-list');
  const btn  = $('toggle-history-btn');
  if (!list.classList.contains('hidden')) {
    list.classList.add('hidden');
    btn.textContent = 'Show';
    return;
  }
  btn.textContent = 'Loading…';
  try {
    const history = await API.getHistory(state.activeBowlId, 10);
    list.innerHTML = history.length === 0
      ? '<p class="muted-text">No fill history yet</p>'
      : history.map(h => `
          <div class="history-item">
            <div class="history-dot"></div>
            <div class="history-info">
              <div class="history-who">${escHtml(h.filled_by || 'Anonymous')}</div>
              <div class="history-when">${formatTimeAgo(h.timestamp)}</div>
              ${h.notes ? `<div class="history-notes">${escHtml(h.notes)}</div>` : ''}
            </div>
          </div>`
        ).join('');
    list.classList.remove('hidden');
    btn.textContent = 'Hide';
  } catch {
    showToast('Failed to load history', 'error');
    btn.textContent = 'Show';
  }
}

// ── Add / Edit Bowl ───────────────────────────────────
function openAddBowlForm() {
  state.editingBowlId  = null;
  state.pendingPhotoData = null;
  state.pendingPhotoMime = null;

  $('bowl-form-title').textContent     = 'Add Water Bowl';
  $('bowl-form-submit-text').textContent = 'Add Bowl';
  $('bowl-name-input').value           = '';
  $('bowl-location-input').value       = '';
  $('bowl-notes-input').value          = '';
  $('bowl-added-by-input').value       = '';
  $('timer-slider').value              = CONFIG.DEFAULT_TIMER_HOURS;
  $('timer-value-display').textContent = `${CONFIG.DEFAULT_TIMER_HOURS}h`;
  resetPhotoUpload();
  $('location-coords').classList.add('hidden');

  openModal('bowl-form-modal');
  setTimeout(initPickerMap, 300);
}

function openEditBowlForm(bowl) {
  state.editingBowlId = bowl.id;
  state.pendingPhotoData = null;
  state.pendingPhotoMime = null;

  $('bowl-form-title').textContent     = 'Edit Bowl';
  $('bowl-form-submit-text').textContent = 'Save Changes';
  $('bowl-name-input').value           = bowl.name || '';
  $('bowl-location-input').value       = bowl.location_name || '';
  $('bowl-notes-input').value          = bowl.description || '';
  $('bowl-added-by-input').value       = '';
  const hours = bowl.timer_hours || CONFIG.DEFAULT_TIMER_HOURS;
  $('timer-slider').value              = hours;
  $('timer-value-display').textContent = `${hours}h`;
  resetPhotoUpload();

  if (bowl.photo_url) {
    const prev = $('photo-preview');
    prev.src = bowl.photo_url;
    $('photo-preview-container').classList.remove('hidden');
    $('photo-upload-placeholder').classList.add('hidden');
  }

  openModal('bowl-form-modal');
  setTimeout(() => {
    initPickerMap();
    if (bowl.latitude && bowl.longitude) {
      setPickerPin(parseFloat(bowl.latitude), parseFloat(bowl.longitude));
    }
  }, 300);
}

function resetPhotoUpload() {
  $('photo-file-input').value           = '';
  $('photo-preview').src                = '';
  $('photo-preview-container').classList.add('hidden');
  $('photo-upload-placeholder').classList.remove('hidden');
}

function initPickerMap() {
  if (state.pickerMap) {
    state.pickerMap.invalidateSize();
    return;
  }
  state.pickerMap = L.map('bowl-map-picker', { zoomControl: true })
    .setView(CONFIG.MAP_CENTER, 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19,
  }).addTo(state.pickerMap);

  state.pickerMap.on('click', e => setPickerPin(e.latlng.lat, e.latlng.lng));
}

function setPickerPin(lat, lng) {
  if (state.pickerMarker) {
    state.pickerMarker.setLatLng([lat, lng]);
  } else {
    state.pickerMarker = L.marker([lat, lng], { draggable: true })
      .addTo(state.pickerMap);
    state.pickerMarker.on('dragend', e => {
      const { lat, lng } = e.target.getLatLng();
      updateCoordsDisplay(lat, lng);
    });
  }
  state.pickerMap.panTo([lat, lng]);
  updateCoordsDisplay(lat, lng);
}

function updateCoordsDisplay(lat, lng) {
  $('coords-text').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  $('location-coords').classList.remove('hidden');
}

async function submitBowlForm() {
  const name = $('bowl-name-input').value.trim();
  if (!name) { showToast('Bowl name is required', 'warning'); return; }

  let lat = 0, lng = 0;
  if (state.pickerMarker) {
    const ll = state.pickerMarker.getLatLng();
    lat = ll.lat; lng = ll.lng;
  }
  if (!lat && !lng) { showToast('Please pin the bowl location on the map', 'warning'); return; }

  const btn       = $('bowl-form-submit-btn');
  const submitTxt = $('bowl-form-submit-text');
  const loadSpin  = $('bowl-form-loading');
  btn.disabled = true;
  submitTxt.classList.add('hidden');
  loadSpin.classList.remove('hidden');

  try {
    let photoUrl = '';
    if (state.pendingPhotoData) {
      const res = await API.uploadImage(state.pendingPhotoData, state.pendingPhotoMime, 'bowl-photo.jpg');
      if (res.error) throw new Error(res.error);
      photoUrl = res.url;
    } else if (state.editingBowlId) {
      const existing = state.bowls.find(b => b.id === state.editingBowlId);
      photoUrl = existing?.photo_url || '';
    }

    const data = {
      id:            state.editingBowlId,
      name,
      description:   $('bowl-notes-input').value.trim(),
      latitude:      lat,
      longitude:     lng,
      location_name: $('bowl-location-input').value.trim(),
      photo_url:     photoUrl,
      timer_hours:   parseInt($('timer-slider').value),
      created_by:    $('bowl-added-by-input').value.trim() || 'Anonymous',
    };

    const res = state.editingBowlId
      ? await API.updateBowl(data)
      : await API.addBowl(data);

    if (res.error) throw new Error(res.error);

    closeModal('bowl-form-modal');
    showToast(state.editingBowlId ? 'Bowl updated!' : 'Bowl added! 🐾', 'success');
    await loadBowls();

    // Reset picker for next use
    if (state.pickerMarker) { state.pickerMap.removeLayer(state.pickerMarker); state.pickerMarker = null; }
    state.pickerMap.remove();
    state.pickerMap = null;
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    submitTxt.classList.remove('hidden');
    loadSpin.classList.add('hidden');
  }
}

async function deleteBowl() {
  const bowl = state.bowls.find(b => b.id === state.activeBowlId);
  if (!bowl) return;
  if (!confirm(`Delete "${bowl.name}"? This cannot be undone.`)) return;

  try {
    await API.deleteBowl(state.activeBowlId);
    closeModal('bowl-detail-modal');
    showToast('Bowl deleted', 'info');
    await loadBowls();
  } catch {
    showToast('Failed to delete bowl', 'error');
  }
}

// ── Admin ─────────────────────────────────────────────
function openAdminModal() {
  if (state.isAdmin) {
    if (confirm('Exit admin mode?')) setAdminMode(false);
    return;
  }
  $('admin-passcode-input').value = '';
  $('admin-error').classList.add('hidden');
  openModal('admin-modal');
  setTimeout(() => $('admin-passcode-input').focus(), 300);
}

async function attemptAdminLogin() {
  const passcode = $('admin-passcode-input').value.trim();
  if (!passcode) return;

  const btn = $('admin-login-btn');
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const res = await API.verifyAdmin(passcode);
    if (res.authorized) {
      closeModal('admin-modal');
      setAdminMode(true);
      showToast('Admin mode enabled 🔓', 'success');
    } else {
      $('admin-error').classList.remove('hidden');
    }
  } catch {
    showToast('Could not verify passcode', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Unlock';
  }
}

function setAdminMode(on) {
  state.isAdmin = on;
  const lockIcon   = $('admin-icon-lock');
  const unlockIcon = $('admin-icon-unlock');
  lockIcon.classList.toggle('hidden', on);
  unlockIcon.classList.toggle('hidden', !on);
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !on));
  if (on) {
    $('add-bowl-btn').classList.remove('hidden');
  } else {
    $('add-bowl-btn').classList.add('hidden');
  }
}

// ── Water Benders ─────────────────────────────────────
function openAddBenderModal() {
  $('bender-name-input').value  = '';
  $('bender-phone-input').value = '';
  openModal('bender-modal');
  setTimeout(() => $('bender-name-input').focus(), 300);
}

async function submitBender() {
  const name  = $('bender-name-input').value.trim();
  const phone = $('bender-phone-input').value.trim();
  if (!name) { showToast('Name is required', 'warning'); return; }

  const btn = $('bender-submit-btn');
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const res = await API.addBender(state.activeBowlId, name, phone);
    if (res.error) throw new Error(res.error);
    delete state.benders[state.activeBowlId];
    closeModal('bender-modal');
    await loadAndRenderBenders(state.activeBowlId);
    renderList();
    showToast(`${name} added as a Water Bender! 🌊`, 'success');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Add Bender';
  }
}

// ── Notifications ─────────────────────────────────────
async function requestNotifications() {
  if (!('Notification' in window)) {
    showToast('Notifications not supported in this browser', 'warning');
    return;
  }
  const perm = await Notification.requestPermission();
  state.notificationsEnabled = perm === 'granted';
  if (perm === 'granted') {
    $('notif-btn').style.color = '#0ea5e9';
    showToast('Notifications enabled 🔔', 'success');
  } else {
    showToast('Notification permission denied', 'warning');
  }
}

function checkAndNotify() {
  if (!state.notificationsEnabled) return;
  const urgent = state.bowls.filter(b => getBowlStatus(b) === 'red');
  if (urgent.length === 0) {
    $('notif-dot').classList.add('hidden');
    $('alert-banner').classList.add('hidden');
    return;
  }

  $('notif-dot').classList.remove('hidden');
  $('alert-banner-text').textContent =
    `⚠️ ${urgent.length} bowl${urgent.length > 1 ? 's' : ''} need water: ${urgent.map(b => b.name).join(', ')}`;
  $('alert-banner').classList.remove('hidden');

  urgent.forEach(bowl => {
    if (!state.notifiedBowls.has(bowl.id)) {
      state.notifiedBowls.add(bowl.id);
      new Notification('🐶 Water Bowl Alert!', {
        body: `"${bowl.name}" needs to be refilled!`,
        icon: 'icons/icon.svg',
        tag: bowl.id,
      });
    }
  });
}

// ── Data Loading ──────────────────────────────────────
async function loadBowls() {
  try {
    const bowls = await API.getBowls();
    state.bowls = Array.isArray(bowls) ? bowls : [];

    // Pre-load benders for all bowls
    const benderPromises = state.bowls.map(b =>
      API.getBenders(b.id).then(bends => { state.benders[b.id] = bends; }).catch(() => {})
    );
    await Promise.all(benderPromises);

    renderMapMarkers();
    renderList();
    checkAndNotify();
  } catch (err) {
    showToast('Failed to load bowls. Check your connection.', 'error');
  }
}

function startRefreshTimer() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(async () => {
    await loadBowls();
  }, CONFIG.REFRESH_INTERVAL);
}

// ── View Switching ────────────────────────────────────
function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  $(`view-${view}`).classList.add('active');
  document.querySelector(`.nav-btn[data-view="${view}"]`)?.classList.add('active');

  if (view === 'map' && state.map) {
    setTimeout(() => state.map.invalidateSize(), 100);
  }
}

// ── Photo Upload ──────────────────────────────────────
function handlePhotoSelect(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      // Compress to max 900px wide
      const maxDim = 900;
      const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      state.pendingPhotoData = dataUrl;
      state.pendingPhotoMime = 'image/jpeg';
      $('photo-preview').src = dataUrl;
      $('photo-preview-container').classList.remove('hidden');
      $('photo-upload-placeholder').classList.add('hidden');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Event Wiring ──────────────────────────────────────
function wireEvents() {
  // Navigation
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Modal close on backdrop click
  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.close));
  });

  // Keyboard ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });

  // Header buttons
  $('notif-btn').addEventListener('click', requestNotifications);
  $('admin-btn').addEventListener('click', openAdminModal);

  // Alert banner close
  $('alert-banner-close').addEventListener('click', () => $('alert-banner').classList.add('hidden'));

  // Add bowl
  $('add-bowl-btn').addEventListener('click', openAddBowlForm);

  // Bowl form
  $('photo-upload-area').addEventListener('click', () => $('photo-file-input').click());
  $('photo-file-input').addEventListener('change', e => handlePhotoSelect(e.target.files[0]));
  $('photo-remove-btn').addEventListener('click', e => { e.stopPropagation(); resetPhotoUpload(); state.pendingPhotoData = null; });
  $('timer-slider').addEventListener('input', e => {
    $('timer-value-display').textContent = `${e.target.value}h`;
  });
  $('use-my-location-btn').addEventListener('click', () => {
    if (!navigator.geolocation) { showToast('Geolocation not supported', 'warning'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      setPickerPin(pos.coords.latitude, pos.coords.longitude);
    }, () => showToast('Could not get location', 'error'));
  });
  $('bowl-form-submit-btn').addEventListener('click', submitBowlForm);

  // Bowl detail
  $('fill-it-btn').addEventListener('click', () => {
    closeModal('bowl-detail-modal');
    openFillModal();
  });
  $('toggle-history-btn').addEventListener('click', toggleHistory);
  $('add-bender-btn').addEventListener('click', openAddBenderModal);
  $('edit-bowl-btn').addEventListener('click', () => {
    const bowl = state.bowls.find(b => b.id === state.activeBowlId);
    if (bowl) { closeModal('bowl-detail-modal'); openEditBowlForm(bowl); }
  });
  $('delete-bowl-btn').addEventListener('click', deleteBowl);

  // Fill modal
  $('fill-confirm-btn').addEventListener('click', confirmFill);
  $('fill-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmFill(); });

  // Admin modal
  $('admin-login-btn').addEventListener('click', attemptAdminLogin);
  $('admin-passcode-input').addEventListener('keydown', e => { if (e.key === 'Enter') attemptAdminLogin(); });

  // Bender modal
  $('bender-submit-btn').addEventListener('click', submitBender);
  $('bender-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitBender(); });

  // List filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentFilter = btn.dataset.filter;
      renderList();
    });
  });
}

// ── Init ──────────────────────────────────────────────
async function init() {
  // Check config
  if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.includes('YOUR_APPS_SCRIPT_URL')) {
    $('loading-screen').classList.add('hidden');
    $('setup-screen').classList.remove('hidden');
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  wireEvents();

  try {
    await loadBowls();
  } catch {
    // loadBowls() surfaces its own toast; nothing more to do here
  } finally {
    // Always reveal the app — even if the API call timed out or failed.
    // initMap() is intentionally placed here so Leaflet can measure the
    // container once it's visible (calling it on a display:none element
    // gives it 0×0 dimensions and no tiles render).
    $('loading-screen').classList.add('hidden');
    $('app').classList.remove('hidden');
    initMap();
    renderMapMarkers(); // first call inside loadBowls() returned early (map wasn't ready)
    startRefreshTimer();
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      state.notificationsEnabled = true;
      $('notif-btn').style.color = '#0ea5e9';
    }
  }
}

// Expose for inline HTML use
window.openBowlDetail = openBowlDetail;

document.addEventListener('DOMContentLoaded', init);
