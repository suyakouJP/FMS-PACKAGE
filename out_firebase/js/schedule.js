/**
 * schedule.js
 * 管理画面：スケジュール管理
 * 保存先：Classes/{classId}/Schedules
 *
 * 対応HTML ID:
 * - #scheduleDate (input type="date")
 * - #scheduleDetail (text)
 * - #addSchedule (button)
 * - #scheduleList (ul)
 */
import { db } from "./firebase.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy,
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const url = new URL(location.href);
  const classId = url.searchParams.get("classId") ?? (window.g24_22 ?? "g24_22");

  const schedulesCol = collection(db, "Classes", classId, "Schedules");

  const dateEl = document.getElementById("scheduleDate");
  const detailEl = document.getElementById("scheduleDetail");
  const addBtn = document.getElementById("addSchedule");
  const listEl = document.getElementById("scheduleList");

  // 一覧（date昇順）
  const q = query(schedulesCol, orderBy("date", "asc"));

  onSnapshot(q, (snap) => {
    if (!listEl) return;
    listEl.innerHTML = "";

    if (snap.size === 0) {
      listEl.innerHTML = "<li>スケジュールがまだありません。</li>";
      return;
    }

    snap.forEach((ds) => {
      const d = ds.data();

      // dateは Timestamp 想定
      const dateObj = d.date?.toDate ? d.date.toDate() : null;
      const dateStr = dateObj ? dateObj.toLocaleDateString("ja-JP") : "";

      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.alignItems = "center";
      li.style.gap = "8px";

      li.innerHTML = `
        <div>
          <div><strong>${dateStr}</strong></div>
          <div>${escapeHtml(d.text ?? "")}</div>
        </div>
        <button data-id="${ds.id}">削除</button>
      `;

      li.querySelector("button")?.addEventListener("click", async () => {
        try {
          await deleteDoc(doc(db, "Classes", classId, "Schedules", ds.id));
        } catch (e) {
          console.error("schedule delete error:", e);
          alert("削除に失敗しました（権限/通信）");
        }
      });

      listEl.appendChild(li);
    });
  });

  // 追加
  addBtn?.addEventListener("click", async () => {
    const dateStr = dateEl?.value;             // "YYYY-MM-DD"
    const text = detailEl?.value?.trim() ?? "";

    if (!dateStr || !text) {
      alert("日付と内容を入力してください。");
      return;
    }

    // date input はローカル日付。0:00固定で Timestamp 化
    const date = new Date(`${dateStr}T00:00:00`);

    try {
      await addDoc(schedulesCol, {
        text,                                 // view側でも使いやすい
        date: Timestamp.fromDate(date),       // 並び替え用
        created_at: serverTimestamp()
      });

      detailEl.value = "";
    } catch (e) {
      console.error("schedule add error:", e);
      alert("追加に失敗しました（権限/通信）");
    }
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[m]));
  }
});
