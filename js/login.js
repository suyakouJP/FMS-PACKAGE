// js/login.js

import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { sha256 } from "./crypto.js";

document.addEventListener("DOMContentLoaded", () => {
  /* ===========================
     ログイン画面に来たら状態リセット
     =========================== */
  localStorage.removeItem("classId");
  localStorage.removeItem("userId");
  localStorage.removeItem("role");

  // ===== DOM参照（先に全部取る） =====
  const modal = document.getElementById("modal");
  const openModal = document.getElementById("openModal");
  const closeModal = document.getElementById("closeModal");

  const createBtn = document.getElementById("createBtn");
  const newClassId = document.getElementById("newClassId");
  const newClassPw = document.getElementById("newClassPw");
  const iinCount = document.getElementById("iinCount");

  const classSelect = document.getElementById("classSelect");
  const passwordEl = document.getElementById("password");
  const userIdEl = document.getElementById("userId");
  const loginBtn = document.getElementById("loginBtn");

  // ===== モーダル開閉 =====
  openModal?.addEventListener("click", () => {
    if (modal) modal.style.display = "flex";
  });
  closeModal?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });

  // ===== クラス一覧ロード（初回） =====
  loadClassesToSelect();

  /* ===========================
     クラス作成（Admins初期発行）
     =========================== */
  createBtn?.addEventListener("click", async () => {
    const cid = newClassId?.value.trim();
    const pw = newClassPw?.value.trim();
    const cnt = Number(iinCount?.value);

    if (!cid || !pw || cnt < 1) {
      alert("すべての項目を入力してください");
      return;
    }
    if (cnt > 10) {
      alert("委員数は10名までです！");
      return;
    }
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(cid)) {
      alert("クラスIDは英数字・_・- のみ使用できます");
      return;
    }

    try {
      console.log("CREATE STEP 1:", { cid, cnt });

      await setDoc(doc(db, "Classes", cid), {
        iinCount: cnt,
        createdAt: serverTimestamp()
      });

      const batch = writeBatch(db);
      const pwHash = await sha256(pw);

      for (let i = 1; i <= cnt; i++) {
        const uid = "user" + (i < 10 ? "0" + i : i);
        batch.set(doc(db, "Classes", cid, "Admins", uid), {
          passwordHash: pwHash,
          mustChangePassword: true,
          created_at: serverTimestamp(),
        });
      }

      await batch.commit();
      console.log("CREATE STEP 2: Admins created");

      alert(`作成完了！ ユーザーIDは user01 ～ user${cnt < 10 ? "0" + cnt : cnt}`);
      if (modal) modal.style.display = "none";
      loadClassesToSelect();

    } catch (e) {
      console.error("CREATE FAILED:", e);
      alert("作成失敗: " + (e.code ?? e.message));
    }
  });

  /* ===========================
     ログイン（Admins）
     =========================== */
  loginBtn?.addEventListener("click", async () => {
    const cid = classSelect?.value;
    const userId = userIdEl?.value.trim();
    const pw = passwordEl?.value.trim();

    if (!cid || !userId || !pw) {
      alert("全て入力してください");
      return;
    }

    try {
      const adminRef = doc(db, "Classes", cid, "Admins", userId);
      const snap = await getDoc(adminRef);

      if (!snap.exists()) {
        alert("そのユーザーは存在しません");
        return;
      }

      const hash = await sha256(pw);
      if (snap.data().passwordHash !== hash) {
        alert("パスワードが違います");
        return;
      }

      // ★ 正しい状態を保存
      localStorage.setItem("classId", cid);
      localStorage.setItem("userId", userId);
      localStorage.setItem("role", "admin");

      location.href = "admin.html";

    } catch (e) {
      console.error(e);
      alert("ログインエラー");
    }
  });
});

/* ===========================
   クラス一覧取得
   =========================== */
async function loadClassesToSelect() {
  const classSelect = document.getElementById("classSelect");
  if (!classSelect) return;

  classSelect.innerHTML = `<option value="">クラス選択</option>`;

  try {
    const qSnap = await getDocs(collection(db, "Classes"));
    qSnap.forEach(d => {
      classSelect.innerHTML += `<option value="${d.id}">${d.id}</option>`;
    });
  } catch (e) {
    console.error(e);
    alert("クラス一覧が取得できません");
  }
}
