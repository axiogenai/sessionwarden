/* ============================================
   GOOGLE AUTO-LOGOUT TIMER — app.js
   Web App file — goes next to index.html
   ============================================ */

// ─── STATE ───────────────────────────────────
const state = {
  timerRunning: false,
  timerPaused: false,
  timerRemaining: 0,
  timerTotal: 0,
  startTime: 0,
  endTime: 0,
  intervalId: null,
  animId: null,
  extensionConnected: false,
  stats: { cookies: 0, sessions: 0, logouts: 0 },
  history: [],
  lastActivity: { tabs: [], cookies: [] },
  refreshCount: 0,
  settings: {
    confirm: true,
    cache: false,
    passwords: false,
    log: true,
    sound: false,
    warning: true,
    notif: true,
    warnSecs: 10,
    repeat: true,
    darkMode: true,
    anim: true,
    accent: '#6366f1',
    browsers: ['Chrome','Firefox','Edge','Brave','Opera'],
    days: ['mon','tue','wed','thu','fri'],
    scheduleMode: 'interval',
    intervalMins: 30,
    specificTime: '22:00',
    idleMins: 10,
  },
};

// ─── PERSIST ─────────────────────────────────
function save() {
  localStorage.setItem('galt_state', JSON.stringify({
    stats: state.stats,
    history: state.history,
    lastActivity: state.lastActivity,
    refreshCount: state.refreshCount,
    settings: state.settings,
  }));
}
function load() {
  try {
    const raw = localStorage.getItem('galt_state');
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.stats) Object.assign(state.stats, d.stats);
    if (d.history) state.history = d.history;
    if (d.lastActivity) state.lastActivity = d.lastActivity;
    if (d.refreshCount !== undefined) state.refreshCount = d.refreshCount;
    if (d.settings) Object.assign(state.settings, d.settings);

    // Auto-clear logic: If activity exists, increment refresh count.
    // Clear after 2 refreshes.
    const hasActivity = (state.lastActivity.tabs && state.lastActivity.tabs.length > 0) || 
                        (state.lastActivity.cookies && state.lastActivity.cookies.length > 0);
    
    if (hasActivity) {
      state.refreshCount++;
      if (state.refreshCount >= 2) {
        state.lastActivity = { tabs: [], cookies: [] };
        state.refreshCount = 0;
        save();
      } else {
        save();
      }
    } else {
      state.refreshCount = 0;
      save();
    }
  } catch(e) {}
}

// ─── TOAST ───────────────────────────────────
function toast(msg, type='info') {
  // Toasts disabled per user request
}

function showCleanupOverlay() {
  const overlay = document.getElementById('cleanup-overlay');
  overlay.classList.remove('hidden');
  overlay.classList.add('show');

  // Re-trigger animations
  const box = overlay.querySelector('.cleanup-box');
  if (box) {
    const newBox = box.cloneNode(true);
    box.parentNode.replaceChild(newBox, box);
  }

  setTimeout(() => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 300);
  }, 4500);
}

// ─── MODAL ───────────────────────────────────
function showModal(desc, onConfirm) {
  document.getElementById('modal-desc').textContent = desc;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-confirm').onclick = () => {
    closeModal(); onConfirm();
  };
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}
document.getElementById('modal-cancel').onclick = closeModal;
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ─── TABS ─────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    // Remove active from ALL nav items
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    
    // Add active to all nav items for THIS tab (both sidebar and mobile)
    document.querySelectorAll(`.nav-item[data-tab="${tab}"]`).forEach(b => b.classList.add('active'));
    
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');

    // Toggle header visibility without shifting layout
    const header = document.querySelector('header');
    if (header) {
        header.style.display = (tab === 'dashboard') ? 'flex' : 'none';
    }
    if (tab === 'history') renderHistory();
    if (tab === 'activity') renderActivity();
    
    // Scroll to top on mobile when tab changes
    if (window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
});

// ─── TIMER LOGIC ─────────────────────────────
const CIRCUMFERENCE = 2 * Math.PI * 88;

function setRingProgress(fraction) {
  const ring = document.getElementById('ring-progress');
  if (!ring) return;
  const offset = CIRCUMFERENCE * (1 - fraction);
  ring.style.strokeDashoffset = offset;
}

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map(v => String(v).padStart(2,'0')).join(':');
}

