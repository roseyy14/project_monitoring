import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

export function protectPage(allowedRoles) {
  const normalized = (allowedRoles || []).map((r) => String(r || '').toLowerCase());
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const role = snap.exists() ? String(snap.data().role || '').toLowerCase() : '';
      if (normalized.length > 0 && !normalized.includes(role)) {
        window.location.href = 'index.html';
        return;
      }
    } catch (_err) {
      window.location.href = 'index.html';
    }
  });
}


