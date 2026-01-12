import { protectPage } from '../core/role-guard.js';
import { auth, db } from '../core/firebase.js';
import { signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { collection, onSnapshot, orderBy, query, updateDoc, doc, serverTimestamp, where, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUserRole, formatRequestDataForRole, escapeHtml } from '../core/role-utils.js';

// --- CLOUDINARY CONFIGURATION ---
const CLOUDINARY_CLOUD_NAME = 'dimiumaxg';
const CLOUDINARY_PRESET = 'project update';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// --- HARDCODED CONTRACTOR DETAILS ---
// ONLY Contractor Name and Address will be saved to the database.
const DEFAULT_CONTRACTOR = {
  contractorName: "JFR CONSTRUCTION INC.",
  contractorAddress: "17 BLISS CANLAPWAS, CATBALOGAN CITY, SAMAR"
};

protectPage(['engineer']);

const signOutBtn = document.getElementById('signOutBtn');
const requestsGrid = document.getElementById('requestsGrid');
const filterChips = Array.from(document.querySelectorAll('.brgy-chip[data-filter]'));

// Modal Elements
const modal = document.getElementById('projectModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalContent = document.getElementById('modalContent');
const imageGallery = document.getElementById('imageGallery');
const certificateGallery = document.getElementById('certificateGallery');

// Form Elements
const projectStatus = document.getElementById('projectStatus');
const projectProgress = document.getElementById('projectProgress');
const proofImageInput = document.getElementById('proofImage');
const certificateImageInput = document.getElementById('certificateImage');
const certificateSection = document.getElementById('certificateSection');
const updateProjectBtn = document.getElementById('updateProjectBtn');
const projectNotes = document.getElementById('projectNotes');

// Certificate section toggle based on status
if (projectStatus) {
  projectStatus.addEventListener('change', () => {
    if (certificateSection) {
      if (projectStatus.value === 'finished') {
        certificateSection.style.display = 'block';
        if (certificateImageInput) certificateImageInput.required = true;
      } else {
        certificateSection.style.display = 'none';
        if (certificateImageInput) certificateImageInput.required = false;
      }
    }
  });
}

// Expense/Financial Elements
const expensesList = document.getElementById('expensesList');
const expenseAmount = document.getElementById('expenseAmount');
const expenseDate = document.getElementById('expenseDate');
const expenseNote = document.getElementById('expenseNote');

let unsubscribe = null;
let currentProjectId = null;
let dataCache = {};

// --- HELPER: Upload to Cloudinary ---
async function uploadImageToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_PRESET);

  try {
    const response = await fetch(CLOUDINARY_URL, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) throw new Error('Upload failed');
    
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Cloudinary Error:", error);
    return null;
  }
}


function renderRequests(docs) {
  requestsGrid.innerHTML = '';
  if (!docs.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 7;
    emptyCell.textContent = 'No approved projects found.';
    emptyCell.style.color = '#667085';
    emptyCell.style.textAlign = 'center';
    emptyRow.appendChild(emptyCell);
    requestsGrid.appendChild(emptyRow);
    return;
  }
  docs.forEach((d) => {
    const data = d.data();
    const progress = data.progress || 0;
    const projectStatus = data.projectStatus || 'not-started';
    const statusClass = projectStatus === 'in-progress' ? 'status-in-progress' : projectStatus === 'finished' ? 'status-finished' : 'status-approved';
    const statusText = projectStatus === 'in-progress' ? 'In Progress' : projectStatus === 'finished' ? 'Finished' : 'Not Started';
    const budget = data.budget != null ? Number(data.budget) : null;
    const spent = data.amountSpent != null ? Number(data.amountSpent) : 0;
    
    let budgetUsed = '—';
    if (budget && budget > 0) {
      const percent = Math.min(100, Math.round((spent / budget) * 100));
      budgetUsed = `<div style="min-width:90px;">
        <div class="progress-container" style="height:10px; background:#e5e7eb; border-radius:8px;">
          <div class="progress-bar" style="width: ${percent}%; height:100%; background:#f59e42; border-radius:8px;"></div>
        </div>
        <div class="progress-value" style="font-size:12px; color:#667085; text-align:right;">Financial: ${percent}%</div>
      </div>`;
    }
    
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', d.id);
    tr.innerHTML = `
      <td>${escapeHtml(data.title || 'Untitled')}</td>
      <td>${escapeHtml(data.category || 'n/a')}</td>
      <td>${escapeHtml(data.location || 'n/a')}</td>
      <td><span class="status-pill ${statusClass}">${statusText}</span></td>
      <td>
        <div style="min-width:90px;">
          <div class="progress-container" style="height:10px; background:#e5e7eb; border-radius:8px;">
            <div class="progress-bar" style="width: ${progress}%; height:100%; background:#3b82f6; border-radius:8px;"></div>
          </div>
          <div class="progress-value" style="font-size:12px; color:#667085; text-align:right;">Physical: ${progress}%</div>
        </div>
      </td>
      <td>${budgetUsed}</td>
      <td>
        <button class="button primary small" data-action="update">Update</button>
      </td>
    `;
    requestsGrid.appendChild(tr);
  });

  requestsGrid.querySelectorAll('[data-action="update"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tr = btn.closest('tr');
      const id = tr.getAttribute('data-id');
      const snap = docs.find((x) => x.id === id);
      openModal(id, snap ? snap.data() : {});
    });
  });
}

