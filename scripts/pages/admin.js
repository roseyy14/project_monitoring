import { protectPage } from '../core/role-guard.js';
import { auth, db } from '../core/firebase.js';
import { signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { collection, onSnapshot, orderBy, query, updateDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import "https://cdn.jsdelivr.net/npm/chart.js";

// --- 1. SECURITY & SETUP ---
protectPage(['admin']);

const signOutBtn = document.getElementById('signOutBtn');

// Navigation Elements
const dashboardNav = document.getElementById('dashboardNav');
const reportsNav = document.getElementById('reportsNav');
const requestsSection = document.querySelector('.requests-section');
const reportsSection = document.getElementById('reportsSection');
const filterNav = document.querySelector('.brgy-navbar');

// Request Table Elements
const requestsGrid = document.getElementById('requestsGrid');
const filterChips = Array.from(document.querySelectorAll('.brgy-chip[data-filter]'));

// Report Filter Elements
const filterYear = document.getElementById('filterYear');
const filterMonth = document.getElementById('filterMonth');
const filterLocation = document.getElementById('filterLocation');
const filterBudget = document.getElementById('filterBudget');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');

// Modal Elements
const modal = document.getElementById('requestModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalContent = document.getElementById('modalContent');
const projectsModal = document.getElementById('projectsModal');
const projectsModalCloseBtn = document.getElementById('projectsModalCloseBtn');
const projectsModalTitle = document.getElementById('projectsModalTitle');
const projectsGrid = document.getElementById('projectsGrid');

// State Variables
let tableUnsubscribe = null;
let reportsUnsubscribe = null;
let allReportDocs = []; // Stores raw data for reports

// Formatters
const pesoFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });
const pesoCompact = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

function escapeHtml(str) {
  return String(str).replace(/[&<>"]+/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

// --- 2. AUTHENTICATION ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    subscribeToRequestsTable();
    subscribeToReports();
  } else {
    if (tableUnsubscribe) tableUnsubscribe();
    if (reportsUnsubscribe) reportsUnsubscribe();
  }
});

signOutBtn.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'index.html';
});

// --- 3. NAVIGATION ---
dashboardNav.addEventListener('click', (e) => {
  e.preventDefault();
  dashboardNav.classList.add('active');
  reportsNav.classList.remove('active');
  requestsSection.style.display = '';
  reportsSection.style.display = 'none';
  if (filterNav) filterNav.style.display = '';
});

reportsNav.addEventListener('click', (e) => {
  e.preventDefault();
  dashboardNav.classList.remove('active');
  reportsNav.classList.add('active');
  requestsSection.style.display = 'none';
  reportsSection.style.display = '';
  if (filterNav) filterNav.style.display = 'none';
});


// --- 4. REQUESTS TABLE LOGIC ---

function subscribeToRequestsTable() {
  const base = collection(db, 'requests');
  const q = query(base, orderBy('createdAt', 'desc'));
  
  tableUnsubscribe = onSnapshot(q, (snap) => {
    applyTableFilterAndRender(snap.docs);
  });
}

