import { auth, db } from '../core/firebase.js';
import { createUserWithEmailAndPassword, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

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

async function handleSignupSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const fullName = form.querySelector('#fullName').value.trim();
  const email = form.querySelector('#signupEmail').value.trim();
  const password = form.querySelector('#signupPassword').value;
  const confirmPassword = form.querySelector('#confirmPassword').value;

  showError(form, '');

  if (!fullName) {
    showError(form, 'Please enter your full name.');
    return;
  }
  if (password.length < 6) {
    showError(form, 'Password must be at least 6 characters.');
    return;
  }
  if (password !== confirmPassword) {
    showError(form, 'Passwords do not match.');
    return;
  }

  setFormDisabled(form, true);

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });
    const userRef = doc(db, 'users', cred.user.uid);
    await setDoc(userRef, {
      uid: cred.user.uid,
      email,
      fullName,
      role: 'residence',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    window.location.href = 'index.html?signup=success';
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
    case 'auth/email-already-in-use':
      return 'This email is already in use.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 6 characters).';
    default:
      return 'Unable to create your account right now.';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.auth-form');
  if (form) {
    form.addEventListener('submit', handleSignupSubmit);
  }
});


