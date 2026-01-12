import { protectPage } from '../core/role-guard.js';
import { auth, db } from '../core/firebase.js';
import { signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { collection, onSnapshot, orderBy, query, updateDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUserRole, formatRequestDataForRole, escapeHtml } from '../core/role-utils.js';
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
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const tableFilterStatus = document.getElementById('filterStatus');
const tableFilterLocation = document.getElementById('filterLocation');
const tableFilterBudget = document.getElementById('filterBudget');
const tableSortBy = document.getElementById('sortBy');
const applyFiltersBtn = document.getElementById('applyFiltersBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');

// Report Filter Elements
const filterYear = document.getElementById('filterYear');
const filterMonth = document.getElementById('filterMonth');
const reportFilterLocation = document.getElementById('reportFilterLocation');
const reportFilterBudget = document.getElementById('reportFilterBudget');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');

// Modal Elements
const modal = document.getElementById('requestModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalContent = document.getElementById('modalContent');
const projectsModal = document.getElementById('projectsModal');
const projectsModalCloseBtn = document.getElementById('projectsModalCloseBtn');
const projectsModalTitle = document.getElementById('projectsModalTitle');
const projectsGrid = document.getElementById('projectsGrid');
const declineModal = document.getElementById('declineModal');
const declineModalCloseBtn = document.getElementById('declineModalCloseBtn');
const declineForm = document.getElementById('declineForm');
const declineReasonInput = document.getElementById('declineReason');
const declineCancelBtn = document.getElementById('declineCancelBtn');
let currentDeclineRequestId = null;

// State Variables
let tableUnsubscribe = null;
let reportsUnsubscribe = null;
let allReportDocs = []; // Stores raw data for reports
let allTableDocs = []; // Stores all table data for filtering
let filteredTableDocs = []; // Stores currently filtered data for PDF export
let currentFilters = {
  dateFrom: null,
  dateTo: null,
  status: 'all',
  location: 'all',
  budget: 'all',
  sortBy: 'date-desc'
};

// Formatters
const pesoFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });
const pesoCompact = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

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
    allTableDocs = snap.docs;
    populateLocationFilter(snap.docs);
    applyTableFilterAndRender(snap.docs);
  });
}

