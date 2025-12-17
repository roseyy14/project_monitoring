import { auth, db } from '../core/firebase.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

function setFormDisabled(form, disabled) {
  const elements = Array.from(form.elements);
  elements.forEach((el) => {
    el.disabled = disabled;
  });
}

function showError(form, message) {
  let box = form.querySelector('[data-error]');
  if (!box) {
    box = document.createElement('div');
    box.setAttribute('data-error', '');
    box.style.color = '#b00020';
    box.style.marginTop = '8px';
    form.appendChild(box);
  }
  box.textContent = message || '';
}

function showSuccess(form, message) {
  let box = form.querySelector('[data-success]');
  if (!box) {
    box = document.createElement('div');
    box.setAttribute('data-success', '');
    box.style.color = '#0a7a28';
    box.style.marginTop = '8px';
    form.appendChild(box);
  }
  box.textContent = message || '';
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.querySelector('#email').value.trim();
  const password = form.querySelector('#password').value;
  showError(form, '');
  setFormDisabled(form, true);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const snap = await getDoc(doc(db, 'users', uid));
    const role = snap.exists() ? snap.data().role : null;
    redirectByRole(role);
  } catch (err) {
    const friendly = mapAuthError(err);
    showError(form, friendly);
  } finally {
    setFormDisabled(form, false);
  }
}

function mapAuthError(error) {
  const code = error && error.code ? String(error.code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Incorrect email or password.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    default:
      return 'Unable to sign in right now.';
  }
}

function redirectByRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'residence') {
    window.location.href = 'residence.html';
    return;
  }
  if (r === 'admin') {
    window.location.href = 'admin.html';
    return;
  }
  if (r === 'engineer') {
    window.location.href = 'engineer.html';
    return;
  }
  if (r === 'barangay_official' || r === 'baranggay_official' || r === 'barangay official' || r === 'baranggay official') {
    window.location.href = 'barangay.html';
    return;
  }
  window.location.href = 'residence.html';
}

window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const form = document.querySelector('.auth-form');
  if (form) {
    form.addEventListener('submit', handleLoginSubmit);
    if (params.get('signup') === 'success') {
      const note = document.createElement('div');
      note.style.color = '#0a7a28';
      note.style.marginTop = '8px';
      note.textContent = 'Account created. Please sign in.';
      form.appendChild(note);
    }
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      // already signed in; keep on login page unless you want auto-redirect
    }
  });
});


