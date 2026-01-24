console.log("winner app connected");

let expenses = [];

const form = document.getElementById("expense-form");
const amountInput = document.getElementById("amount");
const dateInput = document.getElementById("date");
const notesInput = document.getElementById("notes");
const expenseList = document.getElementById("expense-list");
const categoryInput = document.getElementById("category");
const savedExpenses = localStorage.getItem("expenses");
const clearAllBtn = document.getElementById("clearAllBtn");

if (savedExpenses) {
    expenses = JSON.parse(savedExpenses);
    renderExpenses();
    calculateTotal();
}

form.addEventListener("submit", function (e) {
    e.preventDefault();

    const name = notesInput.value.trim();
    const amount = Number(amountInput.value);
    const date = dateInput.value;

    if (!name) {
        alert("Please enter an expense name");
        return;
    }

    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid Amount Greater than 0");
        return;
    }

    if (!date) {
        alert("Please enter a valid date");
        return;
    }
    if (!categoryInput.value) {
        alert("Please select a category");
        return;
    }

    const expense = {
        note: name,
        amount: amount,
        date: date,
        category: categoryInput.value
    };

    expenses.push(expense);
    localStorage.setItem("expenses", JSON.stringify(expenses));

    renderExpenses();
    calculateTotal();
    form.reset();
});

// ----------------------
// GROUPING FUNCTIONS
// ----------------------

function getMonthKey(dateString) {
    const date = new Date(dateString);
    if (isNaN(date)) return "No Date"; // prevents NaN issues

    const year = date.getFullYear();
    const monthName = date.toLocaleString("en-UK", { month: "long" });

    return `${monthName} ${year}`;
}

function groupExpensesByMonth() {
    const grouped = {};

    expenses.forEach(expense => {
        const key = getMonthKey(expense.date);

        if (!grouped[key]) {
            grouped[key] = [];
        }

        grouped[key].push(expense);
    });

    return grouped;
}

// ----------------------
// RENDERING
// ----------------------

function renderExpenses() {
    expenseList.innerHTML = "";

    const emptyState =
    document.getElementById("emptyState");
    const totalAmount = document.getElementById("total");



    if (expenses.length === 0)
        {emptyState.style.display= "block";
            expenseList.innerHTML = "";
            totalAmount.textContent= "£0.00";
            return;
        } 
            emptyState.style.display = "none";
        
    

    const grouped = groupExpensesByMonth();

    for (const month in grouped) {

        // Create container for this month
        const monthDiv = document.createElement("div");
        monthDiv.classList.add("month");

        // Month header
        const monthHeader = document.createElement("h3");
        monthHeader.textContent = month;
        monthDiv.appendChild(monthHeader);

        // Month total
        let monthTotal = 0;
        grouped[month].forEach(exp => {
            monthTotal += exp.amount;
        });

        const monthTotalEl = document.createElement("p");
        monthTotalEl.textContent = `Month Total: £${monthTotal.toFixed(2)}`;
        monthDiv.appendChild(monthTotalEl);

        // Category totals
        const totals = calculateCategoryTotals(grouped[month]);
        for (const category in totals) {
            const p = document.createElement("p");
            p.textContent = `${category}: £${totals[category].toFixed(2)}`;
            monthDiv.appendChild(p);
        }

        // Expense list
        grouped[month].forEach((expense, index) => {
            const li = document.createElement("li");
            li.textContent = `${expense.note} - £${expense.amount.toFixed(2)} (${expense.category})`;

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "x";
            deleteBtn.style.marginLeft = "8px";

            deleteBtn.addEventListener("click", () => {
                deleteExpense(index, month);
            });

            li.appendChild(deleteBtn);
            monthDiv.appendChild(li);
        });

        // Append the whole month block
        expenseList.appendChild(monthDiv);
    }
}

function calculateCategoryTotals(expensesArray) {
    const totals = {};

    expensesArray.forEach(expense => {
        const category = expense.category || "other";

        if (!totals[category]) {
            totals[category] = 0;
        }

        totals[category] += expense.amount;
    });

    return totals;
}

function deleteExpense(index, monthKey) {
    const grouped = groupExpensesByMonth();
    const expenseToDelete = grouped[monthKey][index];

    const realIndex = expenses.indexOf(expenseToDelete);

    expenses.splice(realIndex, 1);
    localStorage.setItem("expenses", JSON.stringify(expenses));

    renderExpenses();
    calculateTotal();
}

clearAllBtn.addEventListener("click", () => {
    if (expenses.length === 0) return;

    const confirm = window.confirm("Are you sure you want to clear all expenses?");
    if (!confirm) return;

    expenses = [];
    localStorage.removeItem("expenses");
    renderExpenses();
    calculateTotal();
});

// ----------------------
// TOTAL
// ----------------------

function calculateTotal() {
    const totalEl = document.getElementById("total");
    const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    totalEl.textContent = `Total: £${total.toFixed(2)}`;
}