function renderRequestsTable(docs) {
  requestsGrid.innerHTML = '';
  if (!docs.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 8;
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
    const reasonText = (status === 'rejected' && data.reasonForDecline) ? escapeHtml(data.reasonForDecline) : '—';
    tr.innerHTML = `
      <td>${escapeHtml(data.title || 'Untitled')}</td>
      <td>${escapeHtml(data.category || 'n/a')}</td>
      <td>${escapeHtml(data.location || 'n/a')}</td>
      <td><span class="status-pill ${statusClass}">${status}</span></td>
      <td>${data.budget != null ? '₱ ' + escapeHtml(String(data.budget)) : '—'}</td>
      <td>${escapeHtml(createdBy.displayName || createdBy.email || createdBy.uid || 'Unknown')}</td>
      <td style="max-width: 200px; font-size: 0.85rem; color: ${status === 'rejected' ? '#dc2626' : '#666'};" title="${reasonText}">${reasonText.length > 50 ? reasonText.substring(0, 50) + '...' : reasonText}</td>
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
      denyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentDeclineRequestId = id;
        if (declineReasonInput) declineReasonInput.value = '';
        if (declineModal) {
          declineModal.classList.add('open');
          declineModal.setAttribute('aria-hidden', 'false');
          if (declineReasonInput) declineReasonInput.focus();
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
  let filtered = [...docs];
  
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
      const status = (data.isApproved === true) ? 'approved' : (data.isApproved === false && data.status === 'rejected') ? 'rejected' : 'pending';
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
  filtered.sort((a, b) => {
    const dataA = a.data();
    const dataB = b.data();
    
    switch (currentFilters.sortBy) {
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
        const statusA = (dataA.isApproved === true) ? 'approved' : (dataA.isApproved === false && dataA.status === 'rejected') ? 'rejected' : 'pending';
        const statusB = (dataB.isApproved === true) ? 'approved' : (dataB.isApproved === false && dataB.status === 'rejected') ? 'rejected' : 'pending';
        return statusA.localeCompare(statusB);
      
      case 'status-desc':
        const statusA2 = (dataA.isApproved === true) ? 'approved' : (dataA.isApproved === false && dataA.status === 'rejected') ? 'rejected' : 'pending';
        const statusB2 = (dataB.isApproved === true) ? 'approved' : (dataB.isApproved === false && dataB.status === 'rejected') ? 'rejected' : 'pending';
        return statusB2.localeCompare(statusA2);
      
      default:
        return 0;
    }
  });
  
  // Store filtered data for PDF export
  filteredTableDocs = filtered;
  renderRequestsTable(filtered);
}

// --- PDF EXPORT FUNCTIONALITY ---
function exportToPDF() {
  if (!filteredTableDocs || filteredTableDocs.length === 0) {
    alert('No data to export. Please apply filters and try again.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'mm', 'a4');

  // Title
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('Admin Dashboard - Requests Report', 14, 15);
  
  // Date Generated
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.text(`Generated: ${currentDate}`, 14, 22);

  // Filter Information
  let filterInfo = 'Applied Filters: ';
  const filterParts = [];
  
  if (currentFilters.dateFrom) filterParts.push(`From: ${currentFilters.dateFrom}`);
  if (currentFilters.dateTo) filterParts.push(`To: ${currentFilters.dateTo}`);
  if (currentFilters.status !== 'all') filterParts.push(`Status: ${currentFilters.status}`);
  if (currentFilters.location !== 'all') filterParts.push(`Location: ${currentFilters.location}`);
  if (currentFilters.budget !== 'all') filterParts.push(`Budget: ${currentFilters.budget}`);
  
  filterInfo += filterParts.length > 0 ? filterParts.join(' | ') : 'None';
  
  doc.setFontSize(9);
  doc.text(filterInfo, 14, 28);

  // Prepare table data
  const tableData = filteredTableDocs.map(d => {
    const data = d.data();
    const status = (data.isApproved === true) ? 'approved' : 
                   (data.isApproved === false && data.status === 'rejected') ? 'rejected' : 'pending';
    const createdBy = data.createdBy || {};
    const submittedBy = createdBy.displayName || createdBy.email || createdBy.uid || 'Unknown';
    const reasonText = (status === 'rejected' && data.reasonForDecline) ? data.reasonForDecline : '—';
    
    return [
      data.title || 'Untitled',
      data.category || 'n/a',
      data.location || 'n/a',
      status,
      data.budget != null ? pesoCompact.format(data.budget) : '—',
      submittedBy,
      reasonText.length > 50 ? reasonText.substring(0, 50) + '...' : reasonText
    ];
  });

  // Generate table
  doc.autoTable({
    head: [['Title', 'Category', 'Location', 'Status', 'Budget', 'Submitted By', 'Reason']],
    body: tableData,
    startY: 35,
    styles: { 
      fontSize: 8,
      cellPadding: 3,
      overflow: 'linebreak'
    },
    headStyles: { 
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'left'
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251]
    },
    columnStyles: {
      0: { cellWidth: 45 }, // Title
      1: { cellWidth: 28 }, // Category
      2: { cellWidth: 35 }, // Location
      3: { cellWidth: 22 }, // Status
      4: { cellWidth: 28 }, // Budget
      5: { cellWidth: 35 }, // Submitted By
      6: { cellWidth: 45 }  // Reason
    },
    margin: { top: 35, left: 14, right: 14 },
    didDrawPage: function (data) {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(100);
      const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        data.settings.margin.left,
        pageHeight - 10
      );
    }
  });

  // Summary statistics
  const finalY = doc.lastAutoTable.finalY + 10;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Summary Statistics:', 14, finalY);
  
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  
  const totalRequests = filteredTableDocs.length;
  const totalBudget = filteredTableDocs.reduce((sum, d) => {
    return sum + (Number(d.data().budget) || 0);
  }, 0);
  
  const statusCounts = { approved: 0, pending: 0, rejected: 0 };
  filteredTableDocs.forEach(d => {
    const data = d.data();
    const status = (data.isApproved === true) ? 'approved' : 
                   (data.isApproved === false && data.status === 'rejected') ? 'rejected' : 'pending';
    statusCounts[status]++;
  });

  doc.text(`Total Requests: ${totalRequests}`, 14, finalY + 6);
  doc.text(`Total Budget: ${pesoCompact.format(totalBudget)}`, 14, finalY + 12);
  doc.text(`Approved: ${statusCounts.approved} | Pending: ${statusCounts.pending} | Rejected: ${statusCounts.rejected}`, 14, finalY + 18);

  const filename = `admin_requests_report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

// Populate location filter dynamically
function populateLocationFilter(docs) {
  if (!tableFilterLocation) return;
  
  const locations = new Set();
  docs.forEach(d => {
    const data = d.data();
    if (data.location) {
      locations.add(data.location.trim());
    }
  });
  
  const currentVal = tableFilterLocation.value;
  while (tableFilterLocation.options.length > 1) {
    tableFilterLocation.remove(1);
  }
  
  Array.from(locations).sort().forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    tableFilterLocation.appendChild(opt);
  });
  
  if (Array.from(locations).includes(currentVal)) {
    tableFilterLocation.value = currentVal;
  }
}

