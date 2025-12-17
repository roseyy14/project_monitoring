import { protectPage } from '../core/role-guard.js';
import { auth, db } from '../core/firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { query, where, orderBy, onSnapshot, collection } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

protectPage(['barangay_official', 'barangay official', 'baranggay official', 'baranggay_official']);

const signOutBtn = document.getElementById('signOutBtn');
const requestsGrid = document.getElementById('requestsGrid');
const filterChips = Array.from(document.querySelectorAll('.brgy-chip[data-filter]'));
const modal = document.getElementById('brgyRequestModal');
const modalCloseBtn = document.getElementById('brgyModalCloseBtn');
const modalContent = document.getElementById('brgyModalContent');
let currentUser = null;
let unsubscribe = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (currentUser) {
    subscribeToRequests();
  }
});

function renderRequests(docs) {
  requestsGrid.innerHTML = '';
  if (!docs.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 6;
    emptyCell.textContent = 'No requests yet.';
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
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', d.id);
    tr.innerHTML = `
      <td>${escapeHtml(data.title || 'Untitled')}</td>
      <td>${escapeHtml(data.category || 'n/a')}</td>
      <td>${escapeHtml(data.location || 'n/a')}</td>
      <td><span class="status-pill ${statusClass}">${status}</span></td>
      <td style="max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(data.details || '')}</td>
      <td><button class="button info" data-action="see-info">See Info</button></td>
    `;
    requestsGrid.appendChild(tr);
  });

  requestsGrid.querySelectorAll('[data-action="see-info"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tr = btn.closest('tr');
      const id = tr.getAttribute('data-id');
      const snap = docs.find((x) => x.id === id);
      const data = snap ? snap.data() : {};
      openModal(data);
    });
  });
}

function subscribeToRequests() {
  const base = collection(db, 'requests');
  const q = query(base, where('createdBy.uid', '==', currentUser.uid), orderBy('createdAt', 'desc'));
  unsubscribe = onSnapshot(q, (snap) => {
    const docs = snap.docs;
    applyFilterAndRender(docs);
  });
}

function applyFilterAndRender(docs) {
  const active = document.querySelector('.brgy-chip[data-filter].active');
  const filter = active ? active.getAttribute('data-filter') : 'all';
  const filtered = docs.filter((d) => {
    const data = d.data();
    const status = (data.isApproved === true) ? 'approved' : (data.isApproved === false && data.status === 'rejected') ? 'rejected' : 'pending';
    if (filter === 'all') return true;
    return status === filter;
  });
  renderRequests(filtered);
}

filterChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    filterChips.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    if (typeof unsubscribe === 'function') {
      if (currentUser) {
        unsubscribe();
        subscribeToRequests();
      }
    }
  });
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"]+/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

signOutBtn.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'index.html';
});

function openModal(data) {
  if (!modal || !modalContent) return;
  const status = (data.isApproved === true)
    ? 'approved'
    : (data.isApproved === false && data.status === 'rejected')
      ? 'rejected'
      : 'pending';

  const budgetYear = data.budgetYear || '—';
  const projectCost = data.budget != null
    ? '₱ ' + Number(data.budget).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    : '—';

  // ✅ Clean 2-column structure (each label/value in its own row)
  modalContent.innerHTML = `
    <div class="detail-row">
      <div class="detail-label">Title</div>
      <div class="detail-value">${escapeHtml(data.title || '')}</div>
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
      <div class="detail-label">Urgency</div>
      <div class="detail-value">${escapeHtml(data.urgency || '')}</div>
    </div>

    <div class="detail-row">
      <div class="detail-label">Status</div>
      <div class="detail-value">${escapeHtml(status)}</div>
    </div>

    <div class="detail-row">
      <div class="detail-label">Target Budget Year</div>
      <div class="detail-value">${escapeHtml(String(budgetYear))}</div>
    </div>

    <div class="detail-row">
      <div class="detail-label">Project Cost</div>
      <div class="detail-value">${projectCost}</div>
    </div>

    <div class="detail-row">
      <div class="detail-label">Details</div>
      <div class="detail-value">${escapeHtml(data.details || '')}</div>
    </div>

    <div class="detail-row">
      <div class="detail-label">Contact</div>
      <div class="detail-value">${escapeHtml(data.contact || '—')}</div>
    </div>
  `;

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}


if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
});
if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  });
}


