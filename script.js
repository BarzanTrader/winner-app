/* ============================================================================
 * WINNER EXPENSE TRACKER - Main Application Script
 * ============================================================================
 * This application manages expense tracking with the following features:
 * - Add, edit, and delete expenses
 * - Monthly expense visualization
 * - Dashboard with key metrics
 * - CSV export functionality
 * - Local storage persistence
 * ============================================================================ */

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let expenses = [];              // Array storing all expense objects
let selectedExpense = null;     // Currently selected expense for editing
let monthlyChart = null;        // Chart.js instance for monthly chart

// ============================================================================
// INITIALIZATION - DOM Content Loaded
// ============================================================================

document.addEventListener("DOMContentLoaded", function() {
    initializeApp();
});

/**
 * Initializes the application by setting up DOM references, loading data,
 * and attaching event listeners
 */
function initializeApp() {
    // Get DOM element references
    const domElements = getDOMElements();
    
    // Load saved expenses from localStorage
    loadExpensesFromStorage();
    
    // Set up event listeners
    setupEventListeners(domElements);
}

/**
 * Retrieves and returns all required DOM elements
 * @returns {Object} Object containing all DOM element references
 */
function getDOMElements() {
    return {
        form: document.getElementById("expense-form"),
        amountInput: document.getElementById("amount"),
        dateInput: document.getElementById("date"),
        notesInput: document.getElementById("notes"),
        expenseList: document.getElementById("expense-list"),
        categoryInput: document.getElementById("category"),
        clearAllBtn: document.getElementById("clearAllBtn"),
        editBtn: document.getElementById("editBtn"),
        exportBtn: document.getElementById("exportbtn")
    };
}

/**
 * Loads expenses from localStorage and initializes the UI
 */
function loadExpensesFromStorage() {
    const savedExpenses = localStorage.getItem("expenses");
    
    if (savedExpenses) {
        try {
            expenses = JSON.parse(savedExpenses);
            refreshAllDisplays();
        } catch (error) {
            console.error("Error parsing saved expenses:", error);
            expenses = [];
            localStorage.removeItem("expenses");
        }
    } else {
        // Initialize dashboard even if no expenses exist
        updateDashboard();
    }
}

/**
 * Refreshes all UI displays (expenses list, total, chart, dashboard)
 */
function refreshAllDisplays() {
    renderExpenses();
    calculateTotal();
    renderChart();
    updateDashboard();
}

/**
 * Sets up all event listeners for user interactions
 * @param {Object} elements - DOM element references
 */
function setupEventListeners(elements) {
    setupFormListeners(elements);
    setupButtonListeners(elements);
    setupModalListeners();
}

// ============================================================================
// FORM EVENT LISTENERS
// ============================================================================

/**
 * Sets up form submission and validation listeners
 * @param {Object} elements - DOM element references
 */
function setupFormListeners(elements) {
    if (!elements.form) {
        console.error("Form element not found");
        return;
    }
    
    // Form submission handler
    elements.form.addEventListener("submit", handleFormSubmit.bind(null, elements));
    
    // Real-time form validation for submit button
    setupFormValidation(elements);
}

/**
 * Handles form submission to add a new expense
 * @param {Object} elements - DOM element references
 * @param {Event} event - Form submit event
 */
function handleFormSubmit(elements, event) {
    event.preventDefault();
    
    // Validate form elements exist
    if (!elements.form) {
        console.error("Form element not found");
        return;
    }
    
    // Extract and validate form data
    const formData = extractFormData(elements);
    if (!validateFormData(formData)) {
        return;
    }
    
    // Create expense object and save
    const expense = createExpenseObject(formData);
    addExpense(expense);
    
    // Reset form and refresh displays
    elements.form.reset();
    refreshAllDisplays();
}

/**
 * Extracts form data from input fields
 * @param {Object} elements - DOM element references
 * @returns {Object} Form data object
 */
