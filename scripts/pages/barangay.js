import { protectPage } from '../core/role-guard.js';
import { auth, db } from '../core/firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { query, where, orderBy, onSnapshot, collection, doc, updateDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUserRole, formatRequestDataForRole, escapeHtml } from '../core/role-utils.js';

protectPage(['barangay_official', 'barangay official', 'baranggay official', 'baranggay_official']);

// Notification system for status updates (stored in database)
const markRequestAsSeen = async (requestId) => {
  try {
    const requestRef = doc(db, 'requests', requestId);
    await updateDoc(requestRef, {
      seenBy: arrayUnion(currentUser.uid)
    });
  } catch (error) {
    console.error('Error marking request as seen:', error);
  }
};

const hasSeenRequest = (data) => {
  if (!data.seenBy || !Array.isArray(data.seenBy)) return false;
  return data.seenBy.includes(currentUser.uid);
};

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
    emptyCell.colSpan = 7;
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

    // Check if this request has been updated and not seen yet
    const hasUpdate = (status === 'approved' || status === 'rejected') && !hasSeenRequest(data);
    const notificationDot = hasUpdate ? '<span class="notification-dot" title="New status update"></span>' : '';

    const reasonText = (status === 'rejected' && data.reasonForDecline) ? escapeHtml(data.reasonForDecline) : '—';
    tr.innerHTML = `
      <td>${notificationDot}${escapeHtml(data.title || 'Untitled')}</td>
      <td>${escapeHtml(data.category || 'n/a')}</td>
      <td>${escapeHtml(data.location || 'n/a')}</td>
      <td><span class="status-pill ${statusClass}">${status}</span></td>
      <td style="max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(data.details || '')}</td>
      <td style="max-width: 200px; font-size: 0.85rem; color: ${status === 'rejected' ? '#dc2626' : '#666'};" title="${reasonText}">${reasonText.length > 50 ? reasonText.substring(0, 50) + '...' : reasonText}</td>
      <td><button class="button info" data-action="see-info">See Info</button></td>
    `;
    requestsGrid.appendChild(tr);
  });

  requestsGrid.querySelectorAll('[data-action="see-info"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tr = btn.closest('tr');
      const id = tr.getAttribute('data-id');

      // Mark as seen in database and remove notification dot immediately
      const notificationDot = tr.querySelector('.notification-dot');
      if (notificationDot) {
        notificationDot.remove();
      }

      // Mark as seen in database (async, don't await to avoid blocking UI)
      markRequestAsSeen(id);

      const snap = docs.find((x) => x.id === id);
      const data = snap ? snap.data() : {};
      openModal(data, id);
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


signOutBtn.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'index.html';
});

async function openModal(data, requestId) {
  if (!modal || !modalContent) return;

  const role = await getCurrentUserRole();
  modalContent.innerHTML = formatRequestDataForRole(data, role);

  // Mark this request as seen when modal opens
  if (requestId) {
    markRequestAsSeen(requestId);
  }

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


