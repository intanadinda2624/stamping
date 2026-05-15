// ========================================
// HISTORY PAGE - Firebase Data
// ========================================

let historySpeedChart = null;
let historySpeedData = [];
let historySpeedLabels = [];
let historyLastTotal = null;
let historyOriginalData = [];
let historyPollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  updateNavUser();
  setupHistoryRole();
  initHistorySpeedChart();
  startHistoryListener();
});

function setupHistoryRole() {
  const reportSection = document.getElementById('reportSection');
  const operatorReport = document.getElementById('operatorReport');

  if (canViewReportFull()) {
    if (reportSection) reportSection.style.display = 'block';
    if (operatorReport) operatorReport.style.display = 'none';
  } else {
    if (reportSection) reportSection.style.display = 'none';
    if (operatorReport) operatorReport.style.display = 'block';
  }
}

function initHistorySpeedChart() {
  const canvas = document.getElementById('speedChartHistory');
  if (!canvas) return;

  historySpeedChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: historySpeedLabels,
      datasets: [{
        label: 'Speed (unit/sec)',
        data: historySpeedData,
        borderColor: '#11d9e7',
        backgroundColor: 'rgba(17, 217, 231, 0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#11d9e7',
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8899aa', font: { family: 'Inter', size: 12 } } }
      },
      scales: {
        x: {
          ticks: { color: '#5a6f82', maxTicksLimit: 12, font: { size: 10 } },
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

function startHistoryListener() {
  const connBar = document.getElementById('connectionBar');
  const connText = document.getElementById('connectionText');

  fetchHistoryData().then(() => {
    if (connBar) connBar.classList.add('connected');
    if (connText) connText.textContent = 'Terhubung ke Firebase — Data real-time aktif';
  }).catch(() => {
    if (connBar) connBar.classList.add('error');
    if (connText) connText.textContent = 'Gagal menghubungkan ke Firebase';
  });

  historyPollInterval = setInterval(fetchHistoryData, 3000);
}

async function fetchHistoryData() {
  try {
    // Fetch latest data for summary
    const latest = await FirebaseDB.get('stamping_box/latest');
    if (latest) updateHistorySummary(latest);

    // Fetch history for table
    const historyData = await FirebaseDB.get('stamping_box/history');
    if (historyData) {
      const entries = Object.values(historyData);
      entries.sort((a, b) => {
        const ta = a.timestamp || '';
        const tb = b.timestamp || '';
        return tb.localeCompare(ta);
      });
      historyOriginalData = entries;
      renderHistoryTable(entries);
      generateSmartReport(entries);
      updateHistorySpeedChart(latest);
    }
  } catch (error) {
    const connBar = document.getElementById('connectionBar');
    const connText = document.getElementById('connectionText');
    if (connBar) { connBar.classList.remove('connected'); connBar.classList.add('error'); }
    if (connText) connText.textContent = 'Koneksi terputus...';
  }
}

function updateHistorySummary(data) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val !== undefined && val !== null ? val : '-';
  };

  setText('dateVal', data.tanggal_produksi || '-');
  setText('machineOpVal', data.jumlah_mesin_beroperasi ?? 0);
  setText('totalGoodVal', data.good_count ?? data.jumlah_good ?? 0);
  setText('totalNGVal', data.ng_count ?? data.jumlah_not_good ?? 0);
  setText('totalProdVal', data.total_count ?? data.total_produksi ?? 0);
  setText('pctGoodVal', data.percent_good ?? data.persentase_good ?? '0.0');
  setText('pctNGVal', data.percent_ng ?? data.persentase_ng ?? '0.0');
  setText('runtimeHVal', data.runtime ?? '00:00:00');
  setText('downtimeHVal', data.downtime ?? '00:00:00');

  const w = data.warning_threshold ?? data.threshold_warning ?? 10;
  const c = data.critical_threshold ?? data.threshold_critical ?? 20;
  const m = data.minimum_sample ?? 20;
  setText('thresholdInfoVal', `W:${w}% C:${c}%\nMin:${m}`);

  // Count warnings/criticals from history
  // We'll update these from the history data in generateSmartReport
}

function renderHistoryTable(data) {
  const table = document.getElementById('historyTableBody');
  if (!table) return;

  table.innerHTML = '';

  if (!data || data.length === 0) {
    table.innerHTML = "<tr><td colspan='8'>Belum ada data histori harian.</td></tr>";
    return;
  }

  data.forEach((row, i) => {
    const status = row.status_system || 'NORMAL';
    let rowClass = '';
    if (status === 'WARNING') rowClass = 'warning-row';
    if (status === 'CRITICAL') rowClass = 'critical-row';

    const tr = document.createElement('tr');
    tr.className = rowClass;
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${row.timestamp || row.jam_produksi || '-'}</td>
      <td>${row.result || '-'}</td>
      <td>${status}</td>
      <td>${row.good_count ?? row.jumlah_good ?? '-'}</td>
      <td>${row.ng_count ?? row.jumlah_not_good ?? '-'}</td>
      <td>${row.total_count ?? row.total_produksi ?? '-'}</td>
      <td>${row.percent_ng ?? row.persentase_ng ?? '-'}</td>
    `;
    table.appendChild(tr);
  });
}

function generateSmartReport(data) {
  const el = document.getElementById('autoReport');
  if (!el) return;

  if (!data || data.length === 0) {
    el.innerText = 'Belum ada data histori untuk dianalisis.';
    return;
  }

  const latest = data[0];
  const total = latest.total_count ?? latest.total_produksi ?? 0;
  const good = latest.good_count ?? latest.jumlah_good ?? 0;
  const ng = latest.ng_count ?? latest.jumlah_not_good ?? 0;

  const warningCount = data.filter(d => (d.status_system || '') === 'WARNING').length;
  const criticalCount = data.filter(d => (d.status_system || '') === 'CRITICAL').length;
  const normalCount = data.filter(d => (d.status_system || '') === 'NORMAL').length;

  // Update counters
  const wEl = document.getElementById('warningCountVal');
  const cEl = document.getElementById('criticalCountVal');
  if (wEl) wEl.innerText = warningCount;
  if (cEl) cEl.innerText = criticalCount;

  let dominant = 'NORMAL';
  if (criticalCount >= warningCount && criticalCount > 0) dominant = 'CRITICAL';
  else if (warningCount > 0) dominant = 'WARNING';

  // Detect critical period
  const criticals = data.filter(d => (d.status_system || '') === 'CRITICAL');
  let period = '-';
  if (criticals.length > 0) {
    period = (criticals[criticals.length - 1].timestamp || '') + ' - ' + (criticals[0].timestamp || '');
  }

  let report = `Produksi hari ini sebanyak ${total} unit, terdiri dari ${good} GOOD dan ${ng} NG. `;
  report += `Sistem didominasi kondisi ${dominant}. `;

  if (warningCount > 0) {
    report += `Kondisi WARNING terjadi sebanyak ${warningCount} kali. `;
  }

  if (criticalCount > 0) {
    report += `Kondisi CRITICAL terjadi sebanyak ${criticalCount} kali`;
    if (period !== '-') report += ` pada periode ${period}. `;
    else report += '. ';
    report += 'Hal ini mengindikasikan adanya potensi ketidakstabilan proses produksi.';
  } else {
    report += 'Tidak ditemukan periode kritis selama pengamatan.';
  }

  el.innerText = report;
}

function updateHistorySpeedChart(latest) {
  if (!latest) return;
  const total = latest.total_count ?? latest.total_produksi ?? 0;

  if (historyLastTotal === null) historyLastTotal = total;
  const speed = Math.max(0, total - historyLastTotal);
  historyLastTotal = total;

  historySpeedData.push(speed);
  historySpeedLabels.push(new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }));

  if (historySpeedData.length > 30) {
    historySpeedData.shift();
    historySpeedLabels.shift();
  }

  if (historySpeedChart) {
    historySpeedChart.data.labels = historySpeedLabels;
    historySpeedChart.data.datasets[0].data = historySpeedData;
    historySpeedChart.update('none');
  }
}

// Filter functions
function applyFilter() {
  const start = document.getElementById('startTime').value;
  const end = document.getElementById('endTime').value;
  if (!start || !end) return;

  const filtered = historyOriginalData.filter(row => {
    const ts = row.timestamp || row.jam_produksi || '';
    const parts = ts.split(' ');
    if (parts.length < 2) return false;
    const t = parts[1].slice(0, 5);
    return t >= start && t <= end;
  });

  renderHistoryTable(filtered);
  generateSmartReport(filtered);
}

function resetFilter() {
  renderHistoryTable(historyOriginalData);
  generateSmartReport(historyOriginalData);
}

window.addEventListener('beforeunload', () => {
  if (historyPollInterval) clearInterval(historyPollInterval);
});