function applyFilterAndRender(docs) {
  const active = document.querySelector('.brgy-chip[data-filter].active');
  const filter = active ? active.getAttribute('data-filter') : 'all';
  const filtered = docs.filter((d) => {
    const data = d.data();
    const projectStatus = data.projectStatus || 'not-started';
    if (filter === 'all') return true;
    return projectStatus === filter;
  });
  renderRequests(filtered);
}

function subscribeToApprovedProjects() {
  const base = collection(db, 'requests');
  const q = query(base, where('isApproved', '==', true), orderBy('createdAt', 'desc'));
  unsubscribe = onSnapshot(q, (snap) => {
    applyFilterAndRender(snap.docs);
  });
}

filterChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    filterChips.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    if (typeof unsubscribe === 'function') {
      unsubscribe();
      subscribeToApprovedProjects();
    }
  });
});

onAuthStateChanged(auth, (user) => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (user) subscribeToApprovedProjects();
});

signOutBtn.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'index.html';
});

// --- OPEN MODAL (Uses role-based display) ---
async function openModal(id, data) {
  currentProjectId = id;
  dataCache[id] = data || {};
  
  const role = await getCurrentUserRole();
  
  // 1. GENERATE READ-ONLY TOP SECTION (using role-based formatter)
  modalContent.innerHTML = formatRequestDataForRole(data, role);

  // 2. FILL FORM INPUTS (Bottom Section)
  projectStatus.value = data.projectStatus || 'not-started';
  projectProgress.value = data.progress || 0;
  if (projectNotes) projectNotes.value = data.notes || '';

  // Handle certificate section visibility
  if (certificateSection && certificateImageInput) {
    if (projectStatus.value === 'finished') {
      certificateSection.style.display = 'block';
      certificateImageInput.required = true;
    } else {
      certificateSection.style.display = 'none';
      certificateImageInput.required = false;
    }
  }

  // Clear inputs
  if (proofImageInput) proofImageInput.value = '';
  if (certificateImageInput) certificateImageInput.value = '';
  if (expenseAmount) expenseAmount.value = '';
  if (expenseDate) expenseDate.value = '';
  if (expenseNote) expenseNote.value = '';

  // Update Labels for Clarity
  const noteLabel = document.querySelector('label[for="expenseNote"]');
  if(noteLabel) noteLabel.textContent = "Particulars / Billing Stage";
  if(expenseNote) expenseNote.placeholder = "e.g., 15% Mobilization, 1st Billing";
  
  const amountLabel = document.querySelector('label[for="expenseAmount"]');
  if(amountLabel) amountLabel.textContent = "Amount Disbursed (₱)";

  // 3. RENDER IMAGES
  imageGallery.innerHTML = '';
  if (data.proofImages && Array.isArray(data.proofImages)) {
    data.proofImages.forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      img.title = "Click to view full size";
      img.onclick = () => window.open(url, '_blank');
      imageGallery.appendChild(img);
    });
  } else {
    imageGallery.innerHTML = '<p style="color:#999; font-size:0.85rem; font-style:italic;">No photos uploaded yet.</p>';
  }

  // 4. RENDER CERTIFICATES
  certificateGallery.innerHTML = '';
  if (data.certificates && Array.isArray(data.certificates) && data.certificates.length > 0) {
    data.certificates.forEach(cert => {
      const img = document.createElement('img');
      img.src = cert.url;
      img.title = `Certificate uploaded on ${new Date(cert.uploadedAt).toLocaleDateString()} - Click to view full size`;
      img.onclick = () => window.open(cert.url, '_blank');
      certificateGallery.appendChild(img);
    });
  } else {
    certificateGallery.innerHTML = '<p style="color:#999; font-size:0.85rem; font-style:italic;">No certificate uploaded yet.</p>';
  }

  // 4. RENDER EXPENSES TABLE
  renderExpenses(Array.isArray(data.expenses) ? data.expenses : []);
  
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  currentProjectId = null;
}

