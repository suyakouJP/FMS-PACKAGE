// 演算用変数
let rightOperand = NaN;    // 現在値（右辺）
let leftOperand = NaN;     // 左辺（演算結果や途中計算）
let operator = NaN;        // 演算子
let isNegativeAllowed = NaN; // 答えがマイナスの正誤確認
let TOTAL = 0;

window.addEventListener("totalUpdated", (e) => {
    TOTAL = e.detail.total
    console.log("合計を別JSで受け取った:", TOTAL);
    leftOperand = TOTAL
    document.getElementById("Lcalc").textContent = TOTAL;
});


// 数値入力処理
function inputNumber(num) {
    if (!isNaN(leftOperand) && isNaN(operator) && num !== 100) {
        // leftOperand = NaN;
        // document.getElementById("Lcalc").textContent = "";
        console.log("a");
        alert("演算子を入力してください。");
    }else if (isNaN(rightOperand)) {
        if (num !== 100) {
            rightOperand = num;
            console.log("b");
        } else {
            alert("先に0~9の数値を入れてください");
        }
    } else {
        if (100000 / rightOperand > 1) {
            if (num !== 100) {
                rightOperand = rightOperand * 10 + num;
            } else {
                rightOperand = rightOperand * 100;
            }
        } else {
            alert("それ以上は入力できません");
        }
    }
    if (!isNaN(rightOperand)) {
        document.getElementById("Rcalc").textContent = rightOperand;
    }
}

// 計算結果を出す
function calculateResult() {
    if (!isNaN(operator) && !isNaN(rightOperand) && !isNaN(leftOperand)) {
        switch (operator) {
            case 1: leftOperand += rightOperand;
                break;
            case 2:
                leftOperand -= rightOperand;
                break;
        }

        if (isNaN(isNegativeAllowed) || isNegativeAllowed) {
            document.getElementById("Lcalc").textContent = leftOperand;
            document.getElementById("Rcalc").textContent = "";
            document.getElementById("enzan").textContent = "";
            operator = NaN;
            rightOperand = NaN;
        }
    } else {
        alert("データを正しく入力してください");
    }
}

// 演算子入力
function setOperator(op) {
    if (!isNaN(rightOperand)) {
        if (isNaN(operator)) {
            operator = op;
            leftOperand = rightOperand;
            rightOperand = NaN;
            document.getElementById("Lcalc").textContent = leftOperand;
            document.getElementById("Rcalc").textContent = "";
        } else {
            calculateResult();
            operator = op;
        }
    } else if (!isNaN(leftOperand)) {
        if (isNaN(operator)) {
            operator = op;
        } else {
            alert("演算子を連続入力しないでください");
        }
    } else {
        alert("先に値を入力してください");
    }

    switch (operator) {
        case 1: document.getElementById("enzan").textContent = "+"; break;
        case 2: document.getElementById("enzan").textContent = "-"; break;
        case 3: document.getElementById("enzan").textContent = "÷"; break;
        case 4: document.getElementById("enzan").textContent = "×"; break;
    }
}

// 現在値クリア
function clearCurrent() {
    document.getElementById("Rcalc").textContent = "";
    rightOperand = NaN;
    if (isNaN(operator) && isNaN(rightOperand) && !isNaN(leftOperand)) {
        leftOperand = TOTAL
    document.getElementById("Lcalc").textContent = TOTAL;
    }
}

function AllClear() {
    document.getElementById("Rcalc").textContent = "";
    rightOperand = NaN;
    if (isNaN(operator) && isNaN(rightOperand) && !isNaN(leftOperand)) {
        document.getElementById("Lcalc").textContent = "";
        leftOperand = NaN;
    }
    leftOperand = TOTAL
    document.getElementById("Lcalc").textContent = TOTAL;
}