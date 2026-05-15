// ========================================
// DASHBOARD - Real-time Firebase Data
// ========================================

let speedChart = null;
let speedData = [];
let speedLabels = [];
let lastTotalChart = null;
let pollInterval = null;

// Local runtime/downtime tracker (website hitung sendiri)
let localRuntimeSec = 0;
let localDowntimeSec = 0;
let localMachineStatus = 'STOP';
let localTimerInterval = null;
let runtimeInitialized = false;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  updateNavUser();
  setupRolePermissions();
  initSpeedChart();
  startRealtimeListener();
  startLocalTimer();
});

// Start local timer for runtime/downtime counting
function startLocalTimer() {
  localTimerInterval = setInterval(() => {
    if (localMachineStatus === 'RUN') {
      localRuntimeSec++;
    } else {
      localDowntimeSec++;
    }
    // Update display
    document.getElementById('runtimeVal').innerText = formatSeconds(localRuntimeSec);
    document.getElementById('downtimeVal').innerText = formatSeconds(localDowntimeSec);
  }, 1000);
}

function formatSeconds(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr || timeStr === '-' || timeStr === '00:00:00') return 0;
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

// Setup role-based UI
function setupRolePermissions() {
  const user = getCurrentUser();

  if (!canChangeThreshold()) {
    const form = document.getElementById('thresholdForm');
    const readonly = document.getElementById('thresholdReadonly');
    if (form) form.style.display = 'none';
    if (readonly) {
      readonly.style.display = 'block';
      const roleText = document.getElementById('thresholdRoleText');
      if (roleText) roleText.textContent = user.role;
    }
  }

  if (!canControlMachine()) {
    const buttons = document.getElementById('controlButtons');
    const readonly = document.getElementById('controlReadonly');
    if (buttons) buttons.style.display = 'none';
    if (readonly) readonly.style.display = 'block';
  }
}

// Initialize speed chart
function initSpeedChart() {
  const canvas = document.getElementById('speedChartDashboard');
  if (!canvas) return;

  speedChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: speedLabels,
      datasets: [{
        label: 'Speed (unit/sec)',
        data: speedData,
        borderColor: '#11d9e7',
        backgroundColor: 'rgba(17, 217, 231, 0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 2,
        pointBackgroundColor: '#11d9e7',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8899aa', font: { family: 'Inter', size: 11 } } }
      },
      scales: {
        x: {
          ticks: { color: '#5a6f82', maxTicksLimit: 8, font: { size: 10 } },
          grid: { color: 'rgba(47,65,87,0.3)' }
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#5a6f82', font: { size: 10 } },
          grid: { color: 'rgba(47,65,87,0.3)' }
        }
      }
    }
  });
}

// Start real-time listener
function startRealtimeListener() {
  fetchLatestData().then(() => {
    updateConnectionStatus(true);
  }).catch(() => {
    updateConnectionStatus(false);
  });

  pollInterval = setInterval(() => {
    fetchLatestData().catch(() => {});
  }, 2000);
}

// Fetch latest data
async function fetchLatestData() {
  const response = await fetch(FirebaseDB.baseURL + '/stamping_box/latest.json');
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  if (data) {
    updateDashboardUI(data);
    updateConnectionStatus(true);
  }
}

function updateConnectionStatus(connected) {
  const connBar = document.getElementById('connectionBar');
  const connText = document.getElementById('connectionText');
  if (connected) {
    if (connBar) { connBar.classList.remove('error'); connBar.classList.add('connected'); }
    if (connText) connText.textContent = 'Terhubung ke Firebase — Data real-time aktif';
  } else {
    if (connBar) { connBar.classList.remove('connected'); connBar.classList.add('error'); }
    if (connText) connText.textContent = 'Koneksi terputus — Mencoba menghubungkan kembali...';
  }
}

