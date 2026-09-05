// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBPyCYRfveDweaKMTISLQBi3tyaoEm88FM",
  authDomain: "mirutina-aa557.firebaseapp.com",
  projectId: "mirutina-aa557",
  storageBucket: "mirutina-aa557.firebasestorage.app",
  messagingSenderId: "1049503803358",
  appId: "1:1049503803358:web:cb9e17bde4c3dcf3905f4f",
  measurementId: "G-M7Z4NX4BVN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