function renderRequestsTable(docs) {
  requestsGrid.innerHTML = '';
  if (!docs.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 7;
    emptyCell.textContent = 'No requests found.';
    emptyCell.style.color = '#667085';
    emptyCell.style.textAlign = 'center';
    emptyRow.appendChild(emptyCell);
    requestsGrid.appendChild(emptyRow);
    return;
  }

  docs.forEach((d) => {
    const data = d.data();
    const status = (data.isApproved === true) ? 'approved' : (data.isApproved === false && data.status === 'rejected') ? 'rejected' : 'pending';
    const statusClass = status === 'approved' ? 'status-approved' : status === 'rejected' ? 'status-rejected' : 'status-pending';
    const createdBy = data.createdBy || {};
    
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', d.id);
    tr.innerHTML = `
      <td>${escapeHtml(data.title || 'Untitled')}</td>
      <td>${escapeHtml(data.category || 'n/a')}</td>
      <td>${escapeHtml(data.location || 'n/a')}</td>
      <td><span class="status-pill ${statusClass}">${status}</span></td>
      <td>${data.budget != null ? '₱ ' + escapeHtml(String(data.budget)) : '—'}</td>
      <td>${escapeHtml(createdBy.displayName || createdBy.email || createdBy.uid || 'Unknown')}</td>
      <td>
        <div class="admin-actions" data-id="${d.id}">
          <button class="button info" data-action="see-info">See Info</button>
          ${status === 'pending' ? `
            <button class="button" data-action="approve">Approve</button>
            <button class="button" data-action="deny" style="margin-left:8px;">Deny</button>
          ` : ''}
        </div>
      </td>
    `;
    requestsGrid.appendChild(tr);
  });

  // Action Buttons
  requestsGrid.querySelectorAll('.admin-actions').forEach((container) => {
    const id = container.getAttribute('data-id');
    const approveBtn = container.querySelector('[data-action="approve"]');
    const denyBtn = container.querySelector('[data-action="deny"]');
    const seeInfoBtn = container.querySelector('[data-action="see-info"]');

    if (approveBtn) {
      approveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if(confirm('Are you sure you want to approve this project?')) {
          await updateDoc(doc(db, 'requests', id), {
            isApproved: true,
            status: 'approved',
            projectStatus: 'not-started',
            progress: 0,
            updatedAt: serverTimestamp()
          });
        }
      });
    }
    if (denyBtn) {
      denyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if(confirm('Are you sure you want to reject this request?')) {
          await updateDoc(doc(db, 'requests', id), {
            isApproved: false,
            status: 'rejected',
            updatedAt: serverTimestamp()
          });
        }
      });
    }
    if (seeInfoBtn) {
      seeInfoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const snap = docs.find((x) => x.id === id);
        openModal(id, snap ? snap.data() : {});
      });
    }
  });

  // Row Click
  requestsGrid.querySelectorAll('tr').forEach((rowEl) => {
    rowEl.addEventListener('click', (e) => {
      if (e.target.closest('.admin-actions')) return;
      const id = rowEl.getAttribute('data-id');
      const snap = docs.find((x) => x.id === id);
      openModal(id, snap ? snap.data() : {});
    });
  });
}

function applyTableFilterAndRender(docs) {
  const active = document.querySelector('.brgy-chip[data-filter].active');
  const filter = active ? active.getAttribute('data-filter') : 'all';
  
  const filtered = docs.filter((d) => {
    const data = d.data();
    const status = (data.isApproved === true) ? 'approved' : (data.isApproved === false && data.status === 'rejected') ? 'rejected' : 'pending';
    if (filter === 'all') return true;
    return status === filter;
  });
  renderRequestsTable(filtered);
}

// Table Filter Chips
filterChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    filterChips.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    // Refresh table with existing data would be better, but re-triggering subscription is safe enough here
    if (tableUnsubscribe) { tableUnsubscribe(); subscribeToRequestsTable(); }
  });
});


// --- 5. REPORTS & CHARTS LOGIC (With Filters) ---

function subscribeToReports() {
  const base = collection(db, 'requests');
  const q = query(base, orderBy('createdAt', 'desc'));
  
  reportsUnsubscribe = onSnapshot(q, (snap) => {
    allReportDocs = snap.docs;
    populateDynamicFilters(allReportDocs);
    filterAndRenderReports(); 
  });
}

function populateDynamicFilters(docs) {
  const years = new Set();
  const locations = new Set();

  docs.forEach(d => {
    const data = d.data();
    if (data.createdAt) {
      years.add(data.createdAt.toDate().getFullYear());
    }
    if (data.location) {
      locations.add(data.location.trim());
    }
  });

  // Fill Year Select
  const currentYearVal = filterYear.value;
  // Keep "All" as first option (index 0), remove others
  while (filterYear.options.length > 1) { filterYear.remove(1); }
  
  Array.from(years).sort().reverse().forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    filterYear.appendChild(opt);
  });
  // Restore selection if valid
  if (Array.from(years).map(String).includes(currentYearVal)) filterYear.value = currentYearVal;

  // Fill Location Select
  const currentLocVal = filterLocation.value;
  while (filterLocation.options.length > 1) { filterLocation.remove(1); }
  
  Array.from(locations).sort().forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    filterLocation.appendChild(opt);
  });
  if (Array.from(locations).includes(currentLocVal)) filterLocation.value = currentLocVal;
}