// Update dashboard UI
function updateDashboardUI(data) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val !== undefined && val !== null ? val : '-';
  };

  setText('goodVal', data.good_count ?? data.jumlah_good ?? 0);
  setText('ngVal', data.ng_count ?? data.jumlah_not_good ?? 0);
  setText('totalVal', data.total_count ?? data.total_produksi ?? 0);
  setText('percentGoodVal', data.percent_good ?? data.persentase_good ?? '0.0');
  setText('percentNGVal', data.percent_ng ?? data.persentase_ng ?? '0.0');
  setText('lastUpdateVal', data.last_update ?? '-');
  setText('warningThresholdVal', data.warning_threshold ?? data.threshold_warning ?? '10.0');
  setText('criticalThresholdVal', data.critical_threshold ?? data.threshold_critical ?? '20.0');
  setText('minimumSampleVal', data.minimum_sample ?? '20');

  // Sync runtime/downtime from Firebase (if ESP32 is pushing updates)
  const fbRuntime = parseTimeToSeconds(data.runtime);
  const fbDowntime = parseTimeToSeconds(data.downtime);
  if (!runtimeInitialized || fbRuntime > localRuntimeSec || fbDowntime > localDowntimeSec) {
    if (fbRuntime > 0 || fbDowntime > 0) {
      localRuntimeSec = fbRuntime;
      localDowntimeSec = fbDowntime;
      runtimeInitialized = true;
    }
  }

  // Track machine status for local timer
  localMachineStatus = data.status_machine ?? 'STOP';

  // Machine status
  const machineEl = document.getElementById('machineVal');
  if (machineEl) {
    const status = data.status_machine ?? 'STOP';
    machineEl.innerText = status;
    machineEl.style.color = status === 'RUN' ? '#34d399' : '#ff5d5d';
  }

  // System status
  const sysEl = document.getElementById('systemVal');
  if (sysEl) {
    const status = data.status_system ?? 'NORMAL';
    sysEl.innerText = status;
    sysEl.classList.remove('normal', 'warning', 'critical');
    if (status === 'WARNING') sysEl.classList.add('warning');
    else if (status === 'CRITICAL') sysEl.classList.add('critical');
    else sysEl.classList.add('normal');
  }

  // Card glow
  const cardSystem = document.getElementById('cardSystem');
  if (cardSystem) {
    const status = data.status_system ?? 'NORMAL';
    if (status === 'WARNING') {
      cardSystem.style.boxShadow = '0 4px 24px rgba(0,0,0,0.25), 0 0 30px rgba(247,183,51,0.25)';
      cardSystem.style.borderColor = 'rgba(247,183,51,0.3)';
    } else if (status === 'CRITICAL') {
      cardSystem.style.boxShadow = '0 4px 24px rgba(0,0,0,0.25), 0 0 30px rgba(255,93,93,0.3)';
      cardSystem.style.borderColor = 'rgba(255,93,93,0.3)';
    } else {
      cardSystem.style.boxShadow = '';
      cardSystem.style.borderColor = '';
    }
  }

  // Warning banner
  const banner = document.getElementById('warningBanner');
  if (banner) {
    const status = data.status_system ?? 'NORMAL';
    banner.style.display = 'none';
    banner.className = 'banner';
    if (status === 'WARNING') {
      banner.classList.add('banner-warning');
      banner.style.display = 'block';
      banner.innerText = '⚠ WARNING: JUMLAH NOT GOOD MELEBIHI AMBANG BATAS.';
    } else if (status === 'CRITICAL') {
      banner.classList.add('banner-critical');
      banner.style.display = 'block';
      banner.innerText = '🚨 CRITICAL: PERSENTASE NOT GOOD SANGAT TINGGI. SEGERA CEK SISTEM.';
    }
  }

  // Start button disable on CRITICAL
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    if ((data.status_system ?? 'NORMAL') === 'CRITICAL') {
      startBtn.classList.add('disabled');
      startBtn.disabled = true;
    } else {
      startBtn.classList.remove('disabled');
      startBtn.disabled = false;
    }
  }

  // Threshold inputs
  const wInput = document.getElementById('thresholdWarning');
  const cInput = document.getElementById('thresholdCritical');
  const mInput = document.getElementById('thresholdMinSample');
  if (wInput && !wInput.matches(':focus')) wInput.value = data.warning_threshold ?? data.threshold_warning ?? 10;
  if (cInput && !cInput.matches(':focus')) cInput.value = data.critical_threshold ?? data.threshold_critical ?? 20;
  if (mInput && !mInput.matches(':focus')) mInput.value = data.minimum_sample ?? 20;

  // Speed chart
  const total = data.total_count ?? data.total_produksi ?? 0;
  updateSpeedChart(total);
}

// Speed chart update
function updateSpeedChart(total) {
  if (lastTotalChart === null) lastTotalChart = total;
  const speed = Math.max(0, total - lastTotalChart);
  lastTotalChart = total;

  speedData.push(speed);
  speedLabels.push(new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }));

  if (speedData.length > 20) {
    speedData.shift();
    speedLabels.shift();
  }

  if (speedChart) {
    speedChart.data.labels = speedLabels;
    speedChart.data.datasets[0].data = speedData;
    speedChart.update('none');
  }
}

