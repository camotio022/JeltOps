// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBVoek-09NfSNaMf_SL3FIvLZ5Pxy2AbqA",
  authDomain: "jeltops.firebaseapp.com",
  databaseURL: "https://jeltops-default-rtdb.firebaseio.com",
  projectId: "jeltops",
  storageBucket: "jeltops.firebasestorage.app",
  messagingSenderId: "355575022658",
  appId: "1:355575022658:web:90ac2878b1d39baf4d99db",
  measurementId: "G-RRQ4S6VB27"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);