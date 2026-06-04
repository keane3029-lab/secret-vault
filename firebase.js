// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDMkUfe-0ecuA1vEXlwAULi_iib6jjXDhc",
  authDomain: "secretvaultpro-c5b5e.firebaseapp.com",
  projectId: "secretvaultpro-c5b5e",
  storageBucket: "secretvaultpro-c5b5e.firebasestorage.app",
  messagingSenderId: "379592440524",
  appId: "1:379592440524:web:73c65829d97ef60750e069",
  measurementId: "G-78H9S3W0CP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