function extractFormData(elements) {
    // Add null checks for safety
    if (!elements.notesInput || !elements.amountInput || !elements.dateInput || !elements.categoryInput) {
        console.error("Form elements not found");
        return {
            name: "",
            amount: 0,
            date: "",
            category: ""
        };
    }
    
    return {
        name: elements.notesInput.value.trim(),
        amount: Number(elements.amountInput.value),
        date: elements.dateInput.value,
        category: elements.categoryInput.value
    };
}

/**
 * Validates form data before submission
 * @param {Object} formData - Form data to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateFormData(formData) {
    if (!formData.name) {
        alert("Please enter an expense name");
        return false;
    }
    
    if (isNaN(formData.amount) || formData.amount <= 0) {
        alert("Please enter a valid amount greater than 0");
        return false;
    }
    
    if (!formData.date) {
        alert("Please enter a valid date");
        return false;
    }
    
    if (!formData.category) {
        alert("Please select a category");
        return false;
    }
    
    return true;
}

/**
 * Creates an expense object from form data
 * @param {Object} formData - Validated form data
 * @returns {Object} Expense object
 */
function createExpenseObject(formData) {
    return {
        note: formData.name,
        amount: formData.amount,
        date: formData.date,
        category: formData.category
    };
}

/**
 * Adds a new expense to the array and saves to localStorage
 * @param {Object} expense - Expense object to add
 */
function addExpense(expense) {
    expenses.push(expense);
    localStorage.setItem("expenses", JSON.stringify(expenses));
}

/**
 * Sets up real-time form validation to enable/disable submit button
 * @param {Object} elements - DOM element references
 */
function setupFormValidation(elements) {
    if (!elements.form) {
        return;
    }
    
    const submitBtn = elements.form.querySelector('button[type="submit"]');
    
    if (submitBtn && elements.amountInput && elements.dateInput && elements.notesInput) {
        elements.form.addEventListener("input", () => {
            const isValid = elements.amountInput.value && 
                          elements.dateInput.value && 
                          elements.notesInput.value.trim();
            submitBtn.disabled = !isValid;
        });
        
        // Initialize button state
        submitBtn.disabled = true;
    }
}

// ============================================================================
// BUTTON EVENT LISTENERS
// ============================================================================

/**
 * Sets up all button click event listeners
 * @param {Object} elements - DOM element references
 */
function setupButtonListeners(elements) {
    // Clear all expenses button
    if (elements.clearAllBtn) {
        elements.clearAllBtn.addEventListener("click", handleClearAllExpenses);
    } else {
        console.warn("Clear all button not found");
    }
    
    // Edit button (hidden but kept for potential future use)
    if (elements.editBtn) {
        elements.editBtn.addEventListener("click", handleEditButtonClick);
    } else {
        console.warn("Edit button not found");
    }
    
    // Export CSV button
    if (elements.exportBtn) {
        elements.exportBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            exportCSV();
        });
    } else {
        console.error("Export button not found! Check HTML for id='exportbtn'");
    }
}

/**
 * Handles clearing all expenses with user confirmation
 */
function handleClearAllExpenses() {
    if (expenses.length === 0) return;
    
    const confirmed = window.confirm("Are you sure you want to clear all expenses?");
    if (!confirmed) return;
    
    expenses = [];
    localStorage.removeItem("expenses");
    refreshAllDisplays();
}

/**
 * Handles edit button click (requires expense to be selected first)
 */
function handleEditButtonClick() {
    if (!selectedExpense) {
        alert("Please tap on an expense to select it first");
        return;
    }
    
    openEditModal(selectedExpense);
}

// ============================================================================
// MODAL EVENT LISTENERS
// ============================================================================

/**
 * Sets up modal-related event listeners
 */
function setupModalListeners() {
    const closeBtn = document.getElementById("closeEditModal");
    const saveBtn = document.getElementById("saveEditBtn");
    
    // Close button
    if (closeBtn) {
        closeBtn.addEventListener("click", closeEditModal);
    }
    
    // Close modal when clicking outside
    window.addEventListener("click", handleModalOutsideClick);
    
    // Save edited expense
    if (saveBtn) {
        saveBtn.addEventListener("click", handleSaveEditedExpense);
    }
}

