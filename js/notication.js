/**
 * notication.js（通知管理）
 * ★トップ階層 Notic(es) ではなく、Classes/{classId}/Notices/current に統一
 */
import { db } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc,
  onSnapshot, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.target);
      if (target) target.classList.add("active");
    });
  });

  loadNoticeList();

  document.getElementById("addNotice")?.addEventListener("click", addNotice);
});

// classId
const url = new URL(location.href);
const classId = url.searchParams.get("classId") ?? (window.g24_22 ?? "g24_22");

// Classes配下へ
const noticeRef = doc(db, "Classes", classId, "Notices", "current");

function loadNoticeList() {
  onSnapshot(noticeRef, (snap) => {
    const ul = document.getElementById("noticeList");
    if (!ul) return;

    ul.innerHTML = "";
    if (!snap.exists()) return;

    const list = snap.data().notices || [];
    list
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach((i) => {
        const d = new Date(i.date);
        const md = `${d.getMonth() + 1}/${d.getDate()}`;
        const li = document.createElement("li");
        li.innerHTML = `
          <div><span>${md}：${escapeHtml(i.text)}</span></div>
          <button onclick='deleteNotice("${i.date}")'>削除</button>
        `;
        ul.appendChild(li);
      });
  });
}

async function addNotice() {
  const t = document.getElementById("noticeText")?.value?.trim();
  if (!t) return alert("入力してください");

  const newItem = { text: t, date: new Date().toISOString() };

  const snap = await getDoc(noticeRef);
  if (snap.exists()) {
    await updateDoc(noticeRef, { notices: arrayUnion(newItem) });
  } else {
    await setDoc(noticeRef, { notices: [newItem] });
  }

  const el = document.getElementById("noticeText");
  if (el) el.value = "";
}

async function deleteNotice(dateKey) {
  const snap = await getDoc(noticeRef);
  if (!snap.exists()) return;

  const list = snap.data().notices || [];
  const target = list.find((n) => n.date === dateKey);
  if (!target) return;

  await updateDoc(noticeRef, { notices: arrayRemove(target) });
}

window.addNotice = addNotice;
window.deleteNotice = deleteNotice;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[m]));
}
