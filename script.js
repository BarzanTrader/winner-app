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
const editBtn = document.getElementById("editBtn");
let selectedExpense = null;

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
            li.classList.add("expense-item");
            li.style.cursor = "pointer";
            
            // Make the expense item clickable to select and offer edit
            li.addEventListener("click", (e) => {
                // Don't trigger if clicking the delete button
                if (e.target.tagName === "BUTTON") {
                    return;
                }
                
                // Remove selection from other items
                document.querySelectorAll(".expense-item").forEach(item => {
                    item.classList.remove("selected");
                });
                
                // Select this expense
                selectedExpense = expense;
                li.classList.add("selected");
                
                // Show edit option prompt
                const wantsToEdit = confirm(`Edit "${expense.note}"?`);
                if (wantsToEdit) {
                    // Populate edit form with selected expense data
                    document.getElementById("edit-amount").value = selectedExpense.amount;
                    document.getElementById("edit-date").value = selectedExpense.date;
                    document.getElementById("edit-notes").value = selectedExpense.note;
                    document.getElementById("edit-category").value = selectedExpense.category;
                    
                    // Show edit modal
                    document.getElementById("editModal").style.display = "block";
                }
            });
            
            const expenseText = document.createElement("span");
            expenseText.textContent = `${expense.note} - £${expense.amount.toFixed(2)} (${expense.category})`;
            expenseText.style.flex = "1";
            
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "x";
            deleteBtn.style.marginLeft = "8px";

            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent triggering the li click
                deleteExpense(index, month);
            });

            li.appendChild(expenseText);
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

    // Clear selection if deleting the selected expense
    if (selectedExpense === expenseToDelete) {
        selectedExpense = null;
    }

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
// EDIT FUNCTIONALITY
// ----------------------

editBtn.addEventListener("click", () => {
    if (!selectedExpense) {
        alert("Please tap on an expense to select it first");
        return;
    }
    
    // Populate edit form with selected expense data
    document.getElementById("edit-amount").value = selectedExpense.amount;
    document.getElementById("edit-date").value = selectedExpense.date;
    document.getElementById("edit-notes").value = selectedExpense.note;
    document.getElementById("edit-category").value = selectedExpense.category;
    
    // Show edit modal
    document.getElementById("editModal").style.display = "block";
});

document.getElementById("closeEditModal").addEventListener("click", () => {
    document.getElementById("editModal").style.display = "none";
});

// Close modal when clicking outside of it
window.addEventListener("click", (event) => {
    const modal = document.getElementById("editModal");
    if (event.target === modal) {
        modal.style.display = "none";
    }
});

document.getElementById("saveEditBtn").addEventListener("click", () => {
    const editAmount = Number(document.getElementById("edit-amount").value);
    const editDate = document.getElementById("edit-date").value;
    const editNotes = document.getElementById("edit-notes").value.trim();
    const editCategory = document.getElementById("edit-category").value;
    
    if (!editNotes) {
        alert("Please enter an expense name");
        return;
    }
    
    if (isNaN(editAmount) || editAmount <= 0) {
        alert("Please enter a valid Amount Greater than 0");
        return;
    }
    
    if (!editDate) {
        alert("Please enter a valid date");
        return;
    }
    
    if (!editCategory) {
        alert("Please select a category");
        return;
    }
    
    // Update the selected expense
    const expenseIndex = expenses.indexOf(selectedExpense);
    if (expenseIndex !== -1) {
        expenses[expenseIndex] = {
            note: editNotes,
            amount: editAmount,
            date: editDate,
            category: editCategory
        };
        
        localStorage.setItem("expenses", JSON.stringify(expenses));
        selectedExpense = null;
        
        renderExpenses();
        calculateTotal();
        document.getElementById("editModal").style.display = "none";
    }
});

// ----------------------
// TOTAL
// ----------------------

function calculateTotal() {
    const totalEl = document.getElementById("total");
    const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    totalEl.textContent = `Total: £${total.toFixed(2)}`;
}