function updateCountdownUI() {
  document.getElementById('countdown-display').textContent = formatTime(state.timerRemaining);
  const nextEl = document.getElementById('stat-next');
  if (state.timerRunning) {
    const now = new Date();
    now.setSeconds(now.getSeconds() + state.timerRemaining);
    nextEl.textContent = now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    document.getElementById('countdown-sublabel').textContent = state.timerPaused ? 'Paused' : 'Running…';
  } else {
    nextEl.textContent = '--:--';
    document.getElementById('countdown-sublabel').textContent = 'Timer not running';
  }
}

function animateRing() {
  if (!state.timerRunning) return; // Completely stop loop if timer is not running
  
  if (state.timerPaused) {
    state.animId = requestAnimationFrame(animateRing);
    return;
  }

  const now = Date.now();
  const remainingMs = state.endTime - now;
  const fraction = Math.max(0, remainingMs / (state.timerTotal * 1000));
  
  setRingProgress(fraction);

  state.animId = requestAnimationFrame(animateRing);
}

function startTimer(seconds) {
  if (seconds <= 0) { return; }
  clearInterval(state.intervalId);
  cancelAnimationFrame(state.animId);

  state.timerTotal = seconds;
  state.timerRemaining = seconds;
  state.startTime = Date.now();
  state.endTime = state.startTime + (seconds * 1000);
  state.timerRunning = true;
  state.timerPaused = false;
  
  document.getElementById('pause-timer-btn').disabled = false;
  document.getElementById('start-timer-btn').textContent = '▶ Restart';

  const sidebarDot = document.getElementById('sidebar-status-dot');
  if (sidebarDot) sidebarDot.classList.add('active');
  document.getElementById('sidebar-status-text').textContent = 'Monitoring Active';

  state.intervalId = setInterval(() => {
    if (state.timerPaused) {
      // Shift endTime forward to account for pause
      state.endTime += 1000;
      return;
    }
    state.timerRemaining--;

    if (state.settings.warning && state.timerRemaining === state.settings.warnSecs) {
      if (state.settings.notif && Notification.permission === 'granted') {
        new Notification('Auto-Logout Warning', {
          body: `All accounts will be signed out in ${state.settings.warnSecs} seconds.`,
          icon: '🔒'
        });
      }
    }

    if (state.timerRemaining <= 0) {
      clearInterval(state.intervalId);
      cancelAnimationFrame(state.animId);
      state.timerRemaining = 0;
      state.timerRunning = false;
      setRingProgress(0);
      updateCountdownUI();
      performLogout('auto');
      document.getElementById('pause-timer-btn').disabled = true;
      document.getElementById('start-timer-btn').textContent = '▶ Start Timer';
      const sidebarDot = document.getElementById('sidebar-status-dot');
      if (sidebarDot) sidebarDot.classList.remove('active');
      document.getElementById('sidebar-status-text').textContent = 'Not Running';
    }
    updateCountdownUI();
    save();
  }, 1000);

  state.animId = requestAnimationFrame(animateRing);
  updateCountdownUI();
}

function setTimerDuration(totalSeconds) {
  if (totalSeconds > 359999) totalSeconds = 359999; // Cap at 99:59:59

  if (state.timerRunning) {
    clearInterval(state.intervalId);
    cancelAnimationFrame(state.animId);
    state.timerRunning = false;
    state.timerPaused = false;
  }
  
  state.timerTotal = totalSeconds;
  state.timerRemaining = totalSeconds;
  
  // Update inputs
  document.getElementById('custom-hours').value = Math.floor(totalSeconds / 3600);
  document.getElementById('custom-mins').value = Math.floor((totalSeconds % 3600) / 60);
  document.getElementById('custom-secs').value = totalSeconds % 60;
  
  // Update UI
  setRingProgress(1);
  updateCountdownUI();
  
  // Reset buttons
  document.getElementById('pause-timer-btn').disabled = true;
  document.getElementById('start-timer-btn').textContent = '▶ Start Timer';
  const sidebarDot = document.getElementById('sidebar-status-dot');
  if (sidebarDot) sidebarDot.classList.remove('active');
  document.getElementById('sidebar-status-text').textContent = 'Not Running';
  if (document.getElementById('countdown-sublabel')) {
    document.getElementById('countdown-sublabel').textContent = 'Ready to Start';
  }
}

document.getElementById('start-timer-btn').addEventListener('click', () => {
  const h = parseInt(document.getElementById('custom-hours').value) || 0;
  const m = parseInt(document.getElementById('custom-mins').value) || 0;
  const s = parseInt(document.getElementById('custom-secs').value) || 0;
  startTimer(h * 3600 + m * 60 + s);
});