// ========================================
// SEND COMMAND
// ========================================
async function sendCommand(cmd) {
  console.log('Sending command:', cmd);

  try {
    const response = await fetch(FirebaseDB.baseURL + '/stamping_box/control.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    });

    if (!response.ok) throw new Error('HTTP ' + response.status);
    console.log('Command sent OK:', cmd);

    // Update local status immediately for responsive UI
    if (cmd === 'START') {
      // Increment jumlah_mesin_beroperasi jika sebelumnya STOP (sama seperti ESP32)
      if (localMachineStatus === 'STOP') {
        incrementLatestField('jumlah_mesin_beroperasi');
      }
      localMachineStatus = 'RUN';
      const machineEl = document.getElementById('machineVal');
      if (machineEl) { machineEl.innerText = 'RUN'; machineEl.style.color = '#34d399'; }
      updateLatestField('status_machine', 'RUN');
    } else if (cmd === 'STOP') {
      localMachineStatus = 'STOP';
      const machineEl = document.getElementById('machineVal');
      if (machineEl) { machineEl.innerText = 'STOP'; machineEl.style.color = '#ff5d5d'; }
      updateLatestField('status_machine', 'STOP');
    } else if (cmd === 'RESET') {
      localRuntimeSec = 0;
      localDowntimeSec = 0;
      resetLatestCounters();
    }

    // Log command (non-blocking)
    const user = getCurrentUser();
    const now = new Date();
    const dateText = now.toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g, '-');
    const timeText = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });

    fetch(FirebaseDB.baseURL + '/stamping_box/logs/command_dashboard.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: dateText + ' ' + timeText,
        tanggal_produksi: dateText,
        jam_produksi: timeText,
        username: user.username,
        role: user.role,
        action: cmd,
        detail: 'Command ' + cmd + ' dari web online',
        nama_mesin: MACHINE_NAME
      })
    }).catch(() => {});

  } catch (error) {
    console.error('Command error:', error);
    alert('Gagal mengirim perintah: ' + error.message);
  }
}

// Update a single field in latest
async function updateLatestField(field, value) {
  try {
    const url = FirebaseDB.baseURL + '/stamping_box/latest/' + field + '.json';
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
  } catch (e) { console.error('Update field error:', e); }
}

// Increment a numeric field in latest by 1
async function incrementLatestField(field) {
  try {
    const url = FirebaseDB.baseURL + '/stamping_box/latest/' + field + '.json';
    const resp = await fetch(url);
    let current = 0;
    if (resp.ok) {
      const val = await resp.json();
      current = parseInt(val) || 0;
    }
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(current + 1)
    });
  } catch (e) { console.error('Increment field error:', e); }
}

// Reset all counters in Firebase latest
async function resetLatestCounters() {
  try {
    const updates = {
      good_count: 0, ng_count: 0, total_count: 0,
      jumlah_good: 0, jumlah_not_good: 0, total_produksi: 0,
      percent_good: 0, percent_ng: 0, persentase_ng: 0,
      runtime: '00:00:00', downtime: '00:00:00',
      status_system: 'NORMAL',
      jumlah_mesin_beroperasi: 0,
      last_update: new Date().toLocaleString('id-ID')
    };
    for (const [key, val] of Object.entries(updates)) {
      await updateLatestField(key, val);
    }
  } catch (e) { console.error('Reset error:', e); }
}

// Periodically sync runtime/downtime to Firebase
setInterval(async () => {
  try {
    await updateLatestField('runtime', formatSeconds(localRuntimeSec));
    await updateLatestField('downtime', formatSeconds(localDowntimeSec));
  } catch (e) {}
}, 5000);

// ========================================
// SET THRESHOLD
// ========================================
async function setThresholdAjax(event) {
  event.preventDefault();

  const warning = parseFloat(document.getElementById('thresholdWarning').value) || 10;
  const critical = parseFloat(document.getElementById('thresholdCritical').value) || 20;
  const minSample = parseInt(document.getElementById('thresholdMinSample').value) || 20;

  if (critical < warning) {
    alert('Threshold Critical harus lebih besar dari Warning!');
    return false;
  }

  try {
    await updateLatestField('warning_threshold', warning);
    await updateLatestField('critical_threshold', critical);
    await updateLatestField('threshold_warning', warning);
    await updateLatestField('threshold_critical', critical);
    await updateLatestField('minimum_sample', minSample);
    console.log('Threshold updated');
    alert('Threshold berhasil diubah!');
  } catch (error) {
    console.error('Threshold error:', error);
    alert('Gagal mengubah threshold: ' + error.message);
  }

  return false;
}

// Cleanup
window.addEventListener('beforeunload', () => {
  if (pollInterval) clearInterval(pollInterval);
  if (localTimerInterval) clearInterval(localTimerInterval);
});
