// js/sale.js
import { db } from "./firebase.js";
import {
  collection, query, orderBy, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

export function initSale(classId, audit) {
  const salesCol = collection(db, "Classes", classId, "Sales");
  const q = query(salesCol, orderBy("created_at", "desc"));

  const container = document.getElementById("salesContainer");

  const modal = document.getElementById("salesModal");
  const modalHeader = document.getElementById("SmodalHeader");
  const modalBody = document.getElementById("SmodalDate");
  const closeBtn = document.getElementById("ScloseModal");
  const cancelBtn = document.getElementById("cancelSalesBtn");

  const pieCanvas = document.getElementById("salesPie");
  let pieChart = null;

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (modal) modal.style.display = "none";
      if (cancelBtn) cancelBtn.dataset.saleId = "";
    });
  }

  audit?.("SALE_LISTEN_START", { classId });

  onSnapshot(q, (snap) => {
    if (!container) return;
    container.innerHTML = "";

    const byProduct = new Map();

    if (snap.size === 0) {
      container.innerHTML = "<p>売上がまだありません。</p>";
      if (typeof renderPie === "function") renderPie(byProduct);
      return;
    }

    snap.forEach((ds) => {
      const saleId = ds.id;
      const d = ds.data();

      const status = d.status ?? "Active";
      const total = Number(d.total ?? 0);

      const dt = d.created_at?.toDate ? d.created_at.toDate() : null;
      const dtStr = dt ? dt.toLocaleString("ja-JP") : "";

      const card = document.createElement("div");
      card.className = "sales-card";
      card.style.border = "1px solid rgba(0,0,0,.1)";
      card.style.borderRadius = "12px";
      card.style.padding = "10px";
      card.style.marginBottom = "10px";
      card.style.cursor = "pointer";

      const badge = status === "Canceled"
        ? `<span style="color:#fff;background:#999;padding:2px 8px;border-radius:999px;font-size:12px;">取消</span>`
        : `<span style="color:#fff;background:#4caf50;padding:2px 8px;border-radius:999px;font-size:12px;">有効</span>`;

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div>
            <div style="font-weight:700;">合計：${total}円</div>
            <div style="font-size:12px;opacity:.75;">${dtStr}</div>
          </div>
          <div>${badge}</div>
        </div>
      `;

      card.addEventListener("click", () => {
        audit?.("SALE_CARD_OPEN", { classId, saleId });
        if (typeof openSaleModal === "function") openSaleModal(classId, saleId, d);
      });
      container.appendChild(card);

      if (status !== "Canceled") {
        const items = Array.isArray(d.items) ? d.items : [];
        for (const it of items) {
          const name = String(it.product_name ?? "不明");
          const subtotal = Number(it.subtotal ?? (Number(it.price ?? 0) * Number(it.quantity ?? 0)));
          byProduct.set(name, (byProduct.get(name) ?? 0) + subtotal);
        }
      }
    });

    if (typeof renderPie === "function") renderPie(byProduct);
  });
}
