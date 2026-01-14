// js/admin.js
// 管理画面の玄関：ログイン情報チェック → 初回PW変更ゲート → 各機能init
// ★このファイルは module なので import は最上段に置く

import { initQr } from "./qr.js";

import { db } from "./firebase.js";
import { sha256 } from "./crypto.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ★各機能は init化されてる前提（DOMContentLoaded禁止）＆ auditは引数で渡す
import { initSale } from "./sale.js";
import { initStock } from "./stock.js";
import { initShiftAdmin } from "./shift-admin.js";

// ★admin専用モジュール（DOMContentLoadedで自走する）
import "./notication-admin.js";
import "./schedule-admin.js";
import "./calendar-admin.js";

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
  // admin.html側にあるなら何もしない
  if (document.getElementById("pwModal")) return;

  // 念のため無い場合は差し込む（保険）
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div id="pwModal" class="modal-backdrop hidden" aria-hidden="true">
    <div class="pw-modal">
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

  // 最低限の見た目だけ
  const style = document.createElement("style");
  style.textContent = `
    .modal-backdrop.hidden { display:none; }
    .modal-backdrop{
      position:fixed; inset:0; background:rgba(0,0,0,0.55);
      display:flex; align-items:center; justify-content:center;
      z-index:9999;
    }
    .pw-modal{
      width:min(520px, 92vw);
      background:#fff;
      border-radius:16px;
      padding:18px 18px 14px;
      box-shadow:0 12px 40px rgba(0,0,0,0.25);
    }
    .pw-modal label{ display:block; margin-top:10px; }
    .pw-modal .row{ display:flex; gap:10px; margin-top:12px; }
    .pw-modal input{ width:100%; padding:10px; margin-top:6px; }
    .pw-modal .err{ color:#c00; min-height:1.2em; margin-top:10px; }
    .pw-modal button.sub{ opacity:0.8; }
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
  // body全体を無効化する
  document.body.style.pointerEvents = "none";

  // ただし pwModal だけは生かす
  const m = document.getElementById("pwModal");
  if (m) m.style.pointerEvents = "auto";
}

function unlockUi() {
  document.body.style.pointerEvents = "";

  const m = document.getElementById("pwModal");
  if (m) m.style.pointerEvents = "";
}


async function gateMustChangePassword({ classId, userId }) {
  ensureModalExists();
  if (!classId || !userId) return false;

  const adminRef = doc(db, "Classes", classId, "Admins", userId);

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
    return true; // OK
  }

  audit("GATE_REQUIRE_PW_CHANGE", { classId, userId });

  lockUi();
  showModal();

  const errEl = document.getElementById("pwErr");
  const saveBtn = document.getElementById("pwSaveBtn");
  const logoutBtn = document.getElementById("pwLogoutBtn");

  if (!errEl || !saveBtn || !logoutBtn) {
    console.warn("pw modal dom missing");
    return false;
  }

  errEl.textContent = "";
  saveBtn.onclick = null;
  logoutBtn.onclick = null;

  // 「ログインへ戻る」
  logoutBtn.onclick = () => {
    audit("PW_CHANGE_ABORT_TO_LOGIN", { classId, userId });
    localStorage.clear();
    location.href = "./login.html";
  };

  // 「変更する」
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

  return false; // 変更完了まで止める
}

/* ---------------------------
   entry（ここが玄関）
--------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  // デバッグログ（必要なら消してOK）
  console.log("pwModal:", document.getElementById("pwModal"));
  console.log("pwSaveBtn:", document.getElementById("pwSaveBtn"));
  console.log("newPw1:", document.getElementById("newPw1"));

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

  // 各機能起動
  initSale(classId, audit);
  initStock(classId, audit);
  initShiftAdmin(classId, audit);
  initQr(classId);

  // 文字数に応じてフォントサイズ調整（要素が無いなら何もしない）
  document.querySelectorAll(".name").forEach(el => {
    const len = el.textContent.trim().length;
    if (len >= 12) el.classList.add("xsmall");
    else if (len >= 8) el.classList.add("small");
  });

  // ログイン画面に戻る（admin.htmlにボタンがある前提）
  document.getElementById("backToLoginBtn")?.addEventListener("click", () => {
    localStorage.removeItem("classId");
    localStorage.removeItem("userId");
    localStorage.removeItem("role");
    location.href = "login.html";
  });
});

// 任意：監査ログをクラス別にコンソール表示
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
window.showAuditLogsForCurrentClass = showAuditLogsForCurrentClass;
