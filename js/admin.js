// js/admin.js
console.log("pwModal:", document.getElementById("pwModal"));
console.log("pwSaveBtn:", document.getElementById("pwSaveBtn"));
console.log("newPw1:", document.getElementById("newPw1"));
import { initQr } from "./qr.js";

import { db } from "./firebase.js";
import { sha256 } from "./crypto.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ★各機能は init化されてる前提（DOMContentLoaded禁止）＆ auditは引数で渡す
import { initSale } from "./sale.js";
import { initStock } from "./stock.js";
import { initShiftAdmin } from "./shift-admin.js";

/* ---------------------------
   audit（console履歴用）
--------------------------- */
const AUDIT_KEY = "auditLog_v1";
const AUDIT_LIMIT = 300;

function audit(action, detail = {}) {
  try {
    const entry = {
      t: new Date().toISOString(),
      action,
      classId: localStorage.getItem("classId") || "",
      userId: localStorage.getItem("userId") || "",
      role: localStorage.getItem("role") || "admin",
      detail,
    };
    const raw = localStorage.getItem(AUDIT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push(entry);
    const sliced = arr.length > AUDIT_LIMIT ? arr.slice(arr.length - AUDIT_LIMIT) : arr;
    localStorage.setItem(AUDIT_KEY, JSON.stringify(sliced));
  } catch (e) {
    console.warn("audit failed", e);
  }
}
window.audit = audit;

function dumpAuditLogToConsole() {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    console.groupCollapsed(`監査ログ（${arr.length}件）`);
    console.table(arr.map(x => ({
      t: x.t,
      action: x.action,
      classId: x.classId,
      userId: x.userId,
      role: x.role,
      detail: JSON.stringify(x.detail),
    })));
    console.groupEnd();
  } catch (e) {
    console.warn("dump audit failed", e);
  }
}