function filterAndRenderReports() {
  const selectedYear = filterYear.value;
  const selectedMonth = filterMonth.value;
  const selectedLoc = filterLocation.value;
  const selectedBudget = filterBudget.value;

  const filteredDocs = allReportDocs.filter(d => {
    const data = d.data();
    const date = data.createdAt ? data.createdAt.toDate() : new Date();
    const budget = Number(data.budget) || 0;

    // Filter Year
    if (selectedYear !== 'all' && date.getFullYear().toString() !== selectedYear) return false;

    // Filter Month (0-11)
    if (selectedMonth !== 'all' && date.getMonth().toString() !== selectedMonth) return false;

    // Filter Location
    if (selectedLoc !== 'all' && data.location !== selectedLoc) return false;

    // Filter Budget
    if (selectedBudget === 'small' && budget >= 50000) return false;
    if (selectedBudget === 'medium' && (budget < 50000 || budget > 500000)) return false;
    if (selectedBudget === 'large' && budget <= 500000) return false;

    return true; // Passed all filters
  });

  renderCharts(filteredDocs);
}

// Report Filter Listeners
[filterYear, filterMonth, filterLocation, filterBudget].forEach(el => {
  if(el) el.addEventListener('change', filterAndRenderReports);
});

if(resetFiltersBtn) {
  resetFiltersBtn.addEventListener('click', () => {
    filterYear.value = 'all';
    filterMonth.value = 'all';
    filterLocation.value = 'all';
    filterBudget.value = 'all';
    filterAndRenderReports();
  });
}

// --- CHARTS RENDERING ---
let statusChart, budgetChart, barangayChart, expenseCategoryChart, spendingTimelineChart;

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
  
  const projectTypeTotals = new Map();
  const monthlyTotals = new Map();
  const barangayCounts = {};
  
  docs.forEach((d) => {
    const data = d.data();

    // Barangay Count
    const name = (data.barangay || data.location || 'Unknown').toString().trim() || 'Unknown';
    barangayCounts[name] = (barangayCounts[name] || 0) + 1;

    // Status & Finances
    if (data.isApproved === true) {
      if (data.projectStatus === 'in-progress') {
        statusCounts.ongoing++;
      } else if (data.projectStatus === 'finished') {
        statusCounts.approved++;
      } else {
        statusCounts.approved++; // fallback
      }
      
      const projBudget = Number(data.budget) || 0;
      totalBudget += projBudget;
      totalSpent += Number(data.amountSpent) || 0;

      // Project Type
      const cat = data.category || 'Other';
      const formattedCat = cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ');
      projectTypeTotals.set(formattedCat, (projectTypeTotals.get(formattedCat) || 0) + projBudget);
      
      // Timeline (Expenses)
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
    } else {
      // Pending
      statusCounts.pending++;
    }
  });

  // 1. Status Chart
  const statusCtx = document.getElementById('statusChart').getContext('2d');
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(statusCtx, {
    type: 'bar',
    data: {
      labels: ['Completed', 'Ongoing', 'Pending', 'Rejected'],
      datasets: [{
        label: 'Projects',
        data: [statusCounts.approved, statusCounts.ongoing, statusCounts.pending, statusCounts.rejected],
        backgroundColor: ['#22c55e', '#f59e42', '#eab308', '#ef4444'],
        borderRadius: 8,
        barPercentage: 0.6,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { stepSize: 1 }, grid: { display: false } }, y: { grid: { display: false } } },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const categoryMap = ['approved', 'ongoing', 'pending', 'rejected'];
          showProjectsModal(categoryMap[index], docs);
        }
      },
      onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; }
    }
  });

  // 2. Budget Chart
  const budgetCtx = document.getElementById('budgetChart').getContext('2d');
  if (budgetChart) budgetChart.destroy();
  const remaining = Math.max(totalBudget - totalSpent, 0);
  budgetChart = new Chart(budgetCtx, {
    type: 'doughnut',
    data: { labels: ['Spent', 'Remaining'], datasets: [{ data: [totalSpent, remaining], backgroundColor: ['#3b82f6', '#93c5fd'] }] },
    options: { responsive: true, cutout: '70%', plugins: { legend: { position: 'bottom' } } },
    plugins: [centerTextPlugin],
    _centerText: pesoCompact.format(totalBudget)
  });

  // 3. Barangay Chart
  const barangayLabels = Object.keys(barangayCounts).sort();
  const barangayValues = barangayLabels.map((k) => barangayCounts[k]);
  const barangayCtx = document.getElementById('barangayChart').getContext('2d');
  if (barangayChart) barangayChart.destroy();
  barangayChart = new Chart(barangayCtx, {
    type: 'bar',
    data: { labels: barangayLabels, datasets: [{ label: 'Requests', data: barangayValues, backgroundColor: '#60a5fa', borderRadius: 4 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { grid: { display: false } } } }
  });

  // 4. Type Chart
  const typeEntries = Array.from(projectTypeTotals.entries()).sort((a,b) => b[1] - a[1]);
  const typeLabels = typeEntries.map(([k]) => k);
  const typeValues = typeEntries.map(([,v]) => v);
  const typeColors = ['#3b82f6','#f59e42','#22c55e','#ef4444','#a78bfa','#10b981','#f472b6'];
  const expenseCategoryCtx = document.getElementById('expenseCategoryChart').getContext('2d');
  if (expenseCategoryChart) expenseCategoryChart.destroy();
  expenseCategoryChart = new Chart(expenseCategoryCtx, {
    type: 'doughnut',
    data: { labels: typeLabels, datasets: [{ data: typeValues, backgroundColor: typeColors.slice(0, typeLabels.length) }] },
    options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'right', labels: { usePointStyle: true } } } }
  });

  // 5. Timeline Chart
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
    data: { labels: monthLabels, datasets: [{ label: 'Monthly Spend', data: monthValues, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
  });
}