if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// --- MAIN UPDATE LOGIC (Injects Name & Address to DB) ---
updateProjectBtn.addEventListener('click', async () => {
  if (!currentProjectId) return;

  // 1. Disable Button
  const originalBtnText = updateProjectBtn.textContent;
  updateProjectBtn.textContent = 'Saving...';
  updateProjectBtn.disabled = true;

  const status = projectStatus.value;
  const progress = parseInt(projectProgress.value, 10) || 0;
  const existingSpent = (dataCache[currentProjectId] && typeof dataCache[currentProjectId].amountSpent === 'number') ? dataCache[currentProjectId].amountSpent : Number(dataCache[currentProjectId]?.amountSpent) || 0;
  const newExpenseAmount = expenseAmount && expenseAmount.value ? parseFloat(expenseAmount.value) : 0;
  const spent = Math.max(0, existingSpent + (newExpenseAmount > 0 ? newExpenseAmount : 0));
  const notes = projectNotes ? projectNotes.value : '';

  try {
    // 2. Upload Images if Selected
    let uploadedImageUrl = null;
    let uploadedCertificateUrl = null;

    // Upload proof image if selected
    if (proofImageInput.files.length > 0) {
      updateProjectBtn.textContent = 'Uploading Image...';
      const file = proofImageInput.files[0];
      uploadedImageUrl = await uploadImageToCloudinary(file);

      if (!uploadedImageUrl) {
        throw new Error('Image upload failed');
      }
    }

    // Upload certificate if status is finished and certificate is selected
    if (status === 'finished') {
      if (!certificateImageInput.files.length > 0) {
        throw new Error('Certificate of Completion is required when marking project as finished');
      }

      updateProjectBtn.textContent = 'Uploading Certificate...';
      const certificateFile = certificateImageInput.files[0];
      uploadedCertificateUrl = await uploadImageToCloudinary(certificateFile);

      if (!uploadedCertificateUrl) {
        throw new Error('Certificate upload failed');
      }
    }

    // 3. Prepare Payload
    // Automatically inject CONTRACTOR NAME & ADDRESS into the database
    const payload = {
      projectStatus: status,
      progress: progress,
      amountSpent: spent,
      notes: notes,
      updatedAt: serverTimestamp(),
      ...DEFAULT_CONTRACTOR // <--- INJECTS ONLY NAME AND ADDRESS
    };

    // Add Image to Array if uploaded
    if (uploadedImageUrl) {
      payload.proofImages = arrayUnion(uploadedImageUrl);
    }

    // Add Certificate to Array if uploaded
    if (uploadedCertificateUrl) {
      payload.certificates = arrayUnion({
        url: uploadedCertificateUrl,
        uploadedAt: new Date().toISOString(),
        type: 'completion_certificate'
      });
    }

    // Add Financial Record if entered
    const hasExpense = newExpenseAmount > 0 || (expenseDate && expenseDate.value) || (expenseNote && expenseNote.value.trim());
    if (hasExpense && newExpenseAmount > 0) {
      if (!expenseNote.value.trim()) {
        throw new Error('Please describe this disbursement (e.g., 1st Billing).');
      }
      
      payload.expenses = arrayUnion({
        amount: newExpenseAmount,
        date: expenseDate && expenseDate.value ? expenseDate.value : new Date().toISOString().slice(0, 10),
        note: expenseNote && expenseNote.value ? expenseNote.value.trim() : 'Unspecified disbursement'
      });
    }

    // 4. Update Firestore
    await updateDoc(doc(db, 'requests', currentProjectId), payload);
    
    closeModal();
  } catch (error) {
    console.error('Error updating project:', error && error.message, error);
    alert('Failed to update: ' + error.message);
  } finally {
    // 5. Reset Button
    updateProjectBtn.textContent = originalBtnText;
    updateProjectBtn.disabled = false;
  }
});

function renderExpenses(expenses) {
  if (!expensesList) return;
  expensesList.innerHTML = '';
  if (!expenses || expenses.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'No disbursements recorded yet.';
    td.style.color = '#667085';
    td.style.textAlign = 'center';
    tr.appendChild(td);
    expensesList.appendChild(tr);
    return;
  }
  const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });
  expenses
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .forEach((e) => {
      const tr = document.createElement('tr');
      const dateStr = e.date ? new Date(e.date).toLocaleDateString() : '—';
      const amountStr = typeof e.amount === 'number' ? peso.format(e.amount) : '—';
      tr.innerHTML = `
        <td>${escapeHtml(dateStr)}</td>
        <td>${escapeHtml(amountStr)}</td>
        <td>${escapeHtml(e.note || '')}</td>
      `;
      expensesList.appendChild(tr);
    });
}