import { db } from '../core/firebase.js';
import { collection, onSnapshot, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import "https://cdn.jsdelivr.net/npm/chart.js";

// DOM elements
const requestsGrid = document.getElementById('requestsGrid');

// Chart and modal variables
let statusChart, budgetChart, barangayChart, expenseCategoryChart, spendingTimelineChart;
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

const centerTextPlugin = {
  id: 'centerTextPlugin',
  afterDraw(chart) {
    const { ctx, chartArea: { width, height } } = chart;
    if (!chart.config._centerText) return;
    ctx.save();
    ctx.font = '600 16px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(chart.config._centerText, chart.getDatasetMeta(0).data[0]?.x || width / 2, chart.getDatasetMeta(0).data[0]?.y || height / 2);
    ctx.restore();
  }
};

function renderCharts(docs) {
  const statusCounts = { approved: 0, ongoing: 0, pending: 0, rejected: 0 };
  let totalBudget = 0;
  let totalSpent = 0;
  
  // CHANGED: Now tracking budget per project category instead of expense notes
  const projectTypeTotals = new Map(); 
  const monthlyTotals = new Map();

  docs.forEach((d) => {
    const data = d.data();
    
    // Only count approved projects for reports
    if (data.isApproved === true) {
      // Status Counts
      if (data.projectStatus === 'in-progress') {
        statusCounts.ongoing++;
      } else if (data.projectStatus === 'finished') {
        statusCounts.approved++;
      } else {
        statusCounts.approved++;
      }

      // Financial Totals
      const projBudget = Number(data.budget) || 0;
      totalBudget += projBudget;
      totalSpent += Number(data.amountSpent) || 0;

      // NEW LOGIC: Group Budget by Project Category
      const cat = data.category || 'Other';
      // Clean up category string (capitalize first letter)
      const formattedCat = cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ');
      projectTypeTotals.set(formattedCat, (projectTypeTotals.get(formattedCat) || 0) + projBudget);

      // Timeline Logic (Expenses over time)
      const expenses = Array.isArray(data.expenses) ? data.expenses : [];
      expenses.forEach((e) => {
        const amt = Number(e.amount) || 0;
        const dateStr = (e.date || '').toString().trim();
        if (amt > 0 && dateStr) {
          const monthKey = dateStr.slice(0, 7); // YYYY-MM
          monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + amt);
        }
      });

    } else if (data.isApproved === false && data.status === 'rejected') {
      statusCounts.rejected++;
    } else if (
      (data.isApproved === false && data.status !== 'rejected') ||
      data.isApproved === null ||
      typeof data.isApproved === 'undefined'
    ) {
      statusCounts.pending++;
    }
  });

  // Status Chart
  const statusCtx = document.getElementById('statusChart').getContext('2d');
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(statusCtx, {
    type: 'bar',
    data: {
      labels: ['Approved (Finished)', 'Approved (Ongoing)', 'Pending (Needs Approval)', 'Rejected Projects'],
      datasets: [{
        label: 'Projects',
        data: [statusCounts.approved, statusCounts.ongoing, statusCounts.pending, statusCounts.rejected],
        backgroundColor: ['#22c55e', '#f59e42', '#eab308', '#ef4444'],
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 28,
        barPercentage: 0.8,
        categoryPercentage: 0.7
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { afterLabel: function() { return 'Click to view projects'; } } }
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0, callback: (v) => Number.isInteger(v) ? v : null }, grid: { color: '#eef2f7' } },
        y: { grid: { display: false }, offset: true, ticks: { maxRotation: 0, autoSkip: false } }
      },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const categoryMap = ['approved', 'ongoing', 'pending', 'rejected'];
          const category = categoryMap[index];
          showProjectsModal(category, docs);
        }
      },
      onHover: (event, elements) => { event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; }
    }
  });

  // Budget Chart
  const budgetCtx = document.getElementById('budgetChart').getContext('2d');
  if (budgetChart) budgetChart.destroy();
  const remaining = Math.max(totalBudget - totalSpent, 0);
  budgetChart = new Chart(budgetCtx, {
    type: 'doughnut',
    data: { labels: ['Spent', 'Remaining'], datasets: [{ data: [totalSpent, remaining], backgroundColor: ['#3b82f6', '#93c5fd'] }] },
    options: { responsive: true, maintainAspectRatio: true, aspectRatio: 1, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle' } }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${peso.format(ctx.parsed)}` } } }, cutout: '70%', layout: { padding: 0 } },
    plugins: [centerTextPlugin],
    _centerText: peso.format(totalBudget)
  });

  // Barangay Chart
  const barangayCounts = {};
  docs.forEach((d) => {
    const data = d.data();
    // Include pending and approved for location tracking? Usually yes.
    const name = (data.barangay || data.location || 'Unknown').toString().trim() || 'Unknown';
    barangayCounts[name] = (barangayCounts[name] || 0) + 1;
  });
  const barangayLabels = Object.keys(barangayCounts).sort((a,b) => a.localeCompare(b));
  const barangayValues = barangayLabels.map((k) => barangayCounts[k]);
  const barangayCtx = document.getElementById('barangayChart').getContext('2d');
  if (barangayChart) barangayChart.destroy();
  barangayChart = new Chart(barangayCtx, {
    type: 'bar',
    data: { labels: barangayLabels, datasets: [{ label: 'Requests', data: barangayValues, backgroundColor: '#60a5fa', borderRadius: 8, borderSkipped: false, maxBarThickness: 18, barPercentage: 0.6, categoryPercentage: 0.5 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef2f7' } }, x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0 } } } }
  });

  // UPDATED: Project Type Doughnut Chart
  const typeEntries = Array.from(projectTypeTotals.entries()).sort((a,b) => b[1] - a[1]);
  const typeLabels = typeEntries.map(([k]) => k);
  const typeValues = typeEntries.map(([,v]) => v);
  const typeColors = ['#3b82f6','#f59e42','#22c55e','#ef4444','#a78bfa','#10b981','#f472b6'];
  
  const expenseCategoryCtx = document.getElementById('expenseCategoryChart').getContext('2d');
  if (expenseCategoryChart) expenseCategoryChart.destroy();
  expenseCategoryChart = new Chart(expenseCategoryCtx, {
    type: 'doughnut',
    data: { labels: typeLabels, datasets: [{ data: typeValues, backgroundColor: typeColors.slice(0, typeLabels.length) }] },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { usePointStyle: true, pointStyle: 'circle' } }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${peso.format(ctx.parsed)}` } } }, cutout: '60%' }
  });

  // Spending Timeline Line Chart (by month)
  const monthKeys = Array.from(monthlyTotals.keys()).sort();
  const monthLabels = monthKeys.map((k) => {
    const [y,m] = k.split('-');
    return new Date(Number(y), Number(m)-1, 1).toLocaleString('en-US', { month: 'short' });
  });
  const monthValues = monthKeys.map((k) => monthlyTotals.get(k));
  const spendingTimelineCtx = document.getElementById('spendingTimelineChart').getContext('2d');
  if (spendingTimelineChart) spendingTimelineChart.destroy();
  spendingTimelineChart = new Chart(spendingTimelineCtx, {
    type: 'line',
    data: { labels: monthLabels, datasets: [{ label: 'Monthly Spend', data: monthValues, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.2)', tension: 0.3, fill: true, pointRadius: 3 }] },
    options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${peso.format(ctx.parsed.y)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => peso.format(v) } }, x: { grid: { display: false } } } }
  });
}

function subscribeToData() {
  const base = collection(db, 'requests');
  const q = query(base, orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap) => { 
    renderCharts(snap.docs);
    renderApprovedRequests(snap.docs);
  });
}

subscribeToData();

// Projects Modal logic
const projectsModal = document.getElementById('projectsModal');
const projectsModalCloseBtn = document.getElementById('projectsModalCloseBtn');
const projectsModalTitle = document.getElementById('projectsModalTitle');
const projectsGrid = document.getElementById('projectsGrid');

function escapeHtml(str) {
  return String(str).replace(/[&<>"']+/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
}

function renderApprovedRequests(docs) {
  requestsGrid.innerHTML = '';
  const approvedDocs = docs.filter(d => d.data().isApproved === true);
  
  if (!approvedDocs.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 5;
    emptyCell.textContent = 'No approved projects found.';
    emptyCell.style.color = '#667085';
    emptyCell.style.textAlign = 'center';
    emptyRow.appendChild(emptyCell);
    requestsGrid.appendChild(emptyRow);
    return;
  }
  
  approvedDocs.forEach((d) => {
    const data = d.data();
    const status = data.projectStatus === 'in-progress' ? 'ongoing' : 
                   data.projectStatus === 'finished' ? 'completed' : 'completed';
    const statusClass = status === 'completed' ? 'status-approved' : 
                       status === 'ongoing' ? 'status-pending' : 'status-approved';
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', d.id);
    tr.innerHTML = `
      <td>${escapeHtml(data.title || 'Untitled')}</td>
      <td>${escapeHtml(data.category || 'n/a')}</td>
      <td>${escapeHtml(data.location || 'n/a')}</td>
      <td><span class="status-pill ${statusClass}">${status}</span></td>
      <td>${data.budget != null ? '₱ ' + escapeHtml(String(data.budget)) : '—'}</td>
    `;
    requestsGrid.appendChild(tr);
  });
}

function showProjectsModal(category, docs) {
  const filtered = docs.filter((d) => {
    const data = d.data();
    if (category === 'approved') { return data.isApproved === true && (data.projectStatus !== 'in-progress'); }
    else if (category === 'ongoing') { return data.isApproved === true && data.projectStatus === 'in-progress'; }
    else if (category === 'pending') { return (data.isApproved === false && data.status !== 'rejected') || data.isApproved === null || typeof data.isApproved === 'undefined'; }
    else if (category === 'rejected') { return data.isApproved === false && data.status === 'rejected'; }
    return false;
  });

  const categoryTitles = { 'approved': 'Approved (Finished) Projects', 'ongoing': 'Approved (Ongoing) Projects', 'pending': 'Pending Projects (Needs Approval)', 'rejected': 'Rejected Projects' };
  projectsModalTitle.textContent = categoryTitles[category] || 'Projects';

  projectsGrid.innerHTML = '';
  if (!filtered.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 5;
    emptyCell.textContent = 'No projects found in this category.';
    emptyCell.style.color = '#667085';
    emptyCell.style.textAlign = 'center';
    emptyRow.appendChild(emptyCell);
    projectsGrid.appendChild(emptyRow);
  } else {
    filtered.forEach((d) => {
      const data = d.data();
      const createdBy = data.createdBy || {};
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', d.id);
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td>${escapeHtml(data.title || 'Untitled')}</td>
        <td>${escapeHtml(data.category || 'n/a')}</td>
        <td>${escapeHtml(data.location || 'n/a')}</td>
        <td>${data.budget != null ? '₱ ' + escapeHtml(String(data.budget)) : '—'}</td>
        <td>${escapeHtml(createdBy.displayName || createdBy.email || createdBy.uid || 'Unknown')}</td>
      `;
      tr.addEventListener('click', () => { closeProjectsModal(); });
      projectsGrid.appendChild(tr);
    });
  }

  projectsModal.classList.add('open');
  projectsModal.setAttribute('aria-hidden', 'false');
}

function closeProjectsModal() { projectsModal.classList.remove('open'); projectsModal.setAttribute('aria-hidden', 'true'); }
if (projectsModalCloseBtn) { projectsModalCloseBtn.addEventListener('click', closeProjectsModal); }
if (projectsModal) { projectsModal.addEventListener('click', (e) => { if (e.target === projectsModal) closeProjectsModal(); }); }