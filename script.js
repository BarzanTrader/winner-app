/* ============================================================================
 * WINNER EXPENSE TRACKER - Main Application Script
 * ============================================================================
 * This application manages expense tracking with the following features:
 * - Add, edit, and delete expenses
 * - Monthly expense visualization
 * - Dashboard with key metrics
 * - CSV export functionality
 * - Local storage persistence
 * ============================================================================
 * Firebase: Uses compat SDK (firebase-app-compat, firebase-firestore-compat).
 * Firebase v9 modular imports can be adopted in a future migration without
 * breaking existing features.
 * ============================================================================ */


// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCetUZwLUa8bxN1tl9MqyryPlYeD-Y59fQ",
    authDomain: "winner-app-1bd1c.firebaseapp.com",
    projectId: "winner-app-1bd1c",
    storageBucket: "winner-app-1bd1c.firebasestorage.app",
    messagingSenderId: "989056268967",
    appId: "1:989056268967:web:295ca8bfd1c885ae8cb982"
};

// Initialize Firebase (with error handling)
let app = null;
let db = null;

// Initialize Firebase when DOM is ready
async function initializeFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            console.warn("⚠️ Firebase SDK not loaded - app will work offline only");
            console.warn("Make sure Firebase scripts are loaded before script.js");
            return false;
        }
        
        // Check if already initialized
        try {
            app = firebase.app();
            console.log("Firebase app already initialized");
        } catch (e) {
            // Not initialized, create new app
            app = firebase.initializeApp(firebaseConfig);
            console.log("✅ Firebase app initialized");
        }
        
        db = firebase.firestore();
        console.log("✅ Firestore database initialized");
        console.log("Database object:", db ? "Available" : "Not available");
        console.log("db type:", typeof db);
        console.log("db.collection:", typeof db.collection);
        
        // Verify db is working
        if (db && typeof db.collection === 'function') {
            console.log("✅ Firestore db object is valid and ready");
        } else {
            console.error("❌ Firestore db object is invalid!");
            return false;
        }
        
        // Enable offline persistence (non-blocking; don't fail init)
        db.enablePersistence().then(function() {
            console.log("✅ Firestore offline persistence enabled");
        }).catch(function(persistenceError) {
            console.warn("⚠️ Offline persistence:", persistenceError);
        });

        // Test connection with timeout so we don't hang the app
        var connectionTimeout = new Promise(function(_, reject) {
            setTimeout(function() { reject(new Error("Connection timeout")); }, 6000);
        });
        Promise.race([testFirebaseConnection(), connectionTimeout]).catch(function(e) {
            console.warn("Firebase connection test:", e && e.message ? e.message : e);
        });

        // Create base collections on initialization (non-blocking)
        createBaseCollections().catch(function(err) {
            console.error("Failed to create base collections:", err);
        });

        return true;
    } catch (error) {
        console.error("❌ Firebase initialization error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        return false;
    }
}

/**
 * Tests Firebase connection
 */
async function testFirebaseConnection() {
    if (!db) {
        console.warn("⚠️ Cannot test connection - db not initialized");
        return;
    }
    
    try {
        // Try a simple read operation
        const testSnapshot = await db.collection("expenses").limit(1).get();
        console.log("✅ Firebase connection test successful");
        console.log("Can read from Firestore");
    } catch (error) {
        console.error("❌ Firebase connection test failed");
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        
        if (error.code === 'permission-denied') {
            console.error("⚠️ PERMISSION DENIED - Check Firestore security rules!");
            console.error("Your Firestore rules may be blocking read/write operations.");
        }
    }
}

async function createBaseCollections() {
    if (!db) {
        console.warn("Firestore database not initialized");
        return;
    }
    
    // Collections to ensure exist (init doc added only if collection is empty). Includes "stocks", "mortgages", "aiInsights".
    const collections = ["users", "expenses", "hours", "income", "settings", "waitlist", "recurring_bills", "saving_goals", "work_sessions", "stocks", "mortgages", "aiInsights", "notifications"];
    
    try {
        for (const collectionName of collections) {
            // Check if collection exists by trying to read it
            const snapshot = await db.collection(collectionName).limit(1).get();
            
            // If collection is empty, add an initialization document
            if (snapshot.empty) {
                await db.collection(collectionName).add({
                    init: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ Collection "${collectionName}" initialized`);
            }
        }
        console.log("✅ All base collections ready");
    } catch (error) {
        console.error("Error creating base collections:", error);
    }
}

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let expenses = [];              // Array storing all expense objects
let selectedExpense = null;     // Currently selected expense for editing
let monthlyChart = null;        // Chart.js instance for monthly chart
let categoryChart = null;       // Chart.js instance for category chart
let incomeVsExpensesChart = null; // Chart.js instance for Income vs Expenses (weekly)
let dashboardIncomeVsExpensesChart = null; // Dashboard panel: income vs expenses by week
let dashboardExpensesByCategoryChart = null; // Dashboard panel: expenses by category
let selectedMonthFilter = "current"; // 'current', 'all', or specific 'YYYY-MM'

// Hourly tracker: current session and live timer
let hourlySessionDocId = null;
let hourlySessionStartTime = null;
let hourlyTimerIntervalId = null;
let currentHourlyRate = 0;
/** Savings percentage (0–100), from user_settings */
let currentSavingsPercent = 0;
/** Holiday accrual rate, UK/Italian style approximation (12.07% of hours worked) */
var HOLIDAY_ACCRUAL_RATE = 0.1207;
/** When set, user clicked Stop work and we're waiting for break duration before saving */
let hourlySessionPausedAt = null;

// ============================================================================
// INITIALIZATION - DOM Content Loaded
// ============================================================================

document.addEventListener("DOMContentLoaded", async function() {
    // Set up app and event listeners first so buttons work even if Firebase hangs
    try {
        initializeApp();
    } catch (e) {
        console.error("initializeApp error:", e);
    }
    // Wait a bit for Firebase SDK to load if needed
    var attempts = 0;
    while (typeof firebase === 'undefined' && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    // Initialize Firebase first and wait for it to be ready
    var firebaseReady = false;
    try {
        firebaseReady = await Promise.race([
            initializeFirebase(),
            new Promise(function(_, rej) { setTimeout(function() { rej(new Error("timeout")); }, 8000); })
        ]);
    } catch (e) {
        console.warn("Firebase init:", e && e.message ? e.message : e);
    }
    
    if (!firebaseReady) {
        console.warn("⚠️ Firebase not initialized - app will work in offline mode");
    } else {
        console.log("✅ Firebase fully initialized and ready");
        // Verify db is accessible globally
        console.log("Global db variable:", db);
        console.log("Global app variable:", app);
    }
    
    // App already initialized above so buttons work; load data after Firebase
    loadSummary().catch(function(err) { console.warn("loadSummary on init:", err); });
    loadRecurringBills().catch(function(err) { console.warn("loadRecurringBills on init:", err); });
    loadSavingGoals().catch(function(err) { console.warn("loadSavingGoals on init:", err); });
    loadUserSettingsHourlyRate().then(function() { return loadWorkSessions(); }).catch(function(err) { console.warn("Hourly tracker on init:", err); });
    loadAppPreferences().then(function() { populateCategoryDropdowns(); }).catch(function(err) { console.warn("loadAppPreferences on init:", err); });
    loadPortfolioFromFirestore().catch(function(e) { console.warn("loadPortfolio on init:", e); });
    loadMortgages().catch(function(e) { console.warn("loadMortgages on init:", e); });
    setTimeout(function() {
        loadExpensesFromStorage().catch(function(err) { console.warn("Delayed load expenses:", err); });
        loadSummary().catch(function(err) { console.warn("Delayed loadSummary:", err); });
        loadRecurringBills().catch(function(err) { console.warn("Delayed loadRecurringBills:", err); });
        loadSavingGoals().catch(function(err) { console.warn("Delayed loadSavingGoals:", err); });
        loadUserSettingsHourlyRate().then(function() { return loadWorkSessions(); }).catch(function(err) { console.warn("Delayed hourly tracker:", err); });
        loadPortfolioFromFirestore().catch(function(e) { console.warn("Delayed loadPortfolio:", e); });
        loadMortgages().catch(function(e) { console.warn("Delayed loadMortgages:", e); });
    }, 2000);
    document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === "visible" && db && typeof db.collection === "function") {
            loadExpensesFromStorage().catch(function(err) { console.warn("Visibility refresh load:", err); });
            loadSummary().catch(function(err) { console.warn("Visibility loadSummary:", err); });
            loadRecurringBills().catch(function(err) { console.warn("Visibility loadRecurringBills:", err); });
            loadSavingGoals().catch(function(err) { console.warn("Visibility loadSavingGoals:", err); });
            loadAppPreferences().catch(function(err) { console.warn("Visibility loadAppPreferences:", err); });
            loadPortfolioFromFirestore().catch(function(e) { console.warn("Visibility loadPortfolio:", e); });
            loadMortgages().catch(function(e) { console.warn("Visibility loadMortgages:", e); });
        }
    });
    
    // Add global diagnostic function for debugging
    window.checkFirebaseStatus = function() {
        console.log("=== Firebase Status Check ===");
        console.log("Firebase SDK loaded:", typeof firebase !== 'undefined');
        console.log("App initialized:", app !== null);
        console.log("DB initialized:", db !== null);
        console.log("DB type:", typeof db);
        console.log("DB.collection exists:", db && typeof db.collection === 'function');
        console.log("Firebase config:", firebaseConfig);
        return {
            sdkLoaded: typeof firebase !== 'undefined',
            appInitialized: app !== null,
            dbInitialized: db !== null,
            dbValid: db && typeof db.collection === 'function'
        };
    };
    
    // Add test function to manually test Firestore write
    window.testFirestoreWrite = async function() {
        console.log("=== Testing Firestore Write ===");
        try {
            if (!db) {
                console.error("❌ DB not initialized");
                return false;
            }
            
            const testData = {
                amount: 1.00,
                description: "Test expense",
                category: "Test",
                note: "Test expense",
                date: new Date().toISOString().split('T')[0],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            console.log("📤 Attempting to write test data:", testData);
            const docRef = await db.collection("expenses").add(testData);
            console.log("✅ Test write successful!");
            console.log("📄 Document ID:", docRef.id);
            
            // Try to read it back
            const doc = await docRef.get();
            console.log("✅ Test read successful!");
            console.log("📄 Document data:", doc.data());
            
            return true;
        } catch (error) {
            console.error("❌ Test write failed!");
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            console.error("Full error:", error);
            
            if (error.code === 'permission-denied') {
                console.error("⚠️ PERMISSION DENIED!");
                console.error("Your Firestore security rules are blocking writes.");
                console.error("Go to Firebase Console > Firestore Database > Rules");
                console.error("Update rules to allow writes. Example rule:");
                console.error("match /expenses/{document=**} {");
                console.error("  allow read, write: if true;");
                console.error("}");
            }
            
            return false;
        }
    };
    
    // Add function to verify expenses in Firestore
    window.verifyFirestoreExpenses = async function() {
        console.log("=== Verifying Expenses in Firestore ===");
        try {
            if (!db) {
                console.error("❌ DB not initialized");
                return;
            }
            
            const snapshot = await db.collection("expenses").get();
            console.log(`✅ Found ${snapshot.size} documents in Firestore`);
            
            const expenses = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (!data.init) { // Skip init documents
                    expenses.push({
                        id: doc.id,
                        ...data
                    });
                }
            });
            
            console.log(`✅ Found ${expenses.length} actual expenses (excluding init docs)`);
            console.table(expenses);
            
            // Compare with local storage
            const localExpenses = JSON.parse(localStorage.getItem("expenses") || "[]");
            console.log(`📦 Local storage has ${localExpenses.length} expenses`);
            
            if (expenses.length !== localExpenses.length) {
                console.warn("⚠️ Mismatch between Firestore and local storage!");
                console.log("Firestore IDs:", expenses.map(e => e.id));
                console.log("Local storage IDs:", localExpenses.map(e => e.id || "NO ID"));
            } else {
                console.log("✅ Firestore and local storage match!");
            }
            
            return expenses;
        } catch (error) {
            console.error("❌ Error verifying expenses:", error);
            return null;
        }
    };
    
    console.log("💡 Tip: Run checkFirebaseStatus() to check Firebase status");
    console.log("💡 Tip: Run testFirestoreWrite() to test writing to Firestore");
    console.log("💡 Tip: Run verifyFirestoreExpenses() to see all expenses in Firestore");
});


async function joinWaitlist(email) {
    if (!db || typeof db.collection !== 'function') {
        throw new Error("Firestore not available");
    }
    await db.collection("waitlist").add({
        email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        source: "app"
    });
    console.log("✅ Waitlist entry added to Firestore");
}
/**
 * Initializes the application by setting up DOM references, loading data,
 * and attaching event listeners
 */
function initializeApp() {
    // Get DOM element references
    const domElements = getDOMElements();
    
    // Check if onboarding is needed
    checkAndShowOnboarding();
    
    // Load saved expenses from Firestore (with localStorage fallback)
    loadExpensesFromStorage().catch(err => {
        console.error("Failed to load expenses:", err);
    });
    
    // Set up event listeners
    setupEventListeners(domElements);
    
    // Set up waitlist form
    setupWaitlistListener();
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
        typeInput: document.getElementById("expenseType"),
        billScheduleInput: document.getElementById("billSchedule"),
        monthlyTotalCard: document.getElementById("monthlyTotalCard"),
        biggestCategoryCard: document.getElementById("biggestCategoryCard"),
        avgExpenseCard: document.getElementById("avgExpenseCard"),
        toggleMonthlyChartBtn: document.getElementById("toggleMonthlyChartBtn"),
        toggleCategoryChartBtn: document.getElementById("toggleCategoryChartBtn"),
        toggleExpenseListBtn: document.getElementById("toggleExpenseListBtn"),
        monthlyChartSection: document.getElementById("monthlyChartSection"),
        categoryChartSection: document.getElementById("categoryChartSection"),
        expenseSearchInput: document.getElementById("expenseSearch"),
        clearAllBtn: document.getElementById("clearAllBtn"),
        editBtn: document.getElementById("editBtn"),
        exportBtn: document.getElementById("exportbtn"),
        homeTab: document.getElementById("homeTab"),
        expensesTab: document.getElementById("expensesTab"),
        historyTab: document.getElementById("historyTab"),
        hourlyTab: document.getElementById("hourlyTab"),
        stocksTab: document.getElementById("stocksTab"),
        mortgageTab: document.getElementById("mortgageTab"),
        settingsTab: document.getElementById("settingsTab"),
        homePage: document.getElementById("homePage"),
        expensesPage: document.getElementById("expensesPage"),
        historyPage: document.getElementById("historyPage"),
        hourlyPage: document.getElementById("hourlyPage"),
        stocksPage: document.getElementById("stocksPage"),
        mortgagePage: document.getElementById("mortgagePage"),
        settingsPage: document.getElementById("settingsPage"),
        monthFilter: document.getElementById("monthFilter"),
        onboardingModal: document.getElementById("onboardingModal"),
        skipOnboardingBtn: document.getElementById("skipOnboarding"),
        nextOnboardingBtn: document.getElementById("nextOnboarding"),
        waitlistForm: document.getElementById("waitlistForm"),
        waitlistEmail: document.getElementById("waitlistEmail"),
        waitlistMsg: document.getElementById("waitlistMsg"),
        startWorkBtn: document.getElementById("startWorkBtn"),
        stopWorkBtn: document.getElementById("stopWorkBtn"),
        startWorkMsg: document.getElementById("startWorkMsg"),
        hourlyTimerDisplay: document.getElementById("hourlyTimerDisplay")
    };
}

/**
 * Sets up waitlist form functionality
 */
function setupWaitlistListener() {
    const waitlistForm = document.getElementById("waitlistForm");
    const waitlistEmail = document.getElementById("waitlistEmail");
    const waitlistMsg = document.getElementById("waitlistMsg");
    
    if (!waitlistForm || !waitlistEmail || !waitlistMsg) return;
    
    waitlistForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const email = waitlistEmail.value.trim();
        if (!email) return;
        
        const list = JSON.parse(localStorage.getItem("waitlist")) || [];
        if (list.includes(email)) {
            waitlistMsg.textContent = "You are already on the waitlist!";
            waitlistMsg.style.display = "block";
            return;
        }
        
        try {
            if (db && typeof db.collection === 'function') {
                await joinWaitlist(email);
            }
            list.push(email);
            localStorage.setItem("waitlist", JSON.stringify(list));
            waitlistMsg.textContent = "Thank you for joining the waitlist!";
            waitlistMsg.style.display = "block";
            waitlistEmail.value = "";
        } catch (error) {
            console.error("Waitlist error:", error);
            waitlistMsg.textContent = "Something went wrong. Please try again.";
            waitlistMsg.style.display = "block";
        }
    });
}

/**
 * Sets up the month filter dropdown on the history page
 * @param {HTMLSelectElement} monthFilter
 */
function setupMonthFilterListener(monthFilter) {
    if (!monthFilter) return;

    monthFilter.addEventListener("change", () => {
        const value = monthFilter.value;
        selectedMonthFilter = value || "current";
        console.log("Selected month filter:", selectedMonthFilter);

        // Refresh views that depend on month
        calculateAndDisplayTotals();
        renderExpenses();
        renderCategoryChart();
        updateDashboard();
    });
}

/**
 * Sets up live filtering of the expense list by a search query
 * @param {HTMLInputElement} searchInput
 */
function setupExpenseSearchListener(searchInput) {
    if (!searchInput) return;

    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim().toLowerCase();
        const expenseList = document.getElementById("expense-list");
        if (!expenseList) return;

        const monthContainers = expenseList.querySelectorAll(".month");

        monthContainers.forEach(monthDiv => {
            const items = monthDiv.querySelectorAll(".expense-item");
            let anyVisible = false;

            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                const match = !query || text.includes(query);
                item.style.display = match ? "" : "none";
                if (match) anyVisible = true;
            });

            // Hide entire month section if no visible items
            monthDiv.style.display = anyVisible ? "" : "none";
        });
    });
}

/**
 * Loads expenses from Firestore (with localStorage fallback) and initializes the UI
 */
function parseExpenseDate(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value && typeof value.toDate === "function") {
        try { return value.toDate().toISOString().slice(0, 10); } catch (e) { return ""; }
    }
    return String(value);
}

async function loadExpensesFromStorage() {
    // Try to load from Firestore first
    if (db && typeof db.collection === "function") {
        try {
            const snapshot = await db.collection("expenses").get();
            expenses = [];
            
            snapshot.forEach(function(doc) {
                const data = doc.data();
                if (data && data.init === true) return;
                var note = (data && (data.description != null ? data.description : (data.note != null ? data.note : data.notes))) || "";
                var amount = Number(data && data.amount);
                if (isNaN(amount)) amount = 0;
                var date = parseExpenseDate(data && data.date);
                var category = (data && data.category != null && String(data.category).trim()) ? String(data.category).trim() : "Other";
                var typeVal = (data.type === "bill" || data.type === "spending") ? data.type : "spending";
                var billSched = (typeVal === "bill" && (data.billSchedule === "recurring" || data.billSchedule === "single")) ? data.billSchedule : "single";
                var recurringBillId = (data.recurringBillId && typeof data.recurringBillId === "string") ? data.recurringBillId : null;
                expenses.push({
                    id: doc.id,
                    note: String(note),
                    amount: amount,
                    date: date,
                    category: category,
                    type: typeVal,
                    billSchedule: billSched,
                    recurringBillId: recurringBillId || undefined
                });
            });

            // Backfill: ensure every expense doc has description and category (fire-and-forget)
            try {
                snapshot.forEach(function(doc) {
                    var d = doc.data();
                    if (d && d.init === true) return;
                    var needsDesc = d.description === undefined || d.description === null;
                    var needsCat = d.category === undefined || d.category === null || String(d.category).trim() === "";
                    if (needsDesc || needsCat) {
                        var update = {};
                        if (needsDesc) update.description = (d.note != null ? String(d.note) : (d.notes != null ? String(d.notes) : ""));
                        if (needsCat) update.category = "Other";
                        db.collection("expenses").doc(doc.id).update(update).catch(function(e) { console.warn("Backfill description/category for " + doc.id + ":", e); });
                    }
                });
            } catch (backfillErr) {
                console.warn("Backfill description/category:", backfillErr);
            }

            // Backfill: any expense with type bill + recurring but no recurringBillId gets a doc in recurring_bills
            if (typeof firebase !== "undefined" && firebase.firestore && firebase.firestore.FieldValue) {
                for (var i = 0; i < expenses.length; i++) {
                    var exp = expenses[i];
                    if (exp && exp.type === "bill" && exp.billSchedule === "recurring" && !exp.recurringBillId && exp.id) {
                        try {
                            var dueDay = 1;
                            if (exp.date && typeof exp.date === "string" && exp.date.length >= 10) {
                                var d = parseInt(exp.date.slice(8, 10), 10);
                                if (!isNaN(d) && d >= 1 && d <= 31) dueDay = d;
                            }
                            var rbRef = await db.collection("recurring_bills").add({
                                amount: exp.amount,
                                note: exp.note || "",
                                name: exp.note || "",
                                expenseId: exp.id,
                                dueDayOfMonth: dueDay,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                            exp.recurringBillId = rbRef.id;
                            await db.collection("expenses").doc(exp.id).update({ recurringBillId: rbRef.id });
                        } catch (backfillErr) {
                            console.warn("Backfill recurring_bills for expense " + exp.id + ":", backfillErr);
                        }
                    }
                }
            }

            localStorage.setItem("expenses", JSON.stringify(expenses));
            console.log("Loaded " + expenses.length + " expenses from Firestore");
            calculateAndDisplayTotals();
            populateMonthFilterOptions();
            loadRecurringBills().catch(function(e) { console.warn("loadRecurringBills after load:", e); });
            refreshAllDisplays();
            return;
        } catch (error) {
            console.error("Error loading expenses from Firestore:", error);
        }
    }

    // Fallback to localStorage
    const savedExpenses = localStorage.getItem("expenses");
    
    if (savedExpenses) {
        try {
            expenses = JSON.parse(savedExpenses);
            expenses.forEach(function(exp) {
                if (exp && (exp.type !== "bill" && exp.type !== "spending")) exp.type = "spending";
                if (exp && (exp.billSchedule !== "recurring" && exp.billSchedule !== "single")) exp.billSchedule = "single";
            });
            // Calculate and display totals
            calculateAndDisplayTotals();
            populateMonthFilterOptions();
            refreshAllDisplays();
        } catch (error) {
            console.error("Error parsing saved expenses:", error);
            expenses = [];
            localStorage.removeItem("expenses");
        }
    } else {
        // Initialize dashboard even if no expenses exist
        calculateAndDisplayTotals();
        updateDashboard();
    }
}

/**
 * Populates the month filter dropdown based on available expenses
 */
function populateMonthFilterOptions() {
    const monthFilter = document.getElementById("monthFilter");
    if (!monthFilter) return;

    // Collect unique YYYY-MM month keys
    const monthSet = new Set();
    expenses.forEach(exp => {
        if (!exp || !exp.date || typeof exp.date !== 'string') return;
        const key = exp.date.slice(0, 7);
        if (key.length === 7) {
            monthSet.add(key);
        }
    });

    const months = Array.from(monthSet).sort();

    // Preserve current selection if possible
    const previousValue = monthFilter.value;

    // Rebuild options
    monthFilter.innerHTML = "";

    const currentOption = document.createElement("option");
    currentOption.value = "current";
    currentOption.textContent = "This month";
    monthFilter.appendChild(currentOption);

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All months";
    monthFilter.appendChild(allOption);

    months.forEach(monthKey => {
        const opt = document.createElement("option");
        opt.value = monthKey;
        opt.textContent = formatMonthLabelFromRaw(monthKey);
        monthFilter.appendChild(opt);
    });

    // Restore previous selection if still valid, otherwise default to "current"
    if (previousValue && Array.from(monthFilter.options).some(o => o.value === previousValue)) {
        monthFilter.value = previousValue;
        selectedMonthFilter = previousValue;
    } else {
        monthFilter.value = "current";
        selectedMonthFilter = "current";
    }
}

/**
 * Calculates and displays monthly total and category summary
 */
function calculateAndDisplayTotals() {
    const activeMonthKey = getActiveMonthKeyFromFilter();
    
    // Filter expenses for active month, excluding recurring bills (they're in Recurring bills section)
    const monthlyExpenses = expenses.filter(exp => {
        if (!exp || !exp.date || typeof exp.date !== 'string') return false;
        if (isRecurringBill(exp)) return false;
        if (!activeMonthKey) return true;
        return exp.date.slice(0, 7) === activeMonthKey;
    });
    
    // Calculate monthly total
    const monthlyTotal = monthlyExpenses.reduce((sum, e) => {
        if (!e || typeof e.amount !== 'number' || isNaN(e.amount)) {
            return sum;
        }
        return sum + e.amount;
    }, 0);
    
    // Update monthly total display (dashboard)
    const monthlyTotalEl = document.getElementById("MonthlyTotal");
    if (monthlyTotalEl) {
        monthlyTotalEl.textContent = `£${monthlyTotal.toFixed(2)}`;
    }
    
    // Update monthly total display (history page)
    const historyMonthlyTotalEl = document.getElementById("historyMonthlyTotal");
    if (historyMonthlyTotalEl) {
        historyMonthlyTotalEl.textContent = `£${monthlyTotal.toFixed(2)}`;
    }
    
    // Calculate category totals
    const categoryTotals = calculateCategoryTotals(monthlyExpenses);
    
    // Update category summary display
    const categorySummaryEl = document.getElementById("categorySummary");
    if (categorySummaryEl) {
        categorySummaryEl.innerHTML = ""; // Clear existing content
        
        if (Object.keys(categoryTotals).length === 0) {
            const li = document.createElement("li");
            li.textContent = "No expenses this month";
            categorySummaryEl.appendChild(li);
        } else {
            // Sort categories by amount (descending)
            const sortedCategories = Object.entries(categoryTotals)
                .sort((a, b) => b[1] - a[1]);
            
            sortedCategories.forEach(([category, total]) => {
                const li = document.createElement("li");
                li.textContent = `${category}: £${total.toFixed(2)}`;
                categorySummaryEl.appendChild(li);
            });
        }
    }
}

/**
 * Refreshes all UI displays (expenses list, total, chart, dashboard).
 * Also recalculates Hourly Tracker Smart savings (daily bills, safe to spend)
 * so it updates when expenses change (e.g. new expense added).
 */
function refreshAllDisplays() {
    renderExpenses();
    calculateTotal();
    calculateAndDisplayTotals(); // Update monthly total and category summary
    renderChart();
    updateDashboard();
    loadSummary().catch(function(e) { console.warn("refreshAllDisplays loadSummary:", e); });
    loadWorkSessions().catch(function(e) { console.warn("refreshAllDisplays loadWorkSessions:", e); });
    refreshSpendingIncomeOverviewCharts().catch(function(e) { console.warn("refreshSpendingIncomeOverviewCharts:", e); });
    loadSavingGoals().catch(function(e) { console.warn("refreshAllDisplays loadSavingGoals:", e); });
}

/**
 * Sets up all event listeners for user interactions
 * @param {Object} elements - DOM element references
 */
function setupEventListeners(elements) {
    setupFormListeners(elements);
    setupButtonListeners(elements);
    setupModalListeners();
    setupNavigationListeners(elements);
    setupOnboardingListeners(elements);
    setupMonthFilterListener(elements.monthFilter);
    setupExpenseSearchListener(elements.expenseSearchInput);
    setupHourlyTrackerListener(elements);
    setupStocksListener();
    setupMortgageListener();
    setupAiBudgetAssistantListener();
    setupSettingsListeners();
}

/**
 * Sets up Settings page: form submit and Add category button.
 */
function setupSettingsListeners() {
    var form = document.getElementById("settingsForm");
    var addCatBtn = document.getElementById("settingsAddCategoryBtn");
    if (form && !form.dataset.settingsBound) {
        form.dataset.settingsBound = "true";
        form.addEventListener("submit", function(e) {
            e.preventDefault();
            saveSettingsFromForm(e);
        });
    }
    if (addCatBtn && !addCatBtn.dataset.settingsBound) {
        addCatBtn.dataset.settingsBound = "true";
        addCatBtn.addEventListener("click", function() {
            var input = document.getElementById("settingsNewCategoryName");
            var name = input && input.value ? input.value.trim() : "";
            if (!name) return;
            if (!appPreferences.categories) appPreferences.categories = DEFAULT_EXPENSE_CATEGORIES.slice();
            if (appPreferences.categories.indexOf(name) !== -1) return;
            appPreferences.categories.push(name);
            renderSettingsCategoriesList();
            populateSettingsMergeDropdowns();
            if (input) input.value = "";
        });
    }
    var mergeBtn = document.getElementById("settingsMergeCategoriesBtn");
    if (mergeBtn && !mergeBtn.dataset.settingsBound) {
        mergeBtn.dataset.settingsBound = "true";
        mergeBtn.addEventListener("click", function() {
            handleMergeCategories().catch(function(e) { console.warn("handleMergeCategories:", e); });
        });
    }
}

/**
 * Merges one expense category into another: updates all expenses with "from" category to "into" category (in-memory and Firestore), then removes "from" from categories list.
 */
async function handleMergeCategories() {
    var fromEl = document.getElementById("settingsMergeFrom");
    var intoEl = document.getElementById("settingsMergeInto");
    var msgEl = document.getElementById("settingsMsg");
    var fromCat = fromEl && fromEl.value ? fromEl.value.trim() : "";
    var intoCat = intoEl && intoEl.value ? intoEl.value.trim() : "";
    if (!fromCat || !intoCat) {
        if (msgEl) { msgEl.textContent = "Select both \"From\" and \"Into\" categories."; msgEl.className = "settings-msg error"; }
        return;
    }
    if (fromCat === intoCat) {
        if (msgEl) { msgEl.textContent = "From and Into must be different."; msgEl.className = "settings-msg error"; }
        return;
    }
    var updated = 0;
    if (Array.isArray(expenses)) {
        for (var i = 0; i < expenses.length; i++) {
            var exp = expenses[i];
            if (exp && String(exp.category || "").trim() === fromCat) {
                exp.category = intoCat;
                updated++;
                if (exp.id && db && typeof db.collection === "function") {
                    try {
                        await db.collection("expenses").doc(exp.id).update({ category: intoCat });
                    } catch (e) { console.warn("Merge update expense " + exp.id + ":", e); }
                }
            }
        }
    }
    var cats = appPreferences.categories || [];
    var idx = cats.indexOf(fromCat);
    if (idx !== -1) {
        cats.splice(idx, 1);
        appPreferences.categories = cats;
    }
    renderSettingsCategoriesList();
    populateSettingsMergeDropdowns();
    var prefsRef = getUserSettingsDocRef(USER_SETTINGS_PREFERENCES_DOC_ID);
    if (prefsRef) {
        try {
            await prefsRef.set(
                { categories: cats.slice() },
                { merge: true }
            );
        } catch (e) { console.warn("Merge save categories:", e); }
    }
    refreshAllDisplays();
    if (msgEl) {
        msgEl.textContent = "Merged \"" + fromCat + "\" into \"" + intoCat + "\". " + updated + " expense(s) updated.";
        msgEl.className = "settings-msg success";
    }
}

// ============================================================================
// STOCKS — Firestore collection "stocks": avgPrice (number), createdAt (timestamp), shares (number), ticker (string), userId (string)
// Live prices via Yahoo Finance (CORS proxy)
// ============================================================================
var STOCKS_USER_ID = "user_1 ";
var portfolioLoadId = 0;

/** Fetch live price for one symbol via Yahoo chart API (fallback when quote API fails). Fails silently on CORS/network. */
async function getLivePriceChart(symbol) {
    var url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?interval=1d&range=1d";
    var proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
    try {
        var res = await fetch(proxyUrl, { method: "GET" });
        if (!res.ok) return null;
        var text = await res.text();
        var json = JSON.parse(text);
        var result = json && json.chart && json.chart.result && json.chart.result[0];
        if (!result) return null;
        var meta = result.meta || {};
        var p = meta.regularMarketPrice != null ? meta.regularMarketPrice : (meta.chartPreviousClose != null ? meta.chartPreviousClose : null);
        if (p == null && result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) {
            var closes = result.indicators.quote[0].close;
            for (var i = closes.length - 1; i >= 0; i--) { if (closes[i] != null) { p = closes[i]; break; } }
        }
        return p != null && !isNaN(Number(p)) ? Number(p) : null;
    } catch (e) {
        return null;
    }
}

/** Fetch live prices for symbols from Yahoo Finance. Returns { SYMBOL: price (number) or null }. Fails silently on CORS/401/520 (e.g. file:// or strict tracking). */
async function getLivePrices(symbols) {
    if (!symbols || symbols.length === 0) return {};
    var unique = symbols.filter(function(s, i, a) { return a.indexOf(s) === i && s; });
    var symbolsStr = unique.join(",");
    var url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" + encodeURIComponent(symbolsStr);
    var proxies = [
        "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
        "https://corsproxy.io/?" + encodeURIComponent(url)
    ];
    for (var p = 0; p < proxies.length; p++) {
        try {
            var res = await fetch(proxies[p], { method: "GET" });
            if (!res.ok) continue;
            var text = await res.text();
            var json = null;
            try { json = JSON.parse(text); } catch (parseErr) { continue; }
            var result = (json && json.quoteResponse && json.quoteResponse.result) ? json.quoteResponse.result : [];
            var out = {};
            result.forEach(function(r) {
                var sym = r && r.symbol ? String(r.symbol).toUpperCase() : null;
                var price = (r && (r.regularMarketPrice != null)) ? r.regularMarketPrice : (r && (r.regularMarketPreviousClose != null)) ? r.regularMarketPreviousClose : null;
                var num = price != null ? Number(price) : null;
                if (sym) out[sym] = (num != null && !isNaN(num)) ? num : null;
            });
            if (Object.keys(out).length > 0) return out;
        } catch (e) {
            continue;
        }
    }
    try {
        var fallbackOut = {};
        for (var i = 0; i < unique.length; i++) {
            fallbackOut[unique[i]] = await getLivePriceChart(unique[i]);
        }
        return fallbackOut;
    } catch (e) {
        return {};
    }
}

var stocksFormSubmitting = false;

function setupStocksListener() {
    if (window.__stocksListenerAttached) return;
    var form = document.getElementById("stockForm");
    var tickerInput = document.getElementById("stockTicker");
    var sharesInput = document.getElementById("stockShares");
    var avgPriceInput = document.getElementById("stockAvgPrice");
    var msgEl = document.getElementById("stockFormMsg");
    if (!form || !tickerInput || !sharesInput || !avgPriceInput) return;
    window.__stocksListenerAttached = true;
    form.addEventListener("submit", async function(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (stocksFormSubmitting) return;
        stocksFormSubmitting = true;
        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        if (msgEl) msgEl.textContent = "";
        var ticker = String(tickerInput.value).trim().toUpperCase();
        var shares = parseFloat(sharesInput.value);
        var avgPrice = parseFloat(avgPriceInput.value);
        if (!ticker) {
            if (msgEl) msgEl.textContent = "Enter a ticker.";
            stocksFormSubmitting = false;
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
        if (isNaN(shares) || shares <= 0) {
            if (msgEl) msgEl.textContent = "Enter a valid number of shares.";
            stocksFormSubmitting = false;
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
        if (isNaN(avgPrice) || avgPrice < 0) {
            if (msgEl) msgEl.textContent = "Enter a valid average price.";
            stocksFormSubmitting = false;
            if (submitBtn) submitBtn.disabled = false;
            return;
        }
        if (msgEl) msgEl.textContent = "Saving…";
        try {
            await addPortfolioHolding({ ticker: ticker, shares: shares, avgPrice: avgPrice });
            tickerInput.value = "";
            sharesInput.value = "";
            avgPriceInput.value = "";
            if (msgEl) msgEl.textContent = "Added.";
            await loadPortfolioFromFirestore();
        } catch (err) {
            console.error("Add stock failed:", err && err.code, err && err.message, err);
            var msg = "Could not add. ";
            if (err && (err.code === "permission-denied" || (err.message && err.message.toLowerCase().indexOf("permission") !== -1))) {
                msg += "Firestore rules may be blocking writes. Check Firebase Console → Firestore → Rules and allow read, write for 'stocks'.";
            } else if (err && err.message) {
                msg += err.message;
            } else {
                msg += "Check connection and try again.";
            }
            if (msgEl) msgEl.textContent = msg;
        } finally {
            stocksFormSubmitting = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

async function addPortfolioHolding(holding) {
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") {
        throw new Error("Firebase not ready. Reload the page and try again.");
    }
    var col = db.collection("stocks");
    var ticker = String(holding.ticker);
    var shares = Number(holding.shares);
    var avgPrice = Number(holding.avgPrice);
    var cutoffMs = Date.now() - 8000;
    var recentSnap = await col.orderBy("createdAt", "desc").limit(20).get();
    for (var i = 0; i < recentSnap.docs.length; i++) {
        var doc = recentSnap.docs[i];
        var d = doc.data();
        var createdMs = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().getTime() : 0;
        if (createdMs >= cutoffMs && d.ticker === ticker && String(d.userId).trim() === STOCKS_USER_ID.trim() && Number(d.shares) === shares && Number(d.avgPrice) === avgPrice) {
            return doc.ref;
        }
    }
    var docRef = await col.add({
        ticker: ticker,
        shares: shares,
        avgPrice: avgPrice,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        userId: String(STOCKS_USER_ID)
    });
    console.log("Stock added to Firestore, doc id:", docRef.id);
    return docRef;
}

async function loadPortfolioFromFirestore() {
    var listEl = document.getElementById("portfolioList");
    var emptyEl = document.getElementById("portfolioEmpty");
    if (!listEl) return;
    var thisLoadId = ++portfolioLoadId;
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") return;
    try {
        var snapshot = await db.collection("stocks").orderBy("createdAt", "desc").get();
        if (thisLoadId !== portfolioLoadId) return;
        var items = [];
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var docUserId = (data && data.userId != null) ? String(data.userId).trim() : "";
            if (docUserId !== "" && docUserId !== STOCKS_USER_ID.trim()) return;
            var ticker = (data && data.ticker) ? String(data.ticker).toUpperCase() : "—";
            var shares = Number(data && data.shares);
            var avgPrice = Number(data && data.avgPrice);
            if (isNaN(shares)) shares = 0;
            if (isNaN(avgPrice)) avgPrice = 0;
            items.push({ id: doc.id, ticker: ticker, shares: shares, avgPrice: avgPrice });
        });
        var tickers = items.map(function(i) { return i.ticker; });
        var livePrices = await getLivePrices(tickers);
        if (thisLoadId !== portfolioLoadId) return;
        items.forEach(function(item) {
            var livePrice = livePrices[item.ticker] != null ? livePrices[item.ticker] : null;
            var currentValue = item.shares * (livePrice != null ? livePrice : item.avgPrice);
            var costBasis = item.shares * item.avgPrice;
            item.livePrice = livePrice;
            item.currentValue = currentValue;
            item.profitLoss = currentValue - costBasis;
        });
        items.forEach(function(item) {
            var li = document.createElement("li");
            li.className = "portfolio-item";
            var details = document.createElement("div");
            details.className = "portfolio-item-details";
            var strong = document.createElement("strong");
            strong.textContent = item.ticker;
            details.appendChild(strong);
            var line1 = document.createElement("div");
            line1.className = "portfolio-item-line";
            line1.textContent = "Shares: " + item.shares + " · Avg: £" + item.avgPrice.toFixed(2) + (item.livePrice != null ? " · Live: £" + item.livePrice.toFixed(2) : " · Live: —");
            details.appendChild(line1);
            var line2 = document.createElement("div");
            line2.className = "portfolio-item-line";
            line2.appendChild(document.createTextNode("Value: £" + item.currentValue.toFixed(2) + " · "));
            var plSpan = document.createElement("span");
            plSpan.className = item.profitLoss >= 0 ? "portfolio-pl positive" : "portfolio-pl negative";
            plSpan.textContent = (item.profitLoss >= 0 ? "+" : "") + "£" + item.profitLoss.toFixed(2);
            line2.appendChild(plSpan);
            details.appendChild(line2);
            li.appendChild(details);
            var editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "portfolio-edit-btn";
            editBtn.setAttribute("aria-label", "Edit " + item.ticker);
            editBtn.textContent = "Edit";
            editBtn.dataset.id = item.id;
            editBtn.dataset.ticker = item.ticker;
            editBtn.dataset.shares = String(item.shares);
            editBtn.dataset.avgPrice = String(item.avgPrice);
            editBtn.addEventListener("click", function() {
                openEditStockModal(editBtn.dataset.id, editBtn.dataset.ticker, editBtn.dataset.shares, editBtn.dataset.avgPrice);
            });
            li.appendChild(editBtn);
            var delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "portfolio-delete-btn";
            delBtn.setAttribute("aria-label", "Remove " + item.ticker);
            delBtn.textContent = "Remove";
            delBtn.dataset.id = item.id;
            delBtn.addEventListener("click", async function() {
                var id = delBtn.dataset.id;
                if (!id) return;
                var ready = await ensureFirebaseReady();
                if (!ready || !db || typeof db.collection !== "function") return;
                try {
                    await db.collection("stocks").doc(id).delete();
                    await loadPortfolioFromFirestore();
                } catch (e) {
                    console.warn("stocks delete:", e);
                }
            });
            li.appendChild(delBtn);
            listEl.appendChild(li);
        });
        if (emptyEl) emptyEl.style.display = items.length > 0 ? "none" : "block";
    } catch (err) {
        console.warn("loadPortfolioFromFirestore:", err);
    }
}

/** Uses same logic as portfolio list: stocks for user, live prices (fallback avgPrice), sums shares * price. Returns a single number (portfolio total value). Returns 0 if not ready or on error. */
async function getPortfolioValue() {
    var total = 0;
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") return 0;
    try {
        var snapshot = await db.collection("stocks").orderBy("createdAt", "desc").get();
        var items = [];
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var docUserId = (data && data.userId != null) ? String(data.userId).trim() : "";
            if (docUserId !== "" && docUserId !== STOCKS_USER_ID.trim()) return;
            var ticker = (data && data.ticker) ? String(data.ticker).toUpperCase() : "";
            var shares = Number(data && data.shares);
            var avgPrice = Number(data && data.avgPrice);
            if (isNaN(shares)) shares = 0;
            if (isNaN(avgPrice)) avgPrice = 0;
            if (ticker) items.push({ ticker: ticker, shares: shares, avgPrice: avgPrice });
        });
        var tickers = items.map(function(i) { return i.ticker; });
        var livePrices = await getLivePrices(tickers);
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var livePrice = livePrices[item.ticker] != null ? livePrices[item.ticker] : null;
            var price = livePrice != null ? livePrice : item.avgPrice;
            total += item.shares * price;
        }
    } catch (err) {
        console.warn("getPortfolioValue:", err);
    }
    return Math.round(total * 100) / 100;
}

function openEditStockModal(docId, ticker, shares, avgPrice) {
    var modal = document.getElementById("editStockModal");
    var tickerEl = document.getElementById("editStockTicker");
    var sharesEl = document.getElementById("editStockShares");
    var avgPriceEl = document.getElementById("editStockAvgPrice");
    var msgEl = document.getElementById("editStockMsg");
    if (!modal || !tickerEl || !sharesEl || !avgPriceEl) return;
    modal.dataset.editStockId = docId || "";
    tickerEl.value = ticker || "";
    sharesEl.value = shares != null ? String(shares) : "";
    avgPriceEl.value = avgPrice != null ? String(avgPrice) : "";
    if (msgEl) msgEl.textContent = "";
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
}

function closeEditStockModal() {
    var modal = document.getElementById("editStockModal");
    if (modal) {
        delete modal.dataset.editStockId;
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
    }
    var msgEl = document.getElementById("editStockMsg");
    if (msgEl) msgEl.textContent = "";
}

async function handleSaveEditStock() {
    var modal = document.getElementById("editStockModal");
    var docId = modal && modal.dataset.editStockId;
    var tickerEl = document.getElementById("editStockTicker");
    var sharesEl = document.getElementById("editStockShares");
    var avgPriceEl = document.getElementById("editStockAvgPrice");
    var msgEl = document.getElementById("editStockMsg");
    if (!docId || !tickerEl || !sharesEl || !avgPriceEl) {
        if (msgEl) msgEl.textContent = "Cannot save.";
        return;
    }
    var ticker = String(tickerEl.value).trim().toUpperCase();
    var shares = parseFloat(sharesEl.value);
    var avgPrice = parseFloat(avgPriceEl.value);
    if (!ticker) {
        if (msgEl) msgEl.textContent = "Enter a ticker.";
        return;
    }
    if (isNaN(shares) || shares <= 0) {
        if (msgEl) msgEl.textContent = "Enter a valid number of shares.";
        return;
    }
    if (isNaN(avgPrice) || avgPrice < 0) {
        if (msgEl) msgEl.textContent = "Enter a valid average price.";
        return;
    }
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") {
        if (msgEl) msgEl.textContent = "Connection not ready. Try again.";
        return;
    }
    if (msgEl) msgEl.textContent = "Saving…";
    try {
        await db.collection("stocks").doc(docId).update({
            ticker: ticker,
            shares: shares,
            avgPrice: avgPrice
        });
        closeEditStockModal();
        await loadPortfolioFromFirestore();
    } catch (err) {
        console.warn("stocks update:", err);
        if (msgEl) msgEl.textContent = "Could not save. Try again.";
    }
}

function openEditMortgageModal(docId, data) {
    var modal = document.getElementById("editMortgageModal");
    if (!modal) return;
    modal.dataset.editMortgageId = docId;
    var propertyNameEl = document.getElementById("editMortgagePropertyName");
    var loanAmountEl = document.getElementById("editMortgageLoanAmount");
    var interestRateEl = document.getElementById("editMortgageInterestRate");
    var termYearsEl = document.getElementById("editMortgageTermYears");
    var monthlyPaymentEl = document.getElementById("editMortgageMonthlyPayment");
    var remainingBalanceEl = document.getElementById("editMortgageRemainingBalance");
    var startDateEl = document.getElementById("editMortgageStartDate");
    var msgEl = document.getElementById("editMortgageMsg");
    if (propertyNameEl) propertyNameEl.value = data.propertyName || "";
    if (loanAmountEl) loanAmountEl.value = data.loanAmount != null ? data.loanAmount : "";
    if (interestRateEl) interestRateEl.value = data.interestRate != null ? data.interestRate : "";
    if (termYearsEl) termYearsEl.value = data.termYears != null ? data.termYears : "";
    if (monthlyPaymentEl) monthlyPaymentEl.value = data.monthlyPayment != null ? data.monthlyPayment : "";
    if (remainingBalanceEl) remainingBalanceEl.value = data.remainingBalance != null ? data.remainingBalance : "";
    if (startDateEl) startDateEl.value = data.startDateValue || "";
    if (msgEl) msgEl.textContent = "";
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
}

function closeEditMortgageModal() {
    var modal = document.getElementById("editMortgageModal");
    if (modal) {
        delete modal.dataset.editMortgageId;
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
    }
    var msgEl = document.getElementById("editMortgageMsg");
    if (msgEl) msgEl.textContent = "";
}

async function handleSaveEditMortgage() {
    var modal = document.getElementById("editMortgageModal");
    var docId = modal && modal.dataset.editMortgageId;
    var propertyNameEl = document.getElementById("editMortgagePropertyName");
    var loanAmountEl = document.getElementById("editMortgageLoanAmount");
    var interestRateEl = document.getElementById("editMortgageInterestRate");
    var termYearsEl = document.getElementById("editMortgageTermYears");
    var monthlyPaymentEl = document.getElementById("editMortgageMonthlyPayment");
    var remainingBalanceEl = document.getElementById("editMortgageRemainingBalance");
    var startDateEl = document.getElementById("editMortgageStartDate");
    var msgEl = document.getElementById("editMortgageMsg");
    if (!docId || !propertyNameEl || !loanAmountEl || !interestRateEl || !termYearsEl || !monthlyPaymentEl || !remainingBalanceEl || !startDateEl) {
        if (msgEl) msgEl.textContent = "Cannot save.";
        return;
    }
    var propertyName = String(propertyNameEl.value).trim();
    var loanAmount = parseFloat(loanAmountEl.value);
    var interestRate = parseFloat(interestRateEl.value);
    var termYears = parseInt(termYearsEl.value, 10);
    var monthlyPayment = parseFloat(monthlyPaymentEl.value);
    var remainingBalance = parseFloat(remainingBalanceEl.value);
    var startDateStr = String(startDateEl.value).trim();
    if (!propertyName) {
        if (msgEl) msgEl.textContent = "Enter a property name.";
        return;
    }
    if (isNaN(loanAmount) || loanAmount < 0) {
        if (msgEl) msgEl.textContent = "Enter a valid loan amount.";
        return;
    }
    if (isNaN(interestRate) || interestRate < 0) {
        if (msgEl) msgEl.textContent = "Enter a valid interest rate.";
        return;
    }
    if (isNaN(termYears) || termYears < 1) {
        if (msgEl) msgEl.textContent = "Enter a valid term (years).";
        return;
    }
    if (isNaN(monthlyPayment) || monthlyPayment < 0) {
        if (msgEl) msgEl.textContent = "Enter a valid monthly payment.";
        return;
    }
    if (isNaN(remainingBalance) || remainingBalance < 0) {
        if (msgEl) msgEl.textContent = "Enter a valid remaining balance.";
        return;
    }
    if (!startDateStr) {
        if (msgEl) msgEl.textContent = "Enter a start date.";
        return;
    }
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") {
        if (msgEl) msgEl.textContent = "Connection not ready. Try again.";
        return;
    }
    if (msgEl) msgEl.textContent = "Saving…";
    try {
        var startDate = firebase.firestore.Timestamp.fromDate(new Date(startDateStr + "T12:00:00"));
        await db.collection("mortgages").doc(docId).update({
            propertyName: propertyName,
            loanAmount: loanAmount,
            interestRate: interestRate,
            termYears: termYears,
            monthlyPayment: monthlyPayment,
            remainingBalance: remainingBalance,
            startDate: startDate
        });
        closeEditMortgageModal();
        loadMortgages();
    } catch (err) {
        console.warn("mortgages update:", err);
        if (msgEl) msgEl.textContent = "Could not save. Try again.";
    }
}

// ============================================================================
// MORTGAGE TRACKER — Firestore collection "mortgages": userId, propertyName,
// loanAmount, interestRate, termYears, monthlyPayment, remainingBalance, startDate
// (Uses same compat Firestore as rest of app to avoid breaking existing features.)
// ============================================================================
var MORTGAGE_USER_ID = "user_1 ";

function setupMortgageListener() {
    var form = document.getElementById("mortgageForm");
    var msgEl = document.getElementById("mortgageFormMsg");
    if (!form) return;
    if (form.dataset.mortgageListenerAttached === "true") return;
    form.dataset.mortgageListenerAttached = "true";
    form.addEventListener("submit", async function(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (msgEl) msgEl.textContent = "";
        var propertyName = document.getElementById("mortgagePropertyName");
        var loanAmountEl = document.getElementById("mortgageLoanAmount");
        var interestRateEl = document.getElementById("mortgageInterestRate");
        var termYearsEl = document.getElementById("mortgageTermYears");
        var monthlyPaymentEl = document.getElementById("mortgageMonthlyPayment");
        var remainingBalanceEl = document.getElementById("mortgageRemainingBalance");
        var startDateEl = document.getElementById("mortgageStartDate");
        if (!propertyName || !loanAmountEl || !interestRateEl || !termYearsEl || !monthlyPaymentEl || !remainingBalanceEl || !startDateEl) return;
        var loanAmount = parseFloat(loanAmountEl.value);
        var interestRate = parseFloat(interestRateEl.value);
        var termYears = parseInt(termYearsEl.value, 10);
        var monthlyPayment = parseFloat(monthlyPaymentEl.value);
        var remainingBalance = parseFloat(remainingBalanceEl.value);
        var startDateStr = startDateEl.value;
        if (!propertyName.value.trim()) {
            if (msgEl) msgEl.textContent = "Enter a property name.";
            return;
        }
        if (isNaN(loanAmount) || loanAmount < 0 || isNaN(interestRate) || interestRate < 0 || isNaN(termYears) || termYears < 1 || isNaN(monthlyPayment) || monthlyPayment < 0 || isNaN(remainingBalance) || remainingBalance < 0) {
            if (msgEl) msgEl.textContent = "Check all numeric fields.";
            return;
        }
        if (!startDateStr) {
            if (msgEl) msgEl.textContent = "Select a start date.";
            return;
        }
        if (msgEl) msgEl.textContent = "Saving…";
        try {
            await addMortgageToFirestore({
                propertyName: propertyName.value.trim(),
                loanAmount: loanAmount,
                interestRate: interestRate,
                termYears: termYears,
                monthlyPayment: monthlyPayment,
                remainingBalance: remainingBalance,
                startDate: startDateStr
            });
            form.reset();
            if (msgEl) msgEl.textContent = "Mortgage added.";
            await loadMortgages();
        } catch (err) {
            console.warn("addMortgageToFirestore:", err);
            if (msgEl) msgEl.textContent = "Could not save. Try again.";
        }
    });
    var simulateBtn = document.getElementById("simulateMonthlyPaymentBtn");
    if (simulateBtn && simulateBtn.dataset.simulateAttached !== "true") {
        simulateBtn.dataset.simulateAttached = "true";
        simulateBtn.addEventListener("click", handleSimulateMonthlyPayment);
    }
}

async function addMortgageToFirestore(data) {
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") {
        throw new Error("Firebase not ready.");
    }
    var loanAmount = Number(data.loanAmount);
    var termYears = Number(data.termYears) || 0;
    var startDate = data.startDate ? firebase.firestore.Timestamp.fromDate(new Date(data.startDate + "T12:00:00")) : firebase.firestore.FieldValue.serverTimestamp();
    var now = new Date();
    var payoffDate = new Date(now.getFullYear() + termYears, now.getMonth(), now.getDate());
    var estimatedPayoff = firebase.firestore.Timestamp.fromDate(payoffDate);
    return db.collection("mortgages").add({
        userId: MORTGAGE_USER_ID,
        propertyName: String(data.propertyName),
        loanAmount: loanAmount,
        interestRate: Number(data.interestRate),
        termYears: termYears,
        monthlyPayment: Number(data.monthlyPayment),
        remainingBalance: loanAmount,
        totalPaid: 0,
        estimatedPayoff: estimatedPayoff,
        startDate: startDate,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

async function loadMortgages() {
    var listEl = document.getElementById("mortgageList");
    var emptyEl = document.getElementById("mortgageListEmpty");
    if (!listEl) return;
    listEl.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") return;
    try {
        var snapshot = await db.collection("mortgages").get();
        var items = [];
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var uid = (data && data.userId != null) ? String(data.userId).trim() : "";
            if (uid !== "" && uid !== MORTGAGE_USER_ID.trim()) return;
            var startDate = data.startDate;
            var startStr = "";
            var startMs = 0;
            var startDateValue = "";
            if (startDate && typeof startDate.toDate === "function") {
                try {
                    var d = startDate.toDate();
                    startMs = d.getTime();
                    startStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                    startDateValue = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
                } catch (e) { startStr = "—"; }
            } else if (startDate) startStr = String(startDate);
            var totalPaid = Number(data.totalPaid) || 0;
            var estimatedPayoff = data.estimatedPayoff;
            var payoffStr = "—";
            if (estimatedPayoff && typeof estimatedPayoff.toDate === "function") {
                try {
                    payoffStr = estimatedPayoff.toDate().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                } catch (e) {}
            }
            items.push({
                id: doc.id,
                propertyName: (data.propertyName != null) ? String(data.propertyName) : "—",
                loanAmount: Number(data.loanAmount) || 0,
                interestRate: Number(data.interestRate) || 0,
                termYears: Number(data.termYears) || 0,
                monthlyPayment: Number(data.monthlyPayment) || 0,
                remainingBalance: Number(data.remainingBalance) || 0,
                totalPaid: totalPaid,
                startStr: startStr || "—",
                startMs: startMs,
                startDateValue: startDateValue,
                payoffStr: payoffStr
            });
        });
        items.sort(function(a, b) { return b.startMs - a.startMs; });
        items.forEach(function(item) {
            var li = document.createElement("li");
            li.className = "mortgage-item";
            var details = document.createElement("div");
            details.className = "mortgage-item-details";
            var strong = document.createElement("strong");
            strong.textContent = item.propertyName;
            details.appendChild(strong);
            var line1 = document.createElement("div");
            line1.className = "mortgage-item-line";
            line1.textContent = "Original loan £" + item.loanAmount.toFixed(2) + " · Remaining £" + item.remainingBalance.toFixed(2);
            details.appendChild(line1);
            var line2 = document.createElement("div");
            line2.className = "mortgage-item-line";
            line2.textContent = "Monthly £" + item.monthlyPayment.toFixed(2) + " · Total paid £" + item.totalPaid.toFixed(2);
            details.appendChild(line2);
            var line3 = document.createElement("div");
            line3.className = "mortgage-item-line";
            line3.textContent = "Estimated payoff " + item.payoffStr;
            details.appendChild(line3);
            li.appendChild(details);
            var editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "portfolio-edit-btn mortgage-edit-btn";
            editBtn.setAttribute("aria-label", "Edit " + item.propertyName);
            editBtn.textContent = "Edit";
            editBtn.dataset.id = item.id;
            editBtn.dataset.propertyName = item.propertyName;
            editBtn.dataset.loanAmount = String(item.loanAmount);
            editBtn.dataset.interestRate = String(item.interestRate);
            editBtn.dataset.termYears = String(item.termYears);
            editBtn.dataset.monthlyPayment = String(item.monthlyPayment);
            editBtn.dataset.remainingBalance = String(item.remainingBalance);
            editBtn.dataset.startDateValue = item.startDateValue || "";
            editBtn.addEventListener("click", function() {
                openEditMortgageModal(editBtn.dataset.id, {
                    propertyName: editBtn.dataset.propertyName,
                    loanAmount: editBtn.dataset.loanAmount,
                    interestRate: editBtn.dataset.interestRate,
                    termYears: editBtn.dataset.termYears,
                    monthlyPayment: editBtn.dataset.monthlyPayment,
                    remainingBalance: editBtn.dataset.remainingBalance,
                    startDateValue: editBtn.dataset.startDateValue
                });
            });
            li.appendChild(editBtn);
            listEl.appendChild(li);
        });
        if (emptyEl) emptyEl.style.display = items.length > 0 ? "none" : "block";
    } catch (err) {
        console.warn("loadMortgages:", err);
    }
}

/** Simulate one monthly payment for all user mortgages: reduce remainingBalance by monthlyPayment (min 0), increase totalPaid by monthlyPayment; update Firestore and refresh list. */
async function handleSimulateMonthlyPayment() {
    var msgEl = document.getElementById("mortgageFormMsg");
    var btn = document.getElementById("simulateMonthlyPaymentBtn");
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") {
        if (msgEl) msgEl.textContent = "Connection not ready. Try again.";
        return;
    }
    if (btn) {
        btn.disabled = true;
        if (msgEl) msgEl.textContent = "Simulating…";
    }
    try {
        var snapshot = await db.collection("mortgages").get();
        var uidTrim = MORTGAGE_USER_ID.trim();
        var updates = [];
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var uid = (data && data.userId != null) ? String(data.userId).trim() : "";
            if (uid && uid !== uidTrim) return;
            var monthlyPayment = Number(data.monthlyPayment) || 0;
            var remaining = Number(data.remainingBalance) || 0;
            var totalPaid = Number(data.totalPaid) || 0;
            var newRemaining = Math.max(0, remaining - monthlyPayment);
            var newTotalPaid = totalPaid + monthlyPayment;
            updates.push({ id: doc.id, remainingBalance: newRemaining, totalPaid: newTotalPaid });
        });
        for (var i = 0; i < updates.length; i++) {
            await db.collection("mortgages").doc(updates[i].id).update({
                remainingBalance: updates[i].remainingBalance,
                totalPaid: updates[i].totalPaid
            });
        }
        if (msgEl) msgEl.textContent = updates.length > 0 ? "Simulated. List updated." : "No mortgages to simulate.";
        loadMortgages();
        updateNetWorthDisplay().catch(function(e) { console.warn("updateNetWorthDisplay after simulate:", e); });
    } catch (err) {
        console.warn("handleSimulateMonthlyPayment:", err);
        if (msgEl) msgEl.textContent = "Could not simulate. Try again.";
    } finally {
        if (btn) btn.disabled = false;
    }
}

/** Queries mortgages for userId = "user_1", sums remainingBalance, returns { totalMortgageDebt }. Returns { totalMortgageDebt: 0 } if not ready or on error. */
async function getTotalMortgageBalance() {
    var totalMortgageDebt = 0;
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") {
        return { totalMortgageDebt: totalMortgageDebt };
    }
    try {
        var snapshot = await db.collection("mortgages").get();
        var uidTrim = MORTGAGE_USER_ID.trim();
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var uid = (data && data.userId != null) ? String(data.userId).trim() : "";
            if (uid && uid !== uidTrim) return;
            totalMortgageDebt += Number(data.remainingBalance) || 0;
        });
    } catch (err) {
        console.warn("getTotalMortgageBalance:", err);
    }
    return { totalMortgageDebt: totalMortgageDebt };
}

// ============================================================================
// AI BUDGET ASSISTANT — Firestore collection "aiInsights"
// Schema: userId (string), month (YYYY-MM), summary (string, AI-generated),
//         recommendations (array of strings, bullet points), createdAt (serverTimestamp).
// ============================================================================

/**
 * Returns the saved AI insight for a given user and month, if any. Use this to avoid regenerating every time.
 * @param {string} userId - User identifier
 * @param {string} month - YYYY-MM
 * @returns {Promise<{ summary: string, recommendations: string[] }|null>} Saved insight or null
 */
async function getAiInsightForMonth(userId, month) {
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") return null;
    try {
        var snapshot = await db.collection("aiInsights")
            .where("userId", "==", String(userId))
            .where("month", "==", String(month))
            .get();
        var latest = null;
        var latestMs = 0;
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var created = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0;
            if (created > latestMs) {
                latestMs = created;
                latest = { summary: data.summary != null ? String(data.summary) : "", recommendations: Array.isArray(data.recommendations) ? data.recommendations : [] };
            }
        });
        return latest;
    } catch (err) {
        console.warn("getAiInsightForMonth:", err);
        return null;
    }
}

/**
 * Saves an AI-generated budget insight to Firestore. Call when you have summary and recommendations.
 * Saving for the current month means getAiInsightForMonth() will return it next time (no need to regenerate).
 * @param {string} userId - User identifier
 * @param {string} month - YYYY-MM
 * @param {string} summary - AI-generated summary text
 * @param {string[]} recommendations - Array of bullet-point strings
 * @returns {Promise<string|null>} Document id or null on error
 */
async function saveAiInsight(userId, month, summary, recommendations) {
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") return null;
    try {
        var rec = Array.isArray(recommendations) ? recommendations : [];
        var docRef = await db.collection("aiInsights").add({
            userId: String(userId),
            month: String(month),
            summary: summary != null ? String(summary) : "",
            recommendations: rec,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return docRef.id;
    } catch (err) {
        console.warn("saveAiInsight:", err);
        return null;
    }
}

/**
 * Gathers budget data and builds a structured prompt for the AI. Before calling this, use
 * getAiInsightForMonth(userId, month) — if it returns an insight, use it and skip regeneration.
 * After your AI returns, parse into summary + recommendations and call saveAiInsight() for the
 * current month so the insight is cached and does not regenerate every time.
 * @param {string} [userId] - User id (e.g. "user_1")
 * @returns {Promise<{ prompt: string, data: object }>} prompt string and the numbers used
 */
async function generateBudgetInsights(userId) {
    var uid = userId != null ? String(userId) : "user_1";
    var now = new Date();
    var monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

    var totalIncomeThisMonth = 0;
    var totalExpensesThisMonth = 0;
    var totalMortgageDebt = 0;
    var portfolioValue = 0;

    try {
        totalIncomeThisMonth = await getTotalEarningsThisMonth();
    } catch (e) { console.warn("generateBudgetInsights getTotalEarningsThisMonth:", e); }
    try {
        totalExpensesThisMonth = await getTotalExpensesThisMonth();
    } catch (e) { console.warn("generateBudgetInsights getTotalExpensesThisMonth:", e); }
    try {
        var mortgageResult = await getTotalMortgageBalance();
        totalMortgageDebt = mortgageResult.totalMortgageDebt || 0;
    } catch (e) { console.warn("generateBudgetInsights getTotalMortgageBalance:", e); }
    try {
        portfolioValue = await getPortfolioValue();
    } catch (e) { console.warn("generateBudgetInsights getPortfolioValue:", e); }

    var data = {
        userId: uid,
        month: monthStr,
        totalIncomeThisMonth: totalIncomeThisMonth,
        totalExpensesThisMonth: totalExpensesThisMonth,
        totalMortgageDebt: totalMortgageDebt,
        portfolioValue: portfolioValue
    };

    var prompt = [
        "You are a budget assistant. Analyse this user's financial snapshot and respond in exactly this format:",
        "",
        "1. SHORT SUMMARY: Write 2–3 sentences on their overall position (income vs expenses, debt, savings).",
        "2. RECOMMENDATIONS: Give 3–5 actionable bullet points. Use concrete formats, e.g.:",
        "   - \"Save X% of income\" (suggest a percentage)",
        "   - \"Reduce category Y by £Z\" (name a category and amount)",
        "   - \"You are overspending in category A\" or \"You are underspending in category A\" (name the category)",
        "   Use £ for currency. Be specific with numbers and category names where possible.",
        "",
        "Financial data for " + monthStr + " (user: " + uid + "):",
        "- Total income this month (from hourly tracker): £" + totalIncomeThisMonth.toFixed(2),
        "- Total expenses this month: £" + totalExpensesThisMonth.toFixed(2),
        "- Total mortgage debt (remaining balance): £" + totalMortgageDebt.toFixed(2),
        "- Portfolio value (investments): £" + portfolioValue.toFixed(2),
        "",
        "Respond with only: (1) the short summary paragraph, then (2) the bullet list of 3–5 recommendations."
    ].join("\n");

    return { prompt: prompt, data: data };
}

/** User id used for AI insights (same pattern as other trackers). */
var AI_INSIGHTS_USER_ID = "user_1";
/** User id for notifications collection (same as other features). */
var NOTIFICATIONS_USER_ID = "user_1";

/**
 * Parses raw AI response text into { summary, recommendations }.
 * Expects summary paragraph(s) then bullet lines (starting with -, *, •, or "n.").
 */
function parseAiInsightResponse(text) {
    var summary = "";
    var recommendations = [];
    if (typeof text !== "string" || !text.trim()) return { summary: summary, recommendations: recommendations };
    var t = text.trim();
    var recStart = t.search(/\n\s*[-*•]\s|\n\s*\d+[.)]\s|Recommendations?:/i);
    if (recStart >= 0) {
        summary = t.slice(0, recStart).trim().replace(/\n+/g, " ");
        var recBlock = t.slice(recStart).replace(/^[\s\S]*?(Recommendations?:\s*)?/i, "").trim();
        recBlock.split(/\n/).forEach(function(line) {
            var m = line.replace(/^\s*[-*•]\s*|\s*\d+[.)]\s*/, "").trim();
            if (m) recommendations.push(m);
        });
    } else {
        summary = t.replace(/\n+/g, " ");
    }
    return { summary: summary, recommendations: recommendations };
}

/** Loads saved insight for current month into the AI Budget Assistant panel. */
async function loadAiInsightPanel() {
    var summaryEl = document.getElementById("aiInsightSummary");
    var listEl = document.getElementById("aiInsightRecommendations");
    var msgEl = document.getElementById("aiInsightMessage");
    if (!summaryEl || !listEl) return;
    var now = new Date();
    var monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    try {
        var insight = await getAiInsightForMonth(AI_INSIGHTS_USER_ID, monthStr);
        if (insight && (insight.summary || (insight.recommendations && insight.recommendations.length > 0))) {
            summaryEl.textContent = insight.summary || "No summary.";
            listEl.innerHTML = "";
            (insight.recommendations || []).forEach(function(r) {
                var li = document.createElement("li");
                li.textContent = r;
                listEl.appendChild(li);
            });
            if (msgEl) msgEl.textContent = "";
        } else {
            summaryEl.textContent = "No insights yet. Click Refresh to generate.";
            listEl.innerHTML = "";
            if (msgEl) msgEl.textContent = "";
        }
    } catch (e) {
        console.warn("loadAiInsightPanel:", e);
        summaryEl.textContent = "No insights yet. Click Refresh to generate.";
        listEl.innerHTML = "";
        if (msgEl) msgEl.textContent = "Could not load insights.";
    }
}

/**
 * Called when user clicks Refresh Insights. Generates prompt, gets AI response (or mock),
 * parses, saves to aiInsights, then refreshes the panel. Set window.callBudgetAI(prompt) to
 * return your AI response string to use a real API.
 */
async function handleRefreshInsights() {
    var btn = document.getElementById("refreshInsightsBtn");
    var msgEl = document.getElementById("aiInsightMessage");
    if (msgEl) msgEl.textContent = "Generating…";
    if (btn) btn.disabled = true;
    var now = new Date();
    var monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    try {
        var result = await generateBudgetInsights(AI_INSIGHTS_USER_ID);
        var prompt = result.prompt;
        var data = result.data;
        var rawResponse;
        if (typeof window.callBudgetAI === "function") {
            rawResponse = await window.callBudgetAI(prompt);
        } else {
            rawResponse = "Your income this month is £" + data.totalIncomeThisMonth.toFixed(2) + " and expenses are £" + data.totalExpensesThisMonth.toFixed(2) + ". Mortgage debt is £" + data.totalMortgageDebt.toFixed(2) + " and portfolio value is £" + data.portfolioValue.toFixed(2) + ".\n\nRecommendations:\n- Save 10–20% of income if possible.\n- Reduce discretionary spending by £50–100 this month.\n- Review category with highest spend and trim where you can.";
        }
        var parsed = parseAiInsightResponse(rawResponse);
        var docId = await saveAiInsight(AI_INSIGHTS_USER_ID, monthStr, parsed.summary, parsed.recommendations);
        await loadAiInsightPanel();
        if (msgEl) msgEl.textContent = docId ? "Insights updated." : "Saved locally.";
    } catch (e) {
        console.warn("handleRefreshInsights:", e);
        if (msgEl) msgEl.textContent = "Could not generate. Try again.";
    } finally {
        if (btn) btn.disabled = false;
    }
}

/** Wires the AI Budget Assistant panel: load existing insight and Refresh button. */
function setupAiBudgetAssistantListener() {
    loadAiInsightPanel().catch(function(e) { console.warn("loadAiInsightPanel on setup:", e); });
    var btn = document.getElementById("refreshInsightsBtn");
    if (btn && btn.dataset.aiAssistantWired !== "true") {
        btn.dataset.aiAssistantWired = "true";
        btn.addEventListener("click", function() { handleRefreshInsights(); });
    }
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
    
    // Show/hide Bill schedule when Type changes (bill = show, spending = hide)
    function toggleBillScheduleVisibility() {
        var wrap = document.getElementById("billScheduleWrap");
        var typeEl = document.getElementById("expenseType");
        if (wrap && typeEl) wrap.classList.toggle("hidden", typeEl.value !== "bill");
    }
    if (elements.typeInput) {
        elements.typeInput.addEventListener("change", toggleBillScheduleVisibility);
        toggleBillScheduleVisibility();
    }

    // Auto-categorise: when user types in notes, suggest category if none selected
    if (elements.notesInput && elements.categoryInput) {
        function applySuggestedCategory() {
            if (!elements.categoryInput.value || elements.categoryInput.value === "") {
                var suggested = suggestCategoryFromDescription(elements.notesInput.value);
                elements.categoryInput.value = suggested;
            }
        }
        elements.notesInput.addEventListener("blur", applySuggestedCategory);
        elements.notesInput.addEventListener("input", applySuggestedCategory);
    }
    
    // Real-time form validation for submit button
    setupFormValidation(elements);
}

/**
 * Handles form submission to add a new expense
 * @param {Object} elements - DOM element references
 * @param {Event} event - Form submit event
 */
async function handleFormSubmit(elements, event) {
    event.preventDefault();
    console.log("📋 Form submitted");
    
    // Validate form elements exist
    if (!elements.form) {
        console.error("Form element not found");
        return;
    }

    // Extract and validate form data
    console.log("📝 Extracting form data...");
    const formData = extractFormData(elements);
    console.log("📝 Extracted form data:", formData);
    
    if (!validateFormData(formData)) {
        console.warn("⚠️ Form validation failed");
        return;
    }
    console.log("✅ Form data validated");
    
    // Create expense object and save
    const expense = createExpenseObject(formData);
    console.log("📦 Created expense object:", expense);
    console.log("🚀 Calling addExpense...");
    
    var errorEl = document.getElementById("expenseFormError");
    if (errorEl) { errorEl.textContent = ""; errorEl.style.display = "none"; }
    try {
        await addExpense(expense);
        if (errorEl) { errorEl.textContent = ""; errorEl.style.display = "none"; }
        elements.form.reset();
        refreshAllDisplays();
        runNotificationChecks().catch(function(e) { console.warn("runNotificationChecks after add:", e); });
    } catch (error) {
        console.error("❌ Error in handleFormSubmit:", error);
        if (errorEl) {
            errorEl.textContent = error && error.message ? error.message : "Could not save expense. Try again.";
            errorEl.style.display = "block";
        }
    }
}

/**
 * Assigns a category based on description (and optionally amount) using keyword matching.
 * Returns one of: "Food", "Transport", "Rent / Mortgage", "Bills", "Subscriptions", "Shopping", "Other".
 */
function categoriseExpense(description, amount) {
    if (typeof description !== "string" || !description.trim()) return "Other";
    var t = description.trim().toLowerCase();
    if (/\b(food|tesco|lidl|aldi|restaurant|uber eats|deliveroo|coffee|grocer|supermarket|takeaway|meal|bread|milk|cafe)\b/i.test(t)) return "Food";
    if (/\b(transport|uber|train|bus|fuel|petrol|parking|taxi|car|mot)\b/i.test(t)) return "Transport";
    if (/\b(rent|landlord|mortgage|housing)\b/i.test(t)) return "Rent / Mortgage";
    if (/\b(electricity|electric|gas|water|internet|phone|bill|broadband)\b/i.test(t)) return "Bills";
    if (/\b(netflix|spotify|apple|google|adobe|subscription)\b/i.test(t)) return "Subscriptions";
    if (/\b(shopping|amazon|clothes|fashion|store)\b/i.test(t)) return "Shopping";
    return "Other";
}

/**
 * Suggests a category from expense description/notes. Uses categoriseExpense and maps to
 * existing form dropdown values (Food, transport, housing, Bills, Other) so the UI is unchanged.
 */
function suggestCategoryFromDescription(text) {
    var cat = categoriseExpense(text, undefined);
    if (cat === "Transport") return "transport";
    if (cat === "Rent / Mortgage") return "housing";
    if (cat === "Subscriptions") return "Bills";
    if (cat === "Shopping") return "Other";
    return cat;
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
            category: "",
            type: "spending"
        };
    }
    var typeVal = elements.typeInput && elements.typeInput.value;
    if (typeVal !== "bill" && typeVal !== "spending") typeVal = "spending";
    var billSched = elements.billScheduleInput && elements.billScheduleInput.value;
    if (billSched !== "recurring" && billSched !== "single") billSched = "single";
    return {
        name: elements.notesInput.value.trim(),
        amount: Number(elements.amountInput.value),
        date: elements.dateInput.value,
        category: elements.categoryInput.value,
        type: typeVal,
        billSchedule: billSched
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
    var typeVal = formData.type === "bill" ? "bill" : "spending";
    var billSched = (typeVal === "bill" && formData.billSchedule === "recurring") ? "recurring" : "single";
    var cat = (formData.category != null && String(formData.category).trim()) ? String(formData.category).trim() : suggestCategoryFromDescription(formData.name || "");
    return {
        note: formData.name,
        description: formData.name,
        amount: formData.amount,
        date: formData.date,
        category: cat || "Other",
        type: typeVal,
        billSchedule: billSched
    };
}

/**
 * Ensures Firebase is initialized and ready
 * @returns {Promise<boolean>} True if Firebase is ready, false otherwise
 */
async function ensureFirebaseReady() {
    // Check if db is already valid
    if (db && typeof db.collection === 'function') {
        console.log("✅ Firebase already ready");
        return true;
    }
    
    // Try to re-initialize if Firebase SDK is available
    if (typeof firebase === 'undefined') {
        console.warn("⚠️ Firebase SDK not loaded in ensureFirebaseReady");
        return false;
    }
    
    try {
        // Check if app exists, if not create it
        if (!app) {
            try {
                app = firebase.app();
                console.log("✅ Firebase app already exists");
            } catch (e) {
                // App doesn't exist, create it
                app = firebase.initializeApp(firebaseConfig);
                console.log("✅ Firebase app created in ensureFirebaseReady");
            }
        }
        
        // Get Firestore instance
        db = firebase.firestore();
        
        // Verify db is valid
        if (!db || typeof db.collection !== 'function') {
            console.error("❌ Firestore db object is invalid after re-initialization");
            return false;
        }
        
        // Test with a simple operation
        try {
            await db.collection("expenses").limit(1).get();
            console.log("✅ Firestore re-initialized and tested successfully");
        } catch (testError) {
            console.warn("⚠️ Firestore re-initialized but test failed:", testError);
            // Still return true if db object exists, test might fail due to permissions
            if (db && typeof db.collection === 'function') {
                console.log("⚠️ Continuing despite test failure - db object is valid");
                return true;
            }
            return false;
        }
        
        return true;
    } catch (error) {
        console.error("❌ Failed to re-initialize Firestore:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        return false;
    }
}

/**
 * Adds a new expense to the array, saves to localStorage, and Firestore
 * @param {Object} expense - Expense object to add
 */
async function addExpense(expense) {
    try {
        // Validate expense object
        if (!expense || typeof expense !== 'object') {
            throw new Error("Invalid expense object");
        }
        
        // Ensure date is set
        if (!expense.date) {
            expense.date = new Date().toISOString().split('T')[0];
        }
        
        console.log("📝 Adding expense:", expense);
        
        // Ensure Firebase is ready (await the async function)
        const firebaseReady = await ensureFirebaseReady();
        console.log("Database status:", firebaseReady ? "✅ Available" : "❌ Not available");
        console.log("db variable:", db);
        console.log("db type:", typeof db);
        
        // Add to local array first
        expenses.push(expense);
        
        // Save to localStorage as backup
        localStorage.setItem("expenses", JSON.stringify(expenses));
        console.log("✅ Expense saved to localStorage");
        
        // Save to Firestore (uses your existing "expenses" collection)
        if (firebaseReady && db) {
            try {
                if (!db || typeof db.collection !== 'function') {
                    throw new Error("Firestore db object is not valid");
                }
                
                var dateTimestamp = expense.date
                    ? firebase.firestore.Timestamp.fromDate(new Date(expense.date + "T12:00:00"))
                    : firebase.firestore.FieldValue.serverTimestamp();
                var expenseType = (expense.type === "bill" || expense.type === "spending") ? expense.type : "spending";
                var billSched = (expenseType === "bill" && (expense.billSchedule === "recurring" || expense.billSchedule === "single")) ? expense.billSchedule : "single";
                var desc = expense.description != null ? String(expense.description) : (expense.note != null ? String(expense.note) : "");
                var cat = (expense.category != null && String(expense.category).trim()) ? String(expense.category).trim() : suggestCategoryFromDescription(expense.note || expense.description || "");
                if (!cat) cat = "Other";
                expense.category = cat;
                const firestoreData = {
                    amount: expense.amount,
                    description: desc,
                    date: dateTimestamp,
                    category: cat,
                    note: expense.note,
                    type: expenseType,
                    billSchedule: billSched,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                const docRef = await db.collection("expenses").add(firestoreData);
                
                expense.id = docRef.id;
                // If recurring bill, add to recurring_bills and link
                if (expenseType === "bill" && billSched === "recurring") {
                    try {
                        var dueDay = 1;
                        if (expense.date && typeof expense.date === "string" && expense.date.length >= 10) {
                            var d = parseInt(expense.date.slice(8, 10), 10);
                            if (!isNaN(d) && d >= 1 && d <= 31) dueDay = d;
                        }
                        var rbRef = await db.collection("recurring_bills").add({
                            amount: expense.amount,
                            note: expense.note || "",
                            name: expense.note || "",
                            expenseId: expense.id,
                            dueDayOfMonth: dueDay,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        expense.recurringBillId = rbRef.id;
                        await db.collection("expenses").doc(expense.id).update({ recurringBillId: rbRef.id });
                        localStorage.setItem("expenses", JSON.stringify(expenses));
                        loadRecurringBills().catch(function(e) { console.warn("loadRecurringBills after add:", e); });
                    } catch (rbErr) {
                        console.warn("Could not add to recurring_bills:", rbErr);
                    }
                }
                // Update localStorage with the ID
                localStorage.setItem("expenses", JSON.stringify(expenses));
                console.log("✅ Expense added to Firestore successfully!");
                console.log("✅ Expense ID stored:", expense.id);
                console.log("✅ Updated expenses array length:", expenses.length);
            } catch (error) {
                console.error("❌ Error adding expense to Firestore:", error.code, error.message);
                expenses.pop();
                localStorage.setItem("expenses", JSON.stringify(expenses));
                var msg = error.message || "Could not save to Firebase.";
                if (error.code === "permission-denied" || (msg && msg.toLowerCase().indexOf("permission") !== -1)) {
                    msg = "Firestore rules are blocking writes. In Firebase Console go to Firestore → Rules and allow read, write for expenses (and stocks).";
                } else if (error.code === "unavailable") {
                    msg = "Firestore unavailable. Check your internet connection.";
                }
                throw new Error(msg);
            }
        } else {
            console.warn("⚠️ Firestore database not available");
            console.warn("db variable:", db);
            console.warn("Firebase app:", app);
            console.warn("Firebase SDK:", typeof firebase !== 'undefined' ? "Loaded" : "Not loaded");
            console.log("Expense saved to localStorage only");
        }
    } catch (error) {
        console.error("❌ Error in addExpense function:", error);
        throw error;
    }
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
    
    if (submitBtn && elements.amountInput && elements.notesInput && elements.categoryInput) {
        elements.form.addEventListener("input", () => {
            // Date is optional, so only check required fields
            const isValid = elements.amountInput.value && 
                          elements.notesInput.value.trim() &&
                          elements.categoryInput.value;
            submitBtn.disabled = !isValid;
        });
        
        // Initialize button state - check if form has valid initial values
        const hasInitialValues = elements.amountInput.value && 
                                elements.notesInput.value.trim() &&
                                elements.categoryInput.value;
        submitBtn.disabled = !hasInitialValues;
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
    
    // Edit button (optional – expense edit is via list item click)
    if (elements.editBtn) {
        elements.editBtn.addEventListener("click", handleEditButtonClick);
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

    // Dashboard "Total This Month" card → open history charts for the current month
    if (elements.monthlyTotalCard) {
        elements.monthlyTotalCard.style.cursor = "pointer";
        elements.monthlyTotalCard.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Focus on current month in filter
            selectedMonthFilter = "current";
            const monthFilter = document.getElementById("monthFilter");
            if (monthFilter) {
                monthFilter.value = "current";
            }

            // Switch to history tab
            switchPage("history", elements);

            // Refresh views (totals, list, charts) for current month
            refreshAllDisplays();

            // Ensure monthly chart section is visible
            if (elements.monthlyChartSection) {
                elements.monthlyChartSection.classList.add("chart-visible");
            }
            if (elements.toggleMonthlyChartBtn) {
                elements.toggleMonthlyChartBtn.textContent = "Hide monthly chart";
            }

            // Smooth scroll to the history section
            const historyPage = elements.historyPage || document.getElementById("historyPage");
            if (historyPage && typeof historyPage.scrollIntoView === "function") {
                historyPage.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    }

    // Dashboard "Biggest Category" card → go to history & focus category chart for current month
    if (elements.biggestCategoryCard) {
        elements.biggestCategoryCard.style.cursor = "pointer";
        elements.biggestCategoryCard.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Focus on current month in filter
            selectedMonthFilter = "current";
            const monthFilter = document.getElementById("monthFilter");
            if (monthFilter) {
                monthFilter.value = "current";
            }

            // Switch to history tab
            switchPage("history", elements);

            // Refresh for current month
            refreshAllDisplays();

            // Scroll to category chart
            const categoryChartContainer = document.querySelector('.chart-container canvas#ExpensesChart')?.parentElement;
            if (categoryChartContainer && typeof categoryChartContainer.scrollIntoView === "function") {
                categoryChartContainer.scrollIntoView({ behavior: "smooth", block: "center" });
            }

            // Ensure category chart section is visible
            if (elements.categoryChartSection) {
                elements.categoryChartSection.classList.add("chart-visible");
            }
            if (elements.toggleCategoryChartBtn) {
                elements.toggleCategoryChartBtn.textContent = "Hide category chart";
            }
        });
    }

    // Dashboard "Avg Daily Spend" card → go to history & focus expense list for current month
    if (elements.avgExpenseCard) {
        elements.avgExpenseCard.style.cursor = "pointer";
        elements.avgExpenseCard.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Focus on current month in filter
            selectedMonthFilter = "current";
            const monthFilter = document.getElementById("monthFilter");
            if (monthFilter) {
                monthFilter.value = "current";
            }

            // Switch to history tab
            switchPage("history", elements);

            // Refresh for current month
            refreshAllDisplays();

            // Scroll to expense list
            const expenseList = elements.expenseList || document.getElementById("expense-list");
            if (expenseList && typeof expenseList.scrollIntoView === "function") {
                expenseList.scrollIntoView({ behavior: "smooth", block: "start" });
            }

            // Ensure expense list is visible
            if (expenseList) {
                expenseList.classList.add("expense-list-visible");
            }
            if (elements.toggleExpenseListBtn) {
                elements.toggleExpenseListBtn.textContent = "Hide expenses";
            }
        });
    }

    // History toggles: show/hide charts to declutter the page
    if (elements.toggleMonthlyChartBtn && elements.monthlyChartSection) {
        elements.toggleMonthlyChartBtn.addEventListener("click", () => {
            const willShow = !elements.monthlyChartSection.classList.contains("chart-visible");
            elements.monthlyChartSection.classList.toggle("chart-visible", willShow);
            elements.toggleMonthlyChartBtn.textContent = willShow ? "Hide monthly chart" : "Show monthly chart";
            if (willShow) {
                // Render after section is visible so canvas has dimensions
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        rendermonthlyChart();
                    });
                });
            }
        });
    }

    if (elements.toggleCategoryChartBtn && elements.categoryChartSection) {
        elements.toggleCategoryChartBtn.addEventListener("click", () => {
            const willShow = !elements.categoryChartSection.classList.contains("chart-visible");
            elements.categoryChartSection.classList.toggle("chart-visible", willShow);
            elements.toggleCategoryChartBtn.textContent = willShow ? "Hide category chart" : "Show category chart";
            if (willShow) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        renderCategoryChart();
                    });
                });
            }
        });
    }
    var incomeVsSection = document.getElementById("incomeVsExpensesChartSection");
    var incomeVsToggleBtn = document.getElementById("toggleIncomeVsExpensesChartBtn");
    if (incomeVsToggleBtn && incomeVsSection) {
        incomeVsToggleBtn.addEventListener("click", function() {
            var willShow = !incomeVsSection.classList.contains("chart-visible");
            incomeVsSection.classList.toggle("chart-visible", willShow);
            incomeVsToggleBtn.textContent = willShow ? "Hide Income vs Expenses" : "Show Income vs Expenses";
            if (willShow) {
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        renderIncomeVsExpensesChart().catch(function(e) { console.warn("renderIncomeVsExpensesChart:", e); });
                    });
                });
            }
        });
    }

    // Expense list toggle (dropdown-style)
    if (elements.toggleExpenseListBtn && elements.expenseList) {
        elements.toggleExpenseListBtn.addEventListener("click", () => {
            const list = elements.expenseList;
            const willShow = !list.classList.contains("expense-list-visible");
            list.classList.toggle("expense-list-visible", willShow);
            elements.toggleExpenseListBtn.textContent = willShow ? "Hide expenses" : "Show expenses";
        });
    }
}



// ============================================================================
// NAVIGATION FUNCTIONALITY
// ============================================================================

/**
 * Sets up navigation tab event listeners
 * @param {Object} elements - DOM element references
 */
function setupNavigationListeners(elements) {
    if (!elements.homeTab || !elements.historyTab || !elements.homePage || !elements.historyPage) {
        console.warn("Navigation elements not found");
        console.warn("homeTab:", elements.homeTab);
        console.warn("historyTab:", elements.historyTab);
        console.warn("homePage:", elements.homePage);
        console.warn("historyPage:", elements.historyPage);
        return;
    }
    
    // Add click listeners with event handling
    // Use both direct listeners and data-page attribute as fallback
    const handleTabClick = (e, pageName) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`${pageName} tab clicked`);
        switchPage(pageName, elements);
    };
    
    elements.homeTab.addEventListener("click", (e) => handleTabClick(e, "home"));
    if (elements.expensesTab) elements.expensesTab.addEventListener("click", (e) => handleTabClick(e, "expenses"));
    elements.historyTab.addEventListener("click", (e) => handleTabClick(e, "history"));
    if (elements.stocksTab) elements.stocksTab.addEventListener("click", (e) => handleTabClick(e, "stocks"));
    if (elements.mortgageTab) elements.mortgageTab.addEventListener("click", (e) => handleTabClick(e, "mortgage"));
    
    // Fallback for tabs that don't have an explicit listener (e.g. hourly, settings)
    const navTabs = document.querySelectorAll('.nav-tab[data-page]');
    navTabs.forEach(tab => {
        if (tab.id === "homeTab" || tab.id === "expensesTab" || tab.id === "historyTab" || tab.id === "stocksTab" || tab.id === "mortgageTab") return;
        const pageName = tab.getAttribute('data-page');
        if (pageName && !tab.hasAttribute('data-listener-added')) {
            tab.setAttribute('data-listener-added', 'true');
            tab.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                switchPage(pageName, elements);
            });
        }
    });

    var addHoldingLink = document.getElementById("dashboardAddHoldingLink");
    if (addHoldingLink) addHoldingLink.addEventListener("click", function(e) { e.preventDefault(); switchPage("stocks", elements); });
    var addMortgageLink = document.getElementById("dashboardAddMortgageLink");
    if (addMortgageLink) addMortgageLink.addEventListener("click", function(e) { e.preventDefault(); switchPage("mortgage", elements); });
    
    setupHomeDetailsToggle();
    console.log("✅ Navigation listeners set up");
    console.log("Home tab element:", elements.homeTab);
    console.log("History tab element:", elements.historyTab);
}

function setupHomeDetailsToggle() {
    var btn = document.getElementById("homeDetailsToggle");
    var content = document.getElementById("homeDetailsContent");
    if (!btn || !content) return;
    if (btn._homeDetailsBound) return;
    btn._homeDetailsBound = true;
    btn.addEventListener("click", function() {
        var isHidden = content.hasAttribute("hidden");
        if (isHidden) {
            content.removeAttribute("hidden");
            btn.setAttribute("aria-expanded", "true");
            btn.textContent = "Show less";
        } else {
            content.setAttribute("hidden", "");
            btn.setAttribute("aria-expanded", "false");
            btn.textContent = "View details";
        }
    });
}

function formatElapsedHMS(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    var pad = function(n) { return n < 10 ? "0" + n : String(n); };
    return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function formatMinutesAsHoursMinutes(totalMinutes) {
    if (totalMinutes == null || isNaN(totalMinutes)) return "—";
    var total = Number(totalMinutes);
    if (total < 0) return "—";
    var h = Math.floor(total / 60);
    var m = Math.round(total - h * 60);
    if (m >= 60) { m = 0; h += 1; }
    if (h > 0 && m > 0) return h + "h " + m + "m";
    if (h > 0) return h + "h";
    return m + "m";
}

function formatSessionDate(timestamp) {
    if (!timestamp) return "—";
    try {
        var date = timestamp && typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
        if (isNaN(date.getTime())) return "—";
        return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (e) {
        return "—";
    }
}

/** Format Date or Firestore Timestamp to datetime-local value (YYYY-MM-DDTHH:mm) in local time. */
function formatToDatetimeLocal(t) {
    if (!t) return "";
    var d = t && typeof t.toDate === "function" ? t.toDate() : new Date(t);
    if (isNaN(d.getTime())) return "";
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var h = String(d.getHours()).padStart(2, "0");
    var min = String(d.getMinutes()).padStart(2, "0");
    return y + "-" + m + "-" + day + "T" + h + ":" + min;
}

/** Count Mon–Fri in the given month (1–5 = weekday). */
function getWorkingDaysInCurrentMonth(date) {
    if (!date || typeof date.getFullYear !== "function") return 0;
    var year = date.getFullYear();
    var month = date.getMonth();
    var first = new Date(year, month, 1);
    var last = new Date(year, month + 1, 0);
    var count = 0;
    var d = new Date(first);
    while (d <= last) {
        var day = d.getDay();
        if (day >= 1 && day <= 5) count++;
        d.setDate(d.getDate() + 1);
    }
    return count;
}

var USER_SETTINGS_HOURLY_DOC_ID = "hourly";
var USER_SETTINGS_PREFERENCES_DOC_ID = "preferences";
/** Current user id for Firestore paths; settings stored under users/{uid}/user_settings (v9 modular compatible). */
var CURRENT_USER_ID = "user_1";

/**
 * Returns Firestore doc reference for the user's settings (users/{uid}/user_settings/{docId}). Use for get/set so all settings live under the user document.
 * @param {string} docId - e.g. USER_SETTINGS_HOURLY_DOC_ID or USER_SETTINGS_PREFERENCES_DOC_ID
 * @returns {FirebaseFirestore.DocumentReference|null}
 */
function getUserSettingsDocRef(docId) {
    if (!db || typeof db.collection !== "function") return null;
    return db.collection("users").doc(CURRENT_USER_ID).collection("user_settings").doc(docId);
}

/** Default expense category options; can be overridden by user in Settings. */
var DEFAULT_EXPENSE_CATEGORIES = ["Food", "transport", "housing", "Bills", "Other"];
/** In-memory app preferences (loaded from users/{uid}/user_settings). */
var appPreferences = {
    monthlyBudget: 0,
    savingsRate: 0,
    riskLevel: "Balanced",
    defaultHourlyRate: 0,
    incomeSource: "both",
    notifyOverspend: true,
    notifyBillReminder: true,
    notifySavingsSuggestion: true,
    notifyIncomeMilestone: true,
    currency: "GBP",
    dateFormat: "DD/MM/YYYY",
    categories: DEFAULT_EXPENSE_CATEGORIES.slice()
};

/**
 * users/{uid}/user_settings/hourly: { hourlyRate, savingsPercent, monthlyBudget }
     */
async function loadUserSettingsHourlyRate() {
    var inputEl = document.getElementById("hourlyRateInput");
    var savingsInputEl = document.getElementById("savingsPercentInput");
    var monthlyBudgetInputEl = document.getElementById("monthlyBudgetInput");
    if (!inputEl) return;
    var ref = getUserSettingsDocRef(USER_SETTINGS_HOURLY_DOC_ID);
    if (!ref) return;
    try {
        var doc = await ref.get();
        var rate = 0;
        var savingsPercent = 0;
        var monthlyBudget = 0;
        if (doc.exists && doc.data()) {
            var data = doc.data();
            rate = Number(data.hourlyRate);
            if (isNaN(rate)) rate = 0;
            savingsPercent = Number(data.savingsPercent);
            if (isNaN(savingsPercent) || savingsPercent < 0 || savingsPercent > 100) savingsPercent = 0;
            monthlyBudget = Number(data.monthlyBudget);
            if (isNaN(monthlyBudget) || monthlyBudget < 0) monthlyBudget = 0;
        }
        currentHourlyRate = rate;
        currentSavingsPercent = savingsPercent;
        inputEl.value = rate > 0 ? rate.toFixed(2) : "";
        if (savingsInputEl) savingsInputEl.value = savingsPercent > 0 ? String(savingsPercent) : "";
        if (monthlyBudgetInputEl) monthlyBudgetInputEl.value = monthlyBudget > 0 ? monthlyBudget.toFixed(2) : "";
    } catch (err) {
        console.warn("loadUserSettingsHourlyRate error:", err);
    }
}

/**
 * Loads app preferences from Firestore users/{uid}/user_settings (hourly + preferences). Syncs appPreferences; keeps monthlyBudget, savingsRate, defaultHourlyRate in sync.
 */
async function loadAppPreferences() {
    var hourlyRef = getUserSettingsDocRef(USER_SETTINGS_HOURLY_DOC_ID);
    var prefsRef = getUserSettingsDocRef(USER_SETTINGS_PREFERENCES_DOC_ID);
    if (!hourlyRef || !prefsRef) return;
    try {
        var hourlyDoc = await hourlyRef.get();
        if (hourlyDoc.exists && hourlyDoc.data()) {
            var h = hourlyDoc.data();
            appPreferences.monthlyBudget = Math.max(0, Number(h.monthlyBudget) || 0);
            appPreferences.savingsRate = Math.max(0, Math.min(100, Number(h.savingsPercent) || 0));
            appPreferences.defaultHourlyRate = Math.max(0, Number(h.hourlyRate) || 0);
        }
        var prefsDoc = await prefsRef.get();
        if (prefsDoc.exists && prefsDoc.data()) {
            var p = prefsDoc.data();
            if (p.riskLevel === "Conservative" || p.riskLevel === "Balanced" || p.riskLevel === "Growth") appPreferences.riskLevel = p.riskLevel;
            if (p.incomeSource === "tracker" || p.incomeSource === "manual" || p.incomeSource === "both") appPreferences.incomeSource = p.incomeSource;
            appPreferences.notifyOverspend = p.notifyOverspend !== false;
            appPreferences.notifyBillReminder = p.notifyBillReminder !== false;
            appPreferences.notifySavingsSuggestion = p.notifySavingsSuggestion !== false;
            appPreferences.notifyIncomeMilestone = p.notifyIncomeMilestone !== false;
            if (p.currency === "EUR" || p.currency === "GBP" || p.currency === "USD") appPreferences.currency = p.currency;
            if (p.dateFormat === "DD/MM/YYYY" || p.dateFormat === "MM/DD/YYYY" || p.dateFormat === "YYYY-MM-DD") appPreferences.dateFormat = p.dateFormat;
            if (Array.isArray(p.categories) && p.categories.length > 0) appPreferences.categories = p.categories.slice();
        }
    } catch (err) {
        console.warn("loadAppPreferences error:", err);
    }
}

/** Returns currency symbol from appPreferences (€ £ $). */
function getCurrencySymbol() {
    if (appPreferences.currency === "EUR") return "€";
    if (appPreferences.currency === "USD") return "$";
    return "£";
}

/**
 * Loads the Settings page: fetches preferences and fills the form (financial, income, notifications, categories, display).
 */
async function loadSettingsPage() {
    await loadAppPreferences();
    var budgetEl = document.getElementById("settingsMonthlyBudget");
    var savingsEl = document.getElementById("settingsSavingsRate");
    var riskEl = document.getElementById("settingsRiskLevel");
    var hourlyEl = document.getElementById("settingsHourlyRate");
    var incomeSourceEl = document.getElementById("settingsIncomeSource");
    var currencyEl = document.getElementById("settingsCurrency");
    var dateFormatEl = document.getElementById("settingsDateFormat");
    var budgetLabel = document.getElementById("settingsMonthlyBudgetLabel");
    if (budgetLabel) budgetLabel.textContent = "Monthly budget (" + getCurrencySymbol() + ")";
    if (budgetEl) budgetEl.value = appPreferences.monthlyBudget > 0 ? appPreferences.monthlyBudget.toFixed(2) : "";
    if (savingsEl) savingsEl.value = appPreferences.savingsRate > 0 ? String(appPreferences.savingsRate) : "";
    if (riskEl) riskEl.value = appPreferences.riskLevel;
    if (hourlyEl) hourlyEl.value = appPreferences.defaultHourlyRate > 0 ? appPreferences.defaultHourlyRate.toFixed(2) : "";
    if (incomeSourceEl) incomeSourceEl.value = appPreferences.incomeSource;
    if (currencyEl) currencyEl.value = appPreferences.currency;
    if (dateFormatEl) dateFormatEl.value = appPreferences.dateFormat;
    var overspendEl = document.getElementById("settingsNotifyOverspend");
    var billEl = document.getElementById("settingsNotifyBillReminder");
    var savingsSugEl = document.getElementById("settingsNotifySavingsSuggestion");
    var milestoneEl = document.getElementById("settingsNotifyIncomeMilestone");
    if (overspendEl) overspendEl.checked = appPreferences.notifyOverspend;
    if (billEl) billEl.checked = appPreferences.notifyBillReminder;
    if (savingsSugEl) savingsSugEl.checked = appPreferences.notifySavingsSuggestion;
    if (milestoneEl) milestoneEl.checked = appPreferences.notifyIncomeMilestone;
    renderSettingsCategoriesList();
    populateSettingsMergeDropdowns();
}

/**
 * Fills the merge dropdowns (From / Into) from appPreferences.categories.
 */
function populateSettingsMergeDropdowns() {
    var fromEl = document.getElementById("settingsMergeFrom");
    var intoEl = document.getElementById("settingsMergeInto");
    var cats = (appPreferences.categories && appPreferences.categories.length) ? appPreferences.categories : DEFAULT_EXPENSE_CATEGORIES;
    function fillSelect(sel, placeholder) {
        if (!sel) return;
        sel.innerHTML = "";
        var first = document.createElement("option");
        first.value = "";
        first.textContent = placeholder;
        sel.appendChild(first);
        cats.forEach(function(c) {
            var opt = document.createElement("option");
            opt.value = c;
            opt.textContent = c;
            sel.appendChild(opt);
        });
    }
    fillSelect(fromEl, "— From —");
    fillSelect(intoEl, "— Into —");
}

/**
 * Renders the expense categories list on the Settings page (add/rename).
 */
function renderSettingsCategoriesList() {
    var container = document.getElementById("settingsCategoriesList");
    if (!container) return;
    container.innerHTML = "";
    (appPreferences.categories || []).forEach(function(name, index) {
        var row = document.createElement("div");
        row.className = "settings-category-row";
        var label = document.createElement("span");
        label.className = "settings-category-name";
        label.textContent = name;
        var renameBtn = document.createElement("button");
        renameBtn.type = "button";
        renameBtn.className = "settings-btn-secondary settings-category-rename";
        renameBtn.textContent = "Rename";
        renameBtn.dataset.index = String(index);
        renameBtn.dataset.currentName = name;
        renameBtn.addEventListener("click", function() {
            var newName = prompt("New name for category \"" + name + "\":", name);
            if (newName != null && newName.trim()) {
                appPreferences.categories[index] = newName.trim();
                renderSettingsCategoriesList();
            }
        });
        row.appendChild(label);
        row.appendChild(renameBtn);
        container.appendChild(row);
    });
}

/**
 * Saves Settings form to Firestore (hourly + preferences) and updates app state.
 */
async function saveSettingsFromForm(ev) {
    if (ev) ev.preventDefault();
    var msgEl = document.getElementById("settingsMsg");
    var budgetEl = document.getElementById("settingsMonthlyBudget");
    var savingsEl = document.getElementById("settingsSavingsRate");
    var riskEl = document.getElementById("settingsRiskLevel");
    var hourlyEl = document.getElementById("settingsHourlyRate");
    var incomeSourceEl = document.getElementById("settingsIncomeSource");
    var currencyEl = document.getElementById("settingsCurrency");
    var dateFormatEl = document.getElementById("settingsDateFormat");
    var monthlyBudget = 0;
    if (budgetEl) { var b = parseFloat(budgetEl.value); if (!isNaN(b) && b >= 0) monthlyBudget = b; }
    var savingsRate = 0;
    if (savingsEl) { var s = parseFloat(savingsEl.value); if (!isNaN(s) && s >= 0) savingsRate = Math.min(100, s); }
    var riskLevel = (riskEl && riskEl.value) ? riskEl.value : "Balanced";
    if (riskLevel !== "Conservative" && riskLevel !== "Balanced" && riskLevel !== "Growth") riskLevel = "Balanced";
    var defaultHourlyRate = 0;
    if (hourlyEl) { var h = parseFloat(hourlyEl.value); if (!isNaN(h) && h >= 0) defaultHourlyRate = h; }
    var incomeSource = (incomeSourceEl && incomeSourceEl.value) ? incomeSourceEl.value : "both";
    if (incomeSource !== "tracker" && incomeSource !== "manual" && incomeSource !== "both") incomeSource = "both";
    var currency = (currencyEl && currencyEl.value) ? currencyEl.value : "GBP";
    if (currency !== "EUR" && currency !== "GBP" && currency !== "USD") currency = "GBP";
    var dateFormat = (dateFormatEl && dateFormatEl.value) ? dateFormatEl.value : "DD/MM/YYYY";
    if (dateFormat !== "DD/MM/YYYY" && dateFormat !== "MM/DD/YYYY" && dateFormat !== "YYYY-MM-DD") dateFormat = "DD/MM/YYYY";
    var notifyOverspend = document.getElementById("settingsNotifyOverspend") ? document.getElementById("settingsNotifyOverspend").checked : true;
    var notifyBillReminder = document.getElementById("settingsNotifyBillReminder") ? document.getElementById("settingsNotifyBillReminder").checked : true;
    var notifySavingsSuggestion = document.getElementById("settingsNotifySavingsSuggestion") ? document.getElementById("settingsNotifySavingsSuggestion").checked : true;
    var notifyIncomeMilestone = document.getElementById("settingsNotifyIncomeMilestone") ? document.getElementById("settingsNotifyIncomeMilestone").checked : true;
    var hourlyRef = getUserSettingsDocRef(USER_SETTINGS_HOURLY_DOC_ID);
    var prefsRef = getUserSettingsDocRef(USER_SETTINGS_PREFERENCES_DOC_ID);
    if (!hourlyRef || !prefsRef) {
        if (msgEl) { msgEl.textContent = "Cannot save: database not ready."; msgEl.className = "settings-msg error"; }
        return;
    }
    try {
        await hourlyRef.set(
            { hourlyRate: defaultHourlyRate, savingsPercent: savingsRate, monthlyBudget: monthlyBudget },
            { merge: true }
        );
        await prefsRef.set({
            riskLevel: riskLevel,
            incomeSource: incomeSource,
            notifyOverspend: notifyOverspend,
            notifyBillReminder: notifyBillReminder,
            notifySavingsSuggestion: notifySavingsSuggestion,
            notifyIncomeMilestone: notifyIncomeMilestone,
            currency: currency,
            dateFormat: dateFormat,
            categories: (appPreferences.categories && appPreferences.categories.length) ? appPreferences.categories.slice() : DEFAULT_EXPENSE_CATEGORIES.slice()
        }, { merge: true });
        appPreferences.monthlyBudget = monthlyBudget;
        appPreferences.savingsRate = savingsRate;
        appPreferences.riskLevel = riskLevel;
        appPreferences.defaultHourlyRate = defaultHourlyRate;
        appPreferences.incomeSource = incomeSource;
        appPreferences.currency = currency;
        appPreferences.dateFormat = dateFormat;
        appPreferences.notifyOverspend = notifyOverspend;
        appPreferences.notifyBillReminder = notifyBillReminder;
        appPreferences.notifySavingsSuggestion = notifySavingsSuggestion;
        appPreferences.notifyIncomeMilestone = notifyIncomeMilestone;
        if (appPreferences.categories && appPreferences.categories.length) { /* already set from form */ } else appPreferences.categories = DEFAULT_EXPENSE_CATEGORIES.slice();
        currentHourlyRate = defaultHourlyRate;
        currentSavingsPercent = savingsRate;
        populateCategoryDropdowns();
        refreshAllDisplays();
        if (msgEl) { msgEl.textContent = "Settings saved."; msgEl.className = "settings-msg success"; }
    } catch (err) {
        console.warn("saveSettingsFromForm error:", err);
        if (msgEl) { msgEl.textContent = "Could not save settings."; msgEl.className = "settings-msg error"; }
    }
}

/**
 * Populates #category and #edit-category dropdowns from appPreferences.categories.
 */
function populateCategoryDropdowns() {
    var cats = (appPreferences.categories && appPreferences.categories.length) ? appPreferences.categories.slice() : DEFAULT_EXPENSE_CATEGORIES.slice();
    var mainSelect = document.getElementById("category");
    var editSelect = document.getElementById("edit-category");
    function fillSelect(sel) {
        if (!sel) return;
        var firstOpt = sel.options[0];
        sel.innerHTML = "";
        if (firstOpt) sel.appendChild(firstOpt);
        else {
            var opt0 = document.createElement("option");
            opt0.value = "";
            opt0.textContent = "select category";
            sel.appendChild(opt0);
        }
        cats.forEach(function(c) {
            var opt = document.createElement("option");
            opt.value = c;
            opt.textContent = c;
            sel.appendChild(opt);
        });
    }
    fillSelect(mainSelect);
    fillSelect(editSelect);
}

/**
 * When user clicks "Save preference": read hourly rate and savings percentage from UI,
 * then store in Firestore users/{uid}/user_settings/hourly.
 */
async function saveUserSettingsHourlyRate() {
    var inputEl = document.getElementById("hourlyRateInput");
    var savingsInputEl = document.getElementById("savingsPercentInput");
    var monthlyBudgetInputEl = document.getElementById("monthlyBudgetInput");
    var msgEl = document.getElementById("hourlyRateMsg");
    var ref = getUserSettingsDocRef(USER_SETTINGS_HOURLY_DOC_ID);
    if (!ref) return;
    var rate = currentHourlyRate;
    if (inputEl) {
        rate = parseFloat(inputEl.value);
        if (isNaN(rate) || rate < 0) rate = 0;
    }
    var savingsPercent = currentSavingsPercent;
    if (savingsInputEl) {
        var raw = parseFloat(savingsInputEl.value);
        if (!isNaN(raw) && raw >= 0) {
            savingsPercent = raw > 100 ? 100 : raw;
        }
    }
    var monthlyBudget = 0;
    if (monthlyBudgetInputEl) {
        var budgetRaw = parseFloat(monthlyBudgetInputEl.value);
        if (!isNaN(budgetRaw) && budgetRaw >= 0) monthlyBudget = budgetRaw;
    }
    try {
        await ref.set(
            { hourlyRate: rate, savingsPercent: savingsPercent, monthlyBudget: monthlyBudget },
            { merge: true }
        );
        currentHourlyRate = rate;
        currentSavingsPercent = savingsPercent;
        if (msgEl) {
            msgEl.textContent = "Saved.";
            msgEl.className = "hourly-msg success";
        }
        loadWorkSessions().catch(function(e) { console.warn("loadWorkSessions after save preference:", e); });
        runNotificationChecks().catch(function(e) { console.warn("runNotificationChecks after budget/preference:", e); });
        loadNotificationsPanel().catch(function(e) { console.warn("loadNotificationsPanel after budget/preference:", e); });
        loadSavingGoals().catch(function(e) { console.warn("loadSavingGoals after budget/preference:", e); });
    } catch (err) {
        console.warn("saveUserSettingsHourlyRate error:", err);
        if (msgEl) {
            msgEl.textContent = "Could not save.";
            msgEl.className = "hourly-msg error";
        }
    }
}

/**
 * Returns sum of earnings from work_sessions for today (local date).
 * Used by dashboard "Today's Breakdown".
 */
async function getTodayEarningsFromFirestore() {
    if (!db || typeof db.collection !== "function") return 0;
    try {
        var now = new Date();
        var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        var todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
        var snapshot = await db.collection("work_sessions").get();
        var total = 0;
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var startTime = data && data.startTime;
            var ts = startTime && startTime.toDate ? startTime.toDate().getTime() : 0;
            var sessionEarning = data.earningsForSession != null ? Number(data.earningsForSession) : (data.earning != null ? Number(data.earning) : NaN);
            if (ts >= todayStart && ts <= todayEnd && !isNaN(sessionEarning)) {
                total += sessionEarning;
            }
        });
        return Math.round(total * 100) / 100;
    } catch (err) {
        console.warn("getTodayEarningsFromFirestore error:", err);
        return 0;
    }
}

/** Returns sum of hours worked (hoursWorked or totalMinutes/60) for all completed sessions in the current month (local). Completed = has endTime or totalMinutes. */
async function getTotalHoursThisMonth() {
    if (!db || typeof db.collection !== "function") return 0;
    try {
        var now = new Date();
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        var monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        var snapshot = await db.collection("work_sessions").get();
        var totalHours = 0;
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var startTime = data && data.startTime;
            var ts = startTime && startTime.toDate ? startTime.toDate().getTime() : 0;
            if (ts < monthStart || ts > monthEnd) return;
            var hasEnd = data.endTime != null || (data.totalMinutes != null && !isNaN(Number(data.totalMinutes)));
            if (!hasEnd) return;
            var hours = data.hoursWorked != null && !isNaN(Number(data.hoursWorked))
                ? Number(data.hoursWorked)
                : (data.totalMinutes != null && !isNaN(Number(data.totalMinutes)) ? Number(data.totalMinutes) / 60 : 0);
            totalHours += hours;
        });
        return Math.round(totalHours * 100) / 100;
    } catch (err) {
        console.warn("getTotalHoursThisMonth error:", err);
        return 0;
    }
}

/**
 * Returns total earnings for the calendar week that contains the given date (Monday 00:00 to Sunday 23:59).
 * @param {Date} date - Any date in the week
 * @returns {Promise<number>}
 */
async function getEarningsForCalendarWeek(date) {
    if (!db || typeof db.collection !== "function") return 0;
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    var day = d.getDay();
    var toMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + toMonday);
    var weekStart = d.getTime();
    var weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000 - 1;
    try {
        var snapshot = await db.collection("work_sessions").get();
        var total = 0;
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var hasEnd = data.endTime != null || (data.totalMinutes != null && !isNaN(Number(data.totalMinutes)));
            if (!hasEnd) return;
            var startTime = data.startTime;
            var ts = startTime && startTime.toDate ? startTime.toDate().getTime() : 0;
            if (ts < weekStart || ts > weekEnd) return;
            var earning = data.earningsForSession != null ? Number(data.earningsForSession) : (data.earning != null ? Number(data.earning) : NaN);
            if (!isNaN(earning)) total += earning;
        });
        return Math.round(total * 100) / 100;
    } catch (err) {
        console.warn("getEarningsForCalendarWeek error:", err);
        return 0;
    }
}

/** Returns sum of earningsForSession (fallback: earning) for all completed sessions in the current month (local). */
async function getTotalEarningsThisMonth() {
    if (!db || typeof db.collection !== "function") return 0;
    try {
        var now = new Date();
        var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        var monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        var snapshot = await db.collection("work_sessions").get();
        var total = 0;
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var startTime = data && data.startTime;
            var ts = startTime && startTime.toDate ? startTime.toDate().getTime() : 0;
            if (ts < monthStart || ts > monthEnd) return;
            var hasEnd = data.endTime != null || (data.totalMinutes != null && !isNaN(Number(data.totalMinutes)));
            if (!hasEnd) return;
            var sessionEarning = data.earningsForSession != null ? Number(data.earningsForSession) : (data.earning != null ? Number(data.earning) : NaN);
            if (!isNaN(sessionEarning)) total += sessionEarning;
        });
        return Math.round(total * 100) / 100;
    } catch (err) {
        console.warn("getTotalEarningsThisMonth error:", err);
        return 0;
    }
}

/**
 * Returns the maximum total earnings from any single calendar month in the past (all months before the current month).
 * Used for "new personal high" monthly earnings notification.
 */
async function getMaxEarningsPastMonths() {
    if (!db || typeof db.collection !== "function") return 0;
    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth();
    try {
        var snapshot = await db.collection("work_sessions").get();
        var byMonth = Object.create(null);
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var hasEnd = data.endTime != null || (data.totalMinutes != null && !isNaN(Number(data.totalMinutes)));
            if (!hasEnd) return;
            var startTime = data.startTime;
            var ts = startTime && startTime.toDate ? startTime.toDate().getTime() : 0;
            if (!ts) return;
            var sessionDate = new Date(ts);
            var y = sessionDate.getFullYear();
            var m = sessionDate.getMonth();
            if (y > currentYear || (y === currentYear && m >= currentMonth)) return;
            var key = y + "-" + String(m + 1).padStart(2, "0");
            if (!byMonth[key]) byMonth[key] = 0;
            var earning = data.earningsForSession != null ? Number(data.earningsForSession) : (data.earning != null ? Number(data.earning) : NaN);
            if (!isNaN(earning)) byMonth[key] += earning;
        });
        var max = 0;
        for (var k in byMonth) if (byMonth[k] > max) max = byMonth[k];
        return Math.round(max * 100) / 100;
    } catch (err) {
        console.warn("getMaxEarningsPastMonths error:", err);
        return 0;
    }
}

/**
 * Returns the average total earnings per calendar month over past months (all months before the current month).
 * Used for "higher than usual" savings suggestion.
 */
async function getAverageMonthlyEarningsPastMonths() {
    if (!db || typeof db.collection !== "function") return 0;
    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth();
    try {
        var snapshot = await db.collection("work_sessions").get();
        var byMonth = Object.create(null);
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var hasEnd = data.endTime != null || (data.totalMinutes != null && !isNaN(Number(data.totalMinutes)));
            if (!hasEnd) return;
            var startTime = data.startTime;
            var ts = startTime && startTime.toDate ? startTime.toDate().getTime() : 0;
            if (!ts) return;
            var sessionDate = new Date(ts);
            var y = sessionDate.getFullYear();
            var m = sessionDate.getMonth();
            if (y > currentYear || (y === currentYear && m >= currentMonth)) return;
            var key = y + "-" + String(m + 1).padStart(2, "0");
            if (!byMonth[key]) byMonth[key] = 0;
            var earning = data.earningsForSession != null ? Number(data.earningsForSession) : (data.earning != null ? Number(data.earning) : NaN);
            if (!isNaN(earning)) byMonth[key] += earning;
        });
        var keys = Object.keys(byMonth);
        if (keys.length === 0) return 0;
        var sum = 0;
        for (var k = 0; k < keys.length; k++) sum += byMonth[keys[k]];
        return Math.round((sum / keys.length) * 100) / 100;
    } catch (err) {
        console.warn("getAverageMonthlyEarningsPastMonths error:", err);
        return 0;
    }
}

/** Projected monthly income = average daily earnings (this month so far) × remaining working days (weekdays from today to end of month). Returns a number. */
async function getProjectedMonthlyIncome() {
    var totalEarnings = await getTotalEarningsThisMonth();
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var dayOfMonth = now.getDate();
    var daysElapsed = dayOfMonth;
    var avgDaily = daysElapsed >= 1 ? totalEarnings / daysElapsed : 0;
    var lastDay = new Date(year, month + 1, 0).getDate();
    var remainingWorkingDays = 0;
    for (var d = dayOfMonth; d <= lastDay; d++) {
        var weekday = new Date(year, month, d).getDay();
        if (weekday >= 1 && weekday <= 5) remainingWorkingDays++;
    }
    var projected = Math.round(avgDaily * remainingWorkingDays * 100) / 100;
    return projected;
}

/**
 * Loads work sessions, updates Today/Week/Pacing/Smart savings, and tries to resume an active session.
 * Called on: page load, stop work (save session), save preference (savings %), switch to Hourly page.
 */
async function loadWorkSessions() {
    var listEl = document.getElementById("workSessionsList");
    if (!listEl) return;
    var sessions = [];
    if (db && typeof db.collection === "function") {
        try {
            var snapshot = await db.collection("work_sessions").get();
            snapshot.forEach(function(doc) {
                var data = doc.data();
                if (data && data.init === true) return;
                var startTime = data && data.startTime;
                var totalMinutes = data && data.totalMinutes;
                var breakMinutes = 0;
                if (data && data.breakMinutes != null && !isNaN(Number(data.breakMinutes))) {
                    breakMinutes = Number(data.breakMinutes);
                } else if (data && data.breaks && Array.isArray(data.breaks)) {
                    data.breaks.forEach(function(b) {
                        var startMs = b.startMs != null ? b.startMs : (b.start && b.start.toMillis ? b.start.toMillis() : 0);
                        var endMs = b.endMs != null ? b.endMs : (b.end && b.end.toMillis ? b.end.toMillis() : 0);
                        breakMinutes += (endMs - startMs) / 60000;
                    });
                }
                var endTime = data && data.endTime;
                var ts = startTime && startTime.toDate ? startTime.toDate().getTime() : (endTime && endTime.toDate ? endTime.toDate().getTime() : 0);
                var dateLabel = formatSessionDate(startTime || endTime);
                var durationLabel = formatMinutesAsHoursMinutes(totalMinutes);
                var breakLabel = breakMinutes <= 0 ? "0 min" : (breakMinutes >= 60 ? formatMinutesAsHoursMinutes(breakMinutes) : Math.round(breakMinutes) + " min");
                var earning = (data.earningsForSession != null ? Number(data.earningsForSession) : (data.earning != null ? Number(data.earning) : null));
                if (earning != null && isNaN(earning)) earning = null;
                var mins = totalMinutes != null && !isNaN(Number(totalMinutes)) ? Number(totalMinutes) : 0;
                var breakMins = breakMinutes;
                sessions.push({ id: doc.id, dateLabel: dateLabel, durationLabel: durationLabel, breakLabel: breakLabel, breakMinutes: breakMins, earning: earning, sortKey: ts, totalMinutes: mins, startTime: startTime, endTime: endTime });
            });
            sessions.sort(function(a, b) {
                return (b.sortKey || 0) - (a.sortKey || 0);
            });
        } catch (err) {
            console.warn("loadWorkSessions error:", err);
        }
    }
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
    var todayTotal = 0;
    sessions.forEach(function(s) {
        if (s.sortKey >= todayStart && s.sortKey <= todayEnd && s.earning != null) {
            todayTotal += s.earning;
        }
    });
    var todayEl = document.getElementById("todayEarningDisplay");
    if (todayEl) todayEl.textContent = "Today: £" + todayTotal.toFixed(2);
    var savingsPercent = (typeof currentSavingsPercent === "number" && !isNaN(currentSavingsPercent)) ? currentSavingsPercent : 0;
    var suggestedSavings = Math.round(todayTotal * (savingsPercent / 100) * 100) / 100;
    var suggestedEl = document.getElementById("suggestedSavingsDisplay");
    if (suggestedEl) suggestedEl.textContent = "Suggested to save today £" + suggestedSavings.toFixed(2);
    var currentMonthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    var monthlyExpensesTotal = 0;
    var monthlyBillsOnlyHourly = 0;
    if (Array.isArray(expenses)) {
        expenses.forEach(function(e) {
            if (!e || !e.date || typeof e.date !== "string" || !e.date.startsWith(currentMonthStr) || e.type !== "bill") return;
            if (typeof e.amount === "number" && !isNaN(e.amount)) monthlyBillsOnlyHourly += e.amount;
        });
    }
    var recurringTotalHourly = 0;
    try {
        recurringTotalHourly = await getRecurringBillsTotal();
    } catch (e) { console.warn("getRecurringBillsTotal in loadWorkSessions:", e); }
    var dailyBills = (monthlyBillsOnlyHourly / 30) + (recurringTotalHourly / 30);
    var safeToSpend = Math.round((todayTotal - dailyBills - suggestedSavings) * 100) / 100;
    var safeToSpendEl = document.getElementById("safeToSpendDisplay");
    if (safeToSpendEl) safeToSpendEl.textContent = "Safe to spend today £" + safeToSpend.toFixed(2);
    var safeToSpendMsgEl = document.getElementById("safeToSpendSmartMessage");
    if (safeToSpendMsgEl) {
        if (safeToSpend < 0) {
            safeToSpendMsgEl.textContent = "Today is tight — consider reducing spending or working more hours.";
        } else if (safeToSpend <= 30) {
            safeToSpendMsgEl.textContent = "You can spend a little today, but keep it light.";
        } else {
            safeToSpendMsgEl.textContent = "You're in a good position today — spend mindfully.";
        }
    }
    var smartMsgEl = document.getElementById("smartSavingsMessage");
    if (smartMsgEl) {
        if (todayTotal === 0) {
            smartMsgEl.textContent = "Log your work hours to see saving suggestion.";
        } else if (todayTotal > 0 && todayTotal < 50) {
            smartMsgEl.textContent = "Small wins add up. Saving a little today keeps you consistent.";
        } else {
            smartMsgEl.textContent = "Great work today — locking in saving now builds long term wealth.";
        }
    }
    var weekStartDate = new Date(now);
    weekStartDate.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStartDate.setHours(0, 0, 0, 0);
    var weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    weekEndDate.setHours(23, 59, 59, 999);
    var weekStart = weekStartDate.getTime();
    var weekEnd = weekEndDate.getTime();
    var weekTotal = 0;
    sessions.forEach(function(s) {
        if (s.sortKey >= weekStart && s.sortKey <= weekEnd && s.earning != null) {
            weekTotal += s.earning;
        }
    });
    var weekEl = document.getElementById("weekEarningDisplay");
    if (weekEl) weekEl.textContent = "This week: £" + weekTotal.toFixed(2);
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    var monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    var hoursThisMonth = 0;
    var earningsThisMonth = 0;
    var holidayHoursThisMonth = 0;
    var totalHolidayAccrued = 0;
    sessions.forEach(function(s) {
        var completed = s.totalMinutes != null && s.totalMinutes > 0;
        if (!completed) return;
        var hours = s.totalMinutes / 60;
        var accrual = hours * (typeof HOLIDAY_ACCRUAL_RATE === "number" && !isNaN(HOLIDAY_ACCRUAL_RATE) ? HOLIDAY_ACCRUAL_RATE : 0.1207);
        if (s.sortKey >= monthStart && s.sortKey <= monthEnd) {
            hoursThisMonth += hours;
            if (s.earning != null && !isNaN(s.earning)) earningsThisMonth += s.earning;
            holidayHoursThisMonth += accrual;
        }
        totalHolidayAccrued += accrual;
    });
    hoursThisMonth = Math.round(hoursThisMonth * 100) / 100;
    earningsThisMonth = Math.round(earningsThisMonth * 100) / 100;
    holidayHoursThisMonth = Math.round(holidayHoursThisMonth * 100) / 100;
    totalHolidayAccrued = Math.round(totalHolidayAccrued * 100) / 100;
    var dayOfMonth = now.getDate();
    var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var remainingWorkingDays = 0;
    for (var d = dayOfMonth; d <= lastDay; d++) {
        var wd = new Date(now.getFullYear(), now.getMonth(), d).getDay();
        if (wd >= 1 && wd <= 5) remainingWorkingDays++;
    }
    var avgDaily = dayOfMonth >= 1 ? earningsThisMonth / dayOfMonth : 0;
    var projectedIncomeThisMonth = Math.round(avgDaily * remainingWorkingDays * 100) / 100;
    var hoursThisMonthEl = document.getElementById("hoursWorkedThisMonthDisplay");
    if (hoursThisMonthEl) hoursThisMonthEl.textContent = "Hours worked this month: " + hoursThisMonth.toFixed(2);
    var earningsThisMonthEl = document.getElementById("earningsThisMonthDisplay");
    if (earningsThisMonthEl) earningsThisMonthEl.textContent = "Earnings this month: £" + earningsThisMonth.toFixed(2);
    var projectedEl = document.getElementById("projectedIncomeThisMonthDisplay");
    if (projectedEl) projectedEl.textContent = "Projected income this month: £" + projectedIncomeThisMonth.toFixed(2);
    var holidayThisMonthEl = document.getElementById("holidayAccruedThisMonthDisplay");
    if (holidayThisMonthEl) holidayThisMonthEl.textContent = "Holiday hours accrued this month: " + holidayHoursThisMonth.toFixed(2);
    var totalHolidayEl = document.getElementById("totalHolidayAccruedDisplay");
    if (totalHolidayEl) totalHolidayEl.textContent = "Total holiday hours accrued: " + totalHolidayAccrued.toFixed(2);
    var rate = (typeof currentHourlyRate === "number" && !isNaN(currentHourlyRate)) ? currentHourlyRate : 0;
    var hoursToday = 0;
    sessions.forEach(function(s) {
        if (s.sortKey >= todayStart && s.sortKey <= todayEnd && s.totalMinutes != null) {
            hoursToday += s.totalMinutes / 60;
        }
    });
    var effectiveRate = (hoursToday > 0 && todayTotal > 0) ? todayTotal / hoursToday : rate;
    var totalHoursAll = 0;
    var minTs = null;
    var maxTs = null;
    sessions.forEach(function(s) {
        if (s.totalMinutes != null) totalHoursAll += s.totalMinutes / 60;
        if (s.sortKey != null) {
            if (minTs == null || s.sortKey < minTs) minTs = s.sortKey;
            if (maxTs == null || s.sortKey > maxTs) maxTs = s.sortKey;
        }
    });
    var todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var rangeEnd = maxTs != null && maxTs > todayStartMs ? maxTs : todayStartMs;
    var rangeStart = minTs != null ? minTs : todayStartMs;
    var calendarDays = Math.max(1, Math.round((rangeEnd - rangeStart) / (24 * 60 * 60 * 1000)) + 1);
    var avgHoursPerDay = calendarDays > 0 ? totalHoursAll / calendarDays : 0;
    var dayProj = Math.round(avgHoursPerDay * effectiveRate * 100) / 100;
    var workingDaysPerWeek = 5;
    var weekProj = Math.round(workingDaysPerWeek * avgHoursPerDay * effectiveRate * 100) / 100;
    var workingDaysInMonth = getWorkingDaysInCurrentMonth(now);
    var monthProj = Math.round(workingDaysInMonth * avgHoursPerDay * effectiveRate * 100) / 100;
    var pacingEl = document.getElementById("pacingDisplay");
    if (pacingEl) {
        pacingEl.textContent = "If you keep this pace: £" + dayProj.toFixed(2) + " today, £" + weekProj.toFixed(2) + " week, £" + monthProj.toFixed(2) + " month";
    }
    listEl.innerHTML = "";
    sessions.forEach(function(s) {
        var li = document.createElement("li");
        li.className = "work-session-item";
        li.setAttribute("role", "button");
        li.tabIndex = 0;
        var earningStr = s.earning != null ? "£" + s.earning.toFixed(2) : "—";
        var breakLabel = s.breakLabel != null ? s.breakLabel : "0 min";
        var textSpan = document.createElement("span");
        textSpan.className = "work-session-item-text";
        textSpan.textContent = s.dateLabel + " — Break: " + breakLabel + " — Hours worked: " + s.durationLabel + " — " + earningStr;
        li.appendChild(textSpan);
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "work-session-edit-btn";
        editBtn.textContent = "Edit";
        editBtn.setAttribute("aria-label", "Edit session");
        editBtn.dataset.sessionId = s.id || "";
        editBtn.addEventListener("click", function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var id = editBtn.dataset.sessionId;
            if (id) openEditWorkSessionModal(id, s.totalMinutes, s.breakMinutes, s.startTime, s.endTime);
        });
        li.appendChild(editBtn);
        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "work-session-delete-btn";
        delBtn.textContent = "Delete";
        delBtn.setAttribute("aria-label", "Delete session");
        delBtn.dataset.sessionId = s.id || "";
        delBtn.addEventListener("click", function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var id = delBtn.dataset.sessionId;
            if (id) deleteWorkSession(id);
        });
        li.appendChild(delBtn);
        li.addEventListener("click", function(ev) {
            if (ev.target === delBtn || ev.target === editBtn) return;
            var items = listEl.querySelectorAll(".work-session-item");
            items.forEach(function(item) { item.classList.remove("selected"); });
            li.classList.add("selected");
        });
        listEl.appendChild(li);
    });

    await tryResumeActiveWorkSession();
}

/**
 * If there is an active work session in Firestore (startTime, no endTime), restore it
 * so the timer continues counting instead of resetting to zero on page load.
 */
async function tryResumeActiveWorkSession() {
    if (hourlySessionDocId != null || !db || typeof db.collection !== "function") return;
    try {
        var snapshot = await db.collection("work_sessions").orderBy("startTime", "desc").limit(1).get();
        if (snapshot.empty) return;
        var doc = snapshot.docs[0];
        var data = doc.data();
        if (data.endTime != null) return;
        var startTime = data.startTime;
        var startMs = startTime && startTime.toDate ? startTime.toDate().getTime() : Date.now();
        hourlySessionDocId = doc.id;
        hourlySessionStartTime = startMs;
        hourlySessionPausedAt = null;
        var timerEl = document.getElementById("hourlyTimerDisplay");
        var startBtn = document.getElementById("startWorkBtn");
        var breakEntryWrap = document.getElementById("breakEntryWrap");
        if (hourlyTimerIntervalId != null) {
            clearInterval(hourlyTimerIntervalId);
            hourlyTimerIntervalId = null;
        }
        if (startBtn) {
            startBtn.textContent = "Stop work";
            startBtn.classList.add("start-work-btn-stop");
        }
        if (breakEntryWrap) breakEntryWrap.style.display = "none";
        var actionsWrap = startBtn && startBtn.closest(".hourly-tracker-actions");
        if (actionsWrap) actionsWrap.style.display = "";
        if (timerEl) {
            var elapsedSec = (Date.now() - hourlySessionStartTime) / 1000;
            timerEl.textContent = formatElapsedHMS(elapsedSec);
        }
        hourlyTimerIntervalId = setInterval(function() {
            if (hourlySessionStartTime == null || hourlySessionPausedAt != null || !timerEl) return;
            var elapsed = (Date.now() - hourlySessionStartTime) / 1000;
            timerEl.textContent = formatElapsedHMS(elapsed);
        }, 1000);
    } catch (err) {
        console.warn("tryResumeActiveWorkSession error:", err);
    }
}

async function deleteWorkSession(sessionId) {
    if (!sessionId || !db || typeof db.collection !== "function") return;
    try {
        await db.collection("work_sessions").doc(sessionId).delete();
        loadWorkSessions().catch(function(e) { console.warn("loadWorkSessions after delete:", e); });
    } catch (err) {
        console.error("Delete work session error:", err);
    }
}

function openEditWorkSessionModal(sessionId, currentTotalMinutes, currentBreakMinutes, startTime, endTime) {
    var modal = document.getElementById("editWorkSessionModal");
    var startEl = document.getElementById("editWorkSessionStartInput");
    var finishEl = document.getElementById("editWorkSessionFinishInput");
    var breakHoursEl = document.getElementById("editWorkSessionBreakHoursInput");
    var breakMinutesEl = document.getElementById("editWorkSessionBreakMinutesInput");
    var totalDisplayEl = document.getElementById("editWorkSessionTotalDisplay");
    var msgEl = document.getElementById("editWorkSessionMsg");
    if (!modal || !startEl || !finishEl) return;
    modal.dataset.editSessionId = sessionId || "";
    var startStr = formatToDatetimeLocal(startTime);
    var endStr = formatToDatetimeLocal(endTime);
    if (!endStr && startStr) {
        var total = (currentTotalMinutes != null && !isNaN(Number(currentTotalMinutes)) && Number(currentTotalMinutes) >= 0) ? Number(currentTotalMinutes) : 0;
        var breakTotal = (currentBreakMinutes != null && !isNaN(Number(currentBreakMinutes)) && Number(currentBreakMinutes) >= 0) ? Number(currentBreakMinutes) : 0;
        var elapsed = total + breakTotal;
        var startDate = startTime && startTime.toDate ? startTime.toDate() : new Date(startStr);
        var finishDate = new Date(startDate.getTime() + elapsed * 60000);
        endStr = formatToDatetimeLocal(finishDate);
    }
    startEl.value = startStr || "";
    finishEl.value = endStr || "";
    var breakTotal = (currentBreakMinutes != null && !isNaN(Number(currentBreakMinutes)) && Number(currentBreakMinutes) >= 0) ? Number(currentBreakMinutes) : 0;
    var bh = Math.floor(breakTotal / 60);
    var bm = Math.round(breakTotal - bh * 60);
    if (bm >= 60) { bm = 0; bh += 1; }
    if (breakHoursEl) breakHoursEl.value = String(bh);
    if (breakMinutesEl) breakMinutesEl.value = String(bm);
    if (msgEl) msgEl.textContent = "";
    updateEditWorkSessionTotalDisplay();
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    startEl.focus();
}

function updateEditWorkSessionTotalDisplay() {
    var startEl = document.getElementById("editWorkSessionStartInput");
    var finishEl = document.getElementById("editWorkSessionFinishInput");
    var breakHoursEl = document.getElementById("editWorkSessionBreakHoursInput");
    var breakMinutesEl = document.getElementById("editWorkSessionBreakMinutesInput");
    var totalDisplayEl = document.getElementById("editWorkSessionTotalDisplay");
    if (!totalDisplayEl) return;
    var s = startEl ? startEl.value : "";
    var f = finishEl ? finishEl.value : "";
    var startMs = s ? new Date(s).getTime() : NaN;
    var finishMs = f ? new Date(f).getTime() : NaN;
    var breakH = breakHoursEl ? parseFloat(breakHoursEl.value) : 0;
    var breakM = breakMinutesEl ? parseFloat(breakMinutesEl.value) : 0;
    if (isNaN(breakH)) breakH = 0;
    if (isNaN(breakM)) breakM = 0;
    if (breakM >= 60) breakM = 59;
    var breakMinutesTotal = breakH * 60 + breakM;
    if (!isNaN(startMs) && !isNaN(finishMs) && finishMs >= startMs) {
        var elapsedMinutes = (finishMs - startMs) / 60000;
        var worked = Math.max(0, elapsedMinutes - breakMinutesTotal);
        totalDisplayEl.textContent = formatMinutesAsHoursMinutes(worked);
    } else {
        totalDisplayEl.textContent = "0h 0m";
    }
}

function closeEditWorkSessionModal() {
    var modal = document.getElementById("editWorkSessionModal");
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    modal.dataset.editSessionId = "";
}

async function updateWorkSessionTime(sessionId, totalMinutes, breakMinutes, startDate, endDate) {
    if (!sessionId || !db || typeof db.collection !== "function") return false;
    var mins = parseFloat(totalMinutes);
    if (isNaN(mins) || mins < 0) mins = 0;
    var totalMinutesRounded = Math.round(mins * 100) / 100;
    var breakMins = (breakMinutes != null && !isNaN(Number(breakMinutes)) && Number(breakMinutes) >= 0)
        ? Number(breakMinutes) : 0;
    breakMins = Math.round(breakMins * 100) / 100;
    var hourlyRate = (typeof currentHourlyRate === "number" && !isNaN(currentHourlyRate)) ? currentHourlyRate : 0;
    var hoursWorked = Math.round((totalMinutesRounded / 60) * 100) / 100;
    var earning = Math.round(hoursWorked * hourlyRate * 100) / 100;
    var payload = { totalMinutes: totalMinutesRounded, hoursWorked: hoursWorked, hourlyRate: hourlyRate, earning: earning, earningsForSession: earning };
    if (breakMins >= 0) payload.breakMinutes = breakMins;
    if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
        payload.startTime = firebase.firestore.Timestamp.fromDate(startDate);
        payload.endTime = firebase.firestore.Timestamp.fromDate(endDate);
    }
    try {
        await db.collection("work_sessions").doc(sessionId).update(payload);
        return true;
    } catch (err) {
        console.error("updateWorkSessionTime error:", err);
        return false;
    }
}

/**
 * Sets up Hourly Tracker: Start/Stop work and live timer
 * @param {Object} elements - DOM element references
 */
function updateWorkButtonState(btn) {
    if (!btn) return;
    if (hourlySessionDocId != null) {
        btn.textContent = "Stop work";
        btn.classList.add("start-work-btn-stop");
    } else {
        btn.textContent = "Start work";
        btn.classList.remove("start-work-btn-stop");
    }
}

function setupHourlyTrackerListener(elements) {
    var startBtn = elements && elements.startWorkBtn;
    var msgEl = elements && elements.startWorkMsg;
    var timerEl = elements && elements.hourlyTimerDisplay;
    var breakEntryWrap = document.getElementById("breakEntryWrap");
    var breakDurationInput = document.getElementById("breakDurationInput");
    var breakUnitSelect = document.getElementById("breakUnitSelect");
    var confirmSessionBtn = document.getElementById("confirmSessionBtn");
    var cancelBreakEntryBtn = document.getElementById("cancelBreakEntryBtn");
    if (!startBtn) return;

    var savePreferenceBtn = document.getElementById("savePreferenceBtn");
    if (savePreferenceBtn) {
        savePreferenceBtn.addEventListener("click", function() {
            var msgEl2 = document.getElementById("hourlyRateMsg");
            if (msgEl2) { msgEl2.textContent = ""; msgEl2.className = "hourly-msg"; }
            saveUserSettingsHourlyRate().then(function() {
                if (msgEl2) { msgEl2.textContent = "Preferences saved."; msgEl2.className = "hourly-msg success"; setTimeout(function() { if (msgEl2) msgEl2.textContent = ""; }, 2000); }
            });
        });
    }

    function stopTimer() {
        if (hourlyTimerIntervalId != null) {
            clearInterval(hourlyTimerIntervalId);
            hourlyTimerIntervalId = null;
        }
        hourlySessionDocId = null;
        hourlySessionStartTime = null;
        hourlySessionPausedAt = null;
        if (timerEl) timerEl.textContent = "00:00:00";
        updateWorkButtonState(startBtn);
        if (breakEntryWrap) breakEntryWrap.style.display = "none";
        var actionsWrap = startBtn && startBtn.closest(".hourly-tracker-actions");
        if (actionsWrap) actionsWrap.style.display = "";
    }

    function showBreakEntry() {
        hourlySessionPausedAt = Date.now();
        if (hourlyTimerIntervalId != null) {
            clearInterval(hourlyTimerIntervalId);
            hourlyTimerIntervalId = null;
        }
        if (timerEl && hourlySessionStartTime != null) {
            var elapsedSec = (hourlySessionPausedAt - hourlySessionStartTime) / 1000;
            timerEl.textContent = formatElapsedHMS(elapsedSec);
        }
        if (breakDurationInput) { breakDurationInput.value = "0"; breakDurationInput.min = "0"; }
        if (breakUnitSelect) breakUnitSelect.value = "minutes";
        if (breakEntryWrap) breakEntryWrap.style.display = "block";
        var actionsWrap = startBtn && startBtn.closest(".hourly-tracker-actions");
        if (actionsWrap) actionsWrap.style.display = "none";
    }

    function hideBreakEntryAndResume() {
        if (breakEntryWrap) breakEntryWrap.style.display = "none";
        var actionsWrap = startBtn && startBtn.closest(".hourly-tracker-actions");
        if (actionsWrap) actionsWrap.style.display = "";
        hourlySessionPausedAt = null;
        var elapsedSoFar = hourlySessionStartTime != null && hourlySessionPausedAt != null
            ? (hourlySessionPausedAt - hourlySessionStartTime) : 0;
        hourlySessionStartTime = Date.now() - elapsedSoFar;
        if (timerEl) timerEl.textContent = formatElapsedHMS(elapsedSoFar / 1000);
        if (hourlyTimerIntervalId != null) clearInterval(hourlyTimerIntervalId);
        hourlyTimerIntervalId = setInterval(function() {
            if (hourlySessionStartTime == null || !timerEl) return;
            var elapsed = (Date.now() - hourlySessionStartTime) / 1000;
            timerEl.textContent = formatElapsedHMS(elapsed);
        }, 1000);
    }

    startBtn.addEventListener("click", async function() {
        if (msgEl) {
            msgEl.textContent = "";
            msgEl.className = "hourly-msg";
        }
        if (hourlySessionPausedAt != null) return;
        if (hourlySessionDocId != null) {
            showBreakEntry();
            return;
        }
        if (!db || typeof db.collection !== "function") {
            if (msgEl) {
                msgEl.textContent = "Firebase not ready. Try again.";
                msgEl.className = "hourly-msg error";
            }
            return;
        }
        try {
            startBtn.disabled = true;
            var rateAtStart = (currentHourlyRate != null && !isNaN(currentHourlyRate)) ? currentHourlyRate : 0;
            var docRef = await db.collection("work_sessions").add({
                startTime: firebase.firestore.FieldValue.serverTimestamp(),
                hourlyRate: rateAtStart
            });
            hourlySessionDocId = docRef.id;
            hourlySessionStartTime = Date.now();
            hourlySessionPausedAt = null;
            updateWorkButtonState(startBtn);
            if (breakEntryWrap) breakEntryWrap.style.display = "none";
            if (timerEl) timerEl.textContent = "00:00:00";
            if (hourlyTimerIntervalId != null) clearInterval(hourlyTimerIntervalId);
            hourlyTimerIntervalId = setInterval(function() {
                if (hourlySessionStartTime == null || hourlySessionPausedAt != null || !timerEl) return;
                var elapsed = (Date.now() - hourlySessionStartTime) / 1000;
                timerEl.textContent = formatElapsedHMS(elapsed);
            }, 1000);
            if (msgEl) {
                msgEl.textContent = "Work session started.";
                msgEl.className = "hourly-msg success";
            }
        } catch (err) {
            console.error("Start work error:", err);
            if (msgEl) {
                msgEl.textContent = "Could not start session. Try again.";
                msgEl.className = "hourly-msg error";
            }
        } finally {
            startBtn.disabled = false;
        }
    });

    if (confirmSessionBtn) {
        confirmSessionBtn.addEventListener("click", async function() {
            if (hourlySessionDocId == null || hourlySessionPausedAt == null) return;
            var raw = breakDurationInput ? parseFloat(breakDurationInput.value) : 0;
            if (isNaN(raw)) raw = 0;
            var unit = breakUnitSelect ? breakUnitSelect.value : "minutes";
            var breakMinutes = unit === "hours" ? raw * 60 : raw;
            breakMinutes = Math.max(0, breakMinutes);
            var elapsedMs = hourlySessionPausedAt - hourlySessionStartTime;
            var workedMs = Math.max(0, elapsedMs - breakMinutes * 60000);
            var totalMinutes = Math.round(workedMs / 60000 * 100) / 100;
            var hourlyRate = currentHourlyRate != null && !isNaN(currentHourlyRate) ? currentHourlyRate : 0;
            var hoursWorked = Math.round((totalMinutes / 60) * 100) / 100;
            var earning = Math.round(hoursWorked * hourlyRate * 100) / 100;
            var earningsForSession = earning;
            if (msgEl) { msgEl.textContent = ""; msgEl.className = "hourly-msg"; }
            if (db && typeof db.collection === "function") {
                try {
                    confirmSessionBtn.disabled = true;
                    await db.collection("work_sessions").doc(hourlySessionDocId).update({
                        endTime: firebase.firestore.FieldValue.serverTimestamp(),
                        totalMinutes: totalMinutes,
                        hoursWorked: hoursWorked,
                        hourlyRate: hourlyRate,
                        earning: earning,
                        earningsForSession: earningsForSession,
                        breakMinutes: breakMinutes
                    });
                    if (msgEl) {
                        msgEl.textContent = "You earned: £" + earning.toFixed(2) + " for this session.";
                        msgEl.className = "hourly-msg success";
                    }
                    loadWorkSessions().catch(function(e) { console.warn("loadWorkSessions after stop:", e); });
                    refreshSpendingIncomeOverviewCharts().catch(function(e) { console.warn("refreshSpendingIncomeOverviewCharts:", e); });
                    runNotificationChecks({ fromSessionComplete: true }).catch(function(e) { console.warn("runNotificationChecks after session:", e); });
                    loadNotificationsPanel().catch(function(e) { console.warn("loadNotificationsPanel after session:", e); });
                    loadSavingGoals().catch(function(e) { console.warn("loadSavingGoals after session:", e); });
                } catch (err) {
                    console.error("Save session error:", err);
                    if (msgEl) {
                        msgEl.textContent = "Could not save session. Try again.";
                        msgEl.className = "hourly-msg error";
                    }
                } finally {
                    confirmSessionBtn.disabled = false;
                }
            } else {
                if (msgEl) {
                    msgEl.textContent = "Session ended (not saved – Firebase not ready).";
                    msgEl.className = "hourly-msg error";
                }
            }
            stopTimer();
        });
    }

    if (cancelBreakEntryBtn) {
        cancelBreakEntryBtn.addEventListener("click", function() {
            if (hourlySessionPausedAt == null) return;
            hideBreakEntryAndResume();
        });
    }
}

/**
 * Switches between pages
 * @param {string} pageName - Name of the page to show ("home" or "history")
 * @param {Object} elements - DOM element references
 */
function switchPage(pageName, elements) {
    console.log("Switching to page:", pageName);
    
    // Remove active class from all tabs and pages
    if (elements.homeTab) elements.homeTab.classList.remove("active");
    if (elements.expensesTab) elements.expensesTab.classList.remove("active");
    if (elements.historyTab) elements.historyTab.classList.remove("active");
    if (elements.hourlyTab) elements.hourlyTab.classList.remove("active");
    if (elements.stocksTab) elements.stocksTab.classList.remove("active");
    if (elements.mortgageTab) elements.mortgageTab.classList.remove("active");
    if (elements.homePage) elements.homePage.classList.remove("active");
    if (elements.expensesPage) elements.expensesPage.classList.remove("active");
    if (elements.historyPage) elements.historyPage.classList.remove("active");
    if (elements.hourlyPage) elements.hourlyPage.classList.remove("active");
    if (elements.stocksPage) elements.stocksPage.classList.remove("active");
    if (elements.mortgagePage) elements.mortgagePage.classList.remove("active");
    if (elements.settingsPage) elements.settingsPage.classList.remove("active");
    if (elements.settingsTab) elements.settingsTab.classList.remove("active");
    
    // Add active class to selected tab and page
    if (pageName === "home") {
        if (elements.homeTab) elements.homeTab.classList.add("active");
        if (elements.homePage) elements.homePage.classList.add("active");
        console.log("✅ Switched to home page");
        loadPortfolioFromFirestore().catch(function(e) { console.warn("loadPortfolio on home:", e); });
        loadMortgages().catch(function(e) { console.warn("loadMortgages on home:", e); });
    } else if (pageName === "expenses") {
        if (elements.expensesTab) elements.expensesTab.classList.add("active");
        if (elements.expensesPage) elements.expensesPage.classList.add("active");
        console.log("✅ Switched to Expenses page");
    } else if (pageName === "history") {
        if (elements.historyTab) elements.historyTab.classList.add("active");
        if (elements.historyPage) elements.historyPage.classList.add("active");
        console.log("✅ Switched to history page");
        // Re-render charts after page is visible so canvas has correct dimensions
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                renderChart();
                // Resize existing Chart.js instances if they exist
                if (monthlyChart) {
                    try { monthlyChart.resize(); } catch (e) { /* ignore */ }
                }
                if (categoryChart) {
                    try { categoryChart.resize(); } catch (e) { /* ignore */ }
                }
                if (incomeVsExpensesChart) {
                    try { incomeVsExpensesChart.resize(); } catch (e) { /* ignore */ }
                }
            });
        });
    } else if (pageName === "hourly") {
        if (elements.hourlyTab) elements.hourlyTab.classList.add("active");
        if (elements.hourlyPage) elements.hourlyPage.classList.add("active");
        console.log("✅ Switched to Hourly Tracker page");
        loadUserSettingsHourlyRate().catch(function(e) { console.warn("loadUserSettingsHourlyRate on switch:", e); });
        loadWorkSessions().catch(function(e) { console.warn("loadWorkSessions on switch:", e); });
    } else if (pageName === "stocks") {
        if (elements.stocksTab) elements.stocksTab.classList.add("active");
        if (elements.stocksPage) elements.stocksPage.classList.add("active");
        console.log("✅ Switched to Stocks page");
        loadPortfolioFromFirestore().catch(function(e) { console.warn("loadPortfolio on switch:", e); });
    } else if (pageName === "mortgage") {
        if (elements.mortgageTab) elements.mortgageTab.classList.add("active");
        if (elements.mortgagePage) elements.mortgagePage.classList.add("active");
        console.log("✅ Switched to Mortgage page");
        loadMortgages().catch(function(e) { console.warn("loadMortgages on switch:", e); });
    } else if (pageName === "settings") {
        if (elements.settingsTab) elements.settingsTab.classList.add("active");
        if (elements.settingsPage) elements.settingsPage.classList.add("active");
        console.log("✅ Switched to Settings page");
        loadSettingsPage().catch(function(e) { console.warn("loadSettingsPage on switch:", e); });
    }
}

// ============================================================================
// ONBOARDING FUNCTIONALITY
// ============================================================================

let currentOnboardingSlide = 1;
const totalOnboardingSlides = 4;

/**
 * Checks if user has seen onboarding and shows it if needed
 */
function checkAndShowOnboarding() {
    const hasSeenOnboarding = localStorage.getItem("hasSeenOnboarding");
    if (!hasSeenOnboarding) {
        setTimeout(() => {
            showOnboarding();
        }, 300);
    }
}

/**
 * Shows the onboarding modal
 */
function showOnboarding() {
    const modal = document.getElementById("onboardingModal");
    if (modal) {
        modal.classList.add("show");
        currentOnboardingSlide = 1;
        updateOnboardingSlide(1);
    }
}

/**
 * Closes the onboarding modal
 */
function closeOnboarding() {
    const modal = document.getElementById("onboardingModal");
    if (modal) {
        modal.classList.remove("show");
        localStorage.setItem("hasSeenOnboarding", "true");
    }
}

/**
 * Updates the onboarding slide display
 * @param {number} slideNumber - Slide number to show (1-4)
 */
function updateOnboardingSlide(slideNumber) {
    // Update slides
    document.querySelectorAll(".onboarding-slide").forEach((slide, index) => {
        if (index + 1 === slideNumber) {
            slide.classList.add("active");
        } else {
            slide.classList.remove("active");
        }
    });
    
    // Update dots
    document.querySelectorAll(".onboarding-dots .dot").forEach((dot, index) => {
        if (index + 1 === slideNumber) {
            dot.classList.add("active");
        } else {
            dot.classList.remove("active");
        }
    });
    
    // Update next button text
    const nextBtn = document.getElementById("nextOnboarding");
    if (nextBtn) {
        if (slideNumber === totalOnboardingSlides) {
            nextBtn.textContent = "Get Started";
        } else {
            nextBtn.textContent = "Next";
        }
    }
}

/**
 * Goes to the next onboarding slide
 */
function nextOnboardingSlide() {
    if (currentOnboardingSlide < totalOnboardingSlides) {
        currentOnboardingSlide++;
        updateOnboardingSlide(currentOnboardingSlide);
    } else {
        closeOnboarding();
    }
}

/**
 * Sets up onboarding event listeners
 * @param {Object} elements - DOM element references
 */
function setupOnboardingListeners(elements) {
    if (!elements.skipOnboardingBtn || !elements.nextOnboardingBtn) {
        return;
    }
    
    // Skip button
    elements.skipOnboardingBtn.addEventListener("click", () => {
        closeOnboarding();
    });
    
    // Next button
    elements.nextOnboardingBtn.addEventListener("click", () => {
        nextOnboardingSlide();
    });
    
    // Dot navigation
    document.querySelectorAll(".onboarding-dots .dot").forEach((dot, index) => {
        dot.addEventListener("click", () => {
            currentOnboardingSlide = index + 1;
            updateOnboardingSlide(currentOnboardingSlide);
        });
    });
}

/**
 * Handles clearing all expenses with user confirmation
 */
async function handleClearAllExpenses() {
    if (expenses.length === 0) return;
    
    const confirmed = window.confirm("Are you sure you want to clear all expenses?");
    if (!confirmed) return;
    
    // Delete all expenses from Firestore
    const firebaseReady = await ensureFirebaseReady();
    if (firebaseReady && db) {
        try {
            const batch = db.batch();
            const expensesToDelete = expenses.filter(exp => exp.id);
            
            if (expensesToDelete.length > 0) {
                expensesToDelete.forEach(exp => {
                    const docRef = db.collection("expenses").doc(exp.id);
                    batch.delete(docRef);
                });
                
                await batch.commit();
                console.log(`✅ Deleted ${expensesToDelete.length} expenses from Firestore`);
            }
        } catch (error) {
            console.error("❌ Error clearing expenses from Firestore:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
        }
    }
    
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

    // Show/hide Bill schedule in edit modal when Type changes
    var editTypeEl = document.getElementById("edit-type");
    var editBillScheduleWrap = document.getElementById("editBillScheduleWrap");
    if (editTypeEl && editBillScheduleWrap) {
        editTypeEl.addEventListener("change", function() {
            editBillScheduleWrap.classList.toggle("hidden", editTypeEl.value !== "bill");
        });
    }

    // Edit work session modal (Hourly Tracker)
    var closeEditWorkSessionBtn = document.getElementById("closeEditWorkSessionModal");
    var cancelEditWorkSessionBtn = document.getElementById("cancelEditWorkSessionBtn");
    var saveEditWorkSessionBtn = document.getElementById("saveEditWorkSessionBtn");
    if (closeEditWorkSessionBtn) closeEditWorkSessionBtn.addEventListener("click", closeEditWorkSessionModal);
    if (cancelEditWorkSessionBtn) cancelEditWorkSessionBtn.addEventListener("click", closeEditWorkSessionModal);
    if (saveEditWorkSessionBtn) saveEditWorkSessionBtn.addEventListener("click", handleSaveEditWorkSession);
    ["editWorkSessionStartInput", "editWorkSessionFinishInput", "editWorkSessionBreakHoursInput", "editWorkSessionBreakMinutesInput"].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", updateEditWorkSessionTotalDisplay);
            el.addEventListener("change", updateEditWorkSessionTotalDisplay);
        }
    });

    // Edit stock modal (Portfolio)
    var closeEditStockBtn = document.getElementById("closeEditStockModal");
    var cancelEditStockBtn = document.getElementById("cancelEditStockBtn");
    var saveEditStockBtn = document.getElementById("saveEditStockBtn");
    if (closeEditStockBtn) closeEditStockBtn.addEventListener("click", closeEditStockModal);
    if (cancelEditStockBtn) cancelEditStockBtn.addEventListener("click", closeEditStockModal);
    if (saveEditStockBtn) saveEditStockBtn.addEventListener("click", handleSaveEditStock);
    var editStockForm = document.getElementById("edit-stock-form");
    if (editStockForm) {
        editStockForm.addEventListener("submit", function(e) {
            e.preventDefault();
            handleSaveEditStock();
        });
    }

    // Edit mortgage modal
    var closeEditMortgageBtn = document.getElementById("closeEditMortgageModal");
    var cancelEditMortgageBtn = document.getElementById("cancelEditMortgageBtn");
    var saveEditMortgageBtn = document.getElementById("saveEditMortgageBtn");
    if (closeEditMortgageBtn) closeEditMortgageBtn.addEventListener("click", closeEditMortgageModal);
    if (cancelEditMortgageBtn) cancelEditMortgageBtn.addEventListener("click", closeEditMortgageModal);
    if (saveEditMortgageBtn) saveEditMortgageBtn.addEventListener("click", handleSaveEditMortgage);
    var editMortgageForm = document.getElementById("edit-mortgage-form");
    if (editMortgageForm) {
        editMortgageForm.addEventListener("submit", function(e) {
            e.preventDefault();
            handleSaveEditMortgage();
        });
    }

    // Saving goal modal
    var savingGoalForm = document.getElementById("savingGoalForm");
    var savingGoalCancelBtn = document.getElementById("savingGoalCancelBtn");
    if (savingGoalForm) {
        savingGoalForm.addEventListener("submit", function(e) {
            e.preventDefault();
            handleSavingGoalFormSubmit(e);
        });
    }
    if (savingGoalCancelBtn) savingGoalCancelBtn.addEventListener("click", closeSavingGoalModal);
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
    const typeInput = document.getElementById("edit-type");
    const modal = document.getElementById("editModal");
    if (modal) {
        modal.classList.add("show");
    }
    
    if (!amountInput || !dateInput || !notesInput || !categoryInput || !modal) {
        console.error("Edit modal elements not found");
        return;
    }
    
    amountInput.value = expense.amount || "";
    dateInput.value = expense.date || "";
    notesInput.value = expense.note || "";
    categoryInput.value = expense.category || "";
    if (typeInput) typeInput.value = (expense.type === "bill" || expense.type === "spending") ? expense.type : "spending";
    var editBillSched = document.getElementById("edit-billSchedule");
    if (editBillSched) editBillSched.value = (expense.billSchedule === "recurring" || expense.billSchedule === "single") ? expense.billSchedule : "single";
    var editBillScheduleWrap = document.getElementById("editBillScheduleWrap");
    if (editBillScheduleWrap) editBillScheduleWrap.classList.toggle("hidden", (expense.type || "spending") !== "bill");
    modal.classList.add("show");
}

/**
 * Closes the edit modal
 */
function closeEditModal() {
    const modal = document.getElementById("editModal");
    if (modal) {
        modal.classList.remove("show");
    }
}

/**
 * Handles clicking outside the modal to close it
 * @param {Event} event - Click event
 */
function handleModalOutsideClick(event) {
    const editModal = document.getElementById("editModal");
    const onboardingModal = document.getElementById("onboardingModal");
    
    // Don't handle clicks if onboarding is showing
    if (onboardingModal && onboardingModal.classList.contains("show")) {
        return;
    }
    
    // Only close edit modal if it's open and click is on the modal backdrop
    if (editModal && editModal.classList.contains("show") && event.target === editModal) {
        closeEditModal();
    }
    var editWorkSessionModal = document.getElementById("editWorkSessionModal");
    if (editWorkSessionModal && editWorkSessionModal.classList.contains("show") && event.target === editWorkSessionModal) {
        closeEditWorkSessionModal();
    }
    var editStockModal = document.getElementById("editStockModal");
    if (editStockModal && editStockModal.classList.contains("show") && event.target === editStockModal) {
        closeEditStockModal();
    }
    var editMortgageModal = document.getElementById("editMortgageModal");
    if (editMortgageModal && editMortgageModal.classList.contains("show") && event.target === editMortgageModal) {
        closeEditMortgageModal();
    }
    var savingGoalModal = document.getElementById("savingGoalModal");
    if (savingGoalModal && savingGoalModal.classList.contains("show") && event.target === savingGoalModal) {
        closeSavingGoalModal();
    }
}

async function handleSaveEditWorkSession() {
    var modal = document.getElementById("editWorkSessionModal");
    var startEl = document.getElementById("editWorkSessionStartInput");
    var finishEl = document.getElementById("editWorkSessionFinishInput");
    var breakHoursEl = document.getElementById("editWorkSessionBreakHoursInput");
    var breakMinutesEl = document.getElementById("editWorkSessionBreakMinutesInput");
    var msgEl = document.getElementById("editWorkSessionMsg");
    if (!modal || !startEl || !finishEl) return;
    var sessionId = modal.dataset.editSessionId;
    if (!sessionId) return;
    if (msgEl) { msgEl.textContent = ""; msgEl.className = "hourly-msg"; }
    var startStr = startEl.value;
    var finishStr = finishEl.value;
    if (!startStr || !finishStr) {
        if (msgEl) { msgEl.textContent = "Please select start and finish."; msgEl.className = "hourly-msg error"; }
        return;
    }
    var startDate = new Date(startStr);
    var finishDate = new Date(finishStr);
    if (isNaN(startDate.getTime()) || isNaN(finishDate.getTime())) {
        if (msgEl) { msgEl.textContent = "Invalid start or finish."; msgEl.className = "hourly-msg error"; }
        return;
    }
    if (finishDate.getTime() <= startDate.getTime()) {
        if (msgEl) { msgEl.textContent = "Finish must be after start."; msgEl.className = "hourly-msg error"; }
        return;
    }
    var elapsedMinutes = (finishDate.getTime() - startDate.getTime()) / 60000;
    var breakHours = breakHoursEl ? parseFloat(breakHoursEl.value) : 0;
    var breakMinutes = breakMinutesEl ? parseFloat(breakMinutesEl.value) : 0;
    if (isNaN(breakHours) || breakHours < 0) breakHours = 0;
    if (isNaN(breakMinutes) || breakMinutes < 0) breakMinutes = 0;
    if (breakMinutes >= 60) breakMinutes = 59;
    var breakMinutesTotal = Math.round((breakHours * 60 + breakMinutes) * 100) / 100;
    var totalMinutes = Math.round((elapsedMinutes - breakMinutesTotal) * 100) / 100;
    if (totalMinutes < 0) totalMinutes = 0;
    var ok = await updateWorkSessionTime(sessionId, totalMinutes, breakMinutesTotal, startDate, finishDate);
    if (ok) {
        closeEditWorkSessionModal();
        loadWorkSessions().catch(function(e) { console.warn("loadWorkSessions after edit:", e); });
        if (msgEl) { msgEl.textContent = ""; }
    } else {
        if (msgEl) { msgEl.textContent = "Could not save. Try again."; msgEl.className = "hourly-msg error"; }
    }
}

/**
 * Handles saving an edited expense
 */
async function handleSaveEditedExpense() {
    // Get edit form elements
    const amountInput = document.getElementById("edit-amount");
    const dateInput = document.getElementById("edit-date");
    const notesInput = document.getElementById("edit-notes");
    const categoryInput = document.getElementById("edit-category");
    const typeInput = document.getElementById("edit-type");
    
    if (!amountInput || !dateInput || !notesInput || !categoryInput) {
        console.error("Edit form elements not found");
        return;
    }
    
    var editType = typeInput && typeInput.value;
    if (editType !== "bill" && editType !== "spending") editType = "spending";
    var editBillSchedEl = document.getElementById("edit-billSchedule");
    var editBillSched = editBillSchedEl && editBillSchedEl.value;
    if (editBillSched !== "recurring" && editBillSched !== "single") editBillSched = "single";
    // Extract edit form data
    const editData = {
        amount: Number(amountInput.value),
        date: dateInput.value,
        note: notesInput.value.trim(),
        category: categoryInput.value,
        type: editType,
        billSchedule: editBillSched
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
    
    var recurringBillIdToKeep = selectedExpense.recurringBillId || null;
    var isRecurringBill = editData.type === "bill" && editData.billSchedule === "recurring";

    // Sync recurring_bills: add, update, or remove
    if (selectedExpense.id) {
        const firebaseReady = await ensureFirebaseReady();
        if (firebaseReady && db) {
            try {
                if (selectedExpense.recurringBillId && !isRecurringBill) {
                    await db.collection("recurring_bills").doc(selectedExpense.recurringBillId).delete();
                    recurringBillIdToKeep = null;
                } else if (selectedExpense.recurringBillId && isRecurringBill) {
                    var dueDayUpdate = 1;
                    if (editData.date && typeof editData.date === "string" && editData.date.length >= 10) {
                        var du = parseInt(editData.date.slice(8, 10), 10);
                        if (!isNaN(du) && du >= 1 && du <= 31) dueDayUpdate = du;
                    }
                    await db.collection("recurring_bills").doc(selectedExpense.recurringBillId).update({
                        amount: editData.amount,
                        note: editData.note,
                        name: editData.note,
                        dueDayOfMonth: dueDayUpdate
                    });
                } else if (!selectedExpense.recurringBillId && isRecurringBill) {
                    var dueDayNew = 1;
                    if (editData.date && typeof editData.date === "string" && editData.date.length >= 10) {
                        var dn = parseInt(editData.date.slice(8, 10), 10);
                        if (!isNaN(dn) && dn >= 1 && dn <= 31) dueDayNew = dn;
                    }
                    var rbRef = await db.collection("recurring_bills").add({
                        amount: editData.amount,
                        note: editData.note,
                        name: editData.note,
                        expenseId: selectedExpense.id,
                        dueDayOfMonth: dueDayNew,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    recurringBillIdToKeep = rbRef.id;
                }
            } catch (rbErr) {
                console.warn("Recurring bills sync:", rbErr);
            }
        }
    }

    // Save updated expense (preserve Firestore ID and recurringBillId)
    const updatedExpense = {
        id: selectedExpense.id,
        note: editData.note,
        amount: editData.amount,
        date: editData.date,
        category: editData.category,
        type: editData.type,
        billSchedule: editData.billSchedule,
        recurringBillId: recurringBillIdToKeep || undefined
    };

    expenses[expenseIndex] = updatedExpense;
    localStorage.setItem("expenses", JSON.stringify(expenses));

    // Update expense in Firestore if it has an ID (date as Timestamp)
    if (updatedExpense.id) {
        const firebaseReady = await ensureFirebaseReady();
        if (firebaseReady && db) {
            try {
                var dateTs = editData.date
                    ? firebase.firestore.Timestamp.fromDate(new Date(editData.date + "T12:00:00"))
                    : null;
                var descEdit = editData.description != null ? String(editData.description) : (editData.note != null ? String(editData.note) : "");
                var catEdit = (editData.category != null && String(editData.category).trim()) ? String(editData.category).trim() : "Other";
                var updatePayload = {
                    amount: editData.amount,
                    description: descEdit,
                    category: catEdit,
                    note: editData.note,
                    type: editData.type,
                    billSchedule: (editData.type === "bill" && (editData.billSchedule === "recurring" || editData.billSchedule === "single")) ? editData.billSchedule : "single",
                    recurringBillId: recurringBillIdToKeep !== null ? recurringBillIdToKeep : firebase.firestore.FieldValue.delete()
                };
                if (dateTs) updatePayload.date = dateTs;
                await db.collection("expenses").doc(updatedExpense.id).update(updatePayload);
                console.log("✅ Expense updated in Firestore");
                loadRecurringBills().catch(function(e) { console.warn("loadRecurringBills after edit:", e); });
            } catch (error) {
                console.error("❌ Error updating expense in Firestore:", error);
                console.error("Error code:", error.code);
                console.error("Error message:", error.message);
            }
        }
    }

    selectedExpense = null;

    refreshAllDisplays();
    closeEditModal();
    runNotificationChecks().catch(function(e) { console.warn("runNotificationChecks after edit:", e); });
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

    if (expenses.length === 0) {
        emptyState.style.display = "block";
        expenseList.innerHTML = "";
        totalAmount.textContent = "Total: £0.00";
        return;
    }

    emptyState.style.display = "none";

    // Group expenses by month and render (recurring bills shown so user can delete them)
    const grouped = groupExpensesByMonth();

    const activeMonthKey = getActiveMonthKeyFromFilter();
    let monthLabelFilter = null;
    if (activeMonthKey) {
        monthLabelFilter = formatMonthLabelFromRaw(activeMonthKey);
    }

    for (const month in grouped) {
        if (monthLabelFilter && month !== monthLabelFilter) {
            continue; // Skip months that don't match the selected filter
        }
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

    li.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.target.tagName === "BUTTON" || e.target.tagName === "SELECT" || e.target.closest("select")) return;

        const isAlreadySelected = li.classList.contains("selected") && selectedExpense === expense;
        if (isAlreadySelected) {
            openEditModal(expense);
            return;
        }
        document.querySelectorAll(".expense-item").forEach(item => item.classList.remove("selected"));
        selectedExpense = expense;
        li.classList.add("selected");
    });

    var desc = expense.note || expense.description || "";
    var dateStr = expense.date && typeof expense.date === "string" ? expense.date : (expense.date ? String(expense.date) : "—");
    var amt = typeof expense.amount === "number" && !isNaN(expense.amount) ? expense.amount.toFixed(2) : "0.00";
    var cat = expense.category ? String(expense.category) : "Other";

    const row = document.createElement("div");
    row.classList.add("expense-item-row");
    const left = document.createElement("div");
    left.classList.add("expense-item-main");
    left.innerHTML = "";
    const amountEl = document.createElement("span");
    amountEl.classList.add("expense-item-amount");
    amountEl.textContent = "£" + amt;
    const descEl = document.createElement("span");
    descEl.classList.add("expense-item-desc");
    descEl.textContent = desc || "—";
    const dateEl = document.createElement("span");
    dateEl.classList.add("expense-item-date");
    dateEl.textContent = dateStr;
    left.appendChild(amountEl);
    left.appendChild(descEl);
    left.appendChild(dateEl);
    row.appendChild(left);

    const badge = document.createElement("span");
    badge.classList.add("expense-item-category-badge");
    badge.textContent = cat;
    row.appendChild(badge);

    const categorySelect = document.createElement("select");
    categorySelect.classList.add("expense-item-category-select");
    categorySelect.setAttribute("aria-label", "Edit category");
    var catList = (appPreferences.categories && appPreferences.categories.length) ? appPreferences.categories : DEFAULT_EXPENSE_CATEGORIES;
    catList.forEach(function(optVal) {
        var opt = document.createElement("option");
        opt.value = optVal;
        opt.textContent = optVal;
        if (optVal === cat) opt.selected = true;
        categorySelect.appendChild(opt);
    });
    if (catList.indexOf(cat) === -1) {
        var optOther = document.createElement("option");
        optOther.value = cat;
        optOther.textContent = cat;
        optOther.selected = true;
        categorySelect.insertBefore(optOther, categorySelect.firstChild);
    }
    categorySelect.addEventListener("change", function(e) {
        e.stopPropagation();
        var newCat = categorySelect.value;
        if (!newCat) return;
        updateExpenseCategory(expense.id, newCat);
        expense.category = newCat;
        badge.textContent = newCat;
    });
    categorySelect.addEventListener("click", function(e) { e.stopPropagation(); });
    row.appendChild(categorySelect);

    li.appendChild(row);
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
async function updateExpenseCategory(expenseId, newCategory) {
    if (!expenseId || newCategory == null || String(newCategory).trim() === "") return;
    var exp = expenses.filter(function(e) { return e && e.id === expenseId; })[0];
    if (!exp) return;
    exp.category = String(newCategory).trim();
    localStorage.setItem("expenses", JSON.stringify(expenses));
    var ready = await ensureFirebaseReady();
    if (ready && db && typeof db.collection === "function") {
        try {
            await db.collection("expenses").doc(expenseId).update({ category: exp.category });
        } catch (err) {
            console.warn("updateExpenseCategory Firestore:", err);
        }
    }
    calculateAndDisplayTotals();
}

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
async function deleteExpense(index, monthKey) {
    const grouped = groupExpensesByMonth();
    
    // Check if month key exists
    if (!grouped[monthKey] || !Array.isArray(grouped[monthKey])) {
        console.error("Month key not found in grouped expenses");
        renderExpenses();
        updateDashboard();
        return;
    }
    
    const expenseToDelete = grouped[monthKey][index];
    
    // Check if expense exists
    if (!expenseToDelete) {
        console.error("Expense not found at index");
        renderExpenses();
        updateDashboard();
        return;
    }
    
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
    
    // Remove from recurring_bills: by recurringBillId and by expenseId (so it always disappears when expense is deleted)
    if (db && typeof db.collection === "function") {
        try {
            if (expenseToDelete.recurringBillId) {
                await db.collection("recurring_bills").doc(expenseToDelete.recurringBillId).delete();
                console.log("✅ Recurring bill removed from Firestore");
            }
            var rbQuery = await db.collection("recurring_bills").where("expenseId", "==", expenseToDelete.id).get();
            var deletePromises = [];
            rbQuery.forEach(function(doc) { deletePromises.push(doc.ref.delete()); });
            if (deletePromises.length) await Promise.all(deletePromises);
        } catch (rbErr) {
            console.warn("Could not delete recurring_bills doc:", rbErr);
        }
    }

    // Remove expense from Firestore if it has an ID
    if (expenseToDelete.id) {
        const firebaseReady = await ensureFirebaseReady();
        if (firebaseReady && db) {
            try {
                await db.collection("expenses").doc(expenseToDelete.id).delete();
                console.log("✅ Expense deleted from Firestore");
            } catch (error) {
                console.error("❌ Error deleting expense from Firestore:", error);
                console.error("Error code:", error.code);
                console.error("Error message:", error.message);
            }
        }
    }

    // Remove expense and save
    expenses.splice(realIndex, 1);
    localStorage.setItem("expenses", JSON.stringify(expenses));

    // Update Recurring bills section so UI reflects the deletion (await so list updates before full refresh)
    try {
        await loadRecurringBills();
    } catch (e) {
        console.warn("loadRecurringBills after delete:", e);
    }

    refreshAllDisplays();
    runNotificationChecks().catch(function(e) { console.warn("runNotificationChecks after delete:", e); });
}

async function getTotalIncome() {
    if (!db || typeof db.collection !== "function") return 0;
    try {
        const snapshot = await db.collection("income").get();
        let total = 0;
        snapshot.forEach(function(doc) {
            const data = doc.data();
            if (data && data.init === true) return;
            var amt = (data && (data.amount ?? data.salary ?? data.value)) ?? 0;
            total += Number(amt) || 0;
        });
        return total;
    } catch (err) {
        console.warn("getTotalIncome error:", err);
        return 0;
    }
}

function isRecurringBill(exp) {
    return exp && exp.type === "bill" && exp.billSchedule === "recurring";
}

async function getTotalExpenses() {
    if (db && typeof db.collection === "function") {
        try {
            const snapshot = await db.collection("expenses").get();
            let total = 0;
            snapshot.forEach(function(doc) {
                const data = doc.data();
                if (data.type === "bill" && data.billSchedule === "recurring") return; // Exclude recurring; they're in Recurring bills section
                total += Number(data.amount) || 0;
            });
            return total;
        } catch (err) {
            console.warn("getTotalExpenses error:", err);
        }
    }
    // Fallback: use global expenses, excluding recurring bills
    var sum = 0;
    if (Array.isArray(expenses)) {
        for (var i = 0; i < expenses.length; i++) {
            var e = expenses[i];
            if (isRecurringBill(e)) continue;
            if (e && typeof e.amount === "number" && !isNaN(e.amount)) sum += e.amount;
        }
    }
    return sum;
}

/** Returns total expenses for the current calendar month from Firestore (excludes recurring bills). Amounts in same month as now (local time). */
async function getTotalExpensesThisMonth() {
    if (!db || typeof db.collection !== "function") return 0;
    try {
        var now = new Date();
        var year = now.getFullYear();
        var month = now.getMonth();
        var monthStart = new Date(year, month, 1).getTime();
        var monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
        var snapshot = await db.collection("expenses").get();
        var total = 0;
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data.type === "bill" && data.billSchedule === "recurring") return;
            var dateVal = data.date;
            var ts = 0;
            if (dateVal && typeof dateVal.toDate === "function") {
                try { ts = dateVal.toDate().getTime(); } catch (e) { return; }
            } else if (dateVal) return;
            if (ts < monthStart || ts > monthEnd) return;
            total += Number(data.amount) || 0;
        });
        return Math.round(total * 100) / 100;
    } catch (err) {
        console.warn("getTotalExpensesThisMonth error:", err);
        return 0;
    }
}

async function updateTotalExpenses() {
    if (!db || typeof db.collection !== "function") return;
    try {
        const snapshot = await db.collection("income").get();
        let total = 0;
        snapshot.forEach(function(doc) {
            const data = doc.data();
            if (data && data.init === true) return;
            var amt = (data && (data.amount ?? data.salary ?? data.value)) ?? 0;
            total += Number(amt) || 0;
        });
    } catch (err) {
        console.warn("updateTotalExpenses error:", err);
    }
}

async function loadSummary() {
    var income = 0;
    var expensesTotal = 0;
    try {
        income = await getTotalIncome();
        expensesTotal = await getTotalExpenses();
    } catch (err) {
        console.warn("loadSummary getTotals:", err);
        // Use global expenses so Overview still shows something
        if (Array.isArray(expenses)) {
            for (var i = 0; i < expenses.length; i++) {
                var e = expenses[i];
                if (e && typeof e.amount === "number" && !isNaN(e.amount)) expensesTotal += e.amount;
            }
        }
    }
    var netBalance = income - expensesTotal;
    var totalIncomeEl = document.getElementById("totalIncome");
    var totalExpensesEl = document.getElementById("totalExpenses");
    var netBalanceEl = document.getElementById("netBalance");
    var sym = getCurrencySymbol();
    if (totalIncomeEl) totalIncomeEl.textContent = income.toFixed(2);
    if (totalExpensesEl) totalExpensesEl.textContent = expensesTotal.toFixed(2);
    if (netBalanceEl) netBalanceEl.textContent = netBalance.toFixed(2);
    var summaryBalanceEl = document.getElementById("summaryCardTotalBalance");
    var summaryIncomeEl = document.getElementById("summaryCardMonthlyIncome");
    var summaryExpensesEl = document.getElementById("summaryCardMonthlyExpenses");
    setSummaryValueWithAnimation(summaryBalanceEl, sym + netBalance.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setSummaryValueWithAnimation(summaryIncomeEl, sym + income.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setSummaryValueWithAnimation(summaryExpensesEl, sym + expensesTotal.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    await updateNetWorthDisplay();
    updateDashboard().catch(function(e) { console.warn("loadSummary updateDashboard:", e); });
}

/** Recalculates total mortgage balance and portfolio value, then updates Net Worth in Overview (#netWorth) and dashboard card (#netWorthCardValue). Uses Cash = 0. Call after mortgages or portfolio change. */
async function updateNetWorthDisplay() {
    var cash = 0;
    var portfolioValue = 0;
    var totalMortgageDebt = 0;
    try {
        portfolioValue = await getPortfolioValue();
        var mortgageResult = await getTotalMortgageBalance();
        totalMortgageDebt = mortgageResult.totalMortgageDebt || 0;
    } catch (e) {
        console.warn("updateNetWorthDisplay:", e);
    }
    var netWorth = (cash + portfolioValue) - totalMortgageDebt;
    var netWorthEl = document.getElementById("netWorth");
    if (netWorthEl) netWorthEl.textContent = netWorth.toFixed(2);
    var netWorthCardEl = document.getElementById("netWorthCardValue");
    var sym = getCurrencySymbol();
    if (netWorthCardEl) netWorthCardEl.textContent = sym + netWorth.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var portfolioCardEl = document.getElementById("summaryCardPortfolioValue");
    setSummaryValueWithAnimation(portfolioCardEl, sym + portfolioValue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

/** Sets element text and triggers a short value-updated animation (CSS class). */
function setSummaryValueWithAnimation(el, text) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("value-updated");
    el.offsetHeight;
    el.classList.add("value-updated");
    setTimeout(function() { el.classList.remove("value-updated"); }, 450);
}

/**
 * Returns the sum of all recurring bills from Firestore (for daily bills calculation).
 */
async function getRecurringBillsTotal() {
    if (!db || typeof db.collection !== "function") return 0;
    try {
        var snapshot = await db.collection("recurring_bills").get();
        var total = 0;
        var seenExpenseIds = Object.create(null);
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var expenseId = data && data.expenseId;
            if (expenseId && seenExpenseIds[expenseId]) return;
            if (expenseId) seenExpenseIds[expenseId] = true;
            var amt = Number(data && data.amount);
            if (!isNaN(amt)) total += amt;
        });
        return total;
    } catch (err) {
        console.warn("getRecurringBillsTotal error:", err);
        return 0;
    }
}

/**
 * Returns recurring bills that are due in 2 days (where today's day of month === dueDayOfMonth - 2).
 * Each bill needs dueDayOfMonth >= 3 so reminder day is in current month. Legacy bills without dueDayOfMonth are treated as 1.
 * @returns {Promise<{ bills: Array<{ name: string, amount: number }>, total: number }>}
 */
async function getRecurringBillsDueInTwoDays() {
    if (!db || typeof db.collection !== "function") return { bills: [], total: 0 };
    var dayOfMonth = new Date().getDate();
    var dueDayTarget = dayOfMonth + 2; // bills due in 2 days have dueDayOfMonth === today + 2
    if (dueDayTarget > 31) return { bills: [], total: 0 };
    try {
        var snapshot = await db.collection("recurring_bills").get();
        var bills = [];
        var total = 0;
        var seenExpenseIds = Object.create(null);
        snapshot.forEach(function(doc) {
            var data = doc.data();
            if (data && data.init === true) return;
            var expenseId = data && data.expenseId;
            if (expenseId && seenExpenseIds[expenseId]) return;
            var dueDay = typeof data.dueDayOfMonth === "number" && data.dueDayOfMonth >= 1 && data.dueDayOfMonth <= 31
                ? data.dueDayOfMonth
                : 1;
            if (dueDay < 3) return; // reminder day would be last month
            if (dueDay !== dueDayTarget) return;
            if (expenseId) seenExpenseIds[expenseId] = true;
            var amt = Number(data && data.amount);
            if (isNaN(amt)) amt = 0;
            var name = (data && (data.name || data.note || data.label)) || "Bill";
            bills.push({ name: name, amount: amt });
            total += amt;
        });
        total = Math.round(total * 100) / 100;
        return { bills: bills, total: total };
    } catch (err) {
        console.warn("getRecurringBillsDueInTwoDays error:", err);
        return { bills: [], total: 0 };
    }
}

// ============================================================================
// SMART FINANCIAL NOTIFICATIONS (Firestore collection: notifications)
// Schema: userId, type, message, read (boolean, default false), createdAt (serverTimestamp)
// ============================================================================

/**
 * Adds a notification document to Firestore. Does not throw; logs on failure.
 * @param {string} userId - User identifier (e.g. NOTIFICATIONS_USER_ID)
 * @param {string} type - One of: 'overspend', 'bill_due', 'income_milestone', 'savings_tip'
 * @param {string} message - Human-readable message
 */
async function createNotification(userId, type, message) {
    if (!db || typeof db.collection !== "function") return;
    if (!userId || !type || !message) return;
    try {
        await db.collection("notifications").add({
            userId: String(userId),
            type: String(type),
            message: String(message),
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.warn("createNotification error:", err);
    }
}

/**
 * Returns true if a notification with the given type (and optional message prefix) exists for userId since the given timestamp.
 * Used to avoid duplicate notifications.
 */
async function hasRecentNotification(userId, type, sinceMs) {
    if (!db || typeof db.collection !== "function") return false;
    try {
        var since = new Date(sinceMs);
        var snapshot = await db.collection("notifications")
            .where("userId", "==", String(userId))
            .where("type", "==", String(type))
            .where("createdAt", ">=", firebase.firestore.Timestamp.fromDate(since))
            .limit(1)
            .get();
        return !snapshot.empty;
    } catch (err) {
        console.warn("hasRecentNotification error:", err);
        return false;
    }
}

/**
 * Returns the user's monthly budget from users/{uid}/user_settings/hourly (monthlyBudget field). Returns 0 if not set.
 */
async function getMonthlyBudget() {
    var ref = getUserSettingsDocRef(USER_SETTINGS_HOURLY_DOC_ID);
    if (!ref) return 0;
    try {
        var doc = await ref.get();
        if (!doc.exists || !doc.data()) return 0;
        var val = Number(doc.data().monthlyBudget);
        return isNaN(val) || val < 0 ? 0 : Math.round(val * 100) / 100;
    } catch (err) {
        console.warn("getMonthlyBudget error:", err);
        return 0;
    }
}

/** Current month spending from in-memory expenses (excludes recurring bills). For notification checks. */
function getCurrentMonthSpendingFromLocal() {
    var now = new Date();
    var monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    var sum = 0;
    if (!Array.isArray(expenses)) return 0;
    for (var i = 0; i < expenses.length; i++) {
        var e = expenses[i];
        if (!e || isRecurringBill(e)) continue;
        var dateStr = e.date && typeof e.date === "string" ? e.date.slice(0, 7) : "";
        if (dateStr !== monthStr) continue;
        var amt = typeof e.amount === "number" && !isNaN(e.amount) ? e.amount : 0;
        sum += amt;
    }
    return Math.round(sum * 100) / 100;
}

/**
 * Runs automated financial notification checks. Call when data changes (expense add/edit/delete, work session complete).
 * @param {Object} [opts] - Optional: { fromSessionComplete: true } to also run income_milestone check
 */
async function runNotificationChecks(opts) {
    if (!db || typeof db.collection !== "function") return;
    var uid = NOTIFICATIONS_USER_ID;
    var now = new Date();
    var dayOfMonth = now.getDate();
    var twentyFourHoursAgo = now.getTime() - 24 * 60 * 60 * 1000;
    var sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    var sym = getCurrencySymbol();

    // --- overspend: spending + recurring bills > income this month ---
    if (appPreferences.notifyOverspend) {
        try {
            var income = await getTotalEarningsThisMonth();
            var spending = getCurrentMonthSpendingFromLocal();
            var bills = await getRecurringBillsTotal();
            var totalOut = spending + bills;
            if (income > 0 && totalOut > income) {
                var hadRecent = await hasRecentNotification(uid, "overspend", twentyFourHoursAgo);
                if (!hadRecent) {
                    await createNotification(uid, "overspend",
                        "This month you've spent " + sym + totalOut.toFixed(2) + " (bills " + sym + bills.toFixed(2) + ") but earned " + sym + income.toFixed(2) + ". Consider trimming non-essential spending.");
                }
            }
        } catch (e) {
            console.warn("runNotificationChecks overspend:", e);
        }
    }

    // --- Budget alerts: 80% and 100% of user-defined monthly budget ---
    if (appPreferences.notifyOverspend) {
        try {
            var budget = await getMonthlyBudget();
            if (budget > 0) {
            var spendingForBudget = getCurrentMonthSpendingFromLocal();
            var billsForBudget = await getRecurringBillsTotal();
            var totalExpenses = spendingForBudget + billsForBudget;
            if (totalExpenses >= budget) {
                var hadExceeded = await hasRecentNotification(uid, "budget_exceeded", twentyFourHoursAgo);
                if (!hadExceeded) {
                    await createNotification(uid, "budget_exceeded", "You've exceeded your monthly budget.");
                }
            } else if (totalExpenses >= 0.8 * budget) {
                var hadEighty = await hasRecentNotification(uid, "budget_80", twentyFourHoursAgo);
                if (!hadEighty) {
                    await createNotification(uid, "budget_80", "You've reached 80% of your monthly budget.");
                }
            }
        }
        } catch (e) {
            console.warn("runNotificationChecks budget:", e);
        }
    }

    // --- bill_reminder: 2 days before each recurring bill's due date ---
    if (appPreferences.notifyBillReminder) {
        try {
        var billsDueInTwo = await getRecurringBillsDueInTwoDays();
        if (billsDueInTwo.bills.length > 0) {
            var hadBillReminder = await hasRecentNotification(uid, "bill_reminder", twentyFourHoursAgo);
            if (!hadBillReminder) {
                var msg = billsDueInTwo.bills.length === 1
                    ? billsDueInTwo.bills[0].name + " (£" + billsDueInTwo.bills[0].amount.toFixed(2) + ") is due in 2 days."
                    : billsDueInTwo.bills.length + " bill(s) due in 2 days: £" + billsDueInTwo.total.toFixed(2) + " total.";
                await createNotification(uid, "bill_reminder", msg);
            }
        }
        } catch (e) {
            console.warn("runNotificationChecks bill_reminder:", e);
        }
    }

    // --- income_milestone: only when a work session was just completed ---
    if (appPreferences.notifyIncomeMilestone && opts && opts.fromSessionComplete) {
        try {
            var earningsNow = await getTotalEarningsThisMonth();
            var milestones = [500, 1000, 2500, 5000, 10000];
            var highestReached = 0;
            for (var m = 0; m < milestones.length; m++) {
                if (earningsNow >= milestones[m]) highestReached = milestones[m];
            }
            if (highestReached > 0) {
                var hadRecentMilestone = await hasRecentNotification(uid, "income_milestone", twentyFourHoursAgo);
                if (!hadRecentMilestone) {
                    await createNotification(uid, "income_milestone",
                        "You've hit £" + highestReached.toLocaleString() + " earnings this month. Well done!");
                }
            }
            // Weekly earnings exceed last week's by 15%
            var thisWeekEarnings = await getEarningsForCalendarWeek(now);
            var lastWeekDate = new Date(now);
            lastWeekDate.setDate(lastWeekDate.getDate() - 7);
            var lastWeekEarnings = await getEarningsForCalendarWeek(lastWeekDate);
            if (lastWeekEarnings > 0 && thisWeekEarnings >= lastWeekEarnings * 1.15) {
                var hadWeekly15 = await hasRecentNotification(uid, "weekly_earnings_15", twentyFourHoursAgo);
                if (!hadWeekly15) {
                    await createNotification(uid, "weekly_earnings_15",
                        "Weekly earnings are 15% above last week! (£" + thisWeekEarnings.toFixed(2) + " vs £" + lastWeekEarnings.toFixed(2) + ")");
                }
            }
            // Monthly earnings reach a new personal high
            var maxPast = await getMaxEarningsPastMonths();
            if (earningsNow > 0 && earningsNow > maxPast) {
                var hadMonthlyHigh = await hasRecentNotification(uid, "monthly_high", twentyFourHoursAgo);
                if (!hadMonthlyHigh) {
                    await createNotification(uid, "monthly_high",
                        "New personal best: monthly earnings! (£" + earningsNow.toFixed(2) + " this month.)");
                }
            }
        } catch (e) {
            console.warn("runNotificationChecks income_milestone:", e);
        }
    }

    // --- savings_suggestion: income higher than usual this month — suggest saving 10–15% ---
    if (appPreferences.notifySavingsSuggestion) {
        try {
        var incomeThisMonth = await getTotalEarningsThisMonth();
        var avgPast = await getAverageMonthlyEarningsPastMonths();
        if (avgPast > 0 && incomeThisMonth > avgPast) {
            var hadSavingsSuggestion = await hasRecentNotification(uid, "savings_suggestion", sevenDaysAgo);
            if (!hadSavingsSuggestion) {
                await createNotification(uid, "savings_suggestion",
                    "You earned more than usual — consider saving 10–15%.");
            }
        }
        } catch (e) {
            console.warn("runNotificationChecks savings_suggestion:", e);
        }
    }

    // --- savings_tip: generic tip if user has saving goals, max once per 7 days ---
    if (appPreferences.notifySavingsSuggestion) {
        try {
        var hadTip = await hasRecentNotification(uid, "savings_tip", sevenDaysAgo);
        if (hadTip) return;
        var hasGoals = false;
        var snap = await db.collection("saving_goals").limit(1).get();
        snap.forEach(function() { hasGoals = true; });
        if (hasGoals) {
            await createNotification(uid, "savings_tip",
                "You have saving goals set. Consider transferring a small amount today to stay on track.");
        }
    } catch (e) {
        console.warn("runNotificationChecks savings_tip:", e);
    }
    }
}

async function loadRecurringBills() {
    var totalEl = document.getElementById("recurringBillsTotal");
    var listEl = document.getElementById("recurringBillsList");
    if (!totalEl) return;
    var total = 0;
    var items = [];
    var seenExpenseIds = Object.create(null); // Dedupe by expenseId so same bill never shows twice
    if (db && typeof db.collection === "function") {
        try {
            var snapshot = await db.collection("recurring_bills").get();
            snapshot.forEach(function(doc) {
                var data = doc.data();
                if (data && data.init === true) return;
                var expenseId = data && data.expenseId;
                if (expenseId && seenExpenseIds[expenseId]) return; // Skip duplicate (same expense linked twice)
                if (expenseId) seenExpenseIds[expenseId] = true;
                var amt = Number(data && data.amount);
                if (isNaN(amt)) amt = 0;
                total += amt;
                var label = (data && (data.name || data.label || data.note)) || "Bill";
                items.push({ label: label, amount: amt });
            });
        } catch (err) {
            console.warn("loadRecurringBills error:", err);
        }
    }
    totalEl.textContent = total.toFixed(2);
    if (listEl) {
        listEl.innerHTML = "";
        items.forEach(function(item) {
            var li = document.createElement("li");
            li.textContent = item.label + " — £" + item.amount.toFixed(2);
            listEl.appendChild(li);
        });
    }
}

/**
 * Returns monthly savings capacity based on: monthly income (hourly tracker), total monthly expenses, monthly bills, and user-defined savings rate (%).
 * capacity = min(income * (savingsRate/100), discretionary) where discretionary = income - expenses - bills; capacity is 0 if discretionary <= 0.
 * @returns {Promise<{ capacity: number, income: number, expenses: number, bills: number, savingsRate: number, discretionary: number }>}
 */
async function getMonthlySavingsCapacity() {
    var income = 0;
    var expenses = 0;
    var bills = 0;
    var savingsRate = (typeof currentSavingsPercent === "number" && !isNaN(currentSavingsPercent)) ? currentSavingsPercent : 0;
    try {
        income = await getTotalEarningsThisMonth();
        expenses = await getTotalExpensesThisMonth();
        bills = await getRecurringBillsTotal();
    } catch (e) {
        console.warn("getMonthlySavingsCapacity:", e);
    }
    var discretionary = Math.round((income - expenses - bills) * 100) / 100;
    var fromRate = income * (savingsRate / 100);
    var capacity = discretionary <= 0 ? 0 : (fromRate <= discretionary ? Math.round(fromRate * 100) / 100 : Math.round(discretionary * 100) / 100);
    return { capacity: capacity, income: income, expenses: expenses, bills: bills, savingsRate: savingsRate, discretionary: discretionary };
}

/**
 * SAVING GOALS — Firestore collection "saving_goals"
 * Schema (compatible with Firestore compat and modular v9): goalName, targetAmount, totalSaved, deadline (optional),
 * priority, monthlySuggestedContribution (optional). Uses standard JS types and Timestamp; no compat-only APIs.
 *
 * Calculated per goal:
 *   percentCompleted = (totalSaved / targetAmount) * 100  (capped at 100)
 *   estimatedTimeToGoal (months) = remainingAmount / monthlySuggestedContribution  (remainingAmount = targetAmount - totalSaved)
 */
/**
 * Normalizes a saving_goals document (legacy or new schema) into a goal object with all required fields.
 * Computes percentCompleted and estimatedTimeToGoal; uses stored monthlySuggestedContribution or derives from deadline.
 * @param {string} id - Document ID
 * @param {Object} data - Document data
 * @returns {Object} { id, goalName, targetAmount, deadline, priority, monthlySuggestedContribution, totalSaved, percentCompleted, estimatedTimeToGoal }
 */
function normalizeSavingGoal(id, data) {
    if (!data || data.init === true) return null;
    var goalName = (data.goalName != null && String(data.goalName).trim()) ? String(data.goalName).trim() : (data.name || data.label || data.title || data.note) || "Goal";
    var targetAmount = Number(data.targetAmount ?? data.target ?? data.goalAmount);
    var totalSaved = Number(data.totalSaved ?? data.current ?? data.currentAmount ?? data.saved);
    if (isNaN(targetAmount)) targetAmount = 0;
    if (isNaN(totalSaved)) totalSaved = 0;
    var deadline = data.deadline || null;
    if (deadline && deadline.toDate) try { deadline = deadline.toDate(); } catch (e) { deadline = null; }
    if (deadline && typeof deadline === "string" && deadline.length >= 10) deadline = new Date(deadline + "T12:00:00");
    var priority = (data.priority === "High" || data.priority === "Medium" || data.priority === "Low") ? data.priority : "Medium";
    var monthlySuggestedContribution = Number(data.monthlySuggestedContribution);
    if (isNaN(monthlySuggestedContribution) || monthlySuggestedContribution < 0) monthlySuggestedContribution = 0;
    if (monthlySuggestedContribution === 0 && deadline && targetAmount > totalSaved) {
        var now = new Date();
        var end = deadline instanceof Date ? deadline : new Date(deadline);
        var monthsRemaining = Math.max(0.5, (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()) + (end.getDate() - now.getDate()) / 30);
        monthlySuggestedContribution = Math.round(((targetAmount - totalSaved) / monthsRemaining) * 100) / 100;
    }
    // percentCompleted = totalSaved / targetAmount * 100 (capped at 100 for display)
    var percentCompleted = targetAmount > 0 ? Math.min(100, (totalSaved / targetAmount) * 100) : 0;
    percentCompleted = Math.round(percentCompleted * 100) / 100;
    var remaining = Math.max(0, targetAmount - totalSaved);
    // estimatedTimeToGoal (months) = remainingAmount / monthlySuggestedContribution; then formatted for display
    var estimatedTimeToGoal = "";
    if (remaining <= 0) {
        estimatedTimeToGoal = "Reached";
    } else if (monthlySuggestedContribution > 0) {
        var monthsToGoal = remaining / monthlySuggestedContribution; // remainingAmount / monthlySuggestedContribution
        if (monthsToGoal >= 12) {
            var years = Math.floor(monthsToGoal / 12);
            var months = Math.round(monthsToGoal % 12);
            estimatedTimeToGoal = years + " yr" + (years !== 1 ? "s" : "") + (months > 0 ? " " + months + " mo" : "");
        } else {
            estimatedTimeToGoal = Math.round(monthsToGoal * 10) / 10 + " months";
        }
    } else if (deadline && deadline instanceof Date) {
        estimatedTimeToGoal = "By " + deadline.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    } else {
        estimatedTimeToGoal = "—";
    }
    return {
        id: id,
        goalName: goalName,
        targetAmount: targetAmount,
        deadline: deadline,
        priority: priority,
        monthlySuggestedContribution: monthlySuggestedContribution,
        totalSaved: totalSaved,
        percentCompleted: percentCompleted,
        estimatedTimeToGoal: estimatedTimeToGoal
    };
}

/** Builds a labeled row for the saving goal dashboard: "Label: value". Optional third arg: extra class for row (e.g. "saving-goal-row--pct"). */
function makeDashboardRow(label, value, rowClass) {
    var row = document.createElement("div");
    row.className = "saving-goal-row" + (rowClass ? " " + rowClass : "");
    var labelSpan = document.createElement("span");
    labelSpan.className = "saving-goal-row-label";
    labelSpan.textContent = label + ": ";
    var valueSpan = document.createElement("span");
    valueSpan.className = "saving-goal-row-value";
    valueSpan.textContent = value;
    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    return row;
}

/** estimatedTimeToGoal (in months) = remainingAmount / monthlySuggestedContribution; returns formatted string for display. */
function formatEstimatedTimeToGoal(remaining, monthlySuggestedContribution) {
    if (remaining <= 0) return "Reached";
    if (!monthlySuggestedContribution || monthlySuggestedContribution <= 0) return "—";
    var monthsToGoal = remaining / monthlySuggestedContribution; // remainingAmount / monthlySuggestedContribution
    if (monthsToGoal >= 12) {
        var years = Math.floor(monthsToGoal / 12);
        var months = Math.round(monthsToGoal % 12);
        return years + " yr" + (years !== 1 ? "s" : "") + (months > 0 ? " " + months + " mo" : "");
    }
    return Math.round(monthsToGoal * 10) / 10 + " months";
}

async function loadSavingGoals() {
    var listEl = document.getElementById("savingGoalsList");
    if (!listEl) return;
    var goals = [];
    if (db && typeof db.collection === "function") {
        try {
            var snapshot = await db.collection("saving_goals").get();
            snapshot.forEach(function(doc) {
                var g = normalizeSavingGoal(doc.id, doc.data());
                if (g) goals.push(g);
            });
        } catch (err) {
            console.warn("loadSavingGoals error:", err);
        }
    }
    // Auto-calculate monthlySuggestedContribution for goals that don't have one, using income, expenses, bills, savings rate
    try {
        var cap = await getMonthlySavingsCapacity();
        var n = goals.length;
        if (n > 0 && cap.capacity > 0) {
            var share = Math.round((cap.capacity / n) * 100) / 100;
            for (var i = 0; i < goals.length; i++) {
                if (goals[i].monthlySuggestedContribution === 0) {
                    goals[i].monthlySuggestedContribution = share;
                    var remaining = Math.max(0, goals[i].targetAmount - goals[i].totalSaved);
                    goals[i].estimatedTimeToGoal = formatEstimatedTimeToGoal(remaining, goals[i].monthlySuggestedContribution);
                }
            }
        }
    } catch (e) {
        console.warn("loadSavingGoals auto-suggest:", e);
    }
    listEl.innerHTML = "";
    goals.forEach(function(g) {
        var li = document.createElement("li");
        li.className = "saving-goal-item saving-goal-card";
        li.setAttribute("data-goal-id", g.id);
        var topLine = document.createElement("div");
        topLine.className = "saving-goal-top";
        var labelEl = document.createElement("span");
        labelEl.className = "saving-goal-label";
        labelEl.textContent = g.goalName;
        var prioritySpan = document.createElement("span");
        prioritySpan.className = "saving-goal-priority saving-goal-priority--" + g.priority.toLowerCase();
        prioritySpan.textContent = g.priority;
        topLine.appendChild(labelEl);
        topLine.appendChild(prioritySpan);
        li.appendChild(topLine);
        var grid = document.createElement("div");
        grid.className = "saving-goal-dashboard";
        grid.appendChild(makeDashboardRow("Target", "£" + g.targetAmount.toFixed(2)));
        grid.appendChild(makeDashboardRow("Total saved", "£" + g.totalSaved.toFixed(2)));
        grid.appendChild(makeDashboardRow("% completed", g.percentCompleted.toFixed(1) + "%", "saving-goal-row--pct"));
        var barWrap = document.createElement("div");
        barWrap.className = "saving-goal-bar-wrap";
        var bar = document.createElement("div");
        bar.className = "saving-goal-bar";
        bar.style.width = Math.min(100, g.percentCompleted) + "%";
        var pct = document.createElement("span");
        pct.className = "saving-goal-pct";
        pct.textContent = g.percentCompleted.toFixed(0) + "%";
        barWrap.appendChild(bar);
        barWrap.appendChild(pct);
        grid.appendChild(barWrap);
        grid.appendChild(makeDashboardRow("Suggested contribution", g.monthlySuggestedContribution > 0 ? "£" + g.monthlySuggestedContribution.toFixed(2) + "/mo" : "—"));
        grid.appendChild(makeDashboardRow("Estimated time remaining", g.estimatedTimeToGoal || "—"));
        li.appendChild(grid);
        var actions = document.createElement("div");
        actions.className = "saving-goal-actions";
        var addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "saving-goal-btn saving-goal-add-btn";
        addBtn.textContent = "Add to saved";
        addBtn.setAttribute("data-goal-id", g.id);
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "saving-goal-btn saving-goal-edit-btn";
        editBtn.textContent = "Edit";
        editBtn.setAttribute("data-goal-id", g.id);
        actions.appendChild(addBtn);
        actions.appendChild(editBtn);
        li.appendChild(actions);
        listEl.appendChild(li);
    });
    if (typeof setupSavingGoalsListeners === "function") setupSavingGoalsListeners();
}

/**
 * Adds a new saving goal to Firestore. Fields: goalName, targetAmount, totalSaved (default 0), deadline (optional), priority, monthlySuggestedContribution (optional).
 */
async function addSavingGoal(payload) {
    if (!db || typeof db.collection !== "function") return null;
    try {
        var data = {
            goalName: String(payload.goalName || "Goal").trim() || "Goal",
            targetAmount: Math.round(Number(payload.targetAmount) * 100) / 100 || 0,
            totalSaved: Math.round(Number(payload.totalSaved) * 100) / 100 || 0,
            priority: (payload.priority === "High" || payload.priority === "Low") ? payload.priority : "Medium"
        };
        if (payload.deadline && String(payload.deadline).trim()) data.deadline = String(payload.deadline).trim().slice(0, 10);
        if (payload.monthlySuggestedContribution != null && !isNaN(Number(payload.monthlySuggestedContribution)) && Number(payload.monthlySuggestedContribution) > 0)
            data.monthlySuggestedContribution = Math.round(Number(payload.monthlySuggestedContribution) * 100) / 100;
        var ref = await db.collection("saving_goals").add(data);
        await loadSavingGoals();
        return ref.id;
    } catch (err) {
        console.warn("addSavingGoal error:", err);
        return null;
    }
}

/**
 * Updates an existing saving goal. Partial updates supported.
 */
async function updateSavingGoal(docId, payload) {
    if (!docId || !db || typeof db.collection !== "function") return false;
    try {
        var data = {};
        if (payload.goalName != null) data.goalName = String(payload.goalName).trim() || "Goal";
        if (payload.targetAmount != null) data.targetAmount = Math.round(Number(payload.targetAmount) * 100) / 100;
        if (payload.totalSaved != null) data.totalSaved = Math.round(Number(payload.totalSaved) * 100) / 100;
        if (payload.priority != null && (payload.priority === "High" || payload.priority === "Medium" || payload.priority === "Low")) data.priority = payload.priority;
        if (payload.deadline !== undefined) data.deadline = payload.deadline && String(payload.deadline).trim() ? String(payload.deadline).trim().slice(0, 10) : null;
        if (payload.monthlySuggestedContribution !== undefined) data.monthlySuggestedContribution = Math.round(Number(payload.monthlySuggestedContribution) * 100) / 100;
        if (Object.keys(data).length === 0) return true;
        await db.collection("saving_goals").doc(docId).update(data);
        await loadSavingGoals();
        return true;
    } catch (err) {
        console.warn("updateSavingGoal error:", err);
        return false;
    }
}

/**
 * Sets up click listeners for saving goal buttons (Add to saved, Edit) and Add goal button. Call after loadSavingGoals renders.
 */
function setupSavingGoalsListeners() {
    document.querySelectorAll(".saving-goal-add-btn").forEach(function(btn) {
        btn.onclick = function() {
            var id = btn.getAttribute("data-goal-id");
            if (id) openAddToSavedModal(id);
        };
    });
    document.querySelectorAll(".saving-goal-edit-btn").forEach(function(btn) {
        btn.onclick = function() {
            var id = btn.getAttribute("data-goal-id");
            if (id) openSavingGoalEditModal(id);
        };
    });
    var addGoalBtn = document.getElementById("addSavingGoalBtn");
    if (addGoalBtn && !addGoalBtn._savingGoalsBound) {
        addGoalBtn._savingGoalsBound = true;
        addGoalBtn.addEventListener("click", openSavingGoalAddModal);
    }
}

function openSavingGoalAddModal() {
    var modal = document.getElementById("savingGoalModal");
    var form = document.getElementById("savingGoalForm");
    if (!modal || !form) return;
    form.reset();
    document.getElementById("savingGoalModalTitle").textContent = "Add saving goal";
    document.getElementById("savingGoalSubmitBtn").textContent = "Add goal";
    form.dataset.goalId = "";
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
}

async function openSavingGoalEditModal(docId) {
    var modal = document.getElementById("savingGoalModal");
    var form = document.getElementById("savingGoalForm");
    if (!modal || !form || !db || !docId) return;
    try {
        var doc = await db.collection("saving_goals").doc(docId).get();
        if (!doc.exists) return;
        var d = doc.data();
        var g = normalizeSavingGoal(docId, d);
        if (!g) return;
        document.getElementById("savingGoalModalTitle").textContent = "Edit saving goal";
        document.getElementById("savingGoalSubmitBtn").textContent = "Save";
        document.getElementById("savingGoalName").value = g.goalName;
        document.getElementById("savingGoalTargetAmount").value = g.targetAmount > 0 ? g.targetAmount.toFixed(2) : "";
        document.getElementById("savingGoalTotalSaved").value = g.totalSaved > 0 ? g.totalSaved.toFixed(2) : "";
        document.getElementById("savingGoalPriority").value = g.priority;
        document.getElementById("savingGoalDeadline").value = g.deadline && g.deadline instanceof Date ? g.deadline.toISOString().slice(0, 10) : (g.deadline || "");
        document.getElementById("savingGoalMonthlySuggested").value = g.monthlySuggestedContribution > 0 ? g.monthlySuggestedContribution.toFixed(2) : "";
        form.dataset.goalId = docId;
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
    } catch (e) {
        console.warn("openSavingGoalEditModal:", e);
    }
}

function closeSavingGoalModal() {
    var modal = document.getElementById("savingGoalModal");
    if (modal) {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
    }
}

async function handleSavingGoalFormSubmit(ev) {
    ev.preventDefault();
    var form = document.getElementById("savingGoalForm");
    var id = form && form.dataset && form.dataset.goalId;
    var name = (document.getElementById("savingGoalName") && document.getElementById("savingGoalName").value) || "";
    var target = parseFloat(document.getElementById("savingGoalTargetAmount") && document.getElementById("savingGoalTargetAmount").value);
    var saved = parseFloat(document.getElementById("savingGoalTotalSaved") && document.getElementById("savingGoalTotalSaved").value);
    var priority = document.getElementById("savingGoalPriority") && document.getElementById("savingGoalPriority").value;
    var deadlineEl = document.getElementById("savingGoalDeadline");
    var deadline = deadlineEl && deadlineEl.value ? deadlineEl.value.trim().slice(0, 10) : "";
    var monthlyEl = document.getElementById("savingGoalMonthlySuggested");
    var monthly = monthlyEl && monthlyEl.value ? parseFloat(monthlyEl.value) : 0;
    if (!name.trim()) { alert("Please enter a goal name."); return; }
    if (isNaN(target) || target <= 0) { alert("Please enter a valid target amount."); return; }
    if (id) {
        await updateSavingGoal(id, { goalName: name.trim(), targetAmount: target, totalSaved: isNaN(saved) ? 0 : saved, priority: priority || "Medium", deadline: deadline || null, monthlySuggestedContribution: isNaN(monthly) ? 0 : monthly });
    } else {
        await addSavingGoal({ goalName: name.trim(), targetAmount: target, totalSaved: isNaN(saved) ? 0 : saved, priority: priority || "Medium", deadline: deadline || null, monthlySuggestedContribution: isNaN(monthly) ? 0 : monthly });
    }
    closeSavingGoalModal();
}

function openAddToSavedModal(docId) {
    var amount = prompt("Amount to add to this goal (£):", "0");
    if (amount === null) return;
    var num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;
    if (!db || typeof db.collection !== "function") return;
    db.collection("saving_goals").doc(docId).get().then(function(doc) {
        if (!doc.exists) return;
        var d = doc.data();
        var current = Number(d.totalSaved ?? d.current ?? d.currentAmount ?? d.saved) || 0;
        return updateSavingGoal(docId, { totalSaved: Math.round((current + num) * 100) / 100 });
    }).catch(function(e) { console.warn("openAddToSavedModal:", e); });
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
        if (!expense || typeof expense !== 'object' || !expense.date) return;
        const key = getMonthKey(expense.date);
        if (!grouped[key]) grouped[key] = [];
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
    
    var total = 0;
    expenses.forEach(function(exp) {
        if (isRecurringBill(exp)) return;
        if (exp && typeof exp.amount === "number" && !isNaN(exp.amount)) total += exp.amount;
    });
    totalEl.textContent = "Total: £" + total.toFixed(2);
}

// ============================================================================
// DASHBOARD FUNCTIONS
// ============================================================================

/**
 * Updates the dashboard with current month's statistics.
 * "Total This Month" shows income minus expenses (net) for the month.
 */
async function updateDashboard() {
    const dashboardEmptyState = document.getElementById("dashboardEmptyState");
    const dashboardCards = document.getElementById("dashboardCards");
    const hasExpenses = Array.isArray(expenses) && expenses.length > 0;

    if (dashboardEmptyState) {
        dashboardEmptyState.classList.toggle("hidden", hasExpenses);
        dashboardEmptyState.setAttribute("aria-hidden", hasExpenses);
    }
    if (dashboardCards) {
        dashboardCards.classList.toggle("hidden", !hasExpenses);
    }

    try {
        var now = new Date();
        var currentMonthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
        // Daily bills share: ONLY type "bill" (ignore "spending")
        var monthlyBillsOnly = Array.isArray(expenses) ? expenses.filter(function(exp) {
            if (!exp || !exp.date || typeof exp.date !== "string" || !exp.date.startsWith(currentMonthStr)) return false;
            if (exp.type !== "bill") return false;
            return true;
        }) : [];
        var totalBillsForBreakdown = monthlyBillsOnly.reduce(function(sum, e) {
            if (!e || typeof e.amount !== "number" || isNaN(e.amount)) return sum;
            return sum + e.amount;
        }, 0);
        var recurringTotal = await getRecurringBillsTotal();
        var dailyBillsForBreakdown = (totalBillsForBreakdown / 30) + (recurringTotal / 30);
        var todayEarnings = 0;
        try {
            todayEarnings = await getTodayEarningsFromFirestore();
        } catch (e) {
            console.warn("updateDashboard getTodayEarningsFromFirestore:", e);
        }
        var savingsPercent = (typeof currentSavingsPercent === "number" && !isNaN(currentSavingsPercent)) ? currentSavingsPercent : 0;
        var suggestedSavingsBreakdown = Math.round(todayEarnings * (savingsPercent / 100) * 100) / 100;
        var safeToSpendBreakdown = Math.round((todayEarnings - dailyBillsForBreakdown - suggestedSavingsBreakdown) * 100) / 100;
        var breakdownEarnedEl = document.getElementById("breakdownEarnedToday");
        var breakdownDailyBillsEl = document.getElementById("breakdownDailyBills");
        var breakdownSuggestedEl = document.getElementById("breakdownSuggestedSave");
        var breakdownSafeEl = document.getElementById("breakdownSafeToSpend");
        if (breakdownEarnedEl) breakdownEarnedEl.textContent = todayEarnings.toFixed(2);
        if (breakdownDailyBillsEl) breakdownDailyBillsEl.textContent = dailyBillsForBreakdown.toFixed(2);
        if (breakdownSuggestedEl) breakdownSuggestedEl.textContent = suggestedSavingsBreakdown.toFixed(2);
        if (breakdownSafeEl) breakdownSafeEl.textContent = safeToSpendBreakdown.toFixed(2);

        var totalBillsThisMonthBreakdown = totalBillsForBreakdown + recurringTotal;
        var totalSpendingThisMonthBreakdown = Array.isArray(expenses) ? expenses.filter(function(exp) {
            return exp && exp.date && typeof exp.date === "string" && exp.date.startsWith(currentMonthStr) && exp.type === "spending";
        }).reduce(function(sum, e) {
            if (!e || typeof e.amount !== "number" || isNaN(e.amount)) return sum;
            return sum + e.amount;
        }, 0) : 0;
        var monthlyOverviewBillsEl = document.getElementById("monthlyOverviewBills");
        var monthlyOverviewSpendingEl = document.getElementById("monthlyOverviewSpending");
        if (monthlyOverviewBillsEl) monthlyOverviewBillsEl.textContent = totalBillsThisMonthBreakdown.toFixed(2);
        if (monthlyOverviewSpendingEl) monthlyOverviewSpendingEl.textContent = totalSpendingThisMonthBreakdown.toFixed(2);
    } catch (e) {
        console.warn("updateDashboard Today's Breakdown:", e);
    }

    if (!hasExpenses) {
        return;
    }

    const monthlyTotalEl = document.getElementById("MonthlyTotal");
    const topCategoryEl = document.getElementById("top-category");
    const averageExpenseEl = document.getElementById("average-expense");
    const dailyBillsEl = document.getElementById("dailyBillsValue");
    
    if (!monthlyTotalEl || !topCategoryEl || !averageExpenseEl) {
        return;
    }

    var nowForDashboard = new Date();
    var currentMonth = (typeof currentMonthStr !== "undefined") ? currentMonthStr : (nowForDashboard.getFullYear() + "-" + String(nowForDashboard.getMonth() + 1).padStart(2, "0"));

    const monthlyExpenses = expenses.filter(exp =>
        exp && exp.date && typeof exp.date === "string" && exp.date.startsWith(currentMonth) && !isRecurringBill(exp)
    );

    // Daily Bills card: only type "bill" this month + recurring (ignore spending)
    var monthlyBillsForCard = expenses.filter(function(exp) {
        return exp && exp.date && typeof exp.date === "string" && exp.date.startsWith(currentMonth) && exp.type === "bill";
    });
    var totalBillsFromExpenses = monthlyBillsForCard.reduce(function(sum, e) {
        if (!e || typeof e.amount !== "number" || isNaN(e.amount)) return sum;
        return sum + e.amount;
    }, 0);
    var recurringTotalForDashboard = await getRecurringBillsTotal();
    var totalBillsThisMonth = totalBillsFromExpenses + recurringTotalForDashboard;
    const dailyBills = totalBillsThisMonth / 30;

    const monthlyExpensesTotal = monthlyExpenses.reduce((sum, e) => {
        if (!e || typeof e.amount !== 'number' || isNaN(e.amount)) return sum;
        return sum + e.amount;
    }, 0);

    var income = 0;
    try {
        income = await getTotalIncome();
    } catch (e) {
        console.warn("updateDashboard getTotalIncome:", e);
    }
    var netThisMonth = income - monthlyExpensesTotal;
    animateValue(monthlyTotalEl, netThisMonth, "£");
    
    const biggestCategory = findTopCategory(monthlyExpenses);
    animateText(topCategoryEl, biggestCategory);
    
    const avgDailySpend = calculateAverageDailySpend(monthlyExpenses, nowForDashboard);
    animateValue(averageExpenseEl, avgDailySpend, "£");
    if (dailyBillsEl) animateValue(dailyBillsEl, dailyBills, "£");

    var budgetWrap = document.getElementById("monthlyBudgetProgressWrap");
    var budgetBar = document.getElementById("monthlyBudgetProgressBar");
    var budgetPctEl = document.getElementById("monthlyBudgetProgressPct");
    var monthlyBudget = (appPreferences && typeof appPreferences.monthlyBudget === "number") ? appPreferences.monthlyBudget : 0;
    if (budgetWrap && budgetBar && budgetPctEl) {
        if (monthlyBudget > 0) {
            var budgetUsedPct = Math.min(100, (monthlyExpensesTotal / monthlyBudget) * 100);
            budgetBar.style.width = budgetUsedPct.toFixed(1) + "%";
            budgetBar.setAttribute("aria-valuenow", Math.round(budgetUsedPct));
            budgetPctEl.textContent = budgetUsedPct.toFixed(0) + "%";
            budgetWrap.style.display = "block";
            budgetWrap.setAttribute("aria-hidden", "false");
        } else {
            budgetWrap.style.display = "none";
            budgetWrap.setAttribute("aria-hidden", "true");
        }
    }

    loadNotificationsPanel().catch(function(e) { console.warn("loadNotificationsPanel:", e); });
}

/**
 * Loads notifications from Firestore (newest first) and renders the Notifications Panel.
 */
async function loadNotificationsPanel() {
    var listEl = document.getElementById("notificationsList");
    var panelEl = document.getElementById("notificationsPanel");
    var emptyEl = document.getElementById("notificationsEmpty");
    if (!listEl || !panelEl) return;
    if (!db || typeof db.collection !== "function") {
        listEl.innerHTML = "";
        if (emptyEl) emptyEl.style.display = "block";
        panelEl.classList.remove("has-notifications");
        return;
    }
    try {
        var snapshot = await db.collection("notifications")
            .where("userId", "==", NOTIFICATIONS_USER_ID)
            .limit(100)
            .get();
        var items = [];
        snapshot.forEach(function(doc) {
            var d = doc.data();
            var createdAt = d.createdAt;
            var ts = 0;
            if (createdAt && createdAt.toDate) try { ts = createdAt.toDate().getTime(); } catch (e) {}
            else if (createdAt) ts = typeof createdAt.getTime === "function" ? createdAt.getTime() : 0;
            items.push({
                id: doc.id,
                type: d.type || "",
                message: d.message || "",
                read: d.read === true,
                createdAt: d.createdAt,
                _sortTime: ts
            });
        });
        items.sort(function(a, b) { return (b._sortTime || 0) - (a._sortTime || 0); });
        items = items.slice(0, 50);
        renderNotificationsList(listEl, panelEl, emptyEl, items);
    } catch (err) {
        console.warn("loadNotificationsPanel error:", err);
        listEl.innerHTML = "";
        if (emptyEl) emptyEl.style.display = "block";
        panelEl.classList.remove("has-notifications");
    }
}

/**
 * Renders notification items into the list and toggles empty state.
 */
function renderNotificationsList(listEl, panelEl, emptyEl, items) {
    listEl.innerHTML = "";
    if (!items || items.length === 0) {
        if (emptyEl) emptyEl.style.display = "block";
        panelEl.classList.remove("has-notifications");
        return;
    }
    if (emptyEl) emptyEl.style.display = "none";
    panelEl.classList.add("has-notifications");
    items.forEach(function(item) {
        var li = document.createElement("li");
        li.className = "notification-item" + (item.read ? "" : " unread");
        li.setAttribute("data-notification-id", item.id);
        var dateStr = "—";
        if (item.createdAt) {
            try {
                var dt = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
                dateStr = dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + " " + dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
            } catch (e) {}
        }
        var body = document.createElement("div");
        body.className = "notification-body";
        var msg = document.createElement("p");
        msg.className = "notification-message";
        msg.textContent = item.message;
        var meta = document.createElement("p");
        meta.className = "notification-meta";
        meta.textContent = (item.type ? item.type + " · " : "") + dateStr;
        body.appendChild(msg);
        body.appendChild(meta);
        var actions = document.createElement("div");
        actions.className = "notification-actions";
        if (!item.read) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "mark-read-btn";
            btn.textContent = "Mark read";
            btn.setAttribute("data-notification-id", item.id);
            btn.addEventListener("click", function(ev) {
                ev.preventDefault();
                var id = ev.currentTarget.getAttribute("data-notification-id");
                if (id) markNotificationRead(id);
            });
            actions.appendChild(btn);
        }
        li.appendChild(body);
        li.appendChild(actions);
        listEl.appendChild(li);
    });
}

/**
 * Marks a notification as read in Firestore and refreshes the list.
 * @param {string} docId - Firestore document ID
 */
async function markNotificationRead(docId) {
    if (!docId || !db || typeof db.collection !== "function") return;
    try {
        await db.collection("notifications").doc(docId).update({ read: true });
        await loadNotificationsPanel();
    } catch (err) {
        console.warn("markNotificationRead error:", err);
    }
}

/**
 * Calculates average daily spend based on days with expenses
 * @param {Array} monthlyExpenses - Array of expenses for the month
 * @param {Date} currentDate - Current date object
 * @returns {number} Average daily spend
 */
function calculateAverageDailySpend(monthlyExpenses, currentDate) {
    if (!Array.isArray(monthlyExpenses) || monthlyExpenses.length === 0) {
        return 0;
    }
    
    // Get unique days with expenses
    const daysWithExpenses = new Set();
    let totalSpent = 0;
    
    monthlyExpenses.forEach(exp => {
        if (exp && exp.date && typeof exp.date === 'string') {
            const expenseDate = new Date(exp.date);
            if (!isNaN(expenseDate.getTime())) {
                daysWithExpenses.add(expenseDate.toDateString());
            }
        }
        if (exp && typeof exp.amount === 'number' && !isNaN(exp.amount)) {
            totalSpent += exp.amount;
        }
    });
    
    const daysCount = daysWithExpenses.size;
    return daysCount > 0 ? totalSpent / daysCount : 0;
}

/**
 * Finds the category with the highest spending
 * @param {Array} monthlyExpenses - Array of expenses for the month
 * @returns {string} Category name with highest spending, or "-" if none
 */
function findTopCategory(monthlyExpenses) {
    if (!Array.isArray(monthlyExpenses) || monthlyExpenses.length === 0) {
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

/**
 * Animates a numeric value with counting effect
 * @param {HTMLElement} element - Element to animate
 * @param {number} targetValue - Target value to animate to
 * @param {string} prefix - Prefix to add (e.g., "£")
 */
function animateValue(element, targetValue, prefix = "") {
    if (!element) return;
    
    const startValue = parseFloat(element.textContent.replace(/[^0-9.-]/g, '')) || 0;
    const duration = 800;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function for smooth animation
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        const currentValue = startValue + (targetValue - startValue) * easeOutCubic;
        
        element.textContent = `${prefix}${currentValue.toFixed(2)}`;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = `${prefix}${targetValue.toFixed(2)}`;
        }
    }
    
    requestAnimationFrame(update);
}

/**
 * Animates text change with fade effect
 * @param {HTMLElement} element - Element to animate
 * @param {string} newText - New text to display
 */
function animateText(element, newText) {
    if (!element) return;
    
    // Only animate if text is changing
    if (element.textContent === newText) return;
    
    // Add transition styles
    element.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    
    // Fade out
    element.style.opacity = "0";
    element.style.transform = "translateY(-10px)";
    
    setTimeout(() => {
        element.textContent = newText;
        // Fade in
        element.style.opacity = "1";
        element.style.transform = "translateY(0)";
    }, 150);
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
    link.download = "valoro-expenses.csv";
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
    if (typeof Chart === 'undefined') {
        console.warn("[Charts] Chart.js not loaded");
        return;
    }
    const historyPage = document.getElementById("historyPage");
    const isHistoryVisible = historyPage && historyPage.classList.contains("active");
    if (!isHistoryVisible) {
        return; // Skip render when History tab not visible so canvas has no size yet
    }
    rendermonthlyChart();
    renderCategoryChart();
    renderIncomeVsExpensesChart().catch(function(e) { console.warn("renderIncomeVsExpensesChart:", e); });
}

/**
 * Renders the monthly expenses bar chart using Chart.js
 */
function rendermonthlyChart() {
    const chartElement = document.getElementById("MonthlyChart");
    if (!chartElement) {
        console.warn("[Charts] MonthlyChart canvas not found");
        return;
    }
    const section = document.getElementById("monthlyChartSection");
    const isVisible = section && section.classList.contains("chart-visible");
    if (!isVisible) {
        return;
    }
    const {labels, data} = getMonthlyTotals();
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
    
    // Create chart colors
    const colors = createChartColors();
    
    // Create and configure chart
    monthlyChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Monthly Expenses",
                data: data,
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 6,
                borderSkipped: false,
                barThickness: 'flex',
                maxBarThickness: 60
            }]
        },
        options: getChartOptions()
    });
}

/**
 * Renders a category breakdown doughnut chart using Chart.js
 */
function renderCategoryChart() {
    const chartElement = document.getElementById("ExpensesChart");
    if (!chartElement) {
        return;
    }
    const section = document.getElementById("categoryChartSection");
    const isVisible = section && section.classList.contains("chart-visible");
    if (!isVisible) {
        return;
    }

    // Use active-month expenses (or all) for category breakdown; exclude recurring bills
    const activeMonthKey = getActiveMonthKeyFromFilter();
    const monthlyExpenses = expenses.filter(exp => {
        if (!exp || !exp.date || typeof exp.date !== 'string') return false;
        if (isRecurringBill(exp)) return false;
        if (!activeMonthKey) return true;
        return exp.date.slice(0, 7) === activeMonthKey;
    });

    const categoryTotals = calculateCategoryTotals(monthlyExpenses);
    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);

    // If no data, destroy existing chart and exit
    if (labels.length === 0 || data.length === 0) {
        if (categoryChart) {
            categoryChart.destroy();
            categoryChart = null;
        }
        return;
    }

    const ctx = chartElement.getContext("2d");

    if (categoryChart) {
        categoryChart.destroy();
    }

    const colors = createChartColors();

    categoryChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: '#A6A6A6',
                        font: {
                            family: "'Inter', sans-serif",
                            size: 12
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

/**
 * Groups earnings by week for the given month (YYYY-MM). Returns labels (Week 1–4/5) and data array.
 * @param {string} month - YYYY-MM
 * @returns {Promise<{ labels: string[], data: number[] }>}
 */
async function getWeeklyIncome(month) {
    if (!month || typeof month !== "string" || month.length < 7) return { labels: [], data: [] };
    var parts = month.split("-");
    var year = parseInt(parts[0], 10);
    var monthNum = parseInt(parts[1], 10);
    if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) return { labels: [], data: [] };
    var lastDay = new Date(year, monthNum, 0).getDate();
    var numWeeks = lastDay <= 28 ? 4 : 5;
    var labels = [];
    for (var w = 1; w <= numWeeks; w++) labels.push("Week " + w);
    var data = new Array(numWeeks).fill(0);
    function weekIndex(dayOfMonth) {
        var d = parseInt(dayOfMonth, 10);
        if (isNaN(d) || d < 1) return 0;
        var idx = Math.floor((d - 1) / 7);
        return Math.min(idx, numWeeks - 1);
    }
    if (db && typeof db.collection === "function") {
        try {
            var monthStart = new Date(year, monthNum - 1, 1).getTime();
            var monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999).getTime();
            var snap = await db.collection("work_sessions").get();
            snap.forEach(function(doc) {
                var d = doc.data();
                if (d && d.init === true) return;
                var hasEnd = d.endTime != null || (d.totalMinutes != null && !isNaN(Number(d.totalMinutes)));
                if (!hasEnd) return;
                var earning = d.earningsForSession != null ? Number(d.earningsForSession) : (d.earning != null ? Number(d.earning) : NaN);
                if (isNaN(earning)) return;
                var startTime = d.startTime;
                var ts = startTime && startTime.toDate ? startTime.toDate().getTime() : 0;
                if (ts < monthStart || ts > monthEnd) return;
                var day = startTime && startTime.toDate ? startTime.toDate().getDate() : 1;
                data[weekIndex(day)] += earning;
            });
        } catch (e) {
            console.warn("getWeeklyIncome:", e);
        }
    }
    data = data.map(function(v) { return Math.round(v * 100) / 100; });
    return { labels: labels, data: data };
}

/**
 * Groups expenses by week for the given month (YYYY-MM). Uses in-memory expenses; excludes recurring bills.
 * @param {string} month - YYYY-MM
 * @returns {{ labels: string[], data: number[] }}
 */
function getWeeklyExpenses(month) {
    if (!month || typeof month !== "string" || month.length < 7) return { labels: [], data: [] };
    var parts = month.split("-");
    var year = parseInt(parts[0], 10);
    var monthNum = parseInt(parts[1], 10);
    if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) return { labels: [], data: [] };
    var lastDay = new Date(year, monthNum, 0).getDate();
    var numWeeks = lastDay <= 28 ? 4 : 5;
    var labels = [];
    for (var w = 1; w <= numWeeks; w++) labels.push("Week " + w);
    var data = new Array(numWeeks).fill(0);
    function weekIndex(dayOfMonth) {
        var d = parseInt(dayOfMonth, 10);
        if (isNaN(d) || d < 1) return 0;
        var idx = Math.floor((d - 1) / 7);
        return Math.min(idx, numWeeks - 1);
    }
    expenses.forEach(function(exp) {
        if (!exp || isRecurringBill(exp)) return;
        var amt = typeof exp.amount === "number" && !isNaN(exp.amount) ? exp.amount : 0;
        if (amt === 0) return;
        var dateStr = exp.date && typeof exp.date === "string" ? exp.date : "";
        if (!dateStr || dateStr.length < 10) return;
        if (dateStr.slice(0, 7) !== month) return;
        var day = parseInt(dateStr.slice(8, 10), 10);
        if (isNaN(day) || day < 1) return;
        data[weekIndex(day)] += amt;
    });
    data = data.map(function(v) { return Math.round(v * 100) / 100; });
    return { labels: labels, data: data };
}

/**
 * Sums expense amounts per category for the given month (YYYY-MM). Uses in-memory expenses; excludes recurring bills.
 * @param {string} month - YYYY-MM
 * @returns {{ labels: string[], data: number[], totals: Object }}
 */
function getExpensesByCategory(month) {
    if (!month || typeof month !== "string" || month.length < 7) return { labels: [], data: [], totals: {} };
    var filtered = expenses.filter(function(exp) {
        if (!exp || isRecurringBill(exp)) return false;
        var dateStr = exp.date && typeof exp.date === "string" ? exp.date : "";
        return dateStr.slice(0, 7) === month;
    });
    var totals = calculateCategoryTotals(filtered);
    var labels = Object.keys(totals);
    var data = Object.values(totals);
    return { labels: labels, data: data, totals: totals };
}

/**
 * Gets weekly totals for the current month: income (from work_sessions) and expenses (from expenses collection).
 * @returns {Promise<{ labels: string[], income: number[], expenses: number[] }>}
 */
async function getWeeklyIncomeAndExpensesForCurrentMonth() {
    var now = new Date();
    var monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    var incomeResult = await getWeeklyIncome(monthStr);
    var expensesResult = getWeeklyExpenses(monthStr);
    return { labels: incomeResult.labels, income: incomeResult.data, expenses: expensesResult.data };
}

/**
 * Renders the Income vs Expenses chart (current month by week). Y-axis in £ to match the rest of the app.
 */
async function renderIncomeVsExpensesChart() {
    if (typeof Chart === "undefined") return;
    var chartElement = document.getElementById("IncomeVsExpensesChart");
    if (!chartElement) return;
    var section = document.getElementById("incomeVsExpensesChartSection");
    if (!section || !section.classList.contains("chart-visible")) return;

    var data = await getWeeklyIncomeAndExpensesForCurrentMonth();
    var ctx = chartElement.getContext("2d");
    if (incomeVsExpensesChart) {
        incomeVsExpensesChart.destroy();
        incomeVsExpensesChart = null;
    }

    incomeVsExpensesChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.labels || [],
            datasets: [
                {
                    label: "Income (£)",
                    data: data.income,
                    backgroundColor: "rgba(76, 175, 80, 0.7)",
                    borderColor: "rgb(76, 175, 80)",
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: "flex",
                    maxBarThickness: 50
                },
                {
                    label: "Expenses (£)",
                    data: data.expenses,
                    backgroundColor: "rgba(244, 67, 54, 0.7)",
                    borderColor: "rgb(244, 67, 54)",
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: "flex",
                    maxBarThickness: 50
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: "Week of month", color: "#A6A6A6" },
                    ticks: { color: "#A6A6A6", maxRotation: 0 }
                },
                y: {
                    title: { display: true, text: "£", color: "#A6A6A6" },
                    ticks: { color: "#A6A6A6", callback: function(v) { return "£" + v; } },
                    beginAtZero: true
                }
            },
            plugins: {
                legend: { display: true, position: "top", labels: { color: "#A6A6A6" } }
            }
        }
    });
}

/**
 * Refreshes the dashboard Spending & Income Overview panel: income vs expenses bar chart and expenses-by-category doughnut.
 * Uses current month (YYYY-MM). Safe to call when Chart or canvas elements are missing.
 */
async function refreshSpendingIncomeOverviewCharts() {
    if (typeof Chart === "undefined") return;
    var barCanvas = document.getElementById("DashboardIncomeVsExpensesChart");
    var doughnutCanvas = document.getElementById("DashboardExpensesByCategoryChart");
    if (!barCanvas || !doughnutCanvas) return;
    var now = new Date();
    var monthStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    var incomeResult = await getWeeklyIncome(monthStr);
    var expensesResult = getWeeklyExpenses(monthStr);
    var categoryResult = getExpensesByCategory(monthStr);
    if (dashboardIncomeVsExpensesChart) {
        dashboardIncomeVsExpensesChart.destroy();
        dashboardIncomeVsExpensesChart = null;
    }
    var barCtx = barCanvas.getContext("2d");
    dashboardIncomeVsExpensesChart = new Chart(barCtx, {
        type: "bar",
        data: {
            labels: incomeResult.labels,
            datasets: [
                {
                    label: "Income (£)",
                    data: incomeResult.data,
                    backgroundColor: "rgba(76, 175, 80, 0.7)",
                    borderColor: "rgb(76, 175, 80)",
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: "flex",
                    maxBarThickness: 50
                },
                {
                    label: "Expenses (£)",
                    data: expensesResult.data,
                    backgroundColor: "rgba(244, 67, 54, 0.7)",
                    borderColor: "rgb(244, 67, 54)",
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: "flex",
                    maxBarThickness: 50
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000,
                easing: "easeOutQuart"
            },
            scales: {
                x: {
                    title: { display: true, text: "Week of month", color: "#A6A6A6" },
                    ticks: { color: "#A6A6A6", maxRotation: 0 }
                },
                y: {
                    title: { display: true, text: "£", color: "#A6A6A6" },
                    ticks: { color: "#A6A6A6", callback: function(v) { return "£" + v; } },
                    beginAtZero: true
                }
            },
            plugins: {
                legend: { display: true, position: "top", labels: { color: "#A6A6A6" } }
            }
        }
    });
    if (dashboardExpensesByCategoryChart) {
        dashboardExpensesByCategoryChart.destroy();
        dashboardExpensesByCategoryChart = null;
    }
    if (categoryResult.labels.length > 0 && categoryResult.data.length > 0) {
        var doughnutCtx = doughnutCanvas.getContext("2d");
        var colors = createChartColors();
        dashboardExpensesByCategoryChart = new Chart(doughnutCtx, {
            type: "doughnut",
            data: {
                labels: categoryResult.labels,
                datasets: [{
                    data: categoryResult.data,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1000,
                    animateRotate: true,
                    animateScale: true,
                    easing: "easeOutQuart"
                },
                plugins: {
                    legend: { display: true, position: "bottom", labels: { color: "#A6A6A6" } }
                },
                cutout: "60%"
            }
        });
    }
}

/**
 * Creates chart colors based on theme
 * @returns {Object} Object containing background and border colors
 */
function createChartColors() {
    // Minimal finance palette: soft golds with subtle contrast
    const baseColors = [
        'rgba(245, 192, 122, 0.85)', // primary gold
        'rgba(245, 192, 122, 0.55)', // lighter gold
        'rgba(245, 192, 122, 0.35)', // very light gold
        'rgba(245, 192, 122, 0.20)'  // faint accent
    ];

    const borderColors = [
        '#f5c07a',
        '#e8b066',
        '#dba25c',
        '#c98f4f'
    ];

    return {
        background: baseColors,
        border: borderColors
    };
}

/**
 * Gets chart configuration options with dark mode support
 * @returns {Object} Chart.js options object
 */
function getChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 1200,
            easing: "easeOutQuart"
        },
        transitions: {
            active: { animation: { duration: 800 } },
            resize: { animation: { duration: 0 } }
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#A6A6A6',
                    font: {
                        family: "'Inter', sans-serif",
                        size: 12,
                        weight: '500'
                    },
                    padding: 8,
                    usePointStyle: true,
                    pointStyle: 'circle'
                }
            },
            tooltip: {
                backgroundColor: 'rgba(27, 29, 35, 0.98)',
                padding: 10,
                titleColor: '#FFFFFF',
                bodyColor: '#FFFFFF',
                borderColor: 'rgba(245, 192, 122, 0.7)',
                borderWidth: 1,
                cornerRadius: 6,
                displayColors: true,
                titleFont: {
                    family: "'Inter', sans-serif",
                    size: 13,
                    weight: '600'
                },
                bodyFont: {
                    family: "'Inter', sans-serif",
                    size: 12
                },
                callbacks: {
                    label: function(context) {
                        if (!context || typeof context.parsed !== 'object') return '';
                        const value = typeof context.parsed.y === 'number'
                            ? context.parsed.y
                            : context.parsed;
                        return '£' + value.toLocaleString('en-GB', {
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
                    color: '#A6A6A6',
                    font: {
                        family: "'Inter', sans-serif",
                        size: 11,
                        weight: '400'
                    },
                    padding: 8
                }
            },
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(58, 61, 69, 0.45)',
                    borderDash: [3, 4],
                    drawBorder: false
                },
                ticks: {
                    color: '#6B6B6B',
                    font: {
                        family: "'Inter', sans-serif",
                        size: 10,
                        weight: '400'
                    },
                    padding: 6,
                    callback: function(value) {
                        if (typeof value !== 'number') return value;
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
        if (isRecurringBill(expense)) return; // Recurring bills shown in Recurring bills section only
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

/**
 * Returns the active month key from the filter
 * @returns {string|null} 'YYYY-MM' for a specific month, or null for "all months"
 */
function getActiveMonthKeyFromFilter() {
    // Default to current month if no explicit selection (use local time for consistency)
    if (!selectedMonthFilter || selectedMonthFilter === "current") {
        const now = new Date();
        return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    }

    if (selectedMonthFilter === "all") {
        return null;
    }

    // Specific month value like '2026-01'
    return selectedMonthFilter;
}

/**
 * Formats a raw YYYY-MM string into a readable label (e.g., "January 2026")
 * @param {string} monthStr
 * @returns {string}
 */
function formatMonthLabelFromRaw(monthStr) {
    try {
        const [year, month] = monthStr.split('-');
        const yearNum = parseInt(year, 10);
        const monthNum = parseInt(month, 10);

        if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
            return monthStr;
        }

        const date = new Date(yearNum, monthNum - 1);
        if (isNaN(date.getTime())) {
            return monthStr;
        }

        return date.toLocaleString("en-UK", { month: "long", year: "numeric" });
    } catch (error) {
        console.warn("Error formatting month label from raw:", monthStr, error);
        return monthStr;
    }
}


