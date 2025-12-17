import { protectPage } from '../core/role-guard.js';
import { auth, db } from '../core/firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

// --- PAGE SETUP ---
protectPage(['barangay_official', 'barangay official', 'baranggay official', 'baranggay_official']);

// --- CONSTANTS ---
// We can define these at the top level because the script is at the end of the <body>
const form = document.getElementById('requestForm');
const signOutBtn = document.getElementById('signOutBtn');
const budgetYearSelect = document.getElementById('budgetYear');
let currentUser = null;

// --- FUNCTIONS ---

/**
 * Populates the year dropdown with the next 5 years
 */
function populateYearOptions() {
  if (!budgetYearSelect) return; 

  while (budgetYearSelect.options.length > 1) {
    budgetYearSelect.remove(1); 
  }
  
  const nextYear = new Date().getFullYear() + 1; 
  for (let i = 0; i < 5; i++) {
    const year = nextYear + i;
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    budgetYearSelect.appendChild(option);
  }
}

/**
 * Disables or enables all form elements.
 */
function setDisabled(disabled) {
  if (!form) return;
  Array.from(form.elements).forEach((el) => (el.disabled = disabled));
}

/**
 * Shows an error message in the form.
 */
function showError(msg) {
  if (!form) return;
  const el = form.querySelector('[data-error]');
  if (el) {
    el.style.color = '#b00020';
    el.textContent = msg || '';
  }
}

/**
 * Shows a success message in the form.
 */
function showSuccess(msg) {
  if (!form) return;
  const el = form.querySelector('[data-success]');
  if (el) {
    el.style.color = '#0a7a28';
    el.textContent = msg || '';
  }
}

// --- INITIALIZATION & EVENT LISTENERS ---

// 1. Populate the dropdown on page load
populateYearOptions();

// 2. Set up auth listener
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
});

// 3. Set up form listener
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    showSuccess('');

    // Get all form values
    const title = form.title.value.trim();
    const category = form.category.value;
    const location = form.location.value.trim();
    const urgency = form.urgency.value;
    const budgetYear = form.budgetYear.value; 
    const budget = form.budget.value ? Number(form.budget.value) : null;
    const details = form.details.value.trim();
    const contact = form.contact.value.trim();

    if (!title || !category || !location || !urgency || !details || !budgetYear) {
      showError('Please fill in all required fields.');
      return;
    }
    if (!currentUser) {
      showError('You must be signed in to submit a request.');
      return;
    }

    setDisabled(true);
    try {
      await addDoc(collection(db, 'requests'), {
        title, category, location, urgency, budgetYear, budget, details, contact,
        isApproved: false,
        status: 'pending_approval',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: {
          uid: currentUser.uid,
          email: currentUser.email || null,
          displayName: currentUser.displayName || null
        }
      });
      showSuccess('Request submitted for approval.');
      form.reset();
      populateYearOptions(); // <-- Re-populate after reset
    } catch (err) {
      console.error('Failed to submit request:', err);
      showError('Failed to submit request. Please try again.');
    } finally {
      setDisabled(false);
    }
  });
}

// 4. Set up sign-out listener
if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });
}