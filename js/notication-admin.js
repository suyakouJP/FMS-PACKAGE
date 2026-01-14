/**
 * notication-admin.js（通知管理）
 * 保存先：Classes/{classId}/Notices/current
 *
 * 対応HTML ID:
 * - #noticeText (textarea)
 * - #addNotice  (button)
 * - #noticeList (ul)
 *
 * 重要：
 * - CSSを壊さないため、inline style は入れない
 * - liの中身はシンプルに（日付＋本文＋削除ボタン）
 */

import { db } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc,
  onSnapshot, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

function resolveClassId() {
  const url = new URL(location.href);
  const cid =
    url.searchParams.get("classId")
    ?? localStorage.getItem("classId");

  if (!cid) {
    alert("クラス情報が取得できません。ログインし直してください。");
    location.href = "login.html";
    throw new Error("classId missing");
  }
  return cid;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[m]));
}

function formatMD(dateIso) {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const classId = resolveClassId();
  const noticeRef = doc(db, "Classes", classId, "Notices", "current");

  const textEl = document.getElementById("noticeText");
  const addBtn = document.getElementById("addNotice");
  const listEl = document.getElementById("noticeList");

  if (!textEl || !addBtn || !listEl) {
    console.warn("[notice-admin] missing DOM:", {
      noticeText: !!textEl,
      addNotice: !!addBtn,
      noticeList: !!listEl,
    });
    return;
  }

  console.log("[notice-admin] loaded / classId =", classId, "/ path =", noticeRef.path);

  // ---- 一覧購読 ----
  onSnapshot(
    noticeRef,
    (snap) => {
      listEl.innerHTML = "";

      if (!snap.exists()) {
        const li = document.createElement("li");
        li.textContent = "お知らせがまだありません。";
        listEl.appendChild(li);
        return;
      }

      const list = snap.data().notices || [];
      if (list.length === 0) {
        const li = document.createElement("li");
        li.textContent = "お知らせがまだありません。";
        listEl.appendChild(li);
        return;
      }

      // 新しい順
      list
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach((item) => {
          const li = document.createElement("li");
          li.className = "notice-item";

          const md = formatMD(item.date);
          const text = item.text ?? "";

          li.innerHTML = `
            <div class="notice-meta">
              <span class="notice-date">${escapeHtml(md)}</span>
              <span class="notice-text">${escapeHtml(text)}</span>
            </div>
            <button type="button" class="notice-delete" data-date="${escapeHtml(item.date)}">削除</button>
          `;

          li.querySelector(".notice-delete")?.addEventListener("click", async () => {
            try {
              const now = await getDoc(noticeRef);
              if (!now.exists()) return;

              const arr = now.data().notices || [];
              const target = arr.find(n => n.date === item.date);
              if (!target) return;

              await updateDoc(noticeRef, { notices: arrayRemove(target) });
            } catch (e) {
              console.error("[notice-admin] delete error:", e);
              alert("削除に失敗しました（権限/通信）");
            }
          });

          listEl.appendChild(li);
        });
    },
    (err) => {
      console.error("[notice-admin] onSnapshot error:", err);
      alert("お知らせの読み込みに失敗しました（権限/通信）");
    }
  );

  // ---- 追加 ----
  addBtn.addEventListener("click", async (e) => {
    e.preventDefault(); // form事故保険

    const t = textEl.value.trim();
    if (!t) {
      alert("入力してください");
      return;
    }

    const newItem = { text: t, date: new Date().toISOString() };

    try {
      const snap = await getDoc(noticeRef);
      if (snap.exists()) {
        await updateDoc(noticeRef, { notices: arrayUnion(newItem) });
      } else {
        await setDoc(noticeRef, { notices: [newItem] });
      }

      textEl.value = "";
    } catch (e2) {
      console.error("[notice-admin] add error:", e2);
      alert("追加に失敗しました（権限/通信）");
    }
  });
});