/**
 * Opens the edit modal and populates it with expense data
 * @param {Object} expense - Expense object to edit
 */
function openEditModal(expense) {
    const amountInput = document.getElementById("edit-amount");
    const dateInput = document.getElementById("edit-date");
    const notesInput = document.getElementById("edit-notes");
    const categoryInput = document.getElementById("edit-category");
    const modal = document.getElementById("editModal");
    
    if (!amountInput || !dateInput || !notesInput || !categoryInput || !modal) {
        console.error("Edit modal elements not found");
        return;
    }
    
    amountInput.value = expense.amount || "";
    dateInput.value = expense.date || "";
    notesInput.value = expense.note || "";
    categoryInput.value = expense.category || "";
    modal.style.display = "block";
}

/**
 * Closes the edit modal
 */
function closeEditModal() {
    const modal = document.getElementById("editModal");
    if (modal) {
        modal.style.display = "none";
    }
}

/**
 * Handles clicking outside the modal to close it
 * @param {Event} event - Click event
 */
function handleModalOutsideClick(event) {
    const modal = document.getElementById("editModal");
    if (event.target === modal) {
        closeEditModal();
    }
}

/**
 * Handles saving an edited expense
 */
function handleSaveEditedExpense() {
    // Get edit form elements
    const amountInput = document.getElementById("edit-amount");
    const dateInput = document.getElementById("edit-date");
    const notesInput = document.getElementById("edit-notes");
    const categoryInput = document.getElementById("edit-category");
    
    if (!amountInput || !dateInput || !notesInput || !categoryInput) {
        console.error("Edit form elements not found");
        return;
    }
    
    // Extract edit form data
    const editData = {
        amount: Number(amountInput.value),
        date: dateInput.value,
        note: notesInput.value.trim(),
        category: categoryInput.value
    };
    
    // Validate edit data
    if (!validateEditData(editData)) {
        return;
    }
    
    // Check if expense is still selected
    if (!selectedExpense) {
        alert("No expense selected. Please select an expense to edit.");
        closeEditModal();
        return;
    }
    
    // Update expense
    const expenseIndex = expenses.indexOf(selectedExpense);
    if (expenseIndex === -1) {
        alert("Expense not found. It may have been deleted.");
        closeEditModal();
        selectedExpense = null;
        renderExpenses();
        return;
    }
    
    // Save updated expense
    expenses[expenseIndex] = {
        note: editData.note,
        amount: editData.amount,
        date: editData.date,
        category: editData.category
    };
    
    localStorage.setItem("expenses", JSON.stringify(expenses));
    selectedExpense = null;
    
    refreshAllDisplays();
    closeEditModal();
}

/**
 * Validates edit form data
 * @param {Object} editData - Edit form data to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateEditData(editData) {
    if (!editData.note) {
        alert("Please enter an expense name");
        return false;
    }
    
    if (isNaN(editData.amount) || editData.amount <= 0) {
        alert("Please enter a valid amount greater than 0");
        return false;
    }
    
    if (!editData.date) {
        alert("Please enter a valid date");
        return false;
    }
    
    if (!editData.category) {
        alert("Please select a category");
        return false;
    }
    
    return true;
}

// ============================================================================
// EXPENSE RENDERING FUNCTIONS
// ============================================================================

/**
 * Renders all expenses grouped by month in the expense list
 */
function renderExpenses() {
    const expenseList = document.getElementById("expense-list");
    if (!expenseList) return;
    
    expenseList.innerHTML = "";
    
    const emptyState = document.getElementById("emptyState");
    const totalAmount = document.getElementById("total");
    
    if (!emptyState || !totalAmount) return;
    
    // Show empty state if no expenses
    if (expenses.length === 0) {
        emptyState.style.display = "block";
        expenseList.innerHTML = "";
        totalAmount.textContent = "Total: £0.00";
        return;
    }
    
    emptyState.style.display = "none";
    
    // Group expenses by month and render
    const grouped = groupExpensesByMonth();
    
    for (const month in grouped) {
        const monthContainer = createMonthContainer(month, grouped[month]);
        expenseList.appendChild(monthContainer);
    }
}

