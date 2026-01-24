console.log("winner app connected");

let expenses = [];
let editingIndex = null; // Track which expense is being edited

// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", function() {
    initializeApp();
});

function initializeApp() {
    const form = document.getElementById("expense-form");
    const amountInput = document.getElementById("amount");
    const dateInput = document.getElementById("date");
    const notesInput = document.getElementById("notes");
    const expenseList = document.getElementById("expense-list");
    const categoryInput = document.getElementById("category");
    const savedExpenses = localStorage.getItem("expenses");
    const clearAllBtn = document.getElementById("clearAllBtn");
    const cancelEditBtn = document.getElementById("cancelEditBtn");

    // Check if required DOM elements exist
    if (!form || !amountInput || !dateInput || !notesInput || !expenseList || !categoryInput || !clearAllBtn) {
        console.error("Required DOM elements not found. Please check your HTML structure.");
        return; // Exit early if DOM elements are missing
    }

    if (savedExpenses) {
        try {
            expenses = JSON.parse(savedExpenses);
            renderExpenses();
            calculateTotal();
        } catch (error) {
            console.error("Error parsing saved expenses:", error);
            localStorage.removeItem("expenses"); // Clear corrupted data
            expenses = [];
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

        // Check if we're editing an existing expense
        if (editingIndex !== null) {
            // Update existing expense
            expenses[editingIndex] = expense;
            editingIndex = null; // Reset editing state
        } else {
            // Add new expense
            expenses.push(expense);
        }

        try {
            localStorage.setItem("expenses", JSON.stringify(expenses));
            console.log("Expense saved successfully:", expense);
        } catch (error) {
            console.error("Error saving to localStorage:", error);
            alert("Failed to save expense. Your browser may be out of storage space.");
            if (editingIndex === null) {
                expenses.pop(); // Remove the expense we just added
            }
            return;
        }

        renderExpenses();
        calculateTotal();
        form.reset();
        cancelEditMode();
    });
    
    // Cancel edit button handler
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener("click", () => {
            cancelEditMode();
        });
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener("click", () => {
            if (expenses.length === 0) return;

            const confirm = window.confirm("Are you sure you want to clear all expenses?");
            if (!confirm) return;

            expenses = [];
            try {
                localStorage.removeItem("expenses");
            } catch (error) {
                console.error("Error clearing localStorage:", error);
            }
            renderExpenses();
            calculateTotal();
        });
    }
}

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
    const expenseList = document.getElementById("expense-list");
    if (!expenseList) return;
    
    expenseList.innerHTML = "";

    const emptyState = document.getElementById("emptyState");
    const totalAmount = document.getElementById("total");
    
    if (!emptyState || !totalAmount) return;



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

            // Create button container
            const buttonContainer = document.createElement("span");
            buttonContainer.style.marginLeft = "8px";
            buttonContainer.style.display = "inline-flex";
            buttonContainer.style.gap = "4px";

            // Edit button
            const editBtn = document.createElement("button");
            editBtn.textContent = "Edit";
            editBtn.style.padding = "4px 8px";
            editBtn.style.fontSize = "12px";
            editBtn.style.cursor = "pointer";
            editBtn.addEventListener("click", () => {
                editExpense(index, month);
            });

            // Delete button
            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "x";
            deleteBtn.style.padding = "4px 8px";
            deleteBtn.style.fontSize = "12px";
            deleteBtn.style.cursor = "pointer";
            deleteBtn.addEventListener("click", () => {
                deleteExpense(index, month);
            });

            buttonContainer.appendChild(editBtn);
            buttonContainer.appendChild(deleteBtn);
            li.appendChild(buttonContainer);
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

function editExpense(index, monthKey) {
    const grouped = groupExpensesByMonth();
    
    // Check if the month group exists and has the expense at that index
    if (!grouped[monthKey] || !grouped[monthKey][index]) {
        console.error("Expense not found at index:", index, "in month:", monthKey);
        return;
    }
    
    const expenseToEdit = grouped[monthKey][index];

    // Find the expense in the main array
    const realIndex = expenses.findIndex(exp => 
        exp.note === expenseToEdit.note &&
        exp.amount === expenseToEdit.amount &&
        exp.date === expenseToEdit.date &&
        exp.category === expenseToEdit.category
    );

    if (realIndex !== -1) {
        editingIndex = realIndex;
        
        // Populate form with expense data
        const amountInput = document.getElementById("amount");
        const dateInput = document.getElementById("date");
        const notesInput = document.getElementById("notes");
        const categoryInput = document.getElementById("category");
        const form = document.getElementById("expense-form");
        const cancelEditBtn = document.getElementById("cancelEditBtn");
        
        if (amountInput && dateInput && notesInput && categoryInput) {
            amountInput.value = expenseToEdit.amount;
            dateInput.value = expenseToEdit.date;
            notesInput.value = expenseToEdit.note;
            categoryInput.value = expenseToEdit.category;
            
            // Update submit button text and show cancel button
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.textContent = "Update expense";
            }
            if (cancelEditBtn) {
                cancelEditBtn.style.display = "block";
            }
            
            // Scroll to form
            form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    } else {
        console.error("Could not find expense in main array to edit");
    }
}

function cancelEditMode() {
    editingIndex = null;
    const form = document.getElementById("expense-form");
    const cancelEditBtn = document.getElementById("cancelEditBtn");
    
    if (form) {
        form.reset();
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.textContent = "Add expense";
        }
    }
    if (cancelEditBtn) {
        cancelEditBtn.style.display = "none";
    }
}

function deleteExpense(index, monthKey) {
    const grouped = groupExpensesByMonth();
    
    // Check if the month group exists and has the expense at that index
    if (!grouped[monthKey] || !grouped[monthKey][index]) {
        console.error("Expense not found at index:", index, "in month:", monthKey);
        return;
    }
    
    const expenseToDelete = grouped[monthKey][index];

    // Find the expense by comparing all properties (more reliable than indexOf)
    const realIndex = expenses.findIndex(exp => 
        exp.note === expenseToDelete.note &&
        exp.amount === expenseToDelete.amount &&
        exp.date === expenseToDelete.date &&
        exp.category === expenseToDelete.category
    );

    // Only delete if the expense was found
    if (realIndex !== -1) {
        expenses.splice(realIndex, 1);
        try {
            localStorage.setItem("expenses", JSON.stringify(expenses));
        } catch (error) {
            console.error("Error saving to localStorage:", error);
            alert("Failed to delete expense. Please try again.");
            return;
        }
        renderExpenses();
        calculateTotal();
    } else {
        console.error("Could not find expense in main array to delete");
    }
}


// ----------------------
// TOTAL
// ----------------------

function calculateTotal() {
    const totalEl = document.getElementById("total");
    if (!totalEl) return;
    
    const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    totalEl.textContent = `Total: £${total.toFixed(2)}`;
}
