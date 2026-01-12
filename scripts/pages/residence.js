import { db } from '../core/firebase.js';
import { collection, onSnapshot, orderBy, query } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import "https://cdn.jsdelivr.net/npm/chart.js";

// ==========================================
// 1. GLOBAL VARIABLES & UTILITIES
// ==========================================

// DOM Elements - Main Page
const requestsGrid = document.getElementById('requestsGrid');
const sortBy = document.getElementById('sortBy');
const filterStatus = document.getElementById('filterStatus');
const filterLocation = document.getElementById('filterLocation');
const filterBudget = document.getElementById('filterBudget');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

// DOM Elements - List Modal (Drill-down from charts)
const projectsModal = document.getElementById('projectsModal');
const projectsModalCloseBtn = document.getElementById('projectsModalCloseBtn');
const projectsModalTitle = document.getElementById('projectsModalTitle');
const projectsGrid = document.getElementById('projectsGrid');

// DOM Elements - Detail Modal (Specific Project View)
const detailModal = document.getElementById('detailModal');
const detailModalCloseBtn = document.getElementById('detailModalCloseBtn');
const detailContent = document.getElementById('detailContent');

// Chart Instances
let statusChart, budgetChart, barangayChart, expenseCategoryChart, spendingTimelineChart;

// Data Storage
let allProjectsData = []; // Store all projects for sorting/filtering
let currentFilters = {
  dateFrom: null,
  dateTo: null,
  status: 'all',
  location: 'all',
  budget: 'all',
  sortBy: 'date-desc'
};

// Formatters
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const pesoFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });

// Utility: Prevent XSS
function escapeHtml(str) {
  return String(str).replace(/[&<>"']+/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
}

// Utility: Center Text Plugin for Doughnut Charts
const centerTextPlugin = {
  id: 'centerTextPlugin',
  afterDraw(chart) {
    const { ctx, chartArea: { width, height } } = chart;
    if (!chart.config._centerText) return;
    ctx.save();
    ctx.font = '600 16px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(chart.config._centerText, chart.getDatasetMeta(0).data[0]?.x || width / 2, chart.getDatasetMeta(0).data[0]?.y || height / 2);
    ctx.restore();
  }
};

// ==========================================
// 2. DATA FETCHING & CHARTS
// ==========================================

function subscribeToData() {
  const base = collection(db, 'requests');
  const q = query(base, orderBy('createdAt', 'desc'));

  onSnapshot(q, (snap) => {
    allProjectsData = snap.docs;
    populateLocationFilter(snap.docs);
    renderCharts(snap.docs);
    applySortAndFilter();
  });
}

function renderCharts(docs) {
  // Aggregators
  const statusCounts = { approved: 0, ongoing: 0, pending: 0, rejected: 0 };
  let totalBudget = 0;
  let totalSpent = 0;
  const projectTypeTotals = new Map(); 
  const monthlyTotals = new Map();
  const barangayCounts = {};

  docs.forEach((d) => {
    const data = d.data();
    
    // 1. Calculate Status & Financials
    if (data.isApproved === true) {
      // Status
      if (data.projectStatus === 'in-progress') {
        statusCounts.ongoing++;
      } else {
        // Includes 'finished' or undefined (defaults to approved/ready)
        statusCounts.approved++;
      }

      // Budget & Expenses
      const projBudget = Number(data.budget) || 0;
      totalBudget += projBudget;
      totalSpent += Number(data.amountSpent) || 0;

      // Category for Doughnut
      const cat = data.category || 'Other';
      const formattedCat = cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ');
      projectTypeTotals.set(formattedCat, (projectTypeTotals.get(formattedCat) || 0) + projBudget);

      // Timeline Data
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
      statusCounts.pending++;
    }

    // 2. Calculate Barangay/Location Stats
    const name = (data.barangay || data.location || 'Unknown').toString().trim() || 'Unknown';
    barangayCounts[name] = (barangayCounts[name] || 0) + 1;
  });

  // --- CHART 1: Projects by Status (Bar) ---
  const statusCtx = document.getElementById('statusChart').getContext('2d');
  if (statusChart) statusChart.destroy();
  statusChart = new Chart(statusCtx, {
    type: 'bar',
    data: {
      labels: ['Completed', 'Ongoing', 'Pending', 'Rejected'],
      datasets: [{
        label: 'Projects',
        data: [statusCounts.approved, statusCounts.ongoing, statusCounts.pending, statusCounts.rejected],
        backgroundColor: ['#22c55e', '#3b82f6', '#f59e42', '#ef4444'],
        borderRadius: 6,
        barPercentage: 0.6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { stepSize: 1 }, grid: { display:false } }, y: { grid: { display: false } } },
      onClick: (event, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const categoryMap = ['approved', 'ongoing', 'pending', 'rejected'];
          showProjectsListModal(categoryMap[index], docs);
        }
      },
      onHover: (event, elements) => { event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; }
    }
  });

  // --- CHART 2: Budget Overview (Doughnut) ---
  const budgetCtx = document.getElementById('budgetChart').getContext('2d');
  if (budgetChart) budgetChart.destroy();
  const remaining = Math.max(totalBudget - totalSpent, 0);
  budgetChart = new Chart(budgetCtx, {
    type: 'doughnut',
    data: { 
      labels: ['Spent', 'Remaining'], 
      datasets: [{ data: [totalSpent, remaining], backgroundColor: ['#3b82f6', '#e2e8f0'], borderWidth:0 }] 
    },
    options: { responsive: true, cutout: '75%', plugins: { legend: { position: 'bottom', labels:{usePointStyle:true} } } },
    plugins: [centerTextPlugin],
    _centerText: peso.format(totalBudget)
  });

  // --- CHART 3: Categories (Doughnut) ---
  const typeEntries = Array.from(projectTypeTotals.entries()).sort((a,b) => b[1] - a[1]);
  const typeLabels = typeEntries.map(([k]) => k);
  const typeValues = typeEntries.map(([,v]) => v);
  const typeColors = ['#3b82f6','#f59e42','#22c55e','#ef4444','#a78bfa','#10b981','#f472b6'];
  
  const expenseCategoryCtx = document.getElementById('expenseCategoryChart').getContext('2d');
  if (expenseCategoryChart) expenseCategoryChart.destroy();
  expenseCategoryChart = new Chart(expenseCategoryCtx, {
    type: 'doughnut',
    data: { labels: typeLabels, datasets: [{ data: typeValues, backgroundColor: typeColors.slice(0, typeLabels.length), borderWidth:0 }] },
    options: { responsive: true, cutout: '65%', plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth:8 } } } }
  });

  // --- CHART 4: Timeline (Line) ---
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
    data: { 
      labels: monthLabels, 
      datasets: [{ 
        label: 'Spend', 
        data: monthValues, 
        borderColor: '#3b82f6', 
        backgroundColor: 'rgba(59,130,246,0.1)', 
        fill: true, 
        tension: 0.3,
        pointRadius: 3
      }] 
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks:{display:false} }, x: { grid: { display: false } } } }
  });

  // --- CHART 5: Barangay (Bar) ---
  const barangayLabels = Object.keys(barangayCounts).sort();
  const barangayValues = barangayLabels.map((k) => barangayCounts[k]);
  const barangayCtx = document.getElementById('barangayChart').getContext('2d');
  if (barangayChart) barangayChart.destroy();
  barangayChart = new Chart(barangayCtx, {
    type: 'bar',
    data: { labels: barangayLabels, datasets: [{ label: 'Requests', data: barangayValues, backgroundColor: '#64748b', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { grid: { display: false } } } }
  });
}

// ==========================================
// 3. MAIN TABLE RENDERING
// ==========================================

function getProjectStatus(data) {
  let status = 'pending';
  let statusClass = 'status-pending';
  
  if (data.isApproved === true) {
    if (data.projectStatus === 'in-progress') {
      status = 'ongoing';
      statusClass = 'status-in-progress';
    } else if (data.projectStatus === 'finished') {
      status = 'completed';
      statusClass = 'status-finished';
    } else {
      status = 'approved';
      statusClass = 'status-approved';
    }
  } else if (data.isApproved === false && data.status === 'rejected') {
    status = 'rejected';
    statusClass = 'status-rejected';
  } else {
    status = 'pending';
    statusClass = 'status-pending';
  }
  
  return { status, statusClass };
}