/* ---------------------------
   gate（初回PW変更）
--------------------------- */
function ensureModalExists() {
  if (document.getElementById("pwModal")) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div id="pwModal" class="modal-backdrop hidden" aria-hidden="true">
    <div class="modal">
      <h2>初回パスワード変更</h2>
      <p>初期パスワードのままだと操作できません。新しいパスワードを設定してください。</p>

      <label>
        新しいパスワード
        <input id="newPw1" type="password" autocomplete="new-password" />
      </label>

      <label>
        もう一度
        <input id="newPw2" type="password" autocomplete="new-password" />
      </label>

      <div class="row">
        <button id="pwSaveBtn">変更する</button>
        <button id="pwLogoutBtn" class="sub">ログイン画面へ戻る</button>
      </div>

      <p id="pwErr" class="err"></p>
    </div>
  </div>
  `;
  document.body.appendChild(wrap);

  const style = document.createElement("style");
  style.textContent = `
    .modal-backdrop.hidden { display:none; }
    .modal-backdrop{
      position:fixed; inset:0; background:rgba(0,0,0,.55);
      display:flex; align-items:center; justify-content:center;
      z-index:9999;
    }
    .modal{
      width:min(520px, 92vw);
      background:#fff;
      border-radius:16px;
      padding:18px 18px 14px;
      box-shadow:0 12px 40px rgba(0,0,0,.25);
    }
    .modal label{ display:block; margin-top:10px; }
    .modal .row{ display:flex; gap:10px; margin-top:12px; }
    .modal input{ width:100%; padding:10px; margin-top:6px; }
    .modal .err{ color:#c00; min-height:1.2em; margin-top:10px; }
    .modal button.sub{ opacity:.85; }
  `;
  document.head.appendChild(style);
}

function showModal() {
  const m = document.getElementById("pwModal");
  if (!m) return;
  m.classList.remove("hidden");
  m.setAttribute("aria-hidden", "false");
}
function hideModal() {
  const m = document.getElementById("pwModal");
  if (!m) return;
  m.classList.add("hidden");
  m.setAttribute("aria-hidden", "true");
}

function lockUi() {
  document.body.style.pointerEvents = "none";
  const m = document.getElementById("pwModal");
  if (m) m.style.pointerEvents = "auto";
}
function unlockUi() {
  document.body.style.pointerEvents = "";
}

async function gateMustChangePassword({ classId, userId }) {
  ensureModalExists();

  if (!classId || !userId) return false;

  const adminRef = doc(db, "Classes", classId, "Admins", userId);

  // ★ここ：存在しない / 読めない を判別して表示
  let snap;
  try {
    snap = await getDoc(adminRef);
  } catch (e) {
    console.error("Admins read blocked:", e);
    alert("Adminsが読めない（Rules）: " + (e.code ?? e.message));
    audit("GATE_ADMIN_READ_BLOCKED", { classId, userId, error: String(e) });
    location.href = "./login.html";
    return false;
  }

  if (!snap.exists()) {
    alert("Adminsが存在しない（初期発行してない）");
    audit("GATE_ADMIN_NOT_FOUND", { classId, userId });
    location.href = "./login.html";
    return false;
  }

  const data = snap.data();
  if (data.mustChangePassword !== true) {
    return true;
  }

  audit("GATE_REQUIRE_PW_CHANGE", { classId, userId });

  lockUi();
  showModal();

  const errEl = document.getElementById("pwErr");
  const saveBtn = document.getElementById("pwSaveBtn");
  const logoutBtn = document.getElementById("pwLogoutBtn");

  errEl.textContent = "";
  saveBtn.onclick = null;
  logoutBtn.onclick = null;

  logoutBtn.onclick = () => {
    audit("PW_CHANGE_ABORT_TO_LOGIN", { classId, userId });
    localStorage.clear();
    location.href = "./login.html";
  };

  saveBtn.onclick = async () => {
    errEl.textContent = "";
    const pw1 = document.getElementById("newPw1")?.value?.trim() ?? "";
    const pw2 = document.getElementById("newPw2")?.value?.trim() ?? "";

    if (pw1.length < 6) { errEl.textContent = "6文字以上にしてください"; return; }
    if (pw1 !== pw2) { errEl.textContent = "一致してません"; return; }

    saveBtn.disabled = true;
    try {
      const hash = await sha256(pw1);
      await updateDoc(adminRef, {
        passwordHash: hash,
        mustChangePassword: false,
        updated_at: serverTimestamp(),
      });

      audit("PASSWORD_CHANGED_FIRST_LOGIN", { classId, userId });

      hideModal();
      unlockUi();
      location.reload();
    } catch (e) {
      console.error("pw update error", e);
      audit("PW_CHANGE_FAIL", { classId, userId, error: String(e) });
      errEl.textContent = "更新失敗（権限/通信）";
      saveBtn.disabled = false;
    }
  };

  return false;
}

/* ---------------------------
   entry（ここが玄関）
--------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  dumpAuditLogToConsole();

  const classId = localStorage.getItem("classId");
  const userId  = localStorage.getItem("userId");
  const role    = localStorage.getItem("role");

  if (!classId || !userId || role !== "admin") {
    alert("ログイン情報がありません。login.htmlへ戻ります");
    localStorage.clear();
    location.href = "./login.html";
    return;
  }

  audit("ADMIN_PAGE_OPEN", { classId, userId });

  const ok = await gateMustChangePassword({ classId, userId });
  if (!ok) return;

  audit("ADMIN_GATE_PASSED", { classId, userId });

    initSale(classId, audit);
    initStock(classId, audit);
    initShiftAdmin(classId, audit);
    initQr(classId);

});


function showAuditLogsForCurrentClass(limit = 50) {
  const classId = localStorage.getItem("classId") || "";
  let logs = [];

  try {
    logs = JSON.parse(localStorage.getItem("auditLog_v1") || "[]");
  } catch {
    console.warn("auditLog_v1 parse failed");
    return;
  }

  const filtered = logs
    .filter(e => (e.classId || "") === classId)
    .sort((a, b) => (b.t || "").localeCompare(a.t || ""))
    .slice(0, limit);

  console.group(`AUDIT LOGS (classId=${classId}, count=${filtered.length})`);
  console.table(filtered);
  console.groupEnd();
}

// ===== 文字数に応じてフォントサイズ調整 =====
document.querySelectorAll(".name").forEach(el => {
  const len = el.textContent.trim().length;

  if (len >= 12) {
    el.classList.add("xsmall");
  } else if (len >= 8) {
    el.classList.add("small");
  }
});

// ログイン画面に戻る
document.getElementById("backToLoginBtn")?.addEventListener("click", () => {
  // 念のためログイン情報を破棄
  localStorage.removeItem("classId");
  localStorage.removeItem("userId");
  localStorage.removeItem("role");

  // ログイン画面へ
  location.href = "login.html";
});
