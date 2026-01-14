/**
 * view.js
 * view側：お知らせ + 直近一週間のスケジュール表示
 * Notices: Classes/{classId}/Notices/current
 * Schedules: Classes/{classId}/Schedules（date/text）
 */
import { db } from "./firebase.js";
import { doc, collection, onSnapshot, getDoc }
  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

/* ===============================
 * token / classId の確定（View）
 * =============================== */
function getParams() {
  const u = new URL(location.href);
  return {
    token: u.searchParams.get("token"),
    classId: u.searchParams.get("classId"),
  };
}

function isExpired(expiresAt) {
  const expMs =
    typeof expiresAt?.toMillis === "function" ? expiresAt.toMillis()
    : expiresAt instanceof Date ? expiresAt.getTime()
    : null;

  return expMs == null || Date.now() > expMs;
}

async function resolveClassIdForViewOrRedirect() {
  const { token, classId } = getParams();

  // QRから来た（tokenあり）なら token検証
  if (token) {
    if (!classId) {
      alert("QR情報が不正です（classIdなし）。管理画面でView用QRを再発行してください。");
      location.href = "login.html";
      return null;
    }

    const tokenRef = doc(db, "Classes", classId, "Tokens", token);
    const snap = await getDoc(tokenRef);

    if (!snap.exists()) {
      alert("トークンが無効です。管理画面でView用QRを再発行してください。");
      location.href = "login.html";
      return null;
    }

    const t = snap.data();

    if (t.type !== "view") {
      alert("このQRは閲覧用ではありません。View用QRを使用してください。");
      location.href = "login.html";
      return null;
    }

    if (isExpired(t.expiresAt)) {
      alert("トークン期限切れです。管理画面でView用QRを再発行してください。");
      location.href = "login.html";
      return null;
    }

    const resolved = t.classId ?? classId;
    localStorage.setItem("classId", resolved);
    console.log("[VIEW] token ok. resolved classId =", resolved);
    return resolved;
  }

  // token無し：従来どおり localStorage
  const ls = localStorage.getItem("classId");
  if (!ls) {
    location.href = "login.html";
    return null;
  }
  return ls;
}

/*******************************************************
 * ▼ Firestore：お知らせ
 *******************************************************/
function loadNotices(noticeRef) {
  const area = document.querySelector(".notice-body");
  if (!area) return;

  onSnapshot(noticeRef, (snap) => {
    area.innerHTML = "";
    if (!snap.exists()) return;

    const list = snap.data().notices || [];
    list
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6)
      .forEach(item => {
        const chat = document.createElement("div");
        chat.classList.add("chat");

        const img = document.createElement("img");
        img.src = "image/tin.png";

        const bubble = document.createElement("div");
        bubble.classList.add("bubble");
        bubble.textContent = item.text ?? "";

        chat.append(img, bubble);
        area.appendChild(chat);
      });
  });
}

/*******************************************************
 * ▼ Firestore：今日〜7日後
 *******************************************************/
function loadSchedule(schedulesCol) {
  const ul = document.querySelector(".schedule ul");
  if (!ul) return;

  onSnapshot(schedulesCol, (snapshot) => {
    ul.innerHTML = "";

    if (snapshot.empty) {
      ul.innerHTML = "<li>直近の予定はありません</li>";
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 7);
    endDate.setHours(23, 59, 59, 999);

    const schedules = snapshot.docs
      .map(ds => {
        const d = ds.data();
        const dt = d.date?.toDate ? d.date.toDate() : null;
        return { text: d.text ?? "", date: dt };
      })
      .filter(item => item.date && item.date >= today && item.date <= endDate)
      .sort((a, b) => a.date - b.date);

    if (schedules.length === 0) {
      ul.innerHTML = "<li>直近の予定はありません</li>";
      return;
    }

    schedules.forEach(item => {
      const d = item.date;
      const day = ["日","月","火","水","木","金","土"][d.getDay()];

      const li = document.createElement("li");
      li.innerHTML = `
        <span>${d.getMonth() + 1}/${d.getDate()}（${day}）</span>
        ${escapeHtml(item.text)}
      `;
      ul.appendChild(li);
    });
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[m]));
  }
}

// ✅ DOMContentLoadedは1回だけ
document.addEventListener("DOMContentLoaded", async () => {
  const classId = await resolveClassIdForViewOrRedirect();
  if (!classId) return;

  const noticeRef = doc(db, "Classes", classId, "Notices", "current");
  const schedulesCol = collection(db, "Classes", classId, "Schedules");

  loadNotices(noticeRef);
  loadSchedule(schedulesCol);
});

// ===== 文字数に応じてフォントサイズ調整 =====
document.querySelectorAll(".name").forEach(el => {
  const len = el.textContent.trim().length;

  if (len >= 12) {
    el.classList.add("xsmall");
  } else if (len >= 8) {
    el.classList.add("small");
  }
});