// --- 6. MODALS LOGIC ---

// --- Main Request Details Modal ---
function openModal(id, data) {
  const budget = data.budget || 0;
  const spent = data.amountSpent || 0;
  const financialPercentage = budget > 0 ? ((spent / budget) * 100).toFixed(1) : 0;

  // Contractor Info
  const contractorFields = [
    data.contractorName, data.contractorAddress, data.contractDate,
    data.contractAmount, data.contractDuration, data.intendedCompletionDate,
    data.noticeToProceedDate, data.contractExpirationDate
  ];
  const hasContractorData = contractorFields.some(v => v && v !== '—');
  
  let contractorHTML = '';
  if (hasContractorData) {
    contractorHTML = `
      <div class="modal-section-title">Contractor Details</div>
      <div class="detail-row">
        <div class="detail-label">Name</div>
        <div class="detail-value">${escapeHtml(data.contractorName || '—')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Address</div>
        <div class="detail-value">${escapeHtml(data.contractorAddress || '—')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Contract Date</div>
        <div class="detail-value">${escapeHtml(data.contractDate || '—')}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Amount</div>
        <div class="detail-value">${data.contractAmount != null ? pesoFormatter.format(data.contractAmount) : '—'}</div>
      </div>
    `;
  }

  // Photos
  let imagesHtml = '';
  if (data.proofImages && Array.isArray(data.proofImages) && data.proofImages.length > 0) {
    imagesHtml = `<div class="image-gallery">`;
    data.proofImages.forEach(url => {
      imagesHtml += `<img src="${url}" onclick="window.open('${url}', '_blank')" title="Click to view full size" />`;
    });
    imagesHtml += `</div>`;
  } else {
    imagesHtml = `<div class="sub-text" style="padding: 0 0 16px 0;">No photo updates available.</div>`;
  }

  // Expenses Table
  const expenses = Array.isArray(data.expenses) ? data.expenses : [];
  let expenseTable = '';
  if (expenses.length > 0) {
    expenseTable = `
      <div style="margin-top:8px;">
        <table class="requests-table" style="width:100%;">
          <thead>
            <tr>
              <th style="text-align:left;">Date</th>
              <th style="text-align:left;">Particulars</th>
              <th style="text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>`;
    expenses.forEach(e => {
      const dateStr = e.date ? new Date(e.date).toLocaleDateString() : '—';
      const amtStr = e.amount ? pesoFormatter.format(e.amount) : '—';
      expenseTable += `
        <tr>
          <td>${escapeHtml(dateStr)}</td>
          <td>${escapeHtml(e.note || '—')}</td>
          <td style="text-align:right;">${amtStr}</td>
        </tr>`;
    });
    expenseTable += `</tbody></table></div>`;
  } else {
    expenseTable = `<div class="sub-text">No disbursements recorded yet.</div>`;
  }

  // Combine HTML
  modalContent.innerHTML = `
    <div class="detail-row">
      <div class="detail-label">Title</div>
      <div class="detail-value"><strong>${escapeHtml(data.title || '')}</strong></div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Category</div>
      <div class="detail-value">${escapeHtml(data.category || '')}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Location</div>
      <div class="detail-value">${escapeHtml(data.location || '')}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Budget</div>
      <div class="detail-value">${data.budget != null ? pesoFormatter.format(data.budget) : '—'}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Details</div>
      <div class="detail-value">${escapeHtml(data.details || '')}</div>
    </div>

    <div class="detail-row" style="background-color: #eff6ff; margin-top:12px;">
      <div class="detail-label" style="color:#3b82f6">Physical Status</div>
      <div class="detail-value" style="color:#3b82f6; font-weight:bold;">${data.progress || 0}% Completed</div>
    </div>
    <div class="detail-row" style="background-color: #fff7ed;">
      <div class="detail-label" style="color:#f59e42">Financial Status</div>
      <div class="detail-value" style="color:#f59e42; font-weight:bold;">${financialPercentage}% Utilized (${pesoFormatter.format(spent)})</div>
    </div>

    ${contractorHTML}

    <div class="modal-section-title">Project Photos</div>
    ${imagesHtml}

    <div class="modal-section-title">Financial Accomplishment History</div>
    ${expenseTable}
  `;
  
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// --- Chart Drill-down Projects Modal ---
function showProjectsModal(category, docs) {
  const filtered = docs.filter((d) => {
    const data = d.data();
    if (category === 'approved') { return data.isApproved === true && (data.projectStatus !== 'in-progress'); }
    else if (category === 'ongoing') { return data.isApproved === true && data.projectStatus === 'in-progress'; }
    else if (category === 'pending') { return (data.isApproved === false && data.status !== 'rejected') || data.isApproved === null || typeof data.isApproved === 'undefined'; }
    else if (category === 'rejected') { return data.isApproved === false && data.status === 'rejected'; }
    return false;
  });

  const categoryTitles = { 
    'approved': 'Completed Projects', 
    'ongoing': 'Ongoing Projects', 
    'pending': 'Pending Requests', 
    'rejected': 'Rejected Requests' 
  };
  projectsModalTitle.textContent = categoryTitles[category] || 'Projects';

  projectsGrid.innerHTML = '';
  if (!filtered.length) {
    projectsGrid.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">No projects found in this category.</td></tr>';
  } else {
    filtered.forEach((d) => {
      const data = d.data();
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td>${escapeHtml(data.title || 'Untitled')}</td>
        <td>${escapeHtml(data.category || 'n/a')}</td>
        <td>${escapeHtml(data.location || 'n/a')}</td>
        <td>${data.budget != null ? pesoCompact.format(data.budget) : '—'}</td>
        <td>${escapeHtml((data.createdBy && data.createdBy.displayName) || 'Unknown')}</td>
      `;
      tr.addEventListener('click', () => { closeProjectsModal(); openModal(d.id, data); });
      projectsGrid.appendChild(tr);
    });
  }

  projectsModal.classList.add('open');
  projectsModal.setAttribute('aria-hidden', 'false');
}

function closeProjectsModal() { projectsModal.classList.remove('open'); projectsModal.setAttribute('aria-hidden', 'true'); }
if (projectsModalCloseBtn) projectsModalCloseBtn.addEventListener('click', closeProjectsModal);
if (projectsModal) projectsModal.addEventListener('click', (e) => { if (e.target === projectsModal) closeProjectsModal(); });