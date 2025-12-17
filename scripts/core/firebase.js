// Firebase initialization module for web (ESM via CDN)
// Exports initialized app, auth, and firestore instances

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAOsYPHYAuKRkrr8i4tGsqYe59fu-e9Ofg",
  authDomain: "monitoring-system-98351.firebaseapp.com",
  projectId: "monitoring-system-98351",
  storageBucket: "monitoring-system-98351.firebasestorage.app",
  messagingSenderId: "1088247137351",
  appId: "1:1088247137351:web:9d79de9ea17e131db69d62",
  measurementId: "G-5J1VRFS9BG"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);