// Filter Event Listeners
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
    currentFilters.status = tableFilterStatus ? tableFilterStatus.value : 'all';
    currentFilters.location = tableFilterLocation ? tableFilterLocation.value : 'all';
    currentFilters.budget = tableFilterBudget ? tableFilterBudget.value : 'all';
    currentFilters.sortBy = tableSortBy ? tableSortBy.value : 'date-desc';
    
    applyTableFilterAndRender(allTableDocs);
  });
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener('click', () => {
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    if (tableFilterStatus) tableFilterStatus.value = 'all';
    if (tableFilterLocation) tableFilterLocation.value = 'all';
    if (tableFilterBudget) tableFilterBudget.value = 'all';
    if (tableSortBy) tableSortBy.value = 'date-desc';
    
    currentFilters = {
      dateFrom: null,
      dateTo: null,
      status: 'all',
      location: 'all',
      budget: 'all',
      sortBy: 'date-desc'
    };
    
    applyTableFilterAndRender(allTableDocs);
  });
}

// Auto-apply on filter changes
if (tableFilterStatus) tableFilterStatus.addEventListener('change', () => {
  currentFilters.status = tableFilterStatus.value;
  applyTableFilterAndRender(allTableDocs);
});

if (tableFilterLocation) tableFilterLocation.addEventListener('change', () => {
  currentFilters.location = tableFilterLocation.value;
  applyTableFilterAndRender(allTableDocs);
});

if (tableFilterBudget) tableFilterBudget.addEventListener('change', () => {
  currentFilters.budget = tableFilterBudget.value;
  applyTableFilterAndRender(allTableDocs);
});

if (tableSortBy) tableSortBy.addEventListener('change', () => {
  currentFilters.sortBy = tableSortBy.value;
  applyTableFilterAndRender(allTableDocs);
});

// Export PDF Button
if (exportPdfBtn) {
  exportPdfBtn.addEventListener('click', exportToPDF);
}


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
  const currentYearVal = filterYear ? filterYear.value : null;
  // Keep "All" as first option (index 0), remove others
  if (filterYear && filterYear.options) {
    while (filterYear.options.length > 1) { filterYear.remove(1); }
  }
  
  if (filterYear) {
    Array.from(years).sort().reverse().forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      filterYear.appendChild(opt);
    });
  }
  // Restore selection if valid
  if (Array.from(years).map(String).includes(currentYearVal)) filterYear.value = currentYearVal;

  // Fill Location Select
  const currentLocVal = reportFilterLocation ? reportFilterLocation.value : null;
  if (reportFilterLocation && reportFilterLocation.options) {
    while (reportFilterLocation.options.length > 1) { reportFilterLocation.remove(1); }
  }
  
  if (reportFilterLocation) {
    Array.from(locations).sort().forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = loc;
      reportFilterLocation.appendChild(opt);
    });
  }
  if (Array.from(locations).includes(currentLocVal)) reportFilterLocation.value = currentLocVal;
}

function filterAndRenderReports() {
  const selectedYear = filterYear ? filterYear.value : 'all';
  const selectedMonth = filterMonth ? filterMonth.value : 'all';
  const selectedLoc = reportFilterLocation ? reportFilterLocation.value : 'all';
  const selectedBudget = reportFilterBudget ? reportFilterBudget.value : 'all';

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
[filterYear, filterMonth, reportFilterLocation, reportFilterBudget].forEach(el => {
  if(el) el.addEventListener('change', filterAndRenderReports);
});

if(resetFiltersBtn) {
  resetFiltersBtn.addEventListener('click', () => {
    filterYear.value = 'all';
    filterMonth.value = 'all';
    reportFilterLocation.value = 'all';
    reportFilterBudget.value = 'all';
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

// --- Main Request Details Modal (UPDATED to use role-based display) ---
async function openModal(id, data) {
  const role = await getCurrentUserRole();
  modalContent.innerHTML = formatRequestDataForRole(data, role);
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

// Decline Modal Logic
function closeDeclineModal() {
  if (declineModal) {
    declineModal.classList.remove('open');
    declineModal.setAttribute('aria-hidden', 'true');
  }
  currentDeclineRequestId = null;
  if (declineReasonInput) declineReasonInput.value = '';
}

if (declineModalCloseBtn) declineModalCloseBtn.addEventListener('click', closeDeclineModal);
if (declineCancelBtn) declineCancelBtn.addEventListener('click', closeDeclineModal);
if (declineModal) {
  declineModal.addEventListener('click', (e) => {
    if (e.target === declineModal) closeDeclineModal();
  });
}

if (declineForm) {
  declineForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentDeclineRequestId) return;
    
    const reason = declineReasonInput ? declineReasonInput.value.trim() : '';
    if (!reason) {
      alert('Please provide a reason for declining this request.');
      if (declineReasonInput) declineReasonInput.focus();
      return;
    }
    
    const submitBtn = document.getElementById('declineSubmitBtn');
    const originalText = submitBtn ? submitBtn.textContent : 'Decline Request';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Declining...';
    }
    
    try {
      await updateDoc(doc(db, 'requests', currentDeclineRequestId), {
        isApproved: false,
        status: 'rejected',
        reasonForDecline: reason,
        updatedAt: serverTimestamp()
      });
      closeDeclineModal();
    } catch (error) {
      console.error('Error declining request:', error);
      alert('Failed to decline request. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
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