/**
 * Creates a container element for a month's expenses
 * @param {string} month - Month label (e.g., "January 2024")
 * @param {Array} monthExpenses - Array of expenses for this month
 * @returns {HTMLElement} Month container element
 */
function createMonthContainer(month, monthExpenses) {
    const monthDiv = document.createElement("div");
    monthDiv.classList.add("month");
    
    // Month header
    const monthHeader = document.createElement("h3");
    monthHeader.textContent = month;
    monthDiv.appendChild(monthHeader);
    
    // Calculate and display month total
    const monthTotal = calculateMonthTotal(monthExpenses);
    const monthTotalEl = document.createElement("p");
    monthTotalEl.textContent = `Month Total: £${monthTotal.toFixed(2)}`;
    monthDiv.appendChild(monthTotalEl);
    
    // Display category totals
    const categoryTotals = calculateCategoryTotals(monthExpenses);
    for (const category in categoryTotals) {
        const categoryEl = document.createElement("p");
        categoryEl.textContent = `${category}: £${categoryTotals[category].toFixed(2)}`;
        monthDiv.appendChild(categoryEl);
    }
    
    // Create expense list items
    monthExpenses.forEach((expense, index) => {
        const expenseItem = createExpenseListItem(expense, index, month);
        monthDiv.appendChild(expenseItem);
    });
    
    return monthDiv;
}

/**
 * Calculates the total amount for a month's expenses
 * @param {Array} monthExpenses - Array of expenses for the month
 * @returns {number} Total amount
 */
function calculateMonthTotal(monthExpenses) {
    if (!Array.isArray(monthExpenses)) {
        return 0;
    }
    
    return monthExpenses.reduce((sum, exp) => {
        if (!exp || typeof exp.amount !== 'number' || isNaN(exp.amount)) {
            return sum; // Skip invalid expenses
        }
        return sum + exp.amount;
    }, 0);
}

/**
 * Creates a list item element for a single expense
 * @param {Object} expense - Expense object
 * @param {number} index - Index of expense in month array
 * @param {string} monthKey - Month key for grouping
 * @returns {HTMLElement} List item element
 */
function createExpenseListItem(expense, index, monthKey) {
    const li = document.createElement("li");
    li.classList.add("expense-item");
    li.style.cursor = "pointer";
    
    // Make expense item clickable for editing
    li.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON") {
            return; // Don't trigger if clicking delete button
        }
        
        // Deselect other items
        document.querySelectorAll(".expense-item").forEach(item => {
            item.classList.remove("selected");
        });
        
        // Select this expense
        selectedExpense = expense;
        li.classList.add("selected");
        
        // Prompt user to edit
        const wantsToEdit = confirm(`Edit "${expense.note}"?`);
        if (wantsToEdit) {
            openEditModal(selectedExpense);
        } else {
            // Deselect if user cancels
            selectedExpense = null;
            li.classList.remove("selected");
        }
    });
    
    // Expense text
    const expenseText = document.createElement("span");
    expenseText.textContent = `${expense.note} - £${expense.amount.toFixed(2)} (${expense.category})`;
    expenseText.style.flex = "1";
    li.appendChild(expenseText);
    
    // Delete button
    const deleteBtn = createDeleteButton(index, monthKey);
    li.appendChild(deleteBtn);
    
    return li;
}

/**
 * Creates a delete button for an expense item
 * @param {number} index - Index of expense in month array
 * @param {string} monthKey - Month key for grouping
 * @returns {HTMLElement} Delete button element
 */
function createDeleteButton(index, monthKey) {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "x";
    deleteBtn.style.marginLeft = "8px";
    
    deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent triggering the li click
        deleteExpense(index, monthKey);
    });
    
    return deleteBtn;
}

// ============================================================================
// EXPENSE DATA MANIPULATION FUNCTIONS
// ============================================================================

/**
 * Deletes an expense from the array
 * @param {number} index - Index of expense in the month's array
 * @param {string} monthKey - Month key for grouping
 */
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
    
    // Remove expense and save
    expenses.splice(realIndex, 1);
    localStorage.setItem("expenses", JSON.stringify(expenses));
    
    refreshAllDisplays();
}

// ============================================================================
// DATA GROUPING AND CALCULATION FUNCTIONS
// ============================================================================

/**
 * Groups expenses by month
 * @returns {Object} Object with month keys and expense arrays as values
 */
function groupExpensesByMonth() {
    const grouped = {};
    
    expenses.forEach(expense => {
        // Validate expense structure
        if (!expense || typeof expense !== 'object' || !expense.date) {
            return; // Skip invalid expenses
        }
        
        const key = getMonthKey(expense.date);
        
        if (!grouped[key]) {
            grouped[key] = [];
        }
        
        grouped[key].push(expense);
    });
    
    return grouped;
}

/**
 * Converts a date string to a readable month key (e.g., "January 2024")
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} Formatted month key
 */
function getMonthKey(dateString) {
    const date = new Date(dateString);
    if (isNaN(date)) return "No Date";
    
    const year = date.getFullYear();
    const monthName = date.toLocaleString("en-UK", { month: "long" });
    
    return `${monthName} ${year}`;
}

/**
 * Calculates totals for each category in an array of expenses
 * @param {Array} expensesArray - Array of expense objects
 * @returns {Object} Object with category names as keys and totals as values
 */
function calculateCategoryTotals(expensesArray) {
    if (!Array.isArray(expensesArray)) {
        return {};
    }
    
    const totals = {};
    
    expensesArray.forEach(expense => {
        if (!expense || typeof expense !== 'object') {
            return; // Skip invalid expenses
        }
        
        const category = expense.category || "other";
        const amount = typeof expense.amount === 'number' && !isNaN(expense.amount) 
            ? expense.amount 
            : 0;
        
        if (!totals[category]) {
            totals[category] = 0;
        }
        
        totals[category] += amount;
    });
    
    return totals;
}

/**
 * Calculates and displays the total of all expenses
 */
function calculateTotal() {
    const totalEl = document.getElementById("total");
    if (!totalEl) return;
    
    // Safely calculate total, handling invalid amounts
    const total = expenses.reduce((sum, exp) => {
        if (!exp || typeof exp.amount !== 'number' || isNaN(exp.amount)) {
            return sum; // Skip invalid expenses
        }
        return sum + exp.amount;
    }, 0);
    
    totalEl.textContent = `Total: £${total.toFixed(2)}`;
}

// ============================================================================
// DASHBOARD FUNCTIONS
// ============================================================================

/**
 * Updates the dashboard with current month's statistics
 */
function updateDashboard() {
    const monthlyTotalEl = document.getElementById("MonthlyTotal");
    const topCategoryEl = document.getElementById("top-category");
    const averageExpenseEl = document.getElementById("average-expense");
    
    if (!monthlyTotalEl || !topCategoryEl || !averageExpenseEl) {
        return; // Elements not found yet
    }
    
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM format
    
    // Filter expenses for current month
    const monthlyExpenses = expenses.filter(exp => 
        exp && exp.date && typeof exp.date === 'string' && exp.date.startsWith(currentMonth)
    );
    
    // Calculate and display monthly total (with validation)
    const monthlyTotal = monthlyExpenses.reduce((sum, e) => {
        if (!e || typeof e.amount !== 'number' || isNaN(e.amount)) {
            return sum;
        }
        return sum + e.amount;
    }, 0);
    monthlyTotalEl.textContent = `Total: £${monthlyTotal.toFixed(2)}`;
    
    // Find top spending category
    const topCategory = findTopCategory(monthlyExpenses);
    topCategoryEl.textContent = topCategory;
    
    // Calculate and display average daily expense
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const averageExpense = daysInMonth > 0 ? monthlyTotal / daysInMonth : 0;
    averageExpenseEl.textContent = `£${averageExpense.toFixed(2)}`;
}