// Update display when inputs change
['custom-hours', 'custom-mins', 'custom-secs'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (state.timerRunning) return;
    
    let h = parseInt(document.getElementById('custom-hours').value) || 0;
    let m = parseInt(document.getElementById('custom-mins').value) || 0;
    let s = parseInt(document.getElementById('custom-secs').value) || 0;
    
    // Enforce 2-digit limits
    if (h > 99) { h = 99; document.getElementById('custom-hours').value = 99; }
    if (m > 59) { m = 59; document.getElementById('custom-mins').value = 59; }
    if (s > 59) { s = 59; document.getElementById('custom-secs').value = 59; }

    state.timerTotal = h * 3600 + m * 60 + s;
    state.timerRemaining = state.timerTotal;
    setRingProgress(1);
    updateCountdownUI();
    if (document.getElementById('countdown-sublabel')) {
      document.getElementById('countdown-sublabel').textContent = 'Ready to Start';
    }
  });
});

document.getElementById('pause-timer-btn').addEventListener('click', () => {
  state.timerPaused = !state.timerPaused;
  document.getElementById('pause-timer-btn').textContent = state.timerPaused ? '▶ Resume' : '⏸ Pause';
  updateCountdownUI();
});

function stopTimer() {
  console.log('[SessionWarden App] Stopping timer...');
  clearInterval(state.intervalId);
  cancelAnimationFrame(state.animId);
  state.intervalId = null;
  state.animId = null;
  
  state.timerRunning = false;
  state.timerPaused = false;
  state.timerRemaining = 0;
  state.timerTotal = 0;
  setRingProgress(0);
  
  const pauseBtn = document.getElementById('pause-timer-btn');
  const startBtn = document.getElementById('start-timer-btn');
  const sidebarDot = document.getElementById('sidebar-status-dot');
  
  if (pauseBtn) {
    pauseBtn.disabled = true;
    pauseBtn.textContent = '⏸ Pause';
  }
  if (startBtn) startBtn.textContent = '▶ Start Timer';
  if (sidebarDot) sidebarDot.classList.remove('active');
  
  const statusText = document.getElementById('sidebar-status-text');
  if (statusText) statusText.textContent = 'Not Running';
  
  const sublabel = document.getElementById('countdown-sublabel');
  if (sublabel) sublabel.textContent = 'Timer Stopped';
  
  updateCountdownUI();
  save(); 
}

document.getElementById('reset-timer-btn').addEventListener('click', () => {
  stopTimer();
});

// Quick buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const mins = parseInt(btn.dataset.mins);
    setTimerDuration(mins * 60);
  });
});

// ─── LOGOUT PROCESS ──────────────────────────

// Silently logout Google in hidden iframes
function triggerIframeLogouts() {
  console.log('[SessionWarden App] Triggering silent iframe logouts...');

  const logoutUrls = [
    'https://accounts.google.com/Logout',
    'https://www.youtube.com/logout',
    'https://mail.google.com/mail/logout',
    'https://accounts.google.com/Logout?continue=https://accounts.google.com/ServiceLogin',
  ];

  logoutUrls.forEach((url, index) => {
    setTimeout(() => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'display:none;width:0;height:0;border:none;position:absolute;left:-9999px;';
      iframe.src = url;
      document.body.appendChild(iframe);

      // Remove iframe after it loads to clean up
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch(e) {}
      }, 5000);

      console.log(`[SessionWarden App] iframe ${index + 1}: ${url}`);
    }, index * 500); // Stagger by 500ms each
  });

  // Also use the existing logout-frame in HTML
  const mainFrame = document.getElementById('logout-frame');
  if (mainFrame) {
    mainFrame.src = 'https://accounts.google.com/Logout';
  }
}

function performLogout(type = 'manual') {
  console.log('[SessionWarden App] ── LOGOUT TRIGGERED ── type:', type);

  // Stop any running timer
  stopTimer();

  const accountsLoggedOut = 1;
  state.stats.sessions += accountsLoggedOut;
  state.stats.logouts += 1;
  updateStats();

  if (state.settings.log) {
    state.history.unshift({
      time: new Date().toLocaleString(),
      type,
      accounts: accountsLoggedOut,
      status: 'success',
    });
    if (state.history.length > 100) state.history.pop();
  }

  // Show cleanup overlay
  showCleanupOverlay();
  
  const cookiesEl = document.getElementById('report-cookies');
  const tabsEl = document.getElementById('report-tabs');
  if (cookiesEl) cookiesEl.textContent = 'Clearing cookies...';
  if (tabsEl) tabsEl.textContent = 'Closing other tabs...';

  // Step 1: Trigger silent iframe logouts (runs in background)
  triggerIframeLogouts();

  // Step 2: Signal the extension to clear cookies + close ALL tabs
  // Using all 3 methods to ensure the content script catches it

  // Method 1: Attribute on <html>
  document.documentElement.setAttribute('data-sw-logout', Date.now().toString());

  // Method 2: Custom event
  window.dispatchEvent(new CustomEvent('sessionwarden_trigger_logout'));

  // Method 3: postMessage
  window.postMessage({ source: 'sessionwarden_page', action: 'perform_logout' }, '*');

  console.log('[SessionWarden App] All logout signals sent');

  save();
}

// Listen for extension response
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source === 'sessionwarden_extension') {
    if (event.data.action === 'logout_complete') {
      console.log('[SessionWarden App] Extension result:', event.data.result);
      if (event.data.result?.status === 'ok') {
        const r = event.data.result;
        
        if (r.details) {
          state.lastActivity = r.details;
          state.refreshCount = 0; // Reset counter for new activity
          save();
          renderActivity(); 
        }

        const cookiesEl = document.getElementById('report-cookies');
        const tabsEl = document.getElementById('report-tabs');
        if (cookiesEl) cookiesEl.textContent = `${r.cookiesCleared} Cookies cleared`;
        if (tabsEl) tabsEl.textContent = `${r.tabsClosed} Tabs closed`;
      } else {
        // toast('Logout completed with warnings', 'warning');
      }
    }
    if (event.data.action === 'extension_ready') {
      state.extensionConnected = true;
      console.log('[SessionWarden App] Extension connected!');
      
      const dot = document.getElementById('ext-status-dot');
      const dotMobile = document.getElementById('ext-status-dot-mobile');
      const text = document.getElementById('ext-status-text');
      const downloadBtn = document.getElementById('header-download-btn');
      
      if (dot) dot.classList.add('active');
      if (dotMobile) dotMobile.classList.add('active');
      if (text) text.textContent = 'Extension Connected';
      if (downloadBtn) {
        downloadBtn.classList.add('hidden');
        downloadBtn.classList.remove('flex');
      }
    }
  }
});

// Manual logout button
document.getElementById('logout-now-btn').addEventListener('click', () => {
  if (state.settings.confirm) {
    showModal(
      'This will silently log out ALL accounts, clear ALL cookies, and close ALL other tabs. Only this dashboard will remain. Continue?',
      () => performLogout('manual')
    );
  } else {
    performLogout('manual');
  }
});

// ─── STATS ───────────────────────────────────
function updateStats() {
  document.getElementById('stat-sessions').textContent = state.stats.sessions;
  document.getElementById('stat-logouts').textContent = state.stats.logouts;
}

