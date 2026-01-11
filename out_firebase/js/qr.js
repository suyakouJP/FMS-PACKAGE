import { db } from "./firebase.js";
import { doc, setDoc, getDoc, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm";

const VIEW_TOKEN_MINUTES = 14 * 24 * 60;
const CASH_TOKEN_MINUTES = 10 * 60;
const QR_SIZE = 260;

function genToken(bytesLen = 24) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function buildUrl(page, classId, token) {
  const base = new URL(page, location.href);
  base.searchParams.set("classId", classId);
  base.searchParams.set("token", token);
  return base.toString();
}

async function writeToken({ classId, token, type, minutes }) {
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + minutes * 60 * 1000));
  const ref = doc(db, "Classes", classId, "Tokens", token);
  await setDoc(ref, { type, createdAt: serverTimestamp(), expiresAt, used: false });

  // 確認（存在しないなら「生成されてない」が確定）
  const snap = await getDoc(ref);
  return { ref, snap };
}

async function renderQrToCanvas(canvas, url) {
  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE;
  await QRCode.toCanvas(canvas, url, { width: QR_SIZE, margin: 2 });
}

function enableDownload(btn, canvas, filename) {
  btn.disabled = false;
  btn.onclick = () => {
    const a = document.createElement("a");
    a.download = filename;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };
}

function drawPlaceholder(canvas) {
  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, QR_SIZE, QR_SIZE);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, QR_SIZE, QR_SIZE);
  ctx.strokeStyle = "#c7b5f2";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, QR_SIZE - 16, QR_SIZE - 16);
  ctx.fillStyle = "#4a0072";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("QRコードがここに表示", QR_SIZE / 2, QR_SIZE / 2);
}

function setBadge(badgeEl, type) {
  if (!badgeEl) return;
  badgeEl.classList.remove("view", "cash");
  if (type === "view") {
    badgeEl.textContent = "View";
    badgeEl.classList.add("view");
  } else if (type === "cash") {
    badgeEl.textContent = "Cash";
    badgeEl.classList.add("cash");
  } else {
    badgeEl.textContent = "未生成";
  }
}

function setStatus(statusEl, text, color = "#4a0072") {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = color;
}

function formatErr(e) {
  return (e?.code ? `${e.code}: ` : "") + (e?.message ?? String(e));
}

/**
 * admin.js から呼ぶ初期化関数
 */
export function initQr(classId) {
  // 要素取得
  const genViewBtn = document.getElementById("genViewQr");
  const genCashBtn = document.getElementById("genCashQr");
  const badge = document.getElementById("qrTypeBadge");
  const hint = document.getElementById("qrHint");
  const urlEl = document.getElementById("qrUrl");
  const copyBtn = document.getElementById("copyQrUrl");
  const dlBtn = document.getElementById("dlQr");
  const canvas = document.getElementById("qrCanvas");
  const status = document.getElementById("qrStatus");

  console.log("[QR] initQr", {
    classId,
    genViewBtn: !!genViewBtn,
    genCashBtn: !!genCashBtn,
    canvas: !!canvas,
    urlEl: !!urlEl
  });

  // どれか欠けてたら初期化失敗を明示
  if (!genViewBtn || !genCashBtn || !canvas || !urlEl || !copyBtn || !dlBtn || !status) {
    console.warn("[QR] missing elements. check ids in admin.html");
    return;
  }

  // 初期表示
  urlEl.value = "";
  copyBtn.disabled = true;
  dlBtn.disabled = true;
  setBadge(badge, null);
  drawPlaceholder(canvas);
  setStatus(status, `対象クラス：${classId}`);

  async function generate(type) {
    const minutes = type === "view" ? VIEW_TOKEN_MINUTES : CASH_TOKEN_MINUTES;
    const page = type === "view" ? "view.html" : "cash.html";

    try {
      setStatus(status, `${type.toUpperCase()} 用QRを生成中…`);
      const token = genToken();

      console.log("[QR] generate start", { type, classId, token });

      const { snap } = await writeToken({ classId, token, type, minutes });
      console.log("[QR] token exists?", snap.exists(), snap.data());

      if (!snap.exists()) {
        setStatus(status, "Tokens が作成されていません（Rules/プロジェクト）", "crimson");
        return;
      }

      const url = buildUrl(page, classId, token);
      urlEl.value = url;

      setBadge(badge, type);
      hint.textContent = `現在表示中：${type.toUpperCase()}（有効 ${minutes / 60} 時間）`;

      await renderQrToCanvas(canvas, url);
      enableDownload(dlBtn, canvas, `QR_${type}_${classId}.png`);

      copyBtn.disabled = false;
      setStatus(status, `${type.toUpperCase()} 用QRを生成しました ✅`);

    } catch (e) {
      console.error("[QR] generate failed:", e);
      setStatus(status, `生成失敗: ${formatErr(e)}`, "crimson");
    }
  }

  genViewBtn.addEventListener("click", () => generate("view"));
  genCashBtn.addEventListener("click", () => generate("cash"));

  copyBtn.addEventListener("click", async () => {
    if (!urlEl.value) return;
    try {
      await navigator.clipboard.writeText(urlEl.value);
      setStatus(status, "URLコピーしました");
    } catch {
      alert("コピー失敗（ブラウザ権限）");
    }
  });
}
