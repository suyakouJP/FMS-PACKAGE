// js/stock.js
import { db } from "./firebase.js";
import {
  doc, updateDoc, onSnapshot, arrayUnion,
  collection, addDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

export function initStock(classId, audit) {
  const productsCol = collection(db, "Classes", classId, "Products");

  let selectID = null;
  const productContainer = document.getElementById("productContainer");
  const modal = document.getElementById("eventModal");
  const closeModal = document.getElementById("closeModal");
  const modalDate = document.getElementById("modalDate");
  const modalHeader = document.getElementById("modalHeader");

  let addMode = false;
  let removeMode = false;
  let editMode = false;

  closeModal?.addEventListener("click", () => (modal.style.display = "none"));

  document.getElementById("add")?.addEventListener("click", () => addproductModal());
  document.getElementById("remove")?.addEventListener("click", () => removeModechenge());
  document.getElementById("editBtn")?.addEventListener("click", () => editProductModal());
  document.getElementById("checkoutBtn")?.addEventListener("click", () => confilmer());

  function confilmer() {
    if (addMode) {
      addProduct();
    } else if (removeMode) {
      rmvProduct(selectID);
      modal.style.display = "none";
    } else if (editMode) {
      editProduct(selectID);
      editMode = false;
      modal.style.display = "none";
    }
  }

  function loadProducts() {
    audit?.("PRODUCT_LISTEN_START", { classId });

    onSnapshot(productsCol, (snapshot) => {
      productContainer.innerHTML = "";
      snapshot.forEach(d => displayProduct({ id: d.id, ...d.data() }));
    });
  }

  function displayProduct(p) {
    const btn = document.createElement("button");
    btn.innerHTML = `
      <h3>GAZOU</h3>
      <h3>商品名：${p.name ?? ""}</h3>
      <p>単価：${p.price ?? 0}円</p>
      <p>原価：${p.cost ?? 0}円</p>
      <p>在庫数：${p.stock ?? 0}</p>
    `;
    btn.classList.add("product-btn");

    btn.addEventListener("click", () => {
      selectID = p.id;
      audit?.("PRODUCT_OPEN_MODAL", { classId, productId: selectID });
      openModal(p);
    });

    productContainer.appendChild(btn);
  }

  function openModal(p) {
    modal.style.display = "flex";
    modalHeader.innerHTML = "<h2>内容</h2>";
    modalDate.innerHTML = `
      <h3>GAZOU</h3>
      <h3>商品名：${p.name ?? ""}</h3>
      <p>単価：${p.price ?? 0}円</p>
      <p>在庫数：${p.stock ?? 0}</p>
    `;

    const editBtn = document.getElementById("editBtn");
    const checkoutBtn = document.getElementById("checkoutBtn");

    if (removeMode) {
      modalHeader.innerHTML = "<h2>削除確認</h2>";
      if (editBtn) editBtn.style.display = "none";
      if (checkoutBtn) checkoutBtn.style.display = "flex";
    } else {
      if (editBtn) editBtn.style.display = "flex";
      if (checkoutBtn) checkoutBtn.style.display = "none";
    }
  }

  function addproductModal() {
    addMode = true;
    editMode = false;

    modal.style.display = "flex";
    modalHeader.innerHTML = "<h2>商品追加</h2>";
    modalDate.innerHTML = `
      <h3>GAZOU</h3>
      <p>商品名：<input type="text" id="name" placeholder="商品名を入力してください。"></p>
      <p>単価：<input type="text" id="price" placeholder="商品単価を入力してください。"></p>
      <p>原価：<input type="text" id="cost" placeholder="商品原価を入力してください。"></p>
      <p>在庫数：<input type="text" id="stock" placeholder="在庫数を入力してください。"></p>
    `;

    const checkoutBtn = document.getElementById("checkoutBtn");
    const editBtn = document.getElementById("editBtn");
    if (checkoutBtn) checkoutBtn.style.display = "flex";
    if (editBtn) editBtn.style.display = "none";
  }

  async function addProduct() {
    const name = document.getElementById("name")?.value?.trim();
    const price = Number(document.getElementById("price")?.value);
    const stock = Number(document.getElementById("stock")?.value);
    const cost = Number(document.getElementById("cost")?.value);

    if (!name || Number.isNaN(price) || Number.isNaN(stock) || Number.isNaN(cost)) {
      alert("すべての項目を正しく入力してください。");
      return;
    }

    try {
      await addDoc(productsCol, {
        name,
        price,
        stock,
        cost,
        pricehistory: [{ price, time: new Date(), by: "admin" }],
      });
      audit?.("PRODUCT_ADD", { classId, name, price, stock, cost });
      alert("商品を登録しました！");
      addMode = false;
      modal.style.display = "none";
    } catch (err) {
      console.error("Firestore書き込みエラー:", err);
      audit?.("PRODUCT_ADD_FAIL", { classId, error: String(err) });
      alert("登録に失敗しました（権限/通信）");
    }
  }

  function removeModechenge() {
    removeMode = !removeMode;
    audit?.("PRODUCT_REMOVE_MODE_TOGGLE", { classId, removeMode });

    if (removeMode) {
      document.body.style.background = "linear-gradient(180deg, #cde0f7,#ff0000 )";
    } else {
      document.body.style.background = "linear-gradient(180deg, #cde0f7, #d7c6f3)";
    }
  }

  async function rmvProduct(id) {
    if (!id) return;
    try {
      await deleteDoc(doc(db, "Classes", classId, "Products", id));
      audit?.("PRODUCT_DELETE", { classId, productId: id });
    } catch (e) {
      console.error("削除失敗", e);
      audit?.("PRODUCT_DELETE_FAIL", { classId, productId: id, error: String(e) });
      alert("削除に失敗しました（権限/通信）");
    }
  }

  function editProductModal() {
    editMode = true;
    addMode = false;

    modalDate.innerHTML = `
      <h3>GAZOU</h3>
      <p>商品名：<input type="text" id="name" placeholder="未入力なら変更しません"></p>
      <p>単価：<input type="text" id="price" placeholder="未入力なら変更しません"></p>
      <p>原価：<input type="text" id="cost" placeholder="未入力なら変更しません"></p>
      <p>在庫数：<input type="text" id="stock" placeholder="未入力なら変更しません"></p>
    `;

    const editBtn = document.getElementById("editBtn");
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (editBtn) editBtn.style.display = "none";
    if (checkoutBtn) checkoutBtn.style.display = "flex";

    audit?.("PRODUCT_EDIT_MODAL", { classId, productId: selectID });
  }

  async function editProduct(id) {
    if (!id) return;

    const name = document.getElementById("name")?.value?.trim();
    const priceStr = document.getElementById("price")?.value?.trim();
    const stockStr = document.getElementById("stock")?.value?.trim();
    const costStr = document.getElementById("cost")?.value?.trim();

    const updateData = {};

    if (name) updateData.name = name;

    if (priceStr) {
      const price = Number(priceStr);
      if (!Number.isNaN(price)) {
        updateData.price = price;
        updateData.pricehistory = arrayUnion({
          price,
          time: new Date(),
          by: "admin"
        });
      }
    }

    if (stockStr) {
      const stock = Number(stockStr);
      if (!Number.isNaN(stock)) updateData.stock = stock;
    }

    if (costStr) {
      const cost = Number(costStr);
      if (!Number.isNaN(cost)) updateData.cost = cost;
    }

    try {
      await updateDoc(doc(db, "Classes", classId, "Products", id), updateData);
      audit?.("PRODUCT_UPDATE", { classId, productId: id, updateData });
    } catch (e) {
      console.error("編集失敗", e);
      audit?.("PRODUCT_UPDATE_FAIL", { classId, productId: id, error: String(e) });
      alert("編集に失敗しました（権限/通信）");
    }
  }

  loadProducts();
}
