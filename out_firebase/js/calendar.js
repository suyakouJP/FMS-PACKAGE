/**
 * calendar.js
 * view画面用：スケジュールをカレンダー表示する
 * 保存先：Classes/{classId}/Schedules
 * フィールド：date(Timestamp) / text(string)
 */
import { db } from "./firebase.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const url = new URL(location.href);
  const classId = url.searchParams.get("classId") ?? (window.g24_22 ?? "g24_22");

  const monthYear = document.getElementById("monthYear");
  const calendarBody = document.getElementById("calendarBody");
  const prevMonth = document.getElementById("prevMonth");
  const nextMonth = document.getElementById("nextMonth");

  const modal = document.getElementById("eventModal");
  const closeModal = document.getElementById("closeModal");
  const modalDate = document.getElementById("modalDate");
  const modalEventList = document.getElementById("modalEventList");

  let currentDate = new Date();
  let savedSchedules = [];

  const schedulesCol = collection(db, "Classes", classId, "Schedules");

  // 🔥 Firestore リアルタイム取得（Classes配下）
  onSnapshot(schedulesCol, (snapshot) => {
    savedSchedules = snapshot.docs.map(ds => {
      const d = ds.data();
      const dateObj = d.date?.toDate ? d.date.toDate() : null;
      const dayStr = dateObj ? dateObj.toISOString().split("T")[0] : "";
      return {
        id: ds.id,
        text: d.text ?? "",
        day: dayStr
      };
    });

    renderCalendar(currentDate);
  });

  function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();

    monthYear.textContent = `${year}年 ${month + 1}月`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const totalDays = lastDay.getDate();

    calendarBody.innerHTML = "";
    let row = document.createElement("tr");

    for (let i = 0; i < startDay; i++) row.appendChild(document.createElement("td"));

    for (let day = 1; day <= totalDays; day++) {
      if ((row.children.length + 1) % 7 === 1 && day !== 1) {
        calendarBody.appendChild(row);
        row = document.createElement("tr");
      }

      const cell = document.createElement("td");
      cell.textContent = day;

      const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const events = savedSchedules.filter(s => s.day === dayStr);

      if (events.length > 0) {
        const countDiv = document.createElement("div");
        countDiv.classList.add("event-count");
        countDiv.textContent = events.length;
        cell.appendChild(countDiv);

        cell.addEventListener("click", () => {
          modal.style.display = "flex";
          modalDate.textContent = `${year}/${month + 1}/${day}`;
          modalEventList.innerHTML = "";

          events.forEach(ev => {
            const li = document.createElement("li");
            li.textContent = ev.text || "（内容なし）";
            modalEventList.appendChild(li);
          });
        });
      }

      row.appendChild(cell);
    }

    calendarBody.appendChild(row);
  }

  prevMonth.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar(currentDate);
  });

  nextMonth.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar(currentDate);
  });

  closeModal.addEventListener("click", () => {
    modal.style.display = "none";
  });
});
