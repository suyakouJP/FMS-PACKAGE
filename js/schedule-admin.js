/**
 * schedule-admin.js
 * 管理画面：スケジュール管理（追加・削除・一覧）
 * 保存先：Classes/{classId}/Schedules
 *
 * 対応HTML ID:
 * - #scheduleDate (input type="date")
 * - #scheduleDetail (input text)
 * - #addSchedule (button)
 * - #scheduleList (ul)
 *
 * 重要：
 * - CSSを壊さないため、原則 inline style は入れない
 * - li内の構造は「日付」「本文」「削除ボタン」だけ（必要ならCSSで整形）
 */

import { db } from "./firebase.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy,
  serverTimestamp, Timestamp
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

function formatJaDate(dateObj) {
  try {
    return dateObj.toLocaleDateString("ja-JP");
  } catch {
    return "";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const classId = resolveClassId();
  const schedulesCol = collection(db, "Classes", classId, "Schedules");
  const q = query(schedulesCol, orderBy("date", "asc"));

  const dateEl = document.getElementById("scheduleDate");
  const detailEl = document.getElementById("scheduleDetail");
  const addBtn = document.getElementById("addSchedule");
  const listEl = document.getElementById("scheduleList");

  if (!dateEl || !detailEl || !addBtn || !listEl) {
    console.warn("[schedule-admin] missing DOM:", {
      scheduleDate: !!dateEl,
      scheduleDetail: !!detailEl,
      addSchedule: !!addBtn,
      scheduleList: !!listEl,
    });
    return;
  }

  console.log("[schedule-admin] loaded / classId =", classId, "/ path =", schedulesCol.path);

  // ---- 一覧購読 ----
  onSnapshot(
    q,
    (snap) => {
      // まず全消し（CSSはそのまま）
      listEl.innerHTML = "";

      if (snap.size === 0) {
        const li = document.createElement("li");
        li.textContent = "スケジュールがまだありません。";
        listEl.appendChild(li);
        return;
      }

      snap.forEach((ds) => {
        const d = ds.data();

        // Timestamp 想定
        const dateObj = d.date?.toDate ? d.date.toDate() : null;
        const dateStr = dateObj ? formatJaDate(dateObj) : "";

        const text = d.text ?? "";

        // li構造（CSSでいじれるように class 付けるだけ）
        const li = document.createElement("li");
        li.className = "schedule-item";

        li.innerHTML = `
          <div class="schedule-meta">
            <div class="schedule-date"><strong>${escapeHtml(dateStr)}</strong></div>
            <div class="schedule-text">${escapeHtml(text)}</div>
          </div>
          <button type="button" class="schedule-delete" data-id="${ds.id}">削除</button>
        `;

        li.querySelector(".schedule-delete")?.addEventListener("click", async () => {
          try {
            await deleteDoc(doc(db, "Classes", classId, "Schedules", ds.id));
          } catch (e) {
            console.error("[schedule-admin] delete error:", e);
            alert("削除に失敗しました（権限/通信）");
          }
        });

        listEl.appendChild(li);
      });
    },
    (err) => {
      console.error("[schedule-admin] onSnapshot error:", err);
      alert("スケジュールの読み込みに失敗しました（権限/通信）");
    }
  );

  // ---- 追加 ----
  addBtn.addEventListener("click", async (e) => {
    e.preventDefault(); // form事故保険

    const dateStr = String(dateEl.value || "");   // "YYYY-MM-DD"
    const text = String(detailEl.value || "").trim();

    if (!dateStr || !text) {
      alert("日付と内容を入力してください。");
      return;
    }

    // date input はローカル日付。0:00固定で Timestamp 化
    const date = new Date(`${dateStr}T00:00:00`);

    try {
      await addDoc(schedulesCol, {
        text,
        date: Timestamp.fromDate(date),
        created_at: serverTimestamp(),
      });

      detailEl.value = "";
    } catch (e2) {
      console.error("[schedule-admin] add error:", e2);
      alert("追加に失敗しました（権限/通信）");
    }
  });
});
