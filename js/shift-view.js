/**
 * shift-view.js
 * view 側（シフト閲覧）
 * Classes/{classId}/Shifts/current をリアルタイム取得して表示
 */
import { db } from "./firebase.js";
import { onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

const url = new URL(location.href);
const classId = url.searchParams.get("classId") ?? (window.g24_22 ?? "g24_22");
const ref = doc(db, "Classes", classId, "Shifts", "current");

onSnapshot(ref, (snap) => {
  const area = document.getElementById("shiftArea");
  if (!area) return;

  if (!snap.exists()) {
    area.textContent = "シフトはまだ登録されていません。";
    return;
  }

  const headers = Array.isArray(snap.data().headers) ? snap.data().headers : [];
  const rows = Array.isArray(snap.data().rows) ? snap.data().rows : [];

  if (rows.length === 0) {
    area.textContent = "データがありません。";
    return;
  }

  const cols = Array.isArray(rows[0].members) ? rows[0].members.length : 0;

  const table = document.createElement("table");

  const trHead = document.createElement("tr");
  trHead.innerHTML = "<th>時間</th>";
  for (let i = 0; i < cols; i++) {
    const name = (typeof headers[i] === "string" && headers[i].trim()) ? headers[i].trim() : `メンバー${i + 1}`;
    trHead.innerHTML += `<th>${name}</th>`;
  }
  table.appendChild(trHead);

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.time || ""}</td>`;
    for (let i = 0; i < cols; i++) {
      const v = r.members?.[i] ?? "";
      tr.innerHTML += `<td>${v || "／"}</td>`;
    }
    table.appendChild(tr);
  });

  area.innerHTML = "";
  area.appendChild(table);
});
