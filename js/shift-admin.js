// js/shift-admin.js
import { db } from "./firebase.js";
import {
  doc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

export function initShiftAdmin(classId) {
  const ref = doc(db, "Classes", classId, "Shifts", "current");

  let shiftRows = [];
  let shiftHeaders = [];

  let draftRows = [];
  let draftHeaders = [];

  let dirty = false;

  const table = document.getElementById("shiftTable");
  const saveBtn = document.getElementById("shiftSaveBtn");
  const statusEl = document.getElementById("shiftSaveStatus");

  function ensureMinimum(dataRows, dataHeaders) {
    let rows = Array.isArray(dataRows) && dataRows.length ? dataRows : [{ time: "09:00", members: [""] }];
    if (!Array.isArray(rows[0].members) || rows[0].members.length === 0) rows[0].members = [""];

    const cols = rows[0].members.length;

    let headers = Array.isArray(dataHeaders) ? dataHeaders : [];
    if (headers.length !== cols) {
      headers = Array.from({ length: cols }, (_, i) => (typeof headers[i] === "string" ? headers[i] : ""));
    }

    rows = rows.map(r => ({
      time: r.time ?? "",
      members: Array.from({ length: cols }, (_, i) => (r.members?.[i] ?? ""))
    }));

    return { rows, headers, cols };
  }

  function deepCopyRows(rows) {
    return rows.map(r => ({ time: r.time, members: [...r.members] }));
  }

  function markDirty() {
    dirty = true;
    if (saveBtn) saveBtn.disabled = false;
    if (statusEl) statusEl.textContent = "未保存";
  }

  async function saveShift() {
    if (!dirty) return;

    if (saveBtn) saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = "保存中…";

    try {
      await setDoc(ref, {
        headers: draftHeaders,
        rows: draftRows,
        updated_at: serverTimestamp()
      }, { merge: true });

      audit("SHIFT_SAVE", { classId, rows: draftRows.length, cols: (draftHeaders?.length ?? 0) });

      dirty = false;
      if (statusEl) statusEl.textContent = "保存しました";
    } catch (err) {
      console.error("saveShift error:", err);
      audit("SHIFT_SAVE_FAIL", { classId, error: String(err) });
      if (statusEl) statusEl.textContent = "保存失敗（権限/接続）";
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function renderShift() {
    if (!table) return;
    table.innerHTML = "";

    const { cols } = ensureMinimum(draftRows, draftHeaders);

    const header = document.createElement("tr");
    header.innerHTML = `<th>時間　/　役割</th>`;

    for (let i = 0; i < cols; i++) {
      const th = document.createElement("th");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "member-name-input";
      input.placeholder = `メンバー${i + 1}`;
      input.value = draftHeaders[i] ?? "";

      input.addEventListener("input", () => {
        draftHeaders[i] = input.value;
        markDirty();
      });

      th.appendChild(input);
      header.appendChild(th);
    }
    table.appendChild(header);

    draftRows.forEach((row, rIdx) => {
      const tr = document.createElement("tr");
      tr.setAttribute("draggable", "true");
      tr.dataset.index = rIdx;

      tr.addEventListener("dragstart", dragStart);
      tr.addEventListener("dragover", dragOver);
      tr.addEventListener("drop", dropRow);

      tr.addEventListener("dragenter", (e) => e.currentTarget.classList.add("drag-over"));
      tr.addEventListener("dragleave", (e) => e.currentTarget.classList.remove("drag-over"));

      const tdTime = document.createElement("td");
      const timeInput = document.createElement("input");
      timeInput.type = "time";
      timeInput.value = row.time || "";
      timeInput.draggable = false;

      timeInput.addEventListener("input", () => {
        draftRows[rIdx].time = timeInput.value;
        markDirty();
      });

      tdTime.appendChild(timeInput);
      tr.appendChild(tdTime);

      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "text";
        input.value = row.members[cIdx] || "";
        input.draggable = false;

        input.addEventListener("input", () => {
          draftRows[rIdx].members[cIdx] = input.value;
          markDirty();
        });

        td.appendChild(input);
        tr.appendChild(td);
      }

      table.appendChild(tr);
    });
  }

  function addRow() {
    const { cols } = ensureMinimum(draftRows, draftHeaders);
    draftRows.push({ time: "", members: Array.from({ length: cols }, () => "") });
    markDirty();
    renderShift();
  }

  function addColumn() {
    const { cols } = ensureMinimum(draftRows, draftHeaders);
    draftHeaders.push("");
    draftRows.forEach(r => r.members.push(""));
    markDirty();
    renderShift();
  }

  function deleteRow() {
    if (draftRows.length > 1) {
      draftRows.splice(draftRows.length - 1, 1);
      markDirty();
      renderShift();
    } else {
      alert("行はこれ以上削除できません");
    }
  }

  function deleteColumn() {
    const { cols } = ensureMinimum(draftRows, draftHeaders);
    if (cols > 1) {
      draftHeaders.pop();
      draftRows.forEach(r => r.members.pop());
      markDirty();
      renderShift();
    } else {
      alert("列はこれ以上削除できません");
    }
  }

  let dragStartIndex = null;

  function dragStart(e) {
    dragStartIndex = Number(e.currentTarget.dataset.index);
    try { e.dataTransfer.setData("text/plain", String(dragStartIndex)); } catch (_) {}
  }
  function dragOver(e) { e.preventDefault(); }

  function dropRow(e) {
    e.preventDefault();
    const dropIndex = Number(e.currentTarget.dataset.index);

    if (Number.isNaN(dragStartIndex) || Number.isNaN(dropIndex) || dragStartIndex === dropIndex) {
      dragStartIndex = null;
      return;
    }
    const moved = draftRows.splice(dragStartIndex, 1)[0];
    draftRows.splice(dropIndex, 0, moved);
    dragStartIndex = null;

    markDirty();
    renderShift();
  }

  audit("SHIFT_LISTEN_START", { classId });

  onSnapshot(ref, snap => {
    const data = snap.exists() ? snap.data() : null;
    const ensured = ensureMinimum(data?.rows, data?.headers);

    shiftRows = ensured.rows;
    shiftHeaders = ensured.headers;

    if (!dirty) {
      draftRows = deepCopyRows(shiftRows);
      draftHeaders = [...shiftHeaders];
      if (saveBtn) saveBtn.disabled = true;
      if (statusEl) statusEl.textContent = "";
    }

    renderShift();
  });

  document.getElementById("addRow")?.addEventListener("click", addRow);
  document.getElementById("addColumn")?.addEventListener("click", addColumn);
  document.getElementById("deleteRow")?.addEventListener("click", deleteRow);
  document.getElementById("deleteColumn")?.addEventListener("click", deleteColumn);
  saveBtn?.addEventListener("click", saveShift);
}