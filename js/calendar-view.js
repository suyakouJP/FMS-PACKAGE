/**
 * calendar-view.js（閲覧側：テーブル型カレンダー）
 * 読み取り：Classes/{classId}/Schedules
 *
 * 対応HTML ID:
 * - #prevMonth, #nextMonth, #monthYear, #calendarBody
 * - #eventModal, #closeModal, #modalDate, #modalEventList
 *
 * 前提：
 * - URLまたはlocalStorageに classId がある（token解決後に付与される想定）
 * - CSSは既存の calendar.css を利用（JSは壊さない）
 */

import { db } from "./firebase.js";
import {
  collection, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

function resolveClassId() {
  const url = new URL(location.href);
  const cid =
    url.searchParams.get("classId")
    ?? localStorage.getItem("classId");

  if (!cid) {
    alert("無効なURLです（classIdなし）。ログインへ戻ります。");
    location.href = "login.html";
    throw new Error("classId missing");
  }
  return cid;
}

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const classId = resolveClassId();

  // DOM
  const prevBtn = document.getElementById("prevMonth");
  const nextBtn = document.getElementById("nextMonth");
  const titleEl = document.getElementById("monthYear");
  const bodyEl  = document.getElementById("calendarBody");

  const modal = document.getElementById("eventModal");
  const closeModalBtn = document.getElementById("closeModal");
  const modalDateEl = document.getElementById("modalDate");
  const modalListEl = document.getElementById("modalEventList");

  if (!prevBtn || !nextBtn || !titleEl || !bodyEl) {
    console.warn("[calendar-view] missing calendar DOM. abort.");
    return;
  }

  console.log("[calendar-view] loaded / classId =", classId);

  // state
  let current = new Date();
  current.setDate(1);

  let schedules = []; // { id, date: Date, text }

  // modal close
  closeModalBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (modal) modal.style.display = "none";
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  prevBtn.addEventListener("click", (e) => {
    e.preventDefault();
    current.setMonth(current.getMonth() - 1);
    render();
  });

  nextBtn.addEventListener("click", (e) => {
    e.preventDefault();
    current.setMonth(current.getMonth() + 1);
    render();
  });

  const schedulesCol = collection(db, "Classes", classId, "Schedules");
  const q = query(schedulesCol, orderBy("date", "asc"));

  onSnapshot(
    q,
    (snap) => {
      schedules = snap.docs.map(ds => {
        const d = ds.data();
        const dateObj = d.date?.toDate ? d.date.toDate() : null;
        return {
          id: ds.id,
          text: d.text ?? "",
          date: dateObj,
        };
      }).filter(x => x.date instanceof Date && !Number.isNaN(x.date.getTime()));

      render();
    },
    (err) => {
      console.error("[calendar-view] onSnapshot error:", err);
      alert("スケジュールの読み込みに失敗しました（権限/通信）");
    }
  );

  function render() {
    // title
    titleEl.textContent = `${current.getFullYear()}年${current.getMonth() + 1}月`;

    // map by day
    const map = new Map(); // "YYYY-MM-DD" -> [{text,...}]
    for (const s of schedules) {
      const key = toKey(s.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }

    // month range
    const first = new Date(current.getFullYear(), current.getMonth(), 1);
    const last  = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    const startDow = first.getDay();

    // clear
    bodyEl.innerHTML = "";

    const totalCells = startDow + last.getDate();
    const rows = Math.ceil(totalCells / 7);

    let dayNum = 1;

    for (let r = 0; r < rows; r++) {
      const tr = document.createElement("tr");

      for (let c = 0; c < 7; c++) {
        const td = document.createElement("td");

        // 1行目の空白
        if (r === 0 && c < startDow) {
          tr.appendChild(td);
          continue;
        }

        // 月末超え
        if (dayNum > last.getDate()) {
          tr.appendChild(td);
          continue;
        }

        const date = new Date(first.getFullYear(), first.getMonth(), dayNum);
        const key = toKey(date);
        const items = map.get(key) ?? [];

        // 日付表示（見た目はCSS任せ）
        const dayDiv = document.createElement("div");
        dayDiv.textContent = String(dayNum);

        td.appendChild(dayDiv);
        
        // 予定がある日は丸バッジ表示
        if (items.length > 0) {
            const badge = document.createElement("span");
            badge.className = "event-count";   // ← 既存CSSを使用
            badge.textContent = items.length;
            td.appendChild(badge);
        }


        // 今日ハイライト（classだけ付与。CSSで装飾できる）
        const todayKey = toKey(new Date());
        if (key === todayKey) td.classList.add("today");

        // クリックでモーダル
        td.style.cursor = "pointer";
        td.addEventListener("click", () => openModal(date, items));

        tr.appendChild(td);
        dayNum++;
      }

      bodyEl.appendChild(tr);
    }
  }

  function openModal(date, items) {
    if (!modal || !modalDateEl || !modalListEl) return;

    modalDateEl.textContent = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    modalListEl.innerHTML = "";

    if (!items || items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "予定がありません。";
      modalListEl.appendChild(li);
    } else {
      items.forEach(it => {
        const li = document.createElement("li");
        li.textContent = it.text;
        modalListEl.appendChild(li);
      });
    }

    modal.style.display = "flex";
  }
});
