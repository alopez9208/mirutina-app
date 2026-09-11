import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBPyCYRfveDweaKMTISLQBi3tyaoEm88FM",
  authDomain: "mirutina-aa557.firebaseapp.com",
  projectId: "mirutina-aa557",
  storageBucket: "mirutina-aa557.firebasestorage.app",
  messagingSenderId: "1049503803358",
  appId: "1:1049503803358:web:cb9e17bde4c3dcf3905f4f",
  measurementId: "G-M7Z4NX4BVN",
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Permite que la app siga funcionando (leer y anotar) sin señal,
// sincronizando solo cuando vuelva la conexión. Si hay varias pestañas
// abiertas a la vez, Firestore avisa y desactiva la persistencia ahí,
// eso es normal y no rompe nada.
enableIndexedDbPersistence(db).catch(() => {});