function applySortAndFilter() {
  let filtered = [...allProjectsData];
  
  // Apply date range filter
  if (currentFilters.dateFrom || currentFilters.dateTo) {
    filtered = filtered.filter((d) => {
      const data = d.data();
      if (!data.createdAt) return false;
      
      const docDate = data.createdAt.toDate();
      const docDateOnly = new Date(docDate.getFullYear(), docDate.getMonth(), docDate.getDate());
      
      if (currentFilters.dateFrom) {
        const fromDate = new Date(currentFilters.dateFrom);
        if (docDateOnly < fromDate) return false;
      }
      
      if (currentFilters.dateTo) {
        const toDate = new Date(currentFilters.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (docDateOnly > toDate) return false;
      }
      
      return true;
    });
  }
  
  // Apply status filter
  if (currentFilters.status !== 'all') {
    filtered = filtered.filter((d) => {
      const data = d.data();
      const { status } = getProjectStatus(data);
      return status === currentFilters.status;
    });
  }

  // Apply location filter
  if (currentFilters.location !== 'all') {
    filtered = filtered.filter((d) => {
      const data = d.data();
      return data.location === currentFilters.location;
    });
  }

  // Apply budget filter
  if (currentFilters.budget !== 'all') {
    filtered = filtered.filter((d) => {
      const data = d.data();
      const budget = Number(data.budget) || 0;
      if (currentFilters.budget === 'small' && budget >= 50000) return false;
      if (currentFilters.budget === 'medium' && (budget < 50000 || budget > 500000)) return false;
      if (currentFilters.budget === 'large' && budget <= 500000) return false;
      return true;
    });
  }
  
  // Apply sorting
  const sortValue = currentFilters.sortBy || 'date-desc';
  filtered.sort((a, b) => {
    const dataA = a.data();
    const dataB = b.data();
    
    switch (sortValue) {
      case 'date-desc':
        const dateA = dataA.createdAt ? dataA.createdAt.toDate().getTime() : 0;
        const dateB = dataB.createdAt ? dataB.createdAt.toDate().getTime() : 0;
        return dateB - dateA;
      
      case 'date-asc':
        const dateA2 = dataA.createdAt ? dataA.createdAt.toDate().getTime() : 0;
        const dateB2 = dataB.createdAt ? dataB.createdAt.toDate().getTime() : 0;
        return dateA2 - dateB2;
      
      case 'title-asc':
        return (dataA.title || '').localeCompare(dataB.title || '');
      
      case 'title-desc':
        return (dataB.title || '').localeCompare(dataA.title || '');
      
      case 'budget-desc':
        return (Number(dataB.budget) || 0) - (Number(dataA.budget) || 0);
      
      case 'budget-asc':
        return (Number(dataA.budget) || 0) - (Number(dataB.budget) || 0);
      
      case 'status-asc':
        const statusA = getProjectStatus(dataA).status;
        const statusB = getProjectStatus(dataB).status;
        return statusA.localeCompare(statusB);
      
      case 'status-desc':
        const statusA2 = getProjectStatus(dataA).status;
        const statusB2 = getProjectStatus(dataB).status;
        return statusB2.localeCompare(statusA2);
      
      default:
        return 0;
    }
  });
  
  renderMainTable(filtered);
}

function renderMainTable(docs) {
  requestsGrid.innerHTML = '';
  
  if (!docs.length) {
    requestsGrid.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748b;">No projects found.</td></tr>';
    return;
  }
  
  docs.forEach((d) => {
    const data = d.data();
    const { status, statusClass } = getProjectStatus(data);

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    const reasonText = (status === 'rejected' && data.reasonForDecline) ? escapeHtml(data.reasonForDecline) : '—';
    tr.innerHTML = `
      <td>${escapeHtml(data.title || 'Untitled')}</td>
      <td>${escapeHtml(data.category || 'n/a')}</td>
      <td>${escapeHtml(data.location || 'n/a')}</td>
      <td><span class="status-pill ${statusClass}">${status}</span></td>
      <td>${data.budget != null ? peso.format(data.budget) : '—'}</td>
      <td style="max-width: 200px; font-size: 0.85rem; color: ${status === 'rejected' ? '#dc2626' : '#666'};" title="${reasonText}">${reasonText.length > 50 ? reasonText.substring(0, 50) + '...' : reasonText}</td>
    `;
    
    // Click opens the Detail Modal
    tr.addEventListener('click', () => openDetailModal(data));
    requestsGrid.appendChild(tr);
  });
}

// ==========================================
// 4. LIST MODAL (Drill-down from Charts)
// ==========================================

function showProjectsListModal(category, docs) {
  // Filter logic based on chart click
  const filtered = docs.filter((d) => {
    const data = d.data();
    if (category === 'approved') return data.isApproved === true && data.projectStatus !== 'in-progress';
    if (category === 'ongoing') return data.isApproved === true && data.projectStatus === 'in-progress';
    if (category === 'pending') return (data.isApproved === false && data.status !== 'rejected') || data.isApproved == null;
    if (category === 'rejected') return data.isApproved === false && data.status === 'rejected';
    return false;
  });

  // Set Title
  const titles = { 
    'approved': 'Completed Projects', 
    'ongoing': 'Ongoing Projects', 
    'pending': 'Pending Approval', 
    'rejected': 'Rejected Projects' 
  };
  projectsModalTitle.textContent = titles[category] || 'Projects';
  
  projectsGrid.innerHTML = '';

  if (!filtered.length) {
    projectsGrid.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#666;">No projects found in this category.</td></tr>';
  } else {
    filtered.forEach((d) => {
      const data = d.data();
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td>${escapeHtml(data.title || 'Untitled')}</td>
        <td>${escapeHtml(data.category || 'n/a')}</td>
        <td>${escapeHtml(data.location || 'n/a')}</td>
        <td>${data.budget != null ? pesoFormatter.format(data.budget) : '—'}</td>
        <td>${escapeHtml(data.createdBy?.email || 'Unknown')}</td>
      `;
      
      // Click closes List Modal, Opens Detail Modal
      tr.addEventListener('click', () => { 
          closeProjectsListModal(); 
          openDetailModal(data); 
      });
      projectsGrid.appendChild(tr);
    });
  }

  projectsModal.classList.add('open');
  projectsModal.setAttribute('aria-hidden', 'false');
}

function closeProjectsListModal() { 
  projectsModal.classList.remove('open'); 
  projectsModal.setAttribute('aria-hidden', 'true'); 
}

// ==========================================
// 5. DETAIL MODAL (The "Engineer" Design)
// ==========================================

function openDetailModal(data) {
    // Math for progress bars
    const budget = Number(data.budget) || 0;
    const spent = Number(data.amountSpent) || 0;
    const financialPercentage = budget > 0 ? ((spent / budget) * 100).toFixed(1) : 0;
    const progress = data.progress || 0;

    // A. Contractor Section HTML
    let contractorSection = '';
    if (data.contractorName) {
        contractorSection = `
            <h4 class="section-title">Contractor Information</h4>
            <div class="detail-row">
                <div class="detail-label">Company Name</div>
                <div class="detail-value">${escapeHtml(data.contractorName)}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Address</div>
                <div class="detail-value">${escapeHtml(data.contractorAddress || '—')}</div>
            </div>
        `;
    }

    // B. Images Section HTML
    let imagesHtml = '<div style="font-style:italic; color:#999; padding:8px 0;">No photos available.</div>';
    if (data.proofImages && Array.isArray(data.proofImages) && data.proofImages.length > 0) {
        imagesHtml = '';
        data.proofImages.forEach(url => {
            imagesHtml += `<img src="${url}" onclick="window.open('${url}', '_blank')" 
            style="width:100px; height:80px; object-fit:cover; border-radius:4px; cursor:pointer; margin-right:8px; border:1px solid #ddd;" 
            title="View Full Size"/>`;
        });
    }

    // C. Expenses Table HTML
    let expenseRows = '';
    const expenses = Array.isArray(data.expenses) ? data.expenses : [];
    if (expenses.length > 0) {
        expenses.forEach(e => {
            expenseRows += `
                <tr>
                    <td>${escapeHtml(e.date || '-')}</td>
                    <td>${escapeHtml(e.note || '-')}</td>
                    <td style="text-align:right;">${e.amount ? pesoFormatter.format(e.amount) : '-'}</td>
                </tr>
            `;
        });
    } else {
        expenseRows = `<tr><td colspan="3" style="text-align:center; color:#999; padding:12px;">No expenses recorded yet.</td></tr>`;
    }

    // D. Construct Final HTML
    detailContent.innerHTML = `
        <h4 class="section-title">General Information</h4>
        
        <div class="detail-row">
            <div class="detail-label">Project Title</div>
            <div class="detail-value"><strong>${escapeHtml(data.title || 'Untitled')}</strong></div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Category</div>
            <div class="detail-value">${escapeHtml(data.category || '—')}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Location</div>
            <div class="detail-value">${escapeHtml(data.location || '—')}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Description</div>
            <div class="detail-value" style="font-size:0.9rem; line-height:1.5;">${escapeHtml(data.details || 'No description provided.')}</div>
        </div>

        <h4 class="section-title">Status & Budget</h4>
        
        <div class="detail-row">
            <div class="detail-label">Physical Status</div>
            <div class="detail-value">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                    <span style="color:var(--primary); font-weight:bold;">${progress}% Completed</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar main" style="width:${progress}%"></div>
                </div>
            </div>
        </div>
        <div class="detail-row">
            <div class="detail-label">Budget Usage</div>
            <div class="detail-value">
                <div style="margin-bottom:4px;">
                    ${pesoFormatter.format(spent)} <span style="color:#8d99ae;">of</span> ${pesoFormatter.format(budget)}
                    <span style="font-size:0.85em; font-weight:600; color:${financialPercentage > 100 ? 'var(--error)' : 'var(--success)'}">
                        (${financialPercentage}%)
                    </span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar budget" style="width:${Math.min(financialPercentage, 100)}%"></div>
                </div>
            </div>
        </div>

        ${contractorSection}

        <h4 class="section-title">Project Photos</h4>
        <div class="image-gallery">
            ${imagesHtml}
        </div>

        <h4 class="section-title">Financial History</h4>
        <div class="table-wrapper">
            <table class="requests-table" style="margin-bottom:0; border:none;">
                <thead>
                    <tr>
                        <th style="background:#fff; border-bottom:2px solid #f1f5f9;">Date</th>
                        <th style="background:#fff; border-bottom:2px solid #f1f5f9;">Particulars</th>
                        <th style="background:#fff; border-bottom:2px solid #f1f5f9; text-align:right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${expenseRows}
                </tbody>
            </table>
        </div>
    `;

    detailModal.classList.add('open');
    detailModal.setAttribute('aria-hidden', 'false');
}

function closeDetailModal() {
    detailModal.classList.remove('open');
    detailModal.setAttribute('aria-hidden', 'true');
}

// ==========================================
// 6. EVENT LISTENERS
// ==========================================

// Initialization
subscribeToData();

// Populate location filter dynamically
function populateLocationFilter(docs) {
  if (!filterLocation) return;

  const locations = new Set();
  docs.forEach(d => {
    const data = d.data();
    if (data.location) {
      locations.add(data.location.trim());
    }
  });

  const currentVal = filterLocation.value;
  while (filterLocation.options.length > 1) {
    filterLocation.remove(1);
  }

  Array.from(locations).sort().forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    filterLocation.appendChild(opt);
  });

  if (Array.from(locations).includes(currentVal)) {
    filterLocation.value = currentVal;
  }
}

// Sort and Filter Event Listeners
if (sortBy) sortBy.addEventListener('change', () => {
  currentFilters.sortBy = sortBy.value;
  applySortAndFilter();
});

if (filterStatus) filterStatus.addEventListener('change', () => {
  currentFilters.status = filterStatus.value;
  applySortAndFilter();
});

if (filterLocation) filterLocation.addEventListener('change', () => {
  currentFilters.location = filterLocation.value;
  applySortAndFilter();
});

if (filterBudget) filterBudget.addEventListener('change', () => {
  currentFilters.budget = filterBudget.value;
  applySortAndFilter();
});

if (applyFiltersBtn) {
  applyFiltersBtn.addEventListener('click', () => {
    const from = dateFrom ? dateFrom.value : null;
    const to = dateTo ? dateTo.value : null;

    if (from && to && new Date(from) > new Date(to)) {
      alert('From date must be before or equal to To date.');
      return;
    }

    currentFilters.dateFrom = from;
    currentFilters.dateTo = to;
    currentFilters.status = filterStatus ? filterStatus.value : 'all';
    currentFilters.location = filterLocation ? filterLocation.value : 'all';
    currentFilters.budget = filterBudget ? filterBudget.value : 'all';
    currentFilters.sortBy = sortBy ? sortBy.value : 'date-desc';

    applySortAndFilter();
  });
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener('click', () => {
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    if (filterStatus) filterStatus.value = 'all';
    if (filterLocation) filterLocation.value = 'all';
    if (filterBudget) filterBudget.value = 'all';
    if (sortBy) sortBy.value = 'date-desc';

    currentFilters = {
      dateFrom: null,
      dateTo: null,
      status: 'all',
      location: 'all',
      budget: 'all',
      sortBy: 'date-desc'
    };

    applySortAndFilter();
  });
}

// List Modal Events
if (projectsModalCloseBtn) projectsModalCloseBtn.addEventListener('click', closeProjectsListModal);
if (projectsModal) projectsModal.addEventListener('click', (e) => { if (e.target === projectsModal) closeProjectsListModal(); });

// Detail Modal Events
if (detailModalCloseBtn) detailModalCloseBtn.addEventListener('click', closeDetailModal);
if (detailModal) detailModal.addEventListener('click', (e) => { if (e.target === detailModal) closeDetailModal(); });