// Role-based data display utilities
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

let currentUserRole = null;
let roleResolved = false;

// Get current user's role
export async function getCurrentUserRole() {
  if (roleResolved && currentUserRole !== null) {
    return currentUserRole;
  }
  
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        currentUserRole = null;
        roleResolved = true;
        resolve(null);
        return;
      }
      
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const role = snap.exists() ? String(snap.data().role || '').toLowerCase() : null;
        currentUserRole = role;
        roleResolved = true;
        resolve(role);
      } catch (_err) {
        currentUserRole = null;
        roleResolved = true;
        resolve(null);
      }
    });
  });
}

// Helper to escape HTML
export function escapeHtml(str) {
  return String(str).replace(/[&<>"]+/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

// Helper to check if role is barangay (handles variations)
function isBarangayRole(role) {
  if (!role) return false;
  const normalized = String(role).toLowerCase().trim();
  return normalized === 'barangay_official' || 
         normalized === 'barangay official' || 
         normalized === 'baranggay official' || 
         normalized === 'baranggay_official';
}

// Role-based data formatter for modal display
export function formatRequestDataForRole(data, role) {
  const pesoFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });
  const status = (data.isApproved === true) ? 'approved' : (data.isApproved === false && data.status === 'rejected') ? 'rejected' : 'pending';
  
  let html = '';
  
  // === BASIC INFO (All roles see this) ===
  html += `
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
      <div class="detail-label">Status</div>
      <div class="detail-value">${escapeHtml(status)}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Budget</div>
      <div class="detail-value">${data.budget != null ? pesoFormatter.format(data.budget) : '—'}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Details</div>
      <div class="detail-value">${escapeHtml(data.details || '')}</div>
    </div>
  `;
  
  // AIP Document (All roles can see this if available)
  if (data.aipDocument && data.aipDocument.url) {
    const fileIcon = data.aipDocument.format === 'pdf' ? '📄' : 
                     (data.aipDocument.format === 'docx' || data.aipDocument.format === 'doc') ? '📝' : 
                     (data.aipDocument.format === 'xlsx' || data.aipDocument.format === 'xls') ? '📊' : '📎';
    const fileSize = data.aipDocument.size ? `(${(data.aipDocument.size / 1024 / 1024).toFixed(2)} MB)` : '';
    
    html += `
      <div class="detail-row" style="background-color: #f0fdf4; border-left: 3px solid #10b981;">
        <div class="detail-label" style="color:#065f46; font-weight:600;">AIP Document</div>
        <div class="detail-value">
          <a href="${data.aipDocument.url}" target="_blank" rel="noopener noreferrer" 
             style="color: #10b981; text-decoration: none; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">
            <span style="font-size: 1.2em;">${fileIcon}</span>
            <span>${escapeHtml(data.aipDocument.originalName || 'AIP Document')}</span>
            <span style="font-size: 0.85em; color: #6b7280;">${fileSize}</span>
            <span style="font-size: 0.9em;">↗</span>
          </a>
        </div>
      </div>
    `;
  }
  
  // Barangay-specific fields (only for barangay role)
  if (isBarangayRole(role)) {
    if (data.urgency) {
      html += `
        <div class="detail-row">
          <div class="detail-label">Urgency</div>
          <div class="detail-value">${escapeHtml(data.urgency || '')}</div>
        </div>
      `;
    }
    if (data.budgetYear) {
      html += `
        <div class="detail-row">
          <div class="detail-label">Target Budget Year</div>
          <div class="detail-value">${escapeHtml(String(data.budgetYear))}</div>
        </div>
      `;
    }
    if (data.contact) {
      html += `
        <div class="detail-row">
          <div class="detail-label">Contact</div>
          <div class="detail-value">${escapeHtml(data.contact || '—')}</div>
        </div>
      `;
    }
    
    // Show reason for decline if rejected
    if (status === 'rejected' && data.reasonForDecline) {
      html += `
        <div class="detail-row" style="background-color: #fee2e2; margin-top:12px;">
          <div class="detail-label" style="color:#dc2626">Reason for Decline</div>
          <div class="detail-value" style="color:#dc2626; font-weight:bold;">${escapeHtml(data.reasonForDecline)}</div>
        </div>
      `;
    }
  }
  
  // === ENGINEER & ADMIN ONLY (Progress, Financial, Contractor) ===
  if (role === 'engineer' || role === 'admin') {
    const budget = data.budget || 0;
    const spent = data.amountSpent || 0;
    const financialPercentage = budget > 0 ? ((spent / budget) * 100).toFixed(1) : 0;
    
    html += `
      <div class="detail-row" style="background-color: #eff6ff; margin-top:12px;">
        <div class="detail-label" style="color:#3b82f6">Physical Status</div>
        <div class="detail-value" style="color:#3b82f6; font-weight:bold;">${data.progress || 0}% Completed</div>
      </div>
      <div class="detail-row" style="background-color: #fff7ed;">
        <div class="detail-label" style="color:#f59e42">Financial Status</div>
        <div class="detail-value" style="color:#f59e42; font-weight:bold;">${financialPercentage}% Utilized (${pesoFormatter.format(spent)})</div>
      </div>
    `;
    
    // Contractor Details
    const cName = data.contractorName || '—';
    const cAddr = data.contractorAddress || '—';
    const cAmount = data.contractAmount != null ? pesoFormatter.format(data.contractAmount) : null;
    const cDate = data.contractDate || null;
    
    html += `
      <div style="margin-top:12px; padding-top:8px; border-top:1px dashed #e5e7eb;">
        <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#9ca3af; margin-bottom:8px;">Contractor Details</div>
        <div class="detail-row">
          <div class="detail-label">Company Name</div>
          <div class="detail-value">${escapeHtml(cName)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Office Address</div>
          <div class="detail-value" style="font-size:0.85rem;">${escapeHtml(cAddr)}</div>
        </div>
    `;
    
    if (cAmount) {
      html += `
        <div class="detail-row">
          <div class="detail-label">Contract Amount</div>
          <div class="detail-value">${cAmount}</div>
        </div>
      `;
    }
    if (cDate) {
      html += `
        <div class="detail-row">
          <div class="detail-label">Contract Date</div>
          <div class="detail-value">${escapeHtml(cDate)}</div>
        </div>
      `;
    }
    
    html += `</div>`;
  }
  
  // === ADMIN ONLY (Additional fields) ===
  if (role === 'admin') {
    const createdBy = data.createdBy || {};
    html += `
      <div class="modal-section-title" style="margin-top:16px;">Submission Details</div>
      <div class="detail-row">
        <div class="detail-label">Submitted By</div>
        <div class="detail-value">${escapeHtml(createdBy.displayName || createdBy.email || createdBy.uid || 'Unknown')}</div>
      </div>
    `;
    
    if (data.createdAt) {
      const createdAt = data.createdAt.toDate ? data.createdAt.toDate().toLocaleString() : String(data.createdAt);
      html += `
        <div class="detail-row">
          <div class="detail-label">Submitted On</div>
          <div class="detail-value">${escapeHtml(createdAt)}</div>
        </div>
      `;
    }
    
    if (data.updatedAt) {
      const updatedAt = data.updatedAt.toDate ? data.updatedAt.toDate().toLocaleString() : String(data.updatedAt);
      html += `
        <div class="detail-row">
          <div class="detail-label">Last Updated</div>
          <div class="detail-value">${escapeHtml(updatedAt)}</div>
        </div>
      `;
    }
    
    // Show reason for decline if rejected (admin sees this prominently)
    if (status === 'rejected' && data.reasonForDecline) {
      html += `
        <div class="modal-section-title" style="margin-top:16px;">Rejection Details</div>
        <div class="detail-row" style="background-color: #fee2e2;">
          <div class="detail-label" style="color:#dc2626; font-weight:bold;">Reason for Decline</div>
          <div class="detail-value" style="color:#dc2626; font-weight:bold;">${escapeHtml(data.reasonForDecline)}</div>
        </div>
      `;
    } else if (status === 'rejected' && !data.reasonForDecline) {
      html += `
        <div class="modal-section-title" style="margin-top:16px;">Rejection Details</div>
        <div class="detail-row">
          <div class="detail-label">Reason for Decline</div>
          <div class="detail-value" style="font-style:italic; color:#9ca3af;">No reason provided</div>
        </div>
      `;
    }
  }
  
  return html;
}

