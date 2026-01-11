/**
 * cash.js
 * 会計（レジ）ページ
 * token を検証して classId を確定 → Products/Sales を処理
 * さらに：会計成功時に token.used=true（再利用禁止）
 */
import { db } from "./firebase.js";
import {
  collection, doc, onSnapshot,
  addDoc, updateDoc, increment,
  serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

/* ===============================
 * token / classId の確定（Cash）
 * =============================== */
function getParams() {
  const u = new URL(location.href);
  return {
    token: u.searchParams.get("token"),
    classId: u.searchParams.get("classId"),
  };
}

function isExpired(expiresAt) {
  const expMs =
    typeof expiresAt?.toMillis === "function" ? expiresAt.toMillis()
    : expiresAt instanceof Date ? expiresAt.getTime()
    : null;

  return expMs == null || Date.now() > expMs;
}

async function resolveClassIdForCashOrRedirect() {
  const { token, classId } = getParams();

  // QRから来た（tokenあり）場合：URLのclassIdで Tokens を検証
  if (token) {
    if (!classId) {
      alert("QR情報が不足しています（classIdなし）。管理画面でCash用QRを再発行してください。");
      location.href = "login.html";
      return null;
    }

    const tokenRef = doc(db, "Classes", classId, "Tokens", token);
    const snap = await getDoc(tokenRef);

    if (!snap.exists()) {
      alert("トークンが無効です。管理画面でCash用QRを再発行してください。");
      location.href = "login.html";
      return null;
    }

    const t = snap.data();

    if (t.type !== "cash") {
      alert("このQRは会計用ではありません。Cash用QRを使用してください。");
      location.href = "login.html";
      return null;
    }

    if (isExpired(t.expiresAt)) {
      alert("トークン期限切れです。管理画面でCash用QRを再発行してください。");
      location.href = "login.html";
      return null;
    }

    // ★ usedがtrueなら弾く → loginへ
    if (t.used === true) {
      alert("読み込み済みです。再度ログインしてください。");
      location.href = "login.html";
      return null;
    }

    const resolved = t.classId ?? classId;
    localStorage.setItem("classId", resolved);

    console.log("[CASH] token ok. resolved classId =", resolved);
    return resolved;
  }

  // token無し：従来どおり localStorage
  const ls = localStorage.getItem("classId");
  if (!ls) {
    console.warn("classId 未設定。ログインへ戻します");
    location.href = "login.html";
    return null;
  }
  return ls;
}

/* ===============================
 * メイン処理（classId確定後）
 * =============================== */
document.addEventListener("DOMContentLoaded", async () => {
  const classId = await resolveClassIdForCashOrRedirect();
  if (!classId) return;

  const productsCol = collection(db, "Classes", classId, "Products");
  const salesCol = collection(db, "Classes", classId, "Sales");

  const productContainer = document.getElementById("productContainer");
  const selectedBody = document.getElementById("selectedBody");
  const totalPriceElement = document.getElementById("totalPrice");
  const confirm = document.getElementById("confirm");
  const modal = document.getElementById("eventModal");
  const closeModal = document.getElementById("closeModal");
  const modalDate = document.getElementById("modalDate");
  const checkoutBtn = document.getElementById("checkoutBtn");

  let TOTAL = 0;

  // 最新の商品状態を保持
  const productMap = new Map(); // id -> {id, ...data}

  // 選択状態：id -> {id,name,price,quantity}
  let selectedProducts = {};

  if (totalPriceElement) totalPriceElement.textContent = "0円";

  confirm?.addEventListener("click", () => {
    if (!modal) return;
    modal.style.display = "flex";
    if (modalDate) modalDate.textContent = `${TOTAL}円`;
  });

  closeModal?.addEventListener("click", () => {
    if (!modal) return;
    modal.style.display = "none";
  });

  // Products監視
  onSnapshot(productsCol, (snapshot) => {
    productMap.clear();
    snapshot.forEach(ds => {
      productMap.set(ds.id, { id: ds.id, ...ds.data() });
    });

    renderProductButtons();
    syncSelectedWithLatest();
    renderSelectedProducts();
  });

  function renderProductButtons() {
    if (!productContainer) return;
    productContainer.innerHTML = "";

    for (const p of productMap.values()) {
      const btn = document.createElement("button");
      btn.textContent = `${p.name ?? ""} (${Number(p.price ?? 0)}円)`;
      btn.classList.add("product-btn");
      btn.dataset.productId = p.id;

      const stock = Number(p.stock ?? 0);
      btn.disabled = stock <= 0 || Boolean(selectedProducts[p.id]);

      btn.addEventListener("click", () => addSelectedProduct(p.id));
      productContainer.appendChild(btn);
    }
  }

  function addSelectedProduct(productId) {
    const p = productMap.get(productId);
    if (!p) return;

    const stock = Number(p.stock ?? 0);
    if (stock <= 0) return;

    if (selectedProducts[p.id]) return;

    selectedProducts[p.id] = {
      id: p.id,
      name: p.name ?? "",
      price: Number(p.price ?? 0),
      quantity: 1
    };

    const btn = productContainer?.querySelector(`[data-product-id="${p.id}"]`);
    if (btn) btn.disabled = true;

    renderSelectedProducts();
  }

  // Firestoreの最新状態に追随（価格・在庫・名前）
  function syncSelectedWithLatest() {
    for (const id of Object.keys(selectedProducts)) {
      const latest = productMap.get(id);
      if (!latest) {
        delete selectedProducts[id];
        continue;
      }

      selectedProducts[id].name = latest.name ?? "";
      selectedProducts[id].price = Number(latest.price ?? 0);

      const stock = Number(latest.stock ?? 0);
      if (selectedProducts[id].quantity > stock) {
        selectedProducts[id].quantity = Math.max(stock, 0);
      }
      if (selectedProducts[id].quantity <= 0) {
        delete selectedProducts[id];
      }
    }
  }

  function renderSelectedProducts() {
    if (!selectedBody) return;
    selectedBody.innerHTML = "";

    const ids = Object.keys(selectedProducts);
    if (ids.length === 0) {
      updateTotal();
      // ボタン復活（在庫0だけ押せない）
      productContainer?.querySelectorAll("button.product-btn").forEach(btn => {
        const id = btn.dataset.productId;
        const p = productMap.get(id);
        const stock = Number(p?.stock ?? 0);
        btn.disabled = stock <= 0;
      });
      return;
    }

    ids.forEach(id => {
      const sel = selectedProducts[id];
      const latest = productMap.get(id);
      const stock = Number(latest?.stock ?? 0);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${sel.name}</td>
        <td>${sel.price}円</td>
        <td id="qty-${id}">${sel.quantity}</td>
        <td>
          <button class="plus">＋</button>
          <button class="minus">−</button>
          <div style="font-size:11px;opacity:.75;">在庫:${stock}</div>
        </td>
      `;

      const plusBtn = row.querySelector(".plus");
      const minusBtn = row.querySelector(".minus");

      // 在庫以上に増やせない
      plusBtn.disabled = sel.quantity >= stock;

      plusBtn.addEventListener("click", () => {
        const nowStock = Number(productMap.get(id)?.stock ?? 0);
        if (sel.quantity >= nowStock) {
          plusBtn.disabled = true;
          return;
        }
        sel.quantity++;
        document.getElementById(`qty-${id}`).textContent = sel.quantity;
        plusBtn.disabled = sel.quantity >= nowStock;
        updateTotal();
      });

      minusBtn.addEventListener("click", () => {
        sel.quantity--;
        if (sel.quantity <= 0) {
          delete selectedProducts[id];

          const btn = productContainer?.querySelector(`[data-product-id="${id}"]`);
          const nowStock = Number(productMap.get(id)?.stock ?? 0);
          if (btn) btn.disabled = nowStock <= 0;

          renderSelectedProducts();
          return;
        }

        document.getElementById(`qty-${id}`).textContent = sel.quantity;
        const nowStock = Number(productMap.get(id)?.stock ?? 0);
        plusBtn.disabled = sel.quantity >= nowStock;
        updateTotal();
      });

      selectedBody.appendChild(row);
    });

    updateTotal();
  }

  function updateTotal() {
    let total = 0;
    Object.values(selectedProducts).forEach(p => {
      total += p.price * p.quantity;
    });
    TOTAL = total;
    if (totalPriceElement) totalPriceElement.textContent = `${total}円`;

    window.dispatchEvent(new CustomEvent("totalUpdated", { detail: { total } }));
  }

  // ✅ 確定時：在庫を最新で再チェック→売上登録→在庫減算→token使用済み
  checkoutBtn?.addEventListener("click", async () => {
    const ids = Object.keys(selectedProducts);
    if (ids.length === 0) {
      alert("商品が選択されていません");
      return;
    }

    // 1) 最新在庫チェック
    for (const id of ids) {
      const snap = await getDoc(doc(db, "Classes", classId, "Products", id));
      if (!snap.exists()) {
        alert("商品が見つかりません（削除された可能性）");
        return;
      }
      const stock = Number(snap.data().stock ?? 0);
      const need = Number(selectedProducts[id].quantity ?? 0);

      if (need <= 0) {
        alert("数量が不正です");
        return;
      }
      if (need > stock) {
        alert(`在庫不足：${snap.data().name ?? "商品"}（在庫${stock}）`);
        return;
      }
    }

    // 2) 売上items作成
    const items = ids.map(id => {
      const p = selectedProducts[id];
      return {
        product_id: p.id,
        product_name: p.name,
        price: p.price,
        quantity: p.quantity,
        subtotal: p.price * p.quantity
      };
    });

    const total = items.reduce((sum, i) => sum + i.subtotal, 0);

    try {
      // 3) 売上登録
      await addDoc(salesCol, {
        status: "Active",
        total,
        items,
        created_at: serverTimestamp()
      });

      // 4) 在庫減算
      await Promise.all(items.map(it => {
        const ref = doc(db, "Classes", classId, "Products", it.product_id);
        return updateDoc(ref, { stock: increment(-it.quantity) });
      }));

      // 5) tokenを使用済みに（再利用禁止）
      const { token, classId: urlClassId } = getParams();
      if (token && urlClassId) {
        const tokenRef = doc(db, "Classes", urlClassId, "Tokens", token);
        await updateDoc(tokenRef, {
          used: true,
          usedAt: serverTimestamp()
        });
      }

      alert("売上を登録しました！");

      // リセット
      if (modal) modal.style.display = "none";
      if (totalPriceElement) totalPriceElement.textContent = "0円";
      selectedProducts = {};
      renderSelectedProducts();

    } catch (err) {
      console.error("Firestoreエラー:", err);
      alert("登録に失敗しました（権限/通信）");
    }
  });
});