// ─── HISTORY ─────────────────────────────────
function renderHistory() {
  const tbody = document.getElementById('history-tbody');
  const empty = document.getElementById('history-empty');
  tbody.innerHTML = '';
  if (state.history.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  state.history.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="pl-12 pr-4 py-4 opacity-70 truncate">${h.time}</td>
      <td class="px-6 py-4"><span class="badge badge-mini badge-${h.type}">${h.type}</span></td>
      <td class="px-6 py-4 font-black">${h.accounts}</td>
      <td class="pl-6 pr-12 py-4 text-right"><span class="badge badge-mini badge-${h.status}">${h.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('clear-history-btn').addEventListener('click', () => {
  showModal('Clear all logout history? This cannot be undone.', () => {
    state.history = [];
    renderHistory();
    save();
    // toast('History cleared', 'success');
  });
});

// ─── ACTIVITY ────────────────────────────────
function renderActivity() {
  const tabsList = document.getElementById('activity-tabs-list');
  const cookiesList = document.getElementById('activity-cookies-list');
  
  if (!tabsList || !cookiesList) return;

  // Render Tabs
  if (!state.lastActivity.tabs || state.lastActivity.tabs.length === 0) {
    tabsList.innerHTML = '<p class="hint-text">No recent tab activity recorded</p>';
  } else {
    tabsList.innerHTML = state.lastActivity.tabs.map(tab => `
      <div class="activity-item">
        <span class="activity-icon">🌐</span>
        <div class="activity-info">
          <div class="activity-name">${tab.title}</div>
          <div class="activity-sub">${tab.url.substring(0, 50)}${tab.url.length > 50 ? '...' : ''}</div>
        </div>
      </div>
    `).join('');
  }

  // Render Cookies
  if (!state.lastActivity.cookies || state.lastActivity.cookies.length === 0) {
    cookiesList.innerHTML = '<p class="hint-text">No recent cookie activity recorded</p>';
  } else {
    // Group cookies by CATEGORY first
    const categories = {};
    state.lastActivity.cookies.forEach(c => {
      const cat = c.category || 'Functional';
      if (!categories[cat]) {
        categories[cat] = { domains: {} };
      }
      if (!categories[cat].domains[c.domain]) {
        categories[cat].domains[c.domain] = { count: 0, types: new Set() };
      }
      categories[cat].domains[c.domain].count++;
      (c.types || []).forEach(t => categories[cat].domains[c.domain].types.add(t));
    });

    // Sort categories (Authentication first)
    const sortedCats = Object.keys(categories).sort((a, b) => {
      if (a === 'Authentication') return -1;
      if (b === 'Authentication') return 1;
      return a.localeCompare(b);
    });

    cookiesList.innerHTML = sortedCats.map(cat => {
      const data = categories[cat];
      return `
        <div class="activity-group">
          <div class="activity-group-header" onclick="this.parentElement.classList.toggle('open')">
            <div class="group-info">
              <span class="group-title">${cat}</span>
              <span class="group-count">${Object.keys(data.domains).length} Sites</span>
            </div>
            <span class="group-arrow">▼</span>
          </div>
          <div class="activity-group-content">
            ${Object.entries(data.domains).map(([domain, d]) => `
              <div class="activity-sub-item">
                <div class="activity-name">${domain}</div>
                <div class="activity-sub">
                  ${d.count} cookie${d.count > 1 ? 's' : ''} cleared
                  <div class="activity-badges">
                    ${Array.from(d.types).map(t => `<span class="badge badge-mini">${t}</span>`).join('')}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }
}

document.getElementById('refresh-activity-btn')?.addEventListener('click', () => {
  renderActivity();
  // toast('Activity refreshed', 'success');
});

// ─── TIMER SETTINGS TAB ──────────────────────
const intervalSlider = document.getElementById('interval-slider');
const idleSlider = document.getElementById('idle-slider');
const warnSlider = document.getElementById('warn-slider');

intervalSlider.addEventListener('input', () => {
  const v = parseInt(intervalSlider.value);
  document.getElementById('interval-label').textContent = v < 60 ? `${v} minutes` : `${(v/60).toFixed(1)} hours`;
});
idleSlider.addEventListener('input', () => {
  document.getElementById('idle-label').textContent = `${idleSlider.value} minutes`;
});
warnSlider.addEventListener('input', () => {
  document.getElementById('warn-label').textContent = `${warnSlider.value} seconds`;
  state.settings.warnSecs = parseInt(warnSlider.value);
});

document.querySelectorAll('input[name="schedule-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.mode-config').forEach(el => el.classList.add('hidden'));
    const cfg = document.getElementById(`config-${radio.value}`);
    if (cfg) cfg.classList.remove('hidden');
    state.settings.scheduleMode = radio.value;
  });
});

document.querySelectorAll('.day-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    const day = btn.dataset.day;
    if (btn.classList.contains('active')) {
      if (!state.settings.days.includes(day)) state.settings.days.push(day);
    } else {
      state.settings.days = state.settings.days.filter(d => d !== day);
    }
  });
});

document.getElementById('save-config-btn').addEventListener('click', () => {
  state.settings.intervalMins = parseInt(intervalSlider.value);
  state.settings.specificTime = document.getElementById('specific-time').value;
  state.settings.idleMins = parseInt(idleSlider.value);
  state.settings.warning = document.getElementById('toggle-warning').checked;
  state.settings.notif = document.getElementById('toggle-notif').checked;
  state.settings.sound = document.getElementById('toggle-sound').checked;
  save();
  // toast('Timer settings saved!', 'success');
});