/**
 * Finds the category with the highest spending
 * @param {Array} monthlyExpenses - Array of expenses for the month
 * @returns {string} Category name with highest spending, or "-" if none
 */
function findTopCategory(monthlyExpenses) {
    if (!Array.isArray(monthlyExpenses)) {
        return "-";
    }
    
    const categoryMap = {};
    
    monthlyExpenses.forEach(exp => {
        if (!exp || typeof exp !== 'object') {
            return; // Skip invalid expenses
        }
        
        if (exp.category && typeof exp.amount === 'number' && !isNaN(exp.amount)) {
            categoryMap[exp.category] = (categoryMap[exp.category] || 0) + exp.amount;
        }
    });
    
    let topCategory = "-";
    let maxAmount = 0;
    
    for (let category in categoryMap) {
        if (categoryMap[category] > maxAmount) {
            maxAmount = categoryMap[category];
            topCategory = category;
        }
    }
    
    return topCategory;
}

// ============================================================================
// CSV EXPORT FUNCTIONS
// ============================================================================

/**
 * Exports all expenses to a CSV file
 */
function exportCSV() {
    if (expenses.length === 0) {
        alert("No expenses to export");
        return;
    }
    
    try {
        const csvContent = generateCSVContent();
        downloadCSVFile(csvContent);
    } catch (error) {
        console.error("Error exporting CSV:", error);
        alert("Error exporting CSV: " + error.message);
    }
}

/**
 * Generates CSV content from expenses array
 * @returns {string} CSV formatted string
 */
function generateCSVContent() {
    const headers = ["Date", "Note", "Amount", "Category"];
    
    const rows = expenses.map(exp => [
        escapeCSVValue(exp.date),
        escapeCSVValue(exp.note),
        escapeCSVValue(exp.amount),
        escapeCSVValue(exp.category)
    ]);
    
    return headers.join(",") + "\n" + rows.map(row => row.join(",")).join("\n");
}

/**
 * Escapes CSV values to handle commas, quotes, and newlines
 * @param {*} value - Value to escape
 * @returns {string} Escaped CSV value
 */
function escapeCSVValue(value) {
    if (value === null || value === undefined) return "";
    
    const stringValue = String(value);
    
    // If value contains special characters, wrap in quotes and escape internal quotes
    if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
}

/**
 * Creates and triggers download of CSV file
 * @param {string} csvContent - CSV content string
 */
function downloadCSVFile(csvContent) {
    // Add BOM for Excel compatibility
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement("a");
    link.href = url;
    link.download = "winner-expenses.csv";
    link.style.display = "none";
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Clean up after a short delay
    setTimeout(() => {
        if (link.parentNode) {
            document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
    }, 100);
}

// ============================================================================
// CHART FUNCTIONS
// ============================================================================

/**
 * Renders the monthly expenses chart
 */
function renderChart() {
    rendermonthlyChart();
}

/**
 * Renders the monthly expenses bar chart using Chart.js
 */
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
    
    // Destroy existing chart if it exists
    if (monthlyChart) {
        monthlyChart.destroy();
    }
    
    // Get chart height for gradient (use computed height or default)
    const chartHeight = chartElement.offsetHeight || 350;
    
    // Create gradients for chart bars
    const gradients = createChartGradients(ctx, chartHeight);
    
    // Create and configure chart
    monthlyChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Monthly Expenses",
                data: data,
                backgroundColor: gradients.background,
                borderColor: gradients.border,
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
                barThickness: 'flex',
                maxBarThickness: 60
            }]
        },
        options: getChartOptions()
    });
}

/**
 * Creates gradient objects for chart styling
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {Object} Object containing background and border gradients
 */
