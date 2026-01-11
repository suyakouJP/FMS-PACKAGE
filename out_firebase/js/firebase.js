/**
 * firebase.js
 * Firebase 初期化専用
 * initializeApp / Firestore(db) を生成して export する
 * ※ このファイル以外で Firebase を初期化しない
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// Firebase configuration（Webアプリ設定）
const firebaseConfig = {
  apiKey: "AIzaSyCTTMWWeICODJw9bgpQAY05aDq2auzwoWI",
  authDomain: "bunkasai-app.firebaseapp.com",
  projectId: "bunkasai-app",
  storageBucket: "bunkasai-app.firebasestorage.app",
  messagingSenderId: "558571432703",
  appId: "1:558571432703:web:99e715ba0471ff8b06baca"
};

// Firebase 初期化（1回だけ）
const app = initializeApp(firebaseConfig);

// Firestore を export
export const db = getFirestore(app);
