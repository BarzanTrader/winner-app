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
    
    // Collections to ensure exist (init doc added only if collection is empty). Includes "stocks" and "mortgages".
    const collections = ["users", "expenses", "hours", "income", "settings", "waitlist", "recurring_bills", "saving_goals", "work_sessions", "user_settings", "stocks", "mortgages"];
    
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
let selectedMonthFilter = "current"; // 'current', 'all', or specific 'YYYY-MM'

// Hourly tracker: current session and live timer
let hourlySessionDocId = null;
let hourlySessionStartTime = null;
let hourlyTimerIntervalId = null;
let currentHourlyRate = 0;
/** Savings percentage (0–100), from user_settings */
let currentSavingsPercent = 0;
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
    setTimeout(function() {
        loadExpensesFromStorage().catch(function(err) { console.warn("Delayed load expenses:", err); });
        loadSummary().catch(function(err) { console.warn("Delayed loadSummary:", err); });
        loadRecurringBills().catch(function(err) { console.warn("Delayed loadRecurringBills:", err); });
        loadSavingGoals().catch(function(err) { console.warn("Delayed loadSavingGoals:", err); });
        loadUserSettingsHourlyRate().then(function() { return loadWorkSessions(); }).catch(function(err) { console.warn("Delayed hourly tracker:", err); });
    }, 2000);
    document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === "visible" && db && typeof db.collection === "function") {
            loadExpensesFromStorage().catch(function(err) { console.warn("Visibility refresh load:", err); });
            loadSummary().catch(function(err) { console.warn("Visibility loadSummary:", err); });
            loadRecurringBills().catch(function(err) { console.warn("Visibility loadRecurringBills:", err); });
            loadSavingGoals().catch(function(err) { console.warn("Visibility loadSavingGoals:", err); });
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
        historyTab: document.getElementById("historyTab"),
        hourlyTab: document.getElementById("hourlyTab"),
        stocksTab: document.getElementById("stocksTab"),
        mortgageTab: document.getElementById("mortgageTab"),
        homePage: document.getElementById("homePage"),
        historyPage: document.getElementById("historyPage"),
        hourlyPage: document.getElementById("hourlyPage"),
        stocksPage: document.getElementById("stocksPage"),
        mortgagePage: document.getElementById("mortgagePage"),
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
                var note = (data && (data.note != null ? data.note : data.notes)) || "";
                var amount = Number(data && data.amount);
                if (isNaN(amount)) amount = 0;
                var date = parseExpenseDate(data && data.date);
                var category = (data && data.category) || "";
                var typeVal = (data.type === "bill" || data.type === "spending") ? data.type : "spending";
                var billSched = (typeVal === "bill" && (data.billSchedule === "recurring" || data.billSchedule === "single")) ? data.billSchedule : "single";
                var recurringBillId = (data.recurringBillId && typeof data.recurringBillId === "string") ? data.recurringBillId : null;
                expenses.push({
                    id: doc.id,
                    note: String(note),
                    amount: amount,
                    date: date,
                    category: String(category),
                    type: typeVal,
                    billSchedule: billSched,
                    recurringBillId: recurringBillId || undefined
                });
            });

            // Backfill: any expense with type bill + recurring but no recurringBillId gets a doc in recurring_bills
            if (typeof firebase !== "undefined" && firebase.firestore && firebase.firestore.FieldValue) {
                for (var i = 0; i < expenses.length; i++) {
                    var exp = expenses[i];
                    if (exp && exp.type === "bill" && exp.billSchedule === "recurring" && !exp.recurringBillId && exp.id) {
                        try {
                            var rbRef = await db.collection("recurring_bills").add({
                                amount: exp.amount,
                                note: exp.note || "",
                                name: exp.note || "",
                                expenseId: exp.id,
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
    loadWorkSessions().catch(function(e) { console.warn("refreshAllDisplays loadWorkSessions:", e); });
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
            if (docUserId && docUserId !== STOCKS_USER_ID.trim()) return;
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
}

async function addMortgageToFirestore(data) {
    var ready = await ensureFirebaseReady();
    if (!ready || !db || typeof db.collection !== "function") {
        throw new Error("Firebase not ready.");
    }
    var startDate = data.startDate ? firebase.firestore.Timestamp.fromDate(new Date(data.startDate + "T12:00:00")) : firebase.firestore.FieldValue.serverTimestamp();
    return db.collection("mortgages").add({
        userId: MORTGAGE_USER_ID,
        propertyName: String(data.propertyName),
        loanAmount: Number(data.loanAmount),
        interestRate: Number(data.interestRate),
        termYears: Number(data.termYears),
        monthlyPayment: Number(data.monthlyPayment),
        remainingBalance: Number(data.remainingBalance),
        startDate: startDate
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
            if (uid && uid !== MORTGAGE_USER_ID.trim()) return;
            var startDate = data.startDate;
            var startStr = "";
            var startMs = 0;
            if (startDate && typeof startDate.toDate === "function") {
                try {
                    var d = startDate.toDate();
                    startMs = d.getTime();
                    startStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                } catch (e) { startStr = "—"; }
            } else if (startDate) startStr = String(startDate);
            items.push({
                id: doc.id,
                propertyName: (data.propertyName != null) ? String(data.propertyName) : "—",
                loanAmount: Number(data.loanAmount) || 0,
                interestRate: Number(data.interestRate) || 0,
                termYears: Number(data.termYears) || 0,
                monthlyPayment: Number(data.monthlyPayment) || 0,
                remainingBalance: Number(data.remainingBalance) || 0,
                startStr: startStr || "—",
                startMs: startMs
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
            line1.textContent = "Loan £" + item.loanAmount.toFixed(2) + " · " + item.interestRate + "% · " + item.termYears + " yrs";
            details.appendChild(line1);
            var line2 = document.createElement("div");
            line2.className = "mortgage-item-line";
            line2.textContent = "Monthly £" + item.monthlyPayment.toFixed(2) + " · Remaining £" + item.remainingBalance.toFixed(2) + " · From " + item.startStr;
            details.appendChild(line2);
            li.appendChild(details);
            listEl.appendChild(li);
        });
        if (emptyEl) emptyEl.style.display = items.length > 0 ? "none" : "block";
    } catch (err) {
        console.warn("loadMortgages:", err);
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
    } catch (error) {
        console.error("❌ Error in handleFormSubmit:", error);
        if (errorEl) {
            errorEl.textContent = error && error.message ? error.message : "Could not save expense. Try again.";
            errorEl.style.display = "block";
        }
    }
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
    return {
        note: formData.name,
        amount: formData.amount,
        date: formData.date,
        category: formData.category,
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
                const firestoreData = {
                    amount: expense.amount,
                    category: expense.category,
                    note: expense.note,
                    date: dateTimestamp,
                    type: expenseType,
                    billSchedule: billSched,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                const docRef = await db.collection("expenses").add(firestoreData);
                
                expense.id = docRef.id;
                // If recurring bill, add to recurring_bills and link
                if (expenseType === "bill" && billSched === "recurring") {
                    try {
                        var rbRef = await db.collection("recurring_bills").add({
                            amount: expense.amount,
                            note: expense.note || "",
                            name: expense.note || "",
                            expenseId: expense.id,
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
    elements.historyTab.addEventListener("click", (e) => handleTabClick(e, "history"));
    if (elements.stocksTab) elements.stocksTab.addEventListener("click", (e) => handleTabClick(e, "stocks"));
    if (elements.mortgageTab) elements.mortgageTab.addEventListener("click", (e) => handleTabClick(e, "mortgage"));
    
    // Fallback for tabs that don't have an explicit listener (e.g. hourly)
    const navTabs = document.querySelectorAll('.nav-tab[data-page]');
    navTabs.forEach(tab => {
        if (tab.id === "homeTab" || tab.id === "historyTab" || tab.id === "stocksTab" || tab.id === "mortgageTab") return;
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
    
    console.log("✅ Navigation listeners set up");
    console.log("Home tab element:", elements.homeTab);
    console.log("History tab element:", elements.historyTab);
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

/**
 * user_settings/hourly doc: { hourlyRate: number, savingsPercent: number }
 */
async function loadUserSettingsHourlyRate() {
    var inputEl = document.getElementById("hourlyRateInput");
    var savingsInputEl = document.getElementById("savingsPercentInput");
    if (!inputEl) return;
    if (!db || typeof db.collection !== "function") return;
    try {
        var doc = await db.collection("user_settings").doc(USER_SETTINGS_HOURLY_DOC_ID).get();
        var rate = 0;
        var savingsPercent = 0;
        if (doc.exists && doc.data()) {
            var data = doc.data();
            rate = Number(data.hourlyRate);
            if (isNaN(rate)) rate = 0;
            savingsPercent = Number(data.savingsPercent);
            if (isNaN(savingsPercent) || savingsPercent < 0 || savingsPercent > 100) savingsPercent = 0;
        }
        currentHourlyRate = rate;
        currentSavingsPercent = savingsPercent;
        inputEl.value = rate > 0 ? rate.toFixed(2) : "";
        if (savingsInputEl) savingsInputEl.value = savingsPercent > 0 ? String(savingsPercent) : "";
    } catch (err) {
        console.warn("loadUserSettingsHourlyRate error:", err);
    }
}

/**
 * When user clicks "Save preference": read hourly rate and savings percentage from UI,
 * then store both in Firestore user_settings/hourly so savings percentage is persisted.
 */
async function saveUserSettingsHourlyRate() {
    var inputEl = document.getElementById("hourlyRateInput");
    var savingsInputEl = document.getElementById("savingsPercentInput");
    var msgEl = document.getElementById("hourlyRateMsg");
    if (!db || typeof db.collection !== "function") return;
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
    try {
        await db.collection("user_settings").doc(USER_SETTINGS_HOURLY_DOC_ID).set(
            { hourlyRate: rate, savingsPercent: savingsPercent },
            { merge: true }
        );
        currentHourlyRate = rate;
        currentSavingsPercent = savingsPercent;
        if (msgEl) {
            msgEl.textContent = "Saved.";
            msgEl.className = "hourly-msg success";
        }
        loadWorkSessions().catch(function(e) { console.warn("loadWorkSessions after save preference:", e); });
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
            if (ts >= todayStart && ts <= todayEnd && data.earning != null && !isNaN(Number(data.earning))) {
                total += Number(data.earning);
            }
        });
        return Math.round(total * 100) / 100;
    } catch (err) {
        console.warn("getTodayEarningsFromFirestore error:", err);
        return 0;
    }
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
                var earning = data && (data.earning != null) ? Number(data.earning) : null;
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
    var earning = Math.round((totalMinutesRounded / 60) * hourlyRate * 100) / 100;
    var payload = { totalMinutes: totalMinutesRounded, hourlyRate: hourlyRate, earning: earning };
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
            var docRef = await db.collection("work_sessions").add({
                startTime: firebase.firestore.FieldValue.serverTimestamp()
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
            var earning = Math.round((totalMinutes / 60) * hourlyRate * 100) / 100;
            if (msgEl) { msgEl.textContent = ""; msgEl.className = "hourly-msg"; }
            if (db && typeof db.collection === "function") {
                try {
                    confirmSessionBtn.disabled = true;
                    await db.collection("work_sessions").doc(hourlySessionDocId).update({
                        endTime: firebase.firestore.FieldValue.serverTimestamp(),
                        totalMinutes: totalMinutes,
                        hourlyRate: hourlyRate,
                        earning: earning,
                        breakMinutes: breakMinutes
                    });
                    if (msgEl) {
                        msgEl.textContent = "You earned: £" + earning.toFixed(2) + " for this session.";
                        msgEl.className = "hourly-msg success";
                    }
                    loadWorkSessions().catch(function(e) { console.warn("loadWorkSessions after stop:", e); });
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
    if (elements.historyTab) elements.historyTab.classList.remove("active");
    if (elements.hourlyTab) elements.hourlyTab.classList.remove("active");
    if (elements.stocksTab) elements.stocksTab.classList.remove("active");
    if (elements.mortgageTab) elements.mortgageTab.classList.remove("active");
    if (elements.homePage) elements.homePage.classList.remove("active");
    if (elements.historyPage) elements.historyPage.classList.remove("active");
    if (elements.hourlyPage) elements.hourlyPage.classList.remove("active");
    if (elements.stocksPage) elements.stocksPage.classList.remove("active");
    if (elements.mortgagePage) elements.mortgagePage.classList.remove("active");
    
    // Add active class to selected tab and page
    if (pageName === "home") {
        if (elements.homeTab) elements.homeTab.classList.add("active");
        if (elements.homePage) elements.homePage.classList.add("active");
        console.log("✅ Switched to home page");
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
                    await db.collection("recurring_bills").doc(selectedExpense.recurringBillId).update({
                        amount: editData.amount,
                        note: editData.note,
                        name: editData.note
                    });
                } else if (!selectedExpense.recurringBillId && isRecurringBill) {
                    var rbRef = await db.collection("recurring_bills").add({
                        amount: editData.amount,
                        note: editData.note,
                        name: editData.note,
                        expenseId: selectedExpense.id,
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
                var updatePayload = {
                    amount: editData.amount,
                    category: editData.category,
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
    
    // Make expense item clickable for selection and editing
    li.addEventListener("click", (e) => {
        // Stop event propagation to prevent triggering other click handlers
        e.stopPropagation();
        
        if (e.target.tagName === "BUTTON") {
            return; // Don't trigger if clicking delete button
        }
        
        // Check if this expense is already selected BEFORE deselecting others
        const isAlreadySelected = li.classList.contains("selected") && selectedExpense === expense;
        
        if (isAlreadySelected) {
            // If already selected, open edit modal on second click
            openEditModal(expense);
            return;
        }
        
        // Deselect other items
        document.querySelectorAll(".expense-item").forEach(item => {
            item.classList.remove("selected");
        });
        
        // First click: just select the expense
        selectedExpense = expense;
        li.classList.add("selected");
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
    if (totalIncomeEl) totalIncomeEl.textContent = income.toFixed(2);
    if (totalExpensesEl) totalExpensesEl.textContent = expensesTotal.toFixed(2);
    if (netBalanceEl) netBalanceEl.textContent = netBalance.toFixed(2);
    updateDashboard().catch(function(e) { console.warn("loadSummary updateDashboard:", e); });
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

async function loadSavingGoals() {
    var listEl = document.getElementById("savingGoalsList");
    if (!listEl) return;
    var goals = [];
    if (db && typeof db.collection === "function") {
        try {
            var snapshot = await db.collection("saving_goals").get();
            snapshot.forEach(function(doc) {
                var data = doc.data();
                if (data && data.init === true) return;
                var target = Number(data && (data.target ?? data.targetAmount ?? data.goalAmount));
                var current = Number(data && (data.current ?? data.currentAmount ?? data.saved));
                if (isNaN(target)) target = 0;
                if (isNaN(current)) current = 0;
                var progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                var label = (data && (data.name ?? data.label ?? data.title ?? data.note)) || "Goal";
                goals.push({ label: label, current: current, target: target, progress: progress });
            });
        } catch (err) {
            console.warn("loadSavingGoals error:", err);
        }
    }
    listEl.innerHTML = "";
    goals.forEach(function(g) {
        var li = document.createElement("li");
        li.className = "saving-goal-item";
        var labelEl = document.createElement("span");
        labelEl.className = "saving-goal-label";
        labelEl.textContent = g.label + " — £" + g.current.toFixed(2) + " / £" + g.target.toFixed(2);
        var barWrap = document.createElement("div");
        barWrap.className = "saving-goal-bar-wrap";
        var bar = document.createElement("div");
        bar.className = "saving-goal-bar";
        bar.style.width = g.progress.toFixed(0) + "%";
        var pct = document.createElement("span");
        pct.className = "saving-goal-pct";
        pct.textContent = g.progress.toFixed(0) + "%";
        barWrap.appendChild(bar);
        barWrap.appendChild(pct);
        li.appendChild(labelEl);
        li.appendChild(barWrap);
        listEl.appendChild(li);
    });
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
            easing: 'easeOutQuart'
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