function createChartGradients(ctx, chartHeight = 400) {
    // Use dynamic height for gradient to match chart size
    const backgroundGradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    backgroundGradient.addColorStop(0, 'rgba(99, 102, 241, 0.8)');  // Indigo
    backgroundGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.7)'); // Purple
    backgroundGradient.addColorStop(1, 'rgba(168, 85, 247, 0.6)');  // Light purple
    
    const borderGradient = ctx.createLinearGradient(0, 0, 0, chartHeight);
    borderGradient.addColorStop(0, 'rgba(99, 102, 241, 1)');
    borderGradient.addColorStop(1, 'rgba(168, 85, 247, 1)');
    
    return {
        background: backgroundGradient,
        border: borderGradient
    };
}

/**
 * Gets chart configuration options
 * @returns {Object} Chart.js options object
 */
function getChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 1500,
            easing: 'easeInOutQuart'
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#374151',
                    font: {
                        family: "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif",
                        size: 14,
                        weight: 'bold'
                    },
                    padding: 20,
                    usePointStyle: true,
                    pointStyle: 'circle'
                }
            },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                padding: 16,
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: 'rgba(99, 102, 241, 0.5)',
                borderWidth: 2,
                cornerRadius: 12,
                displayColors: true,
                titleFont: {
                    family: "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif",
                    size: 16,
                    weight: 'bold'
                },
                bodyFont: {
                    family: "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif",
                    size: 14
                },
                callbacks: {
                    label: function(context) {
                        if (!context || !context.parsed) return '';
                        return 'Amount: £' + context.parsed.y.toLocaleString('en-GB', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        });
                    },
                    title: function(context) {
                        if (!context || !context[0] || !context[0].label) return '';
                        return context[0].label;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: {
                    display: false,
                    drawBorder: false
                },
                ticks: {
                    color: '#6B7280',
                    font: {
                        family: "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif",
                        size: 12,
                        weight: '500'
                    },
                    padding: 12
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(229, 231, 235, 0.5)',
                    lineWidth: 1,
                    drawBorder: false
                },
                ticks: {
                    color: '#6B7280',
                    font: {
                        family: "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif",
                        size: 12,
                        weight: '500'
                    },
                    padding: 12,
                    callback: function(value) {
                        return '£' + value.toLocaleString('en-GB', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                        });
                    }
                }
            }
        },
        interaction: {
            intersect: false,
            mode: 'index'
        }
    };
}

/**
 * Gets monthly totals for chart display
 * @returns {Object} Object with labels and data arrays
 */
function getMonthlyTotals() {
    const monthlyMap = {};
    
    // Group expenses by month
    expenses.forEach(expense => {
        // Validate expense structure
        if (!expense || typeof expense !== 'object') {
            return; // Skip invalid expenses
        }
        
        if (!expense.date || typeof expense.date !== 'string') {
            return; // Skip expenses with invalid dates
        }
        
        // Validate amount is a number
        if (typeof expense.amount !== 'number' || isNaN(expense.amount)) {
            return; // Skip expenses with invalid amounts
        }
        
        const month = expense.date.slice(0, 7); // YYYY-MM format
        
        if (month.length === 7) {
            monthlyMap[month] = (monthlyMap[month] || 0) + expense.amount;
        }
    });
    
    // Sort months chronologically
    const sortedMonths = Object.keys(monthlyMap).sort();
    
    // Format labels to be readable (e.g., "2024-01" -> "January 2024")
    const labels = sortedMonths.map(monthStr => {
        try {
            const [year, month] = monthStr.split('-');
            const yearNum = parseInt(year, 10);
            const monthNum = parseInt(month, 10);
            
            if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
                return monthStr; // Return original if invalid
            }
            
            const date = new Date(yearNum, monthNum - 1);
            if (isNaN(date.getTime())) {
                return monthStr; // Return original if invalid date
            }
            
            return date.toLocaleString("en-UK", { month: "long", year: "numeric" });
        } catch (error) {
            console.warn("Error formatting month label:", monthStr, error);
            return monthStr; // Return original on error
        }
    });
    
    // Extract data values
    const data = sortedMonths.map(month => monthlyMap[month]);
    
    return {labels, data};
}
