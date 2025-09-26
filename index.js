<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ระบบควบคุมงบประมาณ</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        
        // Firebase configuration and initialization (MUST USE THESE GLOBAL VARIABLES)
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const auth = getAuth(app);
        
        // Log all Firebase debug messages to the console
        setLogLevel('debug');
        
        let userId = '';
        let allocationsData = [];
        let transactionsData = [];

        // Function to sign in the user
        async function signIn() {
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Firebase Auth Error:", error);
            }
        }
        
        // Listen for auth state changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                console.log("User signed in with ID:", userId);
                document.getElementById('user-id').textContent = 'User ID: ' + userId;
                
                // Set up real-time listeners for all collections
                setupFirestoreListeners();
            } else {
                console.log("User signed out or not authenticated. Signing in...");
                await signIn();
            }
        });

        // Function to set up real-time listeners for data
        function setupFirestoreListeners() {
            const allocationColRef = collection(db, `/artifacts/${appId}/public/data/allocations`);
            const transactionColRef = collection(db, `/artifacts/${appId}/public/data/transactions`);

            // Listen for changes in allocations data
            onSnapshot(allocationColRef, (snapshot) => {
                allocationsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log("Allocations data updated:", allocationsData);
                // Update dynamic fields when allocations change
                updateDynamicFields();
                renderDashboard();
            });

            // Listen for changes in transactions data
            onSnapshot(transactionColRef, (snapshot) => {
                transactionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                console.log("Transactions data updated:", transactionsData);
                renderBudgetPlanTable(); // <-- Added this line to update the budget plan table
                renderBudgetControlTable();
                renderDashboard();
            });
        }
        
        window.addEventListener('load', async () => {
            // Wait for authentication before doing anything else
            if (!auth.currentUser) {
                await signIn();
            }
            showPage('allocations');
        });

        // --- UI Logic and Functions ---
        
        // Function to show/hide pages
        window.showPage = (pageName) => {
            const pages = document.querySelectorAll('.page-content');
            pages.forEach(page => page.style.display = 'none');
            document.getElementById(pageName + '-page').style.display = 'block';

            // Special logic for the dashboard page
            if (pageName === 'dashboard') {
                renderDashboard();
            }
        };

        // Function to update dynamic fields (project dropdowns)
        function updateDynamicFields() {
            const projectDropdowns = document.querySelectorAll('.project-select');
            projectDropdowns.forEach(dropdown => {
                dropdown.innerHTML = '<option value="">-- เลือกโครงการ --</option>';
                allocationsData.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.projectName;
                    option.textContent = item.projectName;
                    dropdown.appendChild(option);
                });
            });

            // Update the Budget Plan and Budget Control pages
            renderBudgetPlanTable();
        }
        
        // Function to aggregate transaction data by project name
        function getAggregatedTransactionData() {
            const aggregated = {};
            transactionsData.forEach(t => {
                if (!aggregated[t.projectName]) {
                    aggregated[t.projectName] = { actualUsed: 0 };
                }
                aggregated[t.projectName].actualUsed += t.actualUsed;
            });
            return aggregated;
        }

        // Function to render the Budget Plan table
        function renderBudgetPlanTable() {
            const planTableBody = document.getElementById('plan-table-body');
            planTableBody.innerHTML = '';
            const aggregatedTransactions = getAggregatedTransactionData();

            allocationsData.forEach(item => {
                const actualUsed = aggregatedTransactions[item.projectName]?.actualUsed || 0;
                const remaining = (item.budget || 0) - actualUsed;

                const row = document.createElement('tr');
                row.className = 'bg-white border-b hover:bg-gray-50';
                row.innerHTML = `
                    <td class="px-6 py-4">${item.plan}</td>
                    <td class="px-6 py-4">${item.output}</td>
                    <td class="px-6 py-4">${item.mainActivity}</td>
                    <td class="px-6 py-4">${item.projectName}</td>
                    <td class="px-6 py-4">${item.department}</td>
                    <td class="px-6 py-4">${item.projectCode}</td>
                    <td class="px-6 py-4">${item.budgetCode}</td>
                    <td class="px-6 py-4 text-right">${formatNumber(item.budget)}</td>
                    <td class="px-6 py-4 text-right">${formatNumber(actualUsed)}</td>
                    <td class="px-6 py-4 text-right">${formatNumber(remaining)}</td>
                    <td class="px-6 py-4">
                        <button onclick="editAllocation('${item.id}')" class="font-medium text-blue-600 hover:underline mr-2">แก้ไข</button>
                        <button onclick="deleteAllocation('${item.id}')" class="font-medium text-red-600 hover:underline">ลบ</button>
                    </td>
                `;
                planTableBody.appendChild(row);
            });
        }
        
        // Function to render the Budget Control table
        function renderBudgetControlTable() {
            const controlTableBody = document.getElementById('control-table-body');
            controlTableBody.innerHTML = '';
            transactionsData.forEach(item => {
                const row = document.createElement('tr');
                row.className = 'bg-white border-b hover:bg-gray-50';
                row.innerHTML = `
                    <td class="px-6 py-4">${item.projectName}</td>
                    <td class="px-6 py-4">${item.activity}</td>
                    <td class="px-6 py-4">${item.department}</td>
                    <td class="px-6 py-4 text-right">${formatNumber(item.committedBudget)}</td>
                    <td class="px-6 py-4 text-right">${formatNumber(item.actualUsed)}</td>
                    <td class="px-6 py-4">${item.expenseCategory}</td>
                    <td class="px-6 py-4 text-right">${formatNumber(item.remaining)}</td>
                    <td class="px-6 py-4">
                        <button onclick="editTransaction('${item.id}')" class="font-medium text-blue-600 hover:underline mr-2">แก้ไข</button>
                        <button onclick="deleteTransaction('${item.id}')" class="font-medium text-red-600 hover:underline">ลบ</button>
                    </td>
                `;
                controlTableBody.appendChild(row);
            });
        }

        // Form Submission Handlers
        window.saveAllocation = async (event) => {
            event.preventDefault();
            const form = document.getElementById('allocation-form');
            const data = {
                plan: form.plan.value,
                output: form.output.value,
                mainActivity: form.mainActivity.value,
                department: form.department.value,
                budget: parseFloat(form.budget.value.replace(/,/g, '')),
                projectCode: form.projectCode.value,
                budgetCode: form.budgetCode.value,
                projectName: form.projectName.value
            };
            
            try {
                if (form.dataset.docId) {
                    await setDoc(doc(db, `/artifacts/${appId}/public/data/allocations`, form.dataset.docId), data);
                    showMessage('อัปเดตข้อมูลจัดสรรงบประมาณสำเร็จ!', 'success');
                } else {
                    await addDoc(collection(db, `/artifacts/${appId}/public/data/allocations`), data);
                    showMessage('บันทึกข้อมูลจัดสรรงบประมาณสำเร็จ!', 'success');
                }
                form.reset();
                delete form.dataset.docId; // Clear the doc ID
                document.getElementById('allocation-form-title').textContent = 'ช่องกรอกข้อมูลจัดสรรงบประมาณ';
            } catch (e) {
                console.error("Error adding document: ", e);
                showMessage('เกิดข้อผิดพลาดในการบันทึกข้อมูล!', 'error');
            }
        };

        window.editAllocation = (docId) => {
            const item = allocationsData.find(item => item.id === docId);
            if (item) {
                const form = document.getElementById('allocation-form');
                form.plan.value = item.plan;
                form.output.value = item.output;
                form.mainActivity.value = item.mainActivity;
                form.department.value = item.department;
                form.budget.value = formatNumber(item.budget);
                form.projectCode.value = item.projectCode;
                form.budgetCode.value = item.budgetCode;
                form.projectName.value = item.projectName;
                form.dataset.docId = docId;
                document.getElementById('allocation-form-title').textContent = 'แก้ไขข้อมูลจัดสรรงบประมาณ';
                showPage('allocations'); // Switch to the page with the form
            }
        };

        window.deleteAllocation = async (docId) => {
            if (confirm('คุณต้องการลบข้อมูลนี้ใช่หรือไม่?')) {
                try {
                    await deleteDoc(doc(db, `/artifacts/${appId}/public/data/allocations`, docId));
                    showMessage('ลบข้อมูลจัดสรรงบประมาณสำเร็จ!', 'success');
                } catch (e) {
                    console.error("Error deleting document: ", e);
                    showMessage('เกิดข้อผิดพลาดในการลบข้อมูล!', 'error');
                }
            }
        };

        window.saveTransaction = async (event) => {
            event.preventDefault();
            const form = document.getElementById('transaction-form');
            const data = {
                projectName: form.projectName.value,
                activity: form.activity.value,
                department: form.department.value,
                committedBudget: parseFloat(form.committedBudget.value.replace(/,/g, '')),
                actualUsed: parseFloat(form.actualUsed.value.replace(/,/g, '')),
                expenseCategory: form.expenseCategory.value,
                remaining: parseFloat(form.remaining.value.replace(/,/g, '')),
                timestamp: new Date().toISOString()
            };
            
            try {
                if (form.dataset.docId) {
                    await setDoc(doc(db, `/artifacts/${appId}/public/data/transactions`, form.dataset.docId), data);
                    showMessage('อัปเดตข้อมูลคุมงบประมาณสำเร็จ!', 'success');
                } else {
                    await addDoc(collection(db, `/artifacts/${appId}/public/data/transactions`), data);
                    showMessage('บันทึกข้อมูลคุมงบประมาณสำเร็จ!', 'success');
                }
                form.reset();
                delete form.dataset.docId;
                document.getElementById('transaction-form-title').textContent = 'ช่องกรอกข้อมูลคุมงบประมาณ';
            } catch (e) {
                console.error("Error adding document: ", e);
                showMessage('เกิดข้อผิดพลาดในการบันทึกข้อมูล!', 'error');
            }
        };
        
        window.editTransaction = (docId) => {
            const item = transactionsData.find(item => item.id === docId);
            if (item) {
                const form = document.getElementById('transaction-form');
                form.projectName.value = item.projectName;
                form.activity.value = item.activity;
                form.department.value = item.department;
                form.committedBudget.value = formatNumber(item.committedBudget);
                form.actualUsed.value = formatNumber(item.actualUsed);
                form.expenseCategory.value = item.expenseCategory;
                form.remaining.value = formatNumber(item.remaining);
                form.dataset.docId = docId;
                document.getElementById('transaction-form-title').textContent = 'แก้ไขข้อมูลคุมงบประมาณ';
                showPage('budget-control');
            }
        };
        
        window.deleteTransaction = async (docId) => {
            if (confirm('คุณต้องการลบข้อมูลนี้ใช่หรือไม่?')) {
                try {
                    await deleteDoc(doc(db, `/artifacts/${appId}/public/data/transactions`, docId));
                    showMessage('ลบข้อมูลคุมงบประมาณสำเร็จ!', 'success');
                } catch (e) {
                    console.error("Error deleting document: ", e);
                    showMessage('เกิดข้อผิดพลาดในการลบข้อมูล!', 'error');
                }
            }
        };

        // --- Dashboard and Charting Logic ---

        let chart1, chart2, chart3;

        function renderDashboard() {
            const budgetData = aggregateBudgets();
            
            // Render Graph 1: แยกตามประเภทงบประมาณ
            const ctx1 = document.getElementById('chart1').getContext('2d');
            if (chart1) chart1.destroy();
            chart1 = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: ['งบประมาณที่ได้รับ', 'งบประมาณที่ใช้ไป'],
                    datasets: [{
                        label: 'งบประมาณทั้งหมด',
                        data: [budgetData.totalAllocated, budgetData.totalUsed],
                        backgroundColor: ['rgba(59, 130, 246, 0.6)', 'rgba(239, 68, 68, 0.6)'],
                        borderColor: ['rgba(59, 130, 246, 1)', 'rgba(239, 68, 68, 1)'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true } },
                    plugins: { legend: { display: false } }
                }
            });

            // Render Graph 2: แยกตามกลุ่มงาน
            const ctx2 = document.getElementById('chart2').getContext('2d');
            if (chart2) chart2.destroy();
            
            const departmentLabels = Object.keys(budgetData.department);
            const departmentAllocatedData = departmentLabels.map(dept => budgetData.department[dept].allocated);
            const departmentUsedData = departmentLabels.map(dept => budgetData.department[dept].used);
            
            chart2 = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: departmentLabels,
                    datasets: [
                        {
                            label: 'งบประมาณที่ได้รับ',
                            data: departmentAllocatedData,
                            backgroundColor: 'rgba(59, 130, 246, 0.6)',
                            borderColor: 'rgba(59, 130, 246, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'งบประมาณที่ใช้ไป',
                            data: departmentUsedData,
                            backgroundColor: 'rgba(239, 68, 68, 0.6)',
                            borderColor: 'rgba(239, 68, 68, 1)',
                            borderWidth: 1
                        },
                    ]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true } },
                    plugins: { legend: { position: 'top' } }
                }
            });

            // Render Graph 3: แยกตามแผนงาน
            const ctx3 = document.getElementById('chart3').getContext('2d');
            if (chart3) chart3.destroy();
            chart3 = new Chart(ctx3, {
                type: 'bar',
                data: {
                    labels: Object.keys(budgetData.plan),
                    datasets: [
                        {
                            label: 'งบประมาณที่ได้รับ',
                            data: Object.values(budgetData.plan).map(p => p.allocated),
                            backgroundColor: 'rgba(59, 130, 246, 0.6)',
                            borderColor: 'rgba(59, 130, 246, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'งบประมาณที่ใช้ไป',
                            data: Object.values(budgetData.plan).map(p => p.used),
                            backgroundColor: 'rgba(239, 68, 68, 0.6)',
                            borderColor: 'rgba(239, 68, 68, 1)',
                            borderWidth: 1
                        },
                    ]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true } },
                    plugins: { legend: { position: 'top' } }
                }
            });
        }

        // Function to aggregate data for the dashboard
        function aggregateBudgets() {
            const data = {
                totalAllocated: 0,
                totalUsed: 0,
                department: {},
                plan: {}
            };

            // Aggregate from allocations
            allocationsData.forEach(item => {
                data.totalAllocated += item.budget || 0;
                if (!data.plan[item.plan]) {
                    data.plan[item.plan] = { allocated: 0, used: 0 };
                }
                data.plan[item.plan].allocated += item.budget || 0;
                
                // Also aggregate allocated budget by department
                if (!data.department[item.department]) {
                    data.department[item.department] = { allocated: 0, used: 0 };
                }
                data.department[item.department].allocated += item.budget || 0;
            });

            // Aggregate from transactions
            transactionsData.forEach(item => {
                data.totalUsed += item.actualUsed || 0;
                
                // Aggregate used budget by department
                if (!data.department[item.department]) {
                    data.department[item.department] = { allocated: 0, used: 0 };
                }
                data.department[item.department].used += item.actualUsed || 0;
                
                // Aggregate by plan - we need to find the plan from the allocation data
                const correspondingAllocation = allocationsData.find(alloc => alloc.projectName === item.projectName);
                if (correspondingAllocation) {
                    const planName = correspondingAllocation.plan;
                    if (!data.plan[planName]) {
                        data.plan[planName] = { allocated: 0, used: 0 };
                    }
                    data.plan[planName].used += item.actualUsed || 0;
                }
            });

            return data;
        }

        // --- Helper Functions ---

        // Function to format number with commas and 2 decimal places
        window.formatNumber = (num) => {
            if (isNaN(num)) return '';
            const parts = num.toFixed(2).toString().split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return parts.join('.');
        }

        // Function to format input fields
        window.handleNumberInput = (event) => {
            const input = event.target;
            const value = input.value.replace(/,/g, '');
            if (!isNaN(parseFloat(value))) {
                input.value = formatNumber(parseFloat(value));
            } else {
                input.value = '';
            }
        }

        // Function to handle automatic remaining budget calculation
        window.calculateRemaining = () => {
            const committed = parseFloat(document.getElementById('committedBudget').value.replace(/,/g, '') || 0);
            const actual = parseFloat(document.getElementById('actualUsed').value.replace(/,/g, '') || 0);
            const remaining = committed - actual;
            document.getElementById('remaining').value = formatNumber(remaining);
        }
        
        // Function to show a message modal
        window.showMessage = (message, type) => {
            const modal = document.getElementById('message-modal');
            const messageText = document.getElementById('message-text');
            const closeBtn = document.getElementById('close-message-modal');

            messageText.textContent = message;
            
            // Set message color based on type
            messageText.className = 'text-center text-xl font-semibold';
            if (type === 'success') {
                messageText.classList.add('text-green-600');
            } else if (type === 'error') {
                messageText.classList.add('text-red-600');
            }

            modal.classList.remove('hidden');

            closeBtn.onclick = () => {
                modal.classList.add('hidden');
            };

            // Close automatically after 3 seconds
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 3000);
        }

    </script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700&display=swap');
        body {
            font-family: 'Sarabun', sans-serif;
        }
        .page-content {
            display: none;
        }
        .nav-item {
            @apply px-4 py-2 rounded-lg transition-colors duration-200 cursor-pointer;
        }
        .nav-item:hover {
            @apply bg-blue-600;
        }
        .nav-item.active {
            @apply bg-blue-700 font-bold;
        }
    </style>
</head>
<body class="bg-gray-100 text-gray-800">

    <!-- Header and Navigation -->
    <header class="bg-blue-600 text-white p-4 shadow-lg">
        <div class="container mx-auto flex justify-between items-center">
            <h1 class="text-3xl font-bold">ระบบควบคุมงบประมาณ</h1>
            <div id="user-info" class="text-sm font-light">
                <span id="user-id"></span>
            </div>
            <nav>
                <ul class="flex space-x-4">
                    <li><button onclick="showPage('allocations')" class="nav-item active">จัดสรรงบ</button></li>
                    <li><button onclick="showPage('budget-plan')" class="nav-item">แผนงบประมาณ</button></li>
                    <li><button onclick="showPage('budget-control')" class="nav-item">คุมงบประมาณ</button></li>
                    <li><button onclick="showPage('dashboard')" class="nav-item">Dashboard</button></li>
                </ul>
            </nav>
        </div>
    </header>

    <!-- Main Content Area -->
    <main class="container mx-auto p-6">

        <!-- Message Modal -->
        <div id="message-modal" class="fixed inset-0 bg-gray-600 bg-opacity-50 hidden flex justify-center items-center z-50">
            <div class="bg-white rounded-lg p-6 shadow-xl w-80">
                <div class="flex justify-end">
                    <button id="close-message-modal" class="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
                </div>
                <p id="message-text" class="text-center text-xl font-semibold mt-4"></p>
            </div>
        </div>

        <!-- 1. จัดสรรงบ Page -->
        <div id="allocations-page" class="page-content">
            <h2 class="text-2xl font-semibold mb-4 text-blue-800">1. จัดสรรงบ</h2>
            <div class="bg-white p-6 rounded-lg shadow-md">
                <form id="allocation-form" onsubmit="saveAllocation(event)">
                    <h3 id="allocation-form-title" class="text-xl font-medium mb-4">ช่องกรอกข้อมูลจัดสรรงบประมาณ</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <label for="plan" class="block text-sm font-medium text-gray-700 mb-1">แผนงาน</label>
                            <input type="text" id="plan" name="plan" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                        </div>
                        <div>
                            <label for="output" class="block text-sm font-medium text-gray-700 mb-1">ผลผลิต/โครงการ</label>
                            <input type="text" id="output" name="output" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                        </div>
                         <div>
                            <label for="mainActivity" class="block text-sm font-medium text-gray-700 mb-1">กิจกรรมหลัก</label>
                            <input type="text" id="mainActivity" name="mainActivity" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                        </div>
                        <div>
                            <label for="projectName" class="block text-sm font-medium text-gray-700 mb-1">ชื่อโครงการ</label>
                            <input type="text" id="projectName" name="projectName" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                        </div>
                        <div>
                            <label for="department" class="block text-sm font-medium text-gray-700 mb-1">กลุ่มงาน</label>
                            <select id="department" name="department" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                                <option value="">-- เลือกกลุ่มงาน --</option>
                                <option value="พส.">พส.</option>
                                <option value="ปป.">ปป.</option>
                                <option value="มธ.">มธ.</option>
                                <option value="บส.">บส.</option>
                                <option value="บท.">บท.</option>
                                <option value="สป.">สป.</option>
                            </select>
                        </div>
                        <div>
                            <label for="budget" class="block text-sm font-medium text-gray-700 mb-1">งบประมาณ (บาท)</label>
                            <input type="text" id="budget" name="budget" required oninput="handleNumberInput(event)" class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-right">
                        </div>
                        <div>
                            <label for="projectCode" class="block text-sm font-medium text-gray-700 mb-1">รหัสโครงการ</label>
                            <input type="text" id="projectCode" name="projectCode" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                        </div>
                        <div>
                            <label for="budgetCode" class="block text-sm font-medium text-gray-700 mb-1">รหัสงบประมาณ</label>
                            <input type="text" id="budgetCode" name="budgetCode" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                        </div>
                    </div>
                    <div class="mt-6 text-right">
                        <button type="submit" class="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors duration-200">บันทึกข้อมูล</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- 2. แผนงบประมาณ Page -->
        <div id="budget-plan-page" class="page-content">
            <h2 class="text-2xl font-semibold mb-4 text-blue-800">2. แผนงบประมาณ</h2>
            <div class="bg-white p-6 rounded-lg shadow-md">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-xl font-medium">ข้อมูลแผนงานและงบประมาณ</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">แผนงาน</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ผลผลิต/โครงการ</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">กิจกรรมหลัก</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อโครงการ</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">กลุ่มงาน</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รหัสโครงการ</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รหัสงบประมาณ</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">งบประมาณ</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">งบประมาณใช้จริง</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">งบประมาณคงเหลือ</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">การดำเนินการ</th>
                            </tr>
                        </thead>
                        <tbody id="plan-table-body" class="bg-white divide-y divide-gray-200">
                            <!-- Data will be populated by JavaScript -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- 3. คุมงบประมาณ Page -->
        <div id="budget-control-page" class="page-content">
            <h2 class="text-2xl font-semibold mb-4 text-blue-800">3. คุมงบประมาณ</h2>
            <div class="bg-white p-6 rounded-lg shadow-md mb-6">
                <form id="transaction-form" onsubmit="saveTransaction(event)">
                    <h3 id="transaction-form-title" class="text-xl font-medium mb-4">ช่องกรอกข้อมูลคุมงบประมาณ</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <label for="projectName" class="block text-sm font-medium text-gray-700 mb-1">โครงการ</label>
                            <select id="projectName" name="projectName" required class="project-select w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                                <option value="">-- เลือกโครงการ --</option>
                            </select>
                        </div>
                        <div>
                            <label for="activity" class="block text-sm font-medium text-gray-700 mb-1">กิจกรรมที่ดำเนินการ</label>
                            <input type="text" id="activity" name="activity" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                        </div>
                        <div>
                            <label for="department" class="block text-sm font-medium text-gray-700 mb-1">กลุ่มงาน</label>
                            <select id="department" name="department" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                                <option value="">-- เลือกกลุ่มงาน --</option>
                                <option value="พส.">พส.</option>
                                <option value="ปป.">ปป.</option>
                                <option value="มธ.">มธ.</option>
                                <option value="บส.">บส.</option>
                                <option value="บท.">บท.</option>
                                <option value="สป.">สป.</option>
                            </select>
                        </div>
                        <div>
                            <label for="committedBudget" class="block text-sm font-medium text-gray-700 mb-1">งบประมาณผูกพัน/ตัดงบ (บาท)</label>
                            <input type="text" id="committedBudget" name="committedBudget" required oninput="handleNumberInput(event); calculateRemaining();" class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-right">
                        </div>
                        <div>
                            <label for="actualUsed" class="block text-sm font-medium text-gray-700 mb-1">งบประมาณใช้จริง (บาท)</label>
                            <input type="text" id="actualUsed" name="actualUsed" required oninput="handleNumberInput(event); calculateRemaining();" class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 text-right">
                        </div>
                        <div>
                            <label for="expenseCategory" class="block text-sm font-medium text-gray-700 mb-1">หมวดค่าใช้จ่าย</label>
                            <select id="expenseCategory" name="expenseCategory" required class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2">
                                <option value="">-- เลือกหมวด --</option>
                                <option value="ลงทะเบียนอบรม">ลงทะเบียนอบรม</option>
                                <option value="เดินทางไปราชการ">เดินทางไปราชการ</option>
                                <option value="ประชุมราชการ">ประชุมราชการ</option>
                                <option value="ค่าโทรศัพท์">ค่าโทรศัพท์</option>
                                <option value="ค่ากระดาษ หมึกPrinter">ค่ากระดาษ หมึกPrinter</option>
                                <option value="ค่าเช่าห้องประชุม">ค่าเช่าห้องประชุม</option>
                                <option value="OT">OT</option>
                                <option value="อื่นๆ">อื่นๆ</option>
                            </select>
                        </div>
                        <div>
                            <label for="remaining" class="block text-sm font-medium text-gray-700 mb-1">งบประมาณคงเหลือ (บาท)</label>
                            <input type="text" id="remaining" name="remaining" readonly class="w-full rounded-md border-gray-300 bg-gray-50 p-2 text-right font-bold text-gray-600">
                        </div>
                    </div>
                    <div class="mt-6 text-right">
                        <button type="submit" class="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors duration-200">บันทึกข้อมูล</button>
                    </div>
                </form>
            </div>
            
            <div class="bg-white p-6 rounded-lg shadow-md">
                <h3 class="text-xl font-medium mb-4">รายการคุมงบประมาณ</h3>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">โครงการ</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">กิจกรรม</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">กลุ่มงาน</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">งบผูกพัน/ตัดงบ</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">งบใช้จริง</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">หมวดค่าใช้จ่าย</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">งบคงเหลือ</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">การดำเนินการ</th>
                            </tr>
                        </thead>
                        <tbody id="control-table-body" class="bg-white divide-y divide-gray-200">
                            <!-- Data will be populated by JavaScript -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- 4. Dashboard Page -->
        <div id="dashboard-page" class="page-content">
            <h2 class="text-2xl font-semibold mb-4 text-blue-800">4. Dashboard</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Graph 1 -->
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h3 class="text-xl font-medium text-center mb-4">งบประมาณรวม</h3>
                    <canvas id="chart1"></canvas>
                </div>
                <!-- Graph 2 -->
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h3 class="text-xl font-medium text-center mb-4">งบประมาณตามกลุ่มงาน</h3>
                    <canvas id="chart2"></canvas>
                </div>
                <!-- Graph 3 -->
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h3 class="text-xl font-medium text-center mb-4">งบประมาณตามแผนงาน</h3>
                    <canvas id="chart3"></canvas>
                </div>
            </div>
        </div>

    </main>
</body>
</html>
