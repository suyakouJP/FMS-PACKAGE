/**
 * calendar-admin.js（管理画面：月カレンダー表示）
 * 読み取り：Classes/{classId}/Schedules（schedule-admin.jsと同じ）
 *
 * 必須HTML ID:
 * - #calPrev   (button) 前月
 * - #calNext   (button) 次月
 * - #calTitle  (div/span) 例: 2026年1月
 * - #calGrid   (div) カレンダー本体（Gridで描画）
 *
 * 任意:
 * - #calList   (ul) 選択日の予定一覧（無ければ表示スキップ）
 *
 * 方針：
 * - admin専用（viewでは使わない）
 * - classIdは URL → localStorage。無ければ loginへ
 * - CSSを壊さないため、inline style は最小限（Grid成立に必要な分だけ）
 */

import { db } from "./firebase.js";
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

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

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const classId = resolveClassId();
  const schedulesCol = collection(db, "Classes", classId, "Schedules");
  const q = query(schedulesCol, orderBy("date", "asc"));

  // DOM
  const prevBtn = document.getElementById("calPrev");
  const nextBtn = document.getElementById("calNext");
  const titleEl = document.getElementById("calTitle");
  const gridEl  = document.getElementById("calGrid");

  if (!titleEl || !gridEl) {
    console.warn("[calendar-admin] missing calTitle/calGrid. admin.htmlにカレンダータブ未追加の可能性");
    return;
  }

  console.log("[calendar-admin] loaded / classId =", classId, "/ path =", schedulesCol.path);

  // state
  let current = new Date();
  current.setDate(1);

  let schedules = [];      // { id, text, date: Date }
  let selectedKey = null;  // "YYYY-MM-DD"

  prevBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    current.setMonth(current.getMonth() - 1);
    render();
  });

  nextBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    current.setMonth(current.getMonth() + 1);
    render();
  });

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

      if (!selectedKey) selectedKey = toKey(new Date());
      render();
    },
    (err) => {
      console.error("[calendar-admin] onSnapshot error:", err);
      alert("カレンダーの読み込みに失敗しました（権限/通信）");
    }
  );

  function buildMap() {
    const map = new Map(); // key -> [{...}]
    for (const s of schedules) {
      const key = toKey(s.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }

  function render() {
    const map = buildMap();

    // title
    titleEl.textContent = `${current.getFullYear()}年${current.getMonth() + 1}月`;

    // month range
    const first = new Date(current.getFullYear(), current.getMonth(), 1);
    const last  = new Date(current.getFullYear(), current.getMonth() + 1, 0);

    // grid base（最低限のレイアウトだけ）
    gridEl.innerHTML = "";
    gridEl.style.display = "grid";
    gridEl.style.gridTemplateColumns = "repeat(7, 1fr)";
    gridEl.style.gap = "8px";

    // weekday header
    const w = ["日", "月", "火", "水", "木", "金", "土"];
    for (let i = 0; i < 7; i++) {
      const h = document.createElement("div");
      h.className = "cal-weekday";
      h.textContent = w[i];
      gridEl.appendChild(h);
    }

    // blanks
    const startDow = first.getDay();
    for (let i = 0; i < startDow; i++) {
      const blank = document.createElement("div");
      blank.className = "cal-blank";
      gridEl.appendChild(blank);
    }

    // days
    for (let day = 1; day <= last.getDate(); day++) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const key = toKey(date);
      const items = map.get(key) ?? [];

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cal-cell";
      cell.dataset.key = key;

      // ラベル（CSSで整えやすいようにdiv構造だけ）
      const top = document.createElement("div");
      top.className = "cal-top";

      const dayEl = document.createElement("div");
      dayEl.className = "cal-day";
      dayEl.textContent = String(day);

      const badge = document.createElement("div");
      badge.className = "cal-badge";
      badge.textContent = items.length > 0 ? String(items.length) : "";

      top.appendChild(dayEl);
      top.appendChild(badge);

      const preview = document.createElement("div");
      preview.className = "cal-preview";
      preview.textContent = items[0]?.text ?? "";

      cell.appendChild(top);
      cell.appendChild(preview);

      // today/selected
      const todayKey = toKey(new Date());
      if (key === todayKey) cell.classList.add("is-today");
      if (key === selectedKey) cell.classList.add("is-selected");
      if (items.length > 0) cell.classList.add("has-items");

      cell.addEventListener("click", () => {
        selectedKey = key;
        renderSelectedList(map);
        // 選択枠更新だけしたいので軽く再描画
        renderSelectionOnly();
      });

      gridEl.appendChild(cell);
    }

    renderSelectedList(map);
  }

  function renderSelectionOnly() {
    const cells = gridEl.querySelectorAll(".cal-cell");
    cells.forEach((c) => c.classList.toggle("is-selected", c.dataset.key === selectedKey));
  }

  function renderSelectedList(map) {
    const listEl = document.getElementById("calList");
    if (!listEl) return;

    listEl.innerHTML = "";
    const items = map.get(selectedKey) ?? [];

    if (items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "予定がありません。";
      listEl.appendChild(li);
      return;
    }

    items.forEach((it) => {
      const li = document.createElement("li");
      li.className = "cal-list-item";
      li.textContent = it.text;
      listEl.appendChild(li);
    });
  }
});