// ─── APP SETTINGS TAB ────────────────────────
const BROWSERS = [
  { name: 'Chrome', icon: '🌐' },
  { name: 'Firefox', icon: '🦊' },
  { name: 'Edge', icon: '🔵' },
  { name: 'Brave', icon: '🦁' },
  { name: 'Opera', icon: '🔴' },
  { name: 'Safari', icon: '🧭' },
];

function renderBrowserList() {
  const list = document.getElementById('browser-list');
  list.innerHTML = '';
  BROWSERS.forEach(b => {
    const div = document.createElement('div');
    div.className = 'browser-item';
    const active = state.settings.browsers.includes(b.name);
    div.innerHTML = `
      <span class="browser-name"><span class="browser-icon">${b.icon}</span>${b.name}</span>
      <label class="toggle">
        <input type="checkbox" ${active ? 'checked' : ''} data-browser="${b.name}"/>
        <span class="toggle-thumb"></span>
      </label>
    `;
    list.appendChild(div);
  });
  list.querySelectorAll('input[data-browser]').forEach(cb => {
    cb.addEventListener('change', () => {
      const name = cb.dataset.browser;
      if (cb.checked) { if (!state.settings.browsers.includes(name)) state.settings.browsers.push(name); }
      else state.settings.browsers = state.settings.browsers.filter(b => b !== name);
      save();
    });
  });
}

const toggleMap = {
  'toggle-confirm': 'confirm', 'toggle-cache': 'cache',
  'toggle-passwords': 'passwords', 'toggle-log': 'log',
  'toggle-sound': 'sound', 'toggle-warning': 'warning',
  'toggle-notif': 'notif',
};
Object.entries(toggleMap).forEach(([id, key]) => {
  const el = document.getElementById(id);
  if (el) {
    el.checked = !!state.settings[key];
    el.addEventListener('change', () => { state.settings[key] = el.checked; save(); });
  }
});

document.getElementById('toggle-dark').addEventListener('change', e => {
  document.body.style.filter = e.target.checked ? '' : 'invert(0.88) hue-rotate(180deg)';
});
document.getElementById('toggle-anim').addEventListener('change', e => {
  const bg = document.querySelector('.color-bends-container');
  if (bg) bg.style.display = e.target.checked ? '' : 'none';
});

document.querySelectorAll('.swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    const grad = sw.dataset.gradient;
    document.documentElement.style.setProperty('--accent-gradient', grad);
    state.settings.accentGradient = grad;
    save();
  });
});

document.getElementById('export-data-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ stats: state.stats, history: state.history }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `sessionwarden-history-${Date.now()}.json`; a.click();
  // toast('History exported!', 'success');
});

document.getElementById('reset-app-btn').addEventListener('click', () => {
  showModal('Reset all app data? Stats, history and settings will be cleared.', () => {
    localStorage.removeItem('galt_state');
    location.reload();
  });
});

// ─── NOTIFICATIONS ────────────────────────────
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ─── SVG GRADIENT ─────────────────────────────
function injectSVGDefs() {
  const svg = document.getElementById('countdown-svg');
  if (!svg) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>`;
  svg.prepend(defs);
}

// ─── INIT ────────────────────────────────────
function init() {
  load();
  injectSVGDefs();
  updateStats();
  updateCountdownUI();
  renderBrowserList();
  renderHistory();
  renderActivity();

  if (state.settings.accentGradient) {
    document.documentElement.style.setProperty('--accent-gradient', state.settings.accentGradient);
    document.querySelectorAll('.swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.gradient === state.settings.accentGradient);
    });
  }

  Object.entries(toggleMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!state.settings[key];
  });

  document.getElementById('interval-label').textContent = state.settings.intervalMins < 60
    ? `${state.settings.intervalMins} minutes`
    : `${(state.settings.intervalMins/60).toFixed(1)} hours`;
  intervalSlider.value = state.settings.intervalMins;
  idleSlider.value = state.settings.idleMins;
  warnSlider.value = state.settings.warnSecs || 10;
  document.getElementById('idle-label').textContent = `${state.settings.idleMins} minutes`;
  document.getElementById('warn-label').textContent = `${state.settings.warnSecs || 10} seconds`;

  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.classList.toggle('active', state.settings.days.includes(btn.dataset.day));
  });

  console.log('[SessionWarden App] Initialized — waiting for extension...');
  
  // Ping extension
  setTimeout(() => {
    window.postMessage({ source: 'sessionwarden_page', action: 'ping_extension' }, '*');
  }, 500);
}

init();