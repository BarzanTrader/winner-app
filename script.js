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
    try {
        expenses = JSON.parse(savedExpenses);
        renderExpenses();
        calculateTotal();
        renderChart();
        updateDashboard();
    } catch (error) {
        console.error("Error parsing saved expenses:", error);
        expenses = [];
        localStorage.removeItem("expenses");
    }
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
    renderChart();
    updateDashboard();
    form.reset();
});

// ----------------------
// GROUPING FUNCTIONS
// ----------------------
// ----------------------
// DASHBOARD FUNCTIONS
// ----------------------

function updateDashboard() {
    const monthlyTotalEl = document.getElementById("MonthlyTotal");
    const topcategoryEl = document.getElementById("top-category");
    const averageExpenseEl = document.getElementById("average-expense");
    
    if (!monthlyTotalEl || !topcategoryEl || !averageExpenseEl) {
        return; // Elements not found yet
    }
    
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);

    const monthlyExpenses = expenses.filter(exp => exp.date && exp.date.startsWith(currentMonth));

    const total = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
    monthlyTotalEl.textContent = `Total: £${total.toFixed(2)}`;

    const categoryMap = {};
    monthlyExpenses.forEach(exp => {
        if (exp.category) {
            categoryMap[exp.category] = (categoryMap[exp.category] || 0) + exp.amount;
        }
    });

    let topCategory = "-";
    let max = 0;
    for (let cat in categoryMap) {
        if (categoryMap[cat] > max) {
            max = categoryMap[cat];
            topCategory = cat;
        }
    }
    topcategoryEl.textContent = topCategory;
    
    // Calculate average expense per day this month
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const averageExpense = days > 0 ? total / days : 0;
    averageExpenseEl.textContent = `£${averageExpense.toFixed(2)}`;
}


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
                } else {
                    // Deselect if user cancels
                    selectedExpense = null;
                    li.classList.remove("selected");
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

    // Check if expense was found
    if (realIndex === -1) {
        console.error("Expense not found in expenses array");
        renderExpenses();
        updateDashboard();
        return;
    }

    // Clear selection if deleting the selected expense
    if (selectedExpense === expenseToDelete) {
        selectedExpense = null;
    }

    expenses.splice(realIndex, 1);
    localStorage.setItem("expenses", JSON.stringify(expenses));

    renderExpenses();
    calculateTotal();
    renderChart();
    updateDashboard();
}

clearAllBtn.addEventListener("click", () => {
    if (expenses.length === 0) return;

    const confirm = window.confirm("Are you sure you want to clear all expenses?");
    if (!confirm) return;

    expenses = [];
    localStorage.removeItem("expenses");
    renderExpenses();
    calculateTotal();
    renderChart();
    updateDashboard();
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
    if (expenseIndex === -1) {
        alert("Expense not found. It may have been deleted.");
        document.getElementById("editModal").style.display = "none";
        selectedExpense = null;
        renderExpenses();
        return;
    }
    
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
    renderChart();
    updateDashboard();
    document.getElementById("editModal").style.display = "none";
});

// ----------------------
// TOTAL
// ----------------------

function calculateTotal() {
    const totalEl = document.getElementById("total");
    const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    totalEl.textContent = `Total: £${total.toFixed(2)}`;
}

// ----------------------chart functionality

function getMonthlyTotals() {
    const map = {};
    expenses.forEach(e => {
        if (!e.date || typeof e.date !== 'string') {
            return; // Skip expenses with invalid dates
        }
        const month = e.date.slice(0, 7); // yyyy-mm
        if (month.length === 7) {
            map[month] = (map[month] || 0) + e.amount;
        }
    });
    
    const sortedMonths = Object.keys(map).sort();
    // Format labels to be more readable (e.g., "2024-01" -> "January 2024")
    const labels = sortedMonths.map(monthStr => {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleString("en-UK", { month: "long", year: "numeric" });
    });
    const data = sortedMonths.map(month => map[month]);
    return {labels, data};
}


let monthlyChart;

function rendermonthlyChart() {
    const chartElement = document.getElementById("MonthlyChart");
    if (!chartElement) {
        console.warn("MonthlyChart element not found");
        return;
    }
    
    const {labels, data} = getMonthlyTotals();
    
    // Don't render if no data
    if (labels.length === 0 || data.length === 0) {
        if (monthlyChart) {
            monthlyChart.destroy();
            monthlyChart = null;
        }
        return;
    }
    
    const ctx = chartElement.getContext("2d");

    if (monthlyChart) {
        monthlyChart.destroy();
    }
    
    monthlyChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Monthly Expenses (£)",
                data: data,
                backgroundColor: "rgba(54, 162, 235, 0.6)",
                borderColor: "rgba(54, 162, 235, 1)",
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return "£" + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

function renderChart() {
    rendermonthlyChart();
}
