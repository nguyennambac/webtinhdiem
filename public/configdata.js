import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    getDocs,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    limit,
    writeBatch,
    serverTimestamp,
    onSnapshot,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDtFpBAuZ_3JHmMXq1uVShq4sm0zK9xqEI",
    authDomain: "westartrain.firebaseapp.com",
    projectId: "westartrain",
    storageBucket: "westartrain.firebasestorage.app",
    messagingSenderId: "52564586448",
    appId: "1:52564586448:web:983bdc321423b81f5a53d5",
    measurementId: "G-PFTMHMTF6J"
};

// Global variables
let db, auth;
let currentUser = null;
let isAdminUser = false;
let currentTab = 'dashboard';
let currentEditingItem = null;
let currentCollection = '';
let unsubscribeFunctions = {};
let dashboardLoaded = false;  // Khai báo biến để tránh ReferenceError

let topRacers = [];
let topRacersLoading = false;

// Chart instances
let carsRarityChart = null;
let recordsMonthChart = null;

// Filter variables
let carsFilters = {
    rarity: 'all',
    type: 'all',
    search: ''
};

let mapsFilters = {
    difficulty: 'all',
    search: ''
};

let petsFilters = {
    rarity: 'all',
    type: 'all',
    search: ''
};

let usersFilters = {
    role: 'all',
    status: 'all',
    isAdmin: 'all',
    isNewUser: 'all',
    search: ''
};

let recordsFilters = {
    map: 'all',
    racer: '',
    car: '',
    time: 'all',
    sort: 'time_asc'
};

let allCars = [];
let allPets = [];
let filteredCars = [];
let filteredMaps = [];
let filteredPets = [];
let filteredUsers = [];

// Chart instances
let usersRoleChart = null;  // THÊM MỚI
let mapsDifficultyChart = null;  // THÊM MỚI

// Pagination variables
let currentPage = {
    'gameCars': 1,
    'gameMaps': 1,
    'gamePets': 1,
    'raceRecords': 1,
    'users': 1,
    'notifications': 1
};

const itemsPerPage = 10;
let allRecords = [];
let filteredRecords = [];
let selectedRecords = new Set(); // Cho bulk delete
let deletedRecordsBackup = []; // Cho undo delete
let undoTimeoutId = null; // Timer cho undo toast
let allUsers = [];
let allNotifications = [];
let filteredNotifications = [];
let unreadNotificationCount = 0;
let notificationFilters = {
    type: 'all',
    status: 'all'
};
let allMaps = [];
let currentMapFilter = 'all';
let isTop10View = false;

// Initialize Firebase
const initFirebase = async () => {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Export db cho các modules sử dụng
        window.firestoreDb = db;

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user;
                await checkAdminStatus(user);
            } else {
                window.location.href = 'login.html';
            }
        });
    } catch (error) {
        console.error("Firebase initialization error:", error);
        showMessage("Lỗi khởi tạo Firebase!", true);
    }
};

// Check admin status and load user info
const checkAdminStatus = async (user) => {
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            isAdminUser = userData.isAdmin || false;

            if (isAdminUser) {
                document.getElementById('loading-screen').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');

                document.getElementById('user-name').textContent = user.displayName || 'Admin';
                document.getElementById('user-email').textContent = user.email;

                // Cập nhật hiển thị tên và nickname ở realtime-status
                const displayName = userData.displayName || user.displayName || 'Admin';
                const nickname = userData.nickname || '';
                const statusText = nickname ? `${displayName} (${nickname})` : displayName;
                document.getElementById('realtime-status').textContent = statusText;

                // Hiển thị avatar - ưu tiên Base64 nếu có
                if (userData.photoBase64) {
                    document.getElementById('user-avatar').src = userData.photoBase64;
                } else if (userData.photoURL) {
                    document.getElementById('user-avatar').src = userData.photoURL;
                } else if (user.photoURL) {
                    document.getElementById('user-avatar').src = user.photoURL;
                }

                // Tải dữ liệu dashboard khi vào trang
                await loadDashboardStats();

                // Setup realtime listeners
                setupRealtimeListeners();

                // Load notifications
                await loadNotifications();
            } else {
                showMessage("Bạn không có quyền truy cập trang này!", true);
                setTimeout(() => window.location.href = 'index.html', 2000);
            }
        } else {
            showMessage("Không tìm thấy thông tin người dùng!", true);
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    } catch (error) {
        console.error("Error checking admin status:", error);
        showMessage("Lỗi kiểm tra quyền truy cập!", true);
    }
};

// Setup realtime listeners
const setupRealtimeListeners = () => {
    console.log("Setting up realtime listeners...");

    // Listener cho xe
    if (!unsubscribeFunctions.gameCars) {
        unsubscribeFunctions.gameCars = onSnapshot(collection(db, "gameCars"), async (snapshot) => {
            document.getElementById('total-cars').textContent = snapshot.size;

            // Cập nhật chart khi ở tab dashboard
            if (currentTab === 'dashboard') {
                updateCarsRarityChart(snapshot);
            }

            // Cập nhật table khi ở tab cars
            if (currentTab === 'cars') {
                await loadCollectionData('gameCars', currentPage['gameCars']);
            }
        });
    }

    // Listener cho kỷ lục
    if (!unsubscribeFunctions.raceRecords) {
        unsubscribeFunctions.raceRecords = onSnapshot(collection(db, "raceRecords"), async (snapshot) => {
            document.getElementById('total-records').textContent = snapshot.size;

            // Cập nhật chart khi ở tab dashboard
            if (currentTab === 'dashboard') {
                updateRecordsMonthChart(snapshot);
            }

            // Luôn cập nhật allRecords và export ra window
            allRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.allRecords = allRecords; // Export cho các modules khác sử dụng

            // Cập nhật table khi ở tab records
            if (currentTab === 'records') {
                filterRecords(currentPage['raceRecords']);
            }
        });
    }

    // Listener cho người dùng
    if (!unsubscribeFunctions.users) {
        unsubscribeFunctions.users = onSnapshot(collection(db, "users"), (snapshot) => {
            document.getElementById('total-users').textContent = snapshot.size;

            // Luôn cập nhật allUsers và export ra window
            allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.allUsers = allUsers; // Export cho các modules khác sử dụng

            if (currentTab === 'users') {
                const totalItems = allUsers.length;
                const totalPages = Math.ceil(totalItems / itemsPerPage);
                const startIndex = (currentPage['users'] - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const pageData = allUsers.slice(startIndex, endIndex);
                renderTable('users', pageData);
                renderPagination('users', totalItems, currentPage['users']);
            }
        });
    }


    // Listener cho notifications
    if (!unsubscribeFunctions.notifications) {
        unsubscribeFunctions.notifications = onSnapshot(
            query(collection(db, "notifications"), orderBy("timestamp", "desc")),
            async (snapshot) => {
                allNotifications = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    read: doc.data().read !== undefined ? doc.data().read : false
                }));

                // Cập nhật số lượng thông báo chưa đọc
                updateNotificationCount();

                // Cập nhật tổng số thông báo
                document.getElementById('total-notifications').textContent = allNotifications.length;

                // Cập nhật table khi ở tab notifications
                if (currentTab === 'notifications') {
                    renderNotifications();
                }
            }
        );
    }

    // Listener cho activity log
    if (!unsubscribeFunctions.activityLog) {
        unsubscribeFunctions.activityLog = onSnapshot(
            query(collection(db, "activityLog"), orderBy("timestamp", "desc"), limit(5)),
            (snapshot) => {
                if (currentTab === 'dashboard') {
                    loadRecentActivity(snapshot);
                }
            }
        );
    }
};

// Load dashboard stats
const loadDashboardStats = async () => {
    try {
        console.log("Loading dashboard stats...");

        const [carsSnapshot, recordsSnapshot, usersSnapshot, notificationsSnapshot, mapsSnapshot, petsSnapshot] = await Promise.all([
            getDocs(collection(db, "gameCars")),
            getDocs(collection(db, "raceRecords")),
            getDocs(collection(db, "users")),
            getDocs(query(collection(db, "notifications"), orderBy("timestamp", "desc"))),
            getDocs(collection(db, "gameMaps")),
            getDocs(collection(db, "gamePets"))
        ]);

        // Update basic stats
        document.getElementById('total-cars').textContent = carsSnapshot.size;
        document.getElementById('total-records').textContent = recordsSnapshot.size;
        document.getElementById('total-users').textContent = usersSnapshot.size;
        document.getElementById('total-notifications').textContent = notificationsSnapshot.size;

        // Update additional stats
        const totalMapsEl = document.getElementById('total-maps');
        const totalPetsEl = document.getElementById('total-pets');
        if (totalMapsEl) totalMapsEl.textContent = mapsSnapshot.size;
        if (totalPetsEl) totalPetsEl.textContent = petsSnapshot.size;

        // Calculate active users
        let activeUsersCount = 0;
        let adminUsersCount = 0;
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.status === 'active') activeUsersCount++;
            if (userData.isAdmin === true) adminUsersCount++;
        });

        const activeUsersEl = document.getElementById('active-users');
        const adminUsersEl = document.getElementById('admin-users');
        if (activeUsersEl) activeUsersEl.textContent = activeUsersCount;
        if (adminUsersEl) adminUsersEl.textContent = adminUsersCount;

        // Calculate today's records
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let todayRecordsCount = 0;

        recordsSnapshot.forEach(doc => {
            const recordData = doc.data();
            if (recordData.timestamp) {
                const recordDate = new Date(recordData.timestamp);
                recordDate.setHours(0, 0, 0, 0);
                if (recordDate.getTime() === today.getTime()) {
                    todayRecordsCount++;
                }
            }
        });

        const recordsTodayEl = document.getElementById('records-today');
        const recordsTodayCountEl = document.getElementById('records-today-count');
        if (recordsTodayEl) recordsTodayEl.textContent = todayRecordsCount;
        if (recordsTodayCountEl) recordsTodayCountEl.textContent = todayRecordsCount;

        // Calculate new users (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        let newUsersCount = 0;

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.createdAt) {
                const createdDate = new Date(userData.createdAt);
                if (createdDate >= sevenDaysAgo) {
                    newUsersCount++;
                }
            }
        });

        const newUsersEl = document.getElementById('new-users');
        if (newUsersEl) newUsersEl.textContent = newUsersCount;

        // Update charts
        updateCarsRarityChart(carsSnapshot);
        updateRecordsMonthChart(recordsSnapshot);
        updateUsersRoleChart(usersSnapshot);
        updateMapsDifficultyChart(mapsSnapshot);

        // Load recent activity
        await loadRecentActivity();

        // Load top racers
        await loadTopRacers();

        dashboardLoaded = true;
        console.log("Dashboard stats loaded");

    } catch (error) {
        console.error("Error loading dashboard stats:", error);
    }
};



// Refresh dashboard
window.refreshDashboard = async () => {
    await loadDashboardStats();
    showMessage("Đã làm mới dashboard!");
};

// Load top racers
// ==========================================
// RACER STATS TAB - NEW IMPLEMENTATION
// ==========================================

window.racerStatsTab = {
    racers: [],
    selectedRacer: null,
    compareList: new Set(),
    charts: {},

    // Initialize: Fetch Data & Render
    async init() {
        try {
            const container = document.getElementById('racer-list-container');
            const skeleton = document.getElementById('racer-list-skeleton');
            const list = document.getElementById('racer-list');

            if (skeleton) skeleton.classList.remove('hidden');
            if (list) list.innerHTML = '';

            // Fetch Data from gameMaps collection
            const mapsSnapshot = await getDocs(collection(db, "gameMaps"));
            const racerMap = {};

            mapsSnapshot.forEach(doc => {
                const map = doc.data();
                const racerName = map.recordRacer;

                if (racerName && racerName.trim() !== '' && racerName !== 'N/A') {
                    if (!racerMap[racerName]) {
                        racerMap[racerName] = {
                            name: racerName,
                            avatar: map.racerAvatar || null, // If stored, else generated
                            records: 0,
                            maps: [],
                            cars: {},
                            pets: {},
                            bestTimeVal: Infinity,
                            bestTimeStr: null,
                            lastActive: map.timestamp ? new Date(map.timestamp) : new Date(0)
                        };
                    }

                    const stats = racerMap[racerName];
                    stats.records++;
                    stats.maps.push({
                        name: map.name,
                        time: map.recordTime,
                        car: map.recordCar,
                        pet: map.recordPet || 'N/A',
                        date: map.timestamp ? new Date(map.timestamp) : null
                    });

                    // Cars & Pets stats
                    const car = map.recordCar || 'Unknown';
                    stats.cars[car] = (stats.cars[car] || 0) + 1;

                    // Best time logic
                    const timeVal = window.parseRaceTime(map.recordTime);
                    if (timeVal < stats.bestTimeVal) {
                        stats.bestTimeVal = timeVal;
                        stats.bestTimeStr = map.recordTime;
                    }

                    // Last active
                    if (map.timestamp) {
                        const date = new Date(map.timestamp);
                        if (date > stats.lastActive) stats.lastActive = date;
                    }
                }
            });

            // Convert to array
            this.racers = Object.values(racerMap).sort((a, b) => b.records - a.records);

            // Assign Ranks
            this.racers.forEach((r, i) => r.rank = i + 1);

            // Render UI
            this.renderSummary();
            this.renderList();

            if (skeleton) skeleton.classList.add('hidden');

            // Select first racer if available
            if (this.racers.length > 0) {
                this.showDetail(this.racers[0].name);
            } else {
                this.showEmptyState();
            }

            this.populateCompareSelects();

        } catch (error) {
            console.error("Racer Stats Init Error:", error);
            showMessage("Lỗi tải dữ liệu thống kê!", true);
        }
    },

    // Render 4 Summary Cards
    renderSummary() {
        const totalRacers = this.racers.length;
        const totalRecords = this.racers.reduce((sum, r) => sum + r.records, 0);
        const mapSet = new Set();
        this.racers.forEach(r => r.maps.forEach(m => mapSet.add(m.name)));
        const totalMaps = mapSet.size;
        const topRacer = this.racers.length > 0 ? this.racers[0].name : '-';

        this.animateValue('racer-stats-total', totalRacers);
        this.animateValue('racer-stats-records', totalRecords);
        this.animateValue('racer-stats-maps', totalMaps);
        document.getElementById('racer-stats-top').textContent = topRacer;
    },

    // Animate Number helper
    animateValue(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = value; // Simple set for now, can add counting animation later
    },

    // Render Sidebar List
    renderList() {
        const container = document.getElementById('racer-list');
        const filter = document.getElementById('racer-search-input')?.value.toLowerCase() || '';

        container.innerHTML = this.racers
            .filter(r => r.name.toLowerCase().includes(filter))
            .map(r => {
                const isActive = this.selectedRacer && this.selectedRacer.name === r.name;
                const avatarColor = window.getAvatarColor(r.name);
                const initial = r.name.charAt(0).toUpperCase();

                return `
                <div onclick="window.racerStatsTab.showDetail('${r.name}')" 
                     class="p-3 rounded-lg cursor-pointer transition-all border border-transparent 
                            ${isActive ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md' : 'hover:bg-slate-800 border-white/5 bg-slate-900/40'}">
                    <div class="flex items-center gap-3">
                        <div class="relative">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm"
                                 style="background: ${avatarColor}">
                                ${initial}
                            </div>
                            <!-- Rank Badge -->
                            <div class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-[8px] font-bold ${r.rank <= 3 ? 'text-yellow-400' : 'text-slate-400'}">
                                ${r.rank}
                            </div>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-bold text-white truncate ${isActive ? 'text-cyan-400' : ''}">
                                ${r.name}
                            </div>
                            <div class="flex items-center gap-3 mt-1">
                                <div class="text-[10px] text-slate-400">
                                    <i class="fas fa-trophy text-[9px] mr-0.5 text-yellow-500/70"></i> ${r.records}
                                </div>
                                <div class="text-[10px] text-slate-400">
                                    <i class="fas fa-stopwatch text-[9px] mr-0.5 text-green-500/70"></i> ${r.bestTimeStr || '--'}
                                </div>
                            </div>
                        </div>
                        <i class="fas fa-chevron-right text-xs ${isActive ? 'text-cyan-400' : 'text-slate-700'}"></i>
                    </div>
                </div>
                `;
            }).join('');
    },

    // Filter List
    filterList() {
        this.renderList();
    },

    // Show Detail View
    showDetail(racerName) {
        const racer = this.racers.find(r => r.name === racerName);
        if (!racer) return;

        this.selectedRacer = racer;
        this.renderList(); // Re-render to highlight selection

        // Toggle Views
        document.getElementById('racer-detail-empty').classList.add('hidden');
        document.getElementById('racer-detail-content').classList.remove('hidden');

        // Hero Info
        const avatarEl = document.getElementById('racer-detail-avatar');
        avatarEl.style.background = window.getAvatarColor(racer.name);
        avatarEl.textContent = racer.name.charAt(0).toUpperCase();

        document.getElementById('racer-detail-name').textContent = racer.name;
        document.getElementById('racer-detail-rank-text').textContent = `Hạng #${racer.rank}`;
        document.getElementById('racer-detail-lastactive').textContent = racer.lastActive > new Date(0) ?
            racer.lastActive.toLocaleDateString('vi-VN') : 'N/A';

        // Stats Grid
        document.getElementById('racer-stat-records').textContent = racer.records;
        document.getElementById('racer-stat-best').textContent = racer.bestTimeStr || '--:--';

        // Calc Avg Time
        const totalSecs = racer.maps.reduce((acc, m) => acc + window.parseRaceTime(m.time), 0);
        const avgSecs = racer.maps.length ? totalSecs / racer.maps.length : 0;
        document.getElementById('racer-stat-avg').textContent = this.formatTime(avgSecs);

        document.getElementById('racer-stat-maps').textContent = racer.maps.length;

        // Populate Table
        const tableBody = document.getElementById('racer-best-times-table');
        document.getElementById('racer-maps-count').textContent = `${racer.maps.length} maps`;

        tableBody.innerHTML = racer.maps.map(m => `
            <tr class="hover:bg-cyan-500/5 transition-colors border-b border-white/5 last:border-0">
                <td class="px-4 py-3 text-white font-medium text-sm">${m.name}</td>
                <td class="px-4 py-3 text-cyan-400 font-mono text-sm font-bold">${m.time}</td>
                <td class="px-4 py-3">
                    <div class="text-xs text-slate-300"><i class="fas fa-car mr-1 text-slate-500"></i> ${m.car}</div>
                    <div class="text-xs text-slate-400 mt-0.5"><i class="fas fa-paw mr-1 text-slate-600"></i> ${m.pet}</div>
                </td>
                <td class="px-4 py-3 text-center text-xs text-slate-400">1</td>
            </tr>
        `).join('');

        // Render Charts
        this.renderCharts(racer);
    },

    showEmptyState() {
        document.getElementById('racer-detail-empty').classList.remove('hidden');
        document.getElementById('racer-detail-content').classList.add('hidden');
    },

    // Render Charts
    renderCharts(racer) {
        // Destroy old charts
        if (this.charts.progress) this.charts.progress.destroy();
        if (this.charts.map) this.charts.map.destroy();

        // 1. Progress Chart (Fake trend based on records order)
        const progressCtx = document.getElementById('racer-progress-chart').getContext('2d');
        const sortedMaps = [...racer.maps].sort((a, b) => (a.date || 0) - (b.date || 0));

        // Simple data reduction for chart
        const labels = sortedMaps.map((_, i) => `#${i + 1}`);
        const data = sortedMaps.map(m => window.parseRaceTime(m.time));

        this.charts.progress = new Chart(progressCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Thành tích (giây)',
                    data: data,
                    borderColor: '#06b6d4', // Cyan 500
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { display: false }
                }
            }
        });

        // 2. Map Car/Distribution Chart
        const mapCtx = document.getElementById('racer-map-chart').getContext('2d');

        // Use Cars distribution
        const carLabels = Object.keys(racer.cars);
        const carData = Object.values(racer.cars);

        this.charts.map = new Chart(mapCtx, {
            type: 'doughnut',
            data: {
                labels: carLabels,
                datasets: [{
                    data: carData,
                    backgroundColor: [
                        '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 } } }
                },
                cutout: '70%'
            }
        });
    },

    // Format Utils
    formatTime(seconds) {
        if (!seconds) return '--:--';
        const m = Math.floor(seconds / 60);
        const s = (seconds % 60).toFixed(2);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    },

    // Populate Compare Selects
    populateCompareSelects() {
        const options = `<option value="">-- Chọn tay đua --</option>` +
            this.racers.map(r => `<option value="${r.name}">${r.name}</option>`).join('');

        ['compare-racer-1', 'compare-racer-2', 'compare-racer-3', 'compare-racer-4'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = options;
        });
    },

    toggleCompare() {
        const container = document.getElementById('compare-section-container');
        if (container) container.classList.toggle('hidden');
    },

    runCompare() {
        // Collect selected racers
        const selectedNames = [];
        ['1', '2', '3', '4'].forEach(i => {
            const val = document.getElementById(`compare-racer-${i}`).value;
            if (val) selectedNames.push(val);
        });

        if (selectedNames.length < 2) {
            showMessage("Chọn ít nhất 2 tay đua để so sánh", true);
            return;
        }

        const racersToCompare = this.racers.filter(r => selectedNames.includes(r.name));
        this.renderCompareResults(racersToCompare);
    },

    renderCompareResults(racers) {
        const container = document.getElementById('compare-results');
        container.classList.remove('hidden');

        // Simple Table Comparison
        container.innerHTML = `
            <table class="w-full text-sm text-left">
                <thead>
                    <tr class="text-slate-500 border-b border-white/5">
                        <th class="p-2">Chỉ số</th>
                        ${racers.map(r => `<th class="p-2 text-white">${r.name}</th>`).join('')}
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                    <tr>
                        <td class="p-2 text-slate-400">Xếp hạng</td>
                        ${racers.map(r => `<td class="p-2 text-yellow-400 font-bold">#${r.rank}</td>`).join('')}
                    </tr>
                    <tr>
                        <td class="p-2 text-slate-400">Tổng Kỷ lục</td>
                        ${racers.map(r => `<td class="p-2 text-white">${r.records}</td>`).join('')}
                    </tr>
                    <tr>
                        <td class="p-2 text-slate-400">Thời gian tốt nhất</td>
                        ${racers.map(r => `<td class="p-2 text-cyan-400 font-mono">${r.bestTimeStr || '--'}</td>`).join('')}
                    </tr>
                     <tr>
                        <td class="p-2 text-slate-400">Số Map đã chạy</td>
                        ${racers.map(r => `<td class="p-2 text-purple-400">${r.maps.length}</td>`).join('')}
                    </tr>
                     <tr>
                        <td class="p-2 text-slate-400">Xe yêu thích</td>
                        ${racers.map(r => {
            // Find max car
            const bestCar = Object.entries(r.cars).sort((a, b) => b[1] - a[1])[0];
            return `<td class="p-2 text-slate-300">${bestCar ? bestCar[0] : '-'}</td>`;
        }).join('')}
                    </tr>
                </tbody>
            </table>
        `;
    }
};

// Global Exposure
window.refreshRacerStats = () => window.racerStatsTab.init();
window.filterRacerList = () => window.racerStatsTab.filterList();
window.toggleCompareSection = () => window.racerStatsTab.toggleCompare();
window.compareRacers = () => window.racerStatsTab.runCompare();
window.exportRacerPDF = () => showMessage("Tính năng đang phát triển", false);

// Helper function needed for avatar colors
window.getAvatarColor = (name) => {
    const colors = [
        'linear-gradient(135deg, #00f3ff, #0066ff)',
        'linear-gradient(135deg, #9d00ff, #ff0066)',
        'linear-gradient(135deg, #00ff9d, #00f3ff)',
        'linear-gradient(135deg, #ff0066, #9d00ff)',
        'linear-gradient(135deg, #0066ff, #00ff9d)',
        'linear-gradient(135deg, #ffa726, #ff0066)'
    ];
    if (!name || name === 'Unknown') return colors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
};

window.getDifficultyColorClass = (difficulty) => {
    const difficultyMap = {
        'Dễ': 'difficulty-easy',
        'Trung bình': 'difficulty-medium',
        'Khó': 'difficulty-hard',
        'Rất khó': 'difficulty-very-hard',
        'Cực khó': 'difficulty-extreme'
    };
    return difficultyMap[difficulty] || '';
};

// Parse race time (Helper reused)
window.parseRaceTime = (timeString) => {
    if (!timeString || timeString === "--'--'--" || timeString === "N/A") return Infinity;
    try {
        let cleanTime = timeString.trim();
        if (cleanTime.includes(':')) cleanTime = cleanTime.replace(/:/g, "'");
        const parts = cleanTime.split("'");
        if (parts.length >= 2) {
            const minutes = parseInt(parts[0]) || 0;
            const seconds = parseInt(parts[1]) || 0;
            const milliseconds = parts.length > 2 ? (parseInt(parts[2]) || 0) : 0;
            return minutes * 60 + seconds + milliseconds / 100;
        }
        return Infinity;
    } catch (error) {
        return Infinity;
    }
};

// Update cars rarity chart
const updateCarsRarityChart = (carsSnapshot) => {
    try {
        const chartElement = document.getElementById('cars-rarity-chart');
        if (!chartElement) return;

        if (carsRarityChart) {
            carsRarityChart.destroy();
            carsRarityChart = null;
        }

        const rarityCounts = {
            'Thần Thoại': 0,
            'Huyền Thoại': 0,
            'Hiếm': 0,
            'Thường': 0
        };

        carsSnapshot.forEach(doc => {
            const data = doc.data();
            const rarity = data.rarity || 'Thường';
            rarityCounts[rarity] = (rarityCounts[rarity] || 0) + 1;
        });

        const ctx = chartElement.getContext('2d');
        carsRarityChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(rarityCounts),
                datasets: [{
                    data: Object.values(rarityCounts),
                    backgroundColor: [
                        'rgba(157, 0, 255, 0.8)',
                        'rgba(255, 0, 102, 0.8)',
                        'rgba(0, 102, 255, 0.8)',
                        'rgba(100, 116, 139, 0.8)'
                    ],
                    borderWidth: 2,
                    borderColor: 'rgba(18, 18, 26, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e2e8f0',
                            font: { size: 12 }
                        }
                    }
                }
            }
        });

        // Update total count
        const totalEl = document.getElementById('cars-rarity-total');
        if (totalEl) {
            const total = Object.values(rarityCounts).reduce((a, b) => a + b, 0);
            totalEl.textContent = `${total} xe`;
        }

        chartElement.style.width = '100%';
        chartElement.style.height = '250px';

    } catch (error) {
        console.error("Error updating cars rarity chart:", error);
    }
};

// Update records month chart
const updateRecordsMonthChart = (recordsSnapshot) => {
    try {
        const chartElement = document.getElementById('records-month-chart');
        if (!chartElement) return;

        // Destroy existing chart if it exists
        if (recordsMonthChart) {
            recordsMonthChart.destroy();
            recordsMonthChart = null;
        }

        // Calculate monthly counts
        const monthlyCounts = {};
        recordsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.timestamp) {
                const date = new Date(data.timestamp);
                const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
                monthlyCounts[monthYear] = (monthlyCounts[monthYear] || 0) + 1;
            }
        });

        // Sort months chronologically
        const sortedMonths = Object.keys(monthlyCounts).sort((a, b) => {
            const [monthA, yearA] = a.split('/').map(Number);
            const [monthB, yearB] = b.split('/').map(Number);
            return new Date(yearA, monthA - 1) - new Date(yearB, monthB - 1);
        });

        const counts = sortedMonths.map(month => monthlyCounts[month]);
        const ctx = chartElement.getContext('2d');

        // Create new chart
        recordsMonthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedMonths,
                datasets: [{
                    label: 'Số kỷ lục',
                    data: counts,
                    borderColor: 'rgba(0, 243, 255, 0.8)',
                    backgroundColor: 'rgba(0, 243, 255, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: 'rgba(0, 243, 255, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8f0',
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(0, 243, 255, 0.3)',
                        borderWidth: 1,
                        cornerRadius: 6
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            maxRotation: 45,
                            font: {
                                size: 10
                            }
                        },
                        title: {
                            display: true,
                            text: 'Tháng/Năm',
                            color: '#94a3b8',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            stepSize: 1,
                            precision: 0,
                            font: {
                                size: 10
                            }
                        },
                        title: {
                            display: true,
                            text: 'Số kỷ lục',
                            color: '#94a3b8',
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        },
                        beginAtZero: true
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                animation: {
                    duration: 750,
                    easing: 'easeInOutQuart'
                }
            }
        });

        // Update total count
        const totalEl = document.getElementById('records-month-total');
        if (totalEl) {
            const total = Object.values(monthlyCounts).reduce((a, b) => a + b, 0);
            totalEl.textContent = `${total} kỷ lục`;
        }

        // Set chart dimensions
        chartElement.style.width = '100%';
        chartElement.style.height = '250px';

        // Add responsive behavior
        const resizeHandler = () => {
            if (recordsMonthChart) {
                recordsMonthChart.resize();
            }
        };

        // Remove existing listener if any, then add new one
        window.removeEventListener('resize', resizeHandler);
        window.addEventListener('resize', resizeHandler);

        console.log(`Biểu đồ tháng đã cập nhật: ${sortedMonths.length} tháng, ${counts.reduce((a, b) => a + b, 0)} kỷ lục`);

    } catch (error) {
        console.error("Lỗi khi cập nhật biểu đồ kỷ lục theo tháng:", error);

        // Show error message on chart container
        const chartElement = document.getElementById('records-month-chart');
        if (chartElement) {
            chartElement.innerHTML = `
                <div style="color: #f87171; text-align: center; padding: 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 24px; margin-bottom: 10px;"></i>
                    <p>Không thể tải biểu đồ</p>
                    <small>${error.message || 'Vui lòng thử lại'}</small>
                </div>
            `;
        }
    }
};

// Update users role chart
const updateUsersRoleChart = (usersSnapshot) => {
    try {
        const chartElement = document.getElementById('users-role-chart');
        if (!chartElement) return;

        if (usersRoleChart) {
            usersRoleChart.destroy();
            usersRoleChart = null;
        }

        const roleCounts = {
            'admin': 0,
            'racer': 0,
            'viewer': 0
        };

        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const role = data.role || 'viewer';
            roleCounts[role] = (roleCounts[role] || 0) + 1;
        });

        const ctx = chartElement.getContext('2d');
        usersRoleChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Quản trị viên', 'Tay đua', 'Người xem'],
                datasets: [{
                    data: [roleCounts.admin, roleCounts.racer, roleCounts.viewer],
                    backgroundColor: [
                        'rgba(157, 0, 255, 0.8)',
                        'rgba(0, 243, 255, 0.8)',
                        'rgba(100, 116, 139, 0.8)'
                    ],
                    borderWidth: 2,
                    borderColor: 'rgba(18, 18, 26, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e2e8f0',
                            font: { size: 12 }
                        }
                    }
                }
            }
        });

        // Update total count
        const totalEl = document.getElementById('users-role-total');
        if (totalEl) {
            const total = roleCounts.admin + roleCounts.racer + roleCounts.viewer;
            totalEl.textContent = `${total} người`;
        }

        chartElement.style.width = '100%';
        chartElement.style.height = '250px';

    } catch (error) {
        console.error("Error updating users role chart:", error);
    }
};

// Update maps difficulty chart
const updateMapsDifficultyChart = (mapsSnapshot) => {
    try {
        const chartElement = document.getElementById('maps-difficulty-chart');
        if (!chartElement) return;

        if (mapsDifficultyChart) {
            mapsDifficultyChart.destroy();
            mapsDifficultyChart = null;
        }

        const difficultyCounts = {
            'Dễ': 0,
            'Trung bình': 0,
            'Khó': 0,
            'Rất khó': 0,
            'Cực khó': 0
        };

        mapsSnapshot.forEach(doc => {
            const data = doc.data();
            const difficulty = data.difficulty || 'Trung bình';
            difficultyCounts[difficulty] = (difficultyCounts[difficulty] || 0) + 1;
        });

        const ctx = chartElement.getContext('2d');
        mapsDifficultyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(difficultyCounts),
                datasets: [{
                    label: 'Số lượng map',
                    data: Object.values(difficultyCounts),
                    backgroundColor: [
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(234, 179, 8, 0.8)',
                        'rgba(249, 115, 22, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(147, 51, 234, 0.8)'
                    ],
                    borderWidth: 2,
                    borderColor: 'rgba(18, 18, 26, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            maxRotation: 45
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            stepSize: 1
                        },
                        beginAtZero: true
                    }
                }
            }
        });

        // Update total count
        const totalEl = document.getElementById('maps-difficulty-total');
        if (totalEl) {
            const total = Object.values(difficultyCounts).reduce((a, b) => a + b, 0);
            totalEl.textContent = `${total} map`;
        }

        chartElement.style.width = '100%';
        chartElement.style.height = '250px';

    } catch (error) {
        console.error("Error updating maps difficulty chart:", error);
    }
};

// Load recent activity
window.loadRecentActivity = async (snapshot = null) => {
    try {
        const activityList = document.getElementById('recent-activity');
        if (!activityList) return;

        // Hiển thị loading
        activityList.innerHTML = `
                    <div class="text-center py-4">
                        <div class="loading-spinner mx-auto"></div>
                        <p class="mt-2 text-slate-500">Đang tải hoạt động...</p>
                    </div>
                `;

        let activityData = [];

        if (snapshot && typeof snapshot.forEach === 'function') {
            snapshot.forEach(doc => {
                activityData.push({ id: doc.id, ...doc.data() });
            });
        } else {
            try {
                const activityRef = collection(db, "activityLog");
                const q = query(activityRef, orderBy("timestamp", "desc"), limit(5));
                const querySnapshot = await getDocs(q);

                querySnapshot.forEach(doc => {
                    activityData.push({ id: doc.id, ...doc.data() });
                });
            } catch (queryError) {
                console.error("Error querying activityLog:", queryError);
            }
        }

        if (activityData.length === 0) {
            activityList.innerHTML = '<p class="text-center text-slate-500 py-4">Không có hoạt động gần đây</p>';
            return;
        }

        // Render activity items
        activityList.innerHTML = '';
        activityData.forEach(data => {
            const timeAgo = getTimeAgo(data.timestamp?.toDate() || new Date());
            const type = data.type || 'info';
            const action = data.action || 'Hoạt động';
            const userEmail = data.userEmail || 'System';

            const activityItem = document.createElement('div');
            activityItem.className = 'flex items-center justify-between p-3 hover:bg-slate-800/30 rounded-lg';
            activityItem.innerHTML = `
                        <div class="flex items-center">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center mr-3"
                                style="background: ${getActivityColor(type)}">
                                <i class="fas ${getActivityIcon(type)} text-xs"></i>
                            </div>
                            <div>
                                <p class="font-medium text-sm">${action}</p>
                                <p class="text-xs text-slate-400">${userEmail} • ${timeAgo}</p>
                            </div>
                        </div>
                        <span class="text-xs px-2 py-1 rounded" style="background: ${getActivityColor(type)}20; color: ${getActivityColor(type)}">
                            ${type}
                        </span>
                    `;
            activityList.appendChild(activityItem);
        });

    } catch (error) {
        console.error("Error loading activity:", error);
        const activityList = document.getElementById('recent-activity');
        if (activityList) {
            activityList.innerHTML = `
                        <div class="text-center py-4 text-red-500">
                            <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                            <p>Lỗi tải hoạt động: ${error.message}</p>
                        </div>
                    `;
        }
    }
};

// Get time ago
const getTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " năm trước";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " tháng trước";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " ngày trước";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " giờ trước";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " phút trước";
    return "vừa xong";
};

// Get activity color
const getActivityColor = (type) => {
    const colors = {
        'create': '#00f3ff',
        'update': '#9d00ff',
        'delete': '#ff0066',
        'user': '#00ff9d',
        'system': '#ffa726'
    };
    return colors[type] || '#00f3ff';
};

// Get activity icon
const getActivityIcon = (type) => {
    const icons = {
        'create': 'fa-plus',
        'update': 'fa-edit',
        'delete': 'fa-trash',
        'user': 'fa-user',
        'system': 'fa-cog'
    };
    return icons[type] || 'fa-info-circle';
};

// Log activity
const logActivity = async (type, action, details = {}) => {
    try {
        await addDoc(collection(db, "activityLog"), {
            type,
            action,
            userEmail: currentUser.email,
            userId: currentUser.uid,
            timestamp: serverTimestamp(),
            ...details
        });
    } catch (error) {
        console.error("Error logging activity:", error);
    }
};

// ============ CARS FILTER ============
window.filterCars = () => {
    const rarityFilter = document.getElementById('cars-filter-rarity');
    const typeFilter = document.getElementById('cars-filter-type');
    const searchInput = document.getElementById('cars-search');

    if (rarityFilter) carsFilters.rarity = rarityFilter.value;
    if (typeFilter) carsFilters.type = typeFilter.value;
    if (searchInput) carsFilters.search = searchInput.value.toLowerCase();

    filteredCars = allCars.filter(car => {
        // Filter by rarity
        if (carsFilters.rarity !== 'all' && car.rarity !== carsFilters.rarity) {
            return false;
        }

        // Filter by type
        if (carsFilters.type !== 'all' && car.type !== carsFilters.type) {
            return false;
        }

        // Filter by search
        if (carsFilters.search) {
            const searchTerm = carsFilters.search;
            const name = (car.name || '').toLowerCase();
            const type = (car.type || '').toLowerCase();

            if (!name.includes(searchTerm) && !type.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    renderFilteredCars(1);
};

const renderFilteredCars = (page) => {
    currentPage['gameCars'] = page;

    const totalItems = filteredCars.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredCars.slice(startIndex, endIndex);

    renderTable('gameCars', pageData);
    renderPagination('gameCars', totalItems, page);
};

window.resetCarsFilter = () => {
    const rarityFilter = document.getElementById('cars-filter-rarity');
    const typeFilter = document.getElementById('cars-filter-type');
    const searchInput = document.getElementById('cars-search');

    if (rarityFilter) rarityFilter.value = 'all';
    if (typeFilter) typeFilter.value = 'all';
    if (searchInput) searchInput.value = '';

    carsFilters = { rarity: 'all', type: 'all', search: '' };
    filteredCars = [...allCars];
    renderFilteredCars(1);
    showMessage("Đã reset bộ lọc xe");
};

// ============ MAPS FILTER ============
window.filterMaps = () => {
    const difficultyFilter = document.getElementById('maps-filter-difficulty');
    const searchInput = document.getElementById('maps-search');

    if (difficultyFilter) mapsFilters.difficulty = difficultyFilter.value;
    if (searchInput) mapsFilters.search = searchInput.value.toLowerCase();

    filteredMaps = allMaps.filter(map => {
        // Filter by difficulty
        if (mapsFilters.difficulty !== 'all' && map.difficulty !== mapsFilters.difficulty) {
            return false;
        }

        // Filter by search
        if (mapsFilters.search) {
            const searchTerm = mapsFilters.search;
            const name = (map.name || '').toLowerCase();
            const recordRacer = (map.recordRacer || '').toLowerCase();

            if (!name.includes(searchTerm) && !recordRacer.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    renderFilteredMaps(1);
};

const renderFilteredMaps = (page) => {
    currentPage['gameMaps'] = page;

    const totalItems = filteredMaps.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredMaps.slice(startIndex, endIndex);

    renderTable('gameMaps', pageData);
    renderPagination('gameMaps', totalItems, page);
};

window.resetMapsFilter = () => {
    const difficultyFilter = document.getElementById('maps-filter-difficulty');
    const searchInput = document.getElementById('maps-search');

    if (difficultyFilter) difficultyFilter.value = 'all';
    if (searchInput) searchInput.value = '';

    mapsFilters = { difficulty: 'all', search: '' };
    filteredMaps = [...allMaps];
    renderFilteredMaps(1);
    showMessage("Đã reset bộ lọc bản đồ");
};

// ============ PETS FILTER ============
window.filterPets = () => {
    const rarityFilter = document.getElementById('pets-filter-rarity');
    const typeFilter = document.getElementById('pets-filter-type');
    const searchInput = document.getElementById('pets-search');

    if (rarityFilter) petsFilters.rarity = rarityFilter.value;
    if (typeFilter) petsFilters.type = typeFilter.value;
    if (searchInput) petsFilters.search = searchInput.value.toLowerCase();

    filteredPets = allPets.filter(pet => {
        // Filter by rarity
        if (petsFilters.rarity !== 'all' && pet.rarity !== petsFilters.rarity) {
            return false;
        }

        // Filter by type
        if (petsFilters.type !== 'all' && pet.type !== petsFilters.type) {
            return false;
        }

        // Filter by search
        if (petsFilters.search) {
            const searchTerm = petsFilters.search;
            const name = (pet.name || '').toLowerCase();
            const type = (pet.type || '').toLowerCase();
            const skillName = (pet.skill?.name || '').toLowerCase();

            if (!name.includes(searchTerm) && !type.includes(searchTerm) && !skillName.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    renderFilteredPets(1);
};

const renderFilteredPets = (page) => {
    currentPage['gamePets'] = page;

    const totalItems = filteredPets.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredPets.slice(startIndex, endIndex);

    renderTable('gamePets', pageData);
    renderPagination('gamePets', totalItems, page);
};

window.resetPetsFilter = () => {
    const rarityFilter = document.getElementById('pets-filter-rarity');
    const typeFilter = document.getElementById('pets-filter-type');
    const searchInput = document.getElementById('pets-search');

    if (rarityFilter) rarityFilter.value = 'all';
    if (typeFilter) typeFilter.value = 'all';
    if (searchInput) searchInput.value = '';

    petsFilters = { rarity: 'all', type: 'all', search: '' };
    filteredPets = [...allPets];
    renderFilteredPets(1);
    showMessage("Đã reset bộ lọc pet");
};

// ============ USERS FILTER ============
window.filterUsers = () => {
    const roleFilter = document.getElementById('users-filter-role');
    const statusFilter = document.getElementById('users-filter-status');
    const adminFilter = document.getElementById('users-filter-admin');
    const newUserFilter = document.getElementById('users-filter-newuser');
    const searchInput = document.getElementById('users-search');

    if (roleFilter) usersFilters.role = roleFilter.value;
    if (statusFilter) usersFilters.status = statusFilter.value;
    if (adminFilter) usersFilters.isAdmin = adminFilter.value;
    if (newUserFilter) usersFilters.isNewUser = newUserFilter.value;
    if (searchInput) usersFilters.search = searchInput.value.toLowerCase();

    filteredUsers = allUsers.filter(user => {
        // Filter by role
        if (usersFilters.role !== 'all' && user.role !== usersFilters.role) {
            return false;
        }

        // Filter by status
        if (usersFilters.status !== 'all' && user.status !== usersFilters.status) {
            return false;
        }

        // Filter by admin status
        if (usersFilters.isAdmin !== 'all') {
            const isAdmin = user.isAdmin || false;
            if (usersFilters.isAdmin === 'true' && !isAdmin) return false;
            if (usersFilters.isAdmin === 'false' && isAdmin) return false;
        }

        // Filter by new user (người dùng mới - đăng ký trong 7 ngày)
        if (usersFilters.isNewUser !== 'all') {
            const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : 0;
            const now = new Date().getTime();
            const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
            const isNewUser = createdAt > sevenDaysAgo;

            if (usersFilters.isNewUser === 'true' && !isNewUser) return false;
            if (usersFilters.isNewUser === 'false' && isNewUser) return false;
        }

        // Filter by search
        if (usersFilters.search) {
            const searchTerm = usersFilters.search;
            const email = (user.email || '').toLowerCase();
            const displayName = (user.displayName || '').toLowerCase();
            const nickname = (user.nickname || '').toLowerCase();

            if (!email.includes(searchTerm) && !displayName.includes(searchTerm) && !nickname.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    renderFilteredUsers(1);
};

const renderFilteredUsers = (page) => {
    currentPage['users'] = page;

    const totalItems = filteredUsers.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredUsers.slice(startIndex, endIndex);

    renderTable('users', pageData);
    renderPagination('users', totalItems, page);
};

window.resetUsersFilter = () => {
    const roleFilter = document.getElementById('users-filter-role');
    const statusFilter = document.getElementById('users-filter-status');
    const adminFilter = document.getElementById('users-filter-admin');
    const newUserFilter = document.getElementById('users-filter-newuser');
    const searchInput = document.getElementById('users-search');

    if (roleFilter) roleFilter.value = 'all';
    if (statusFilter) statusFilter.value = 'all';
    if (adminFilter) adminFilter.value = 'all';
    if (newUserFilter) newUserFilter.value = 'all';
    if (searchInput) searchInput.value = '';

    usersFilters = { role: 'all', status: 'all', isAdmin: 'all', isNewUser: 'all', search: '' };
    filteredUsers = [...allUsers];
    renderFilteredUsers(1);
    showMessage("Đã reset bộ lọc người dùng");
};

// Populate dynamic filter options
const populateFilterOptions = async () => {
    try {
        // Populate car types
        const carTypes = [...new Set(allCars.map(car => car.type).filter(Boolean))];
        const carTypeFilter = document.getElementById('cars-filter-type');
        if (carTypeFilter) {
            carTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                carTypeFilter.appendChild(option);
            });
        }

        // Populate pet types
        const petTypes = [...new Set(allPets.map(pet => pet.type).filter(Boolean))];
        const petTypeFilter = document.getElementById('pets-filter-type');
        if (petTypeFilter) {
            petTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                petTypeFilter.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Error populating filter options:", error);
    }
};

// Load collection data
const loadCollectionData = async (collectionName, page = 1) => {
    try {
        currentPage[collectionName] = page;

        if (collectionName === 'raceRecords') {
            await loadRecordsData(page);
        } else if (collectionName === 'users') {
            await loadUsersData(page);
        } else {
            const querySnapshot = await getDocs(collection(db, collectionName));
            const allData = [];

            querySnapshot.forEach((doc) => {
                allData.push({ id: doc.id, ...doc.data() });
            });

            // Store in appropriate global array
            if (collectionName === 'gameCars') {
                allCars = [...allData];
                filteredCars = [...allData];

                // Populate filter options after loading
                await populateFilterOptions();

                renderFilteredCars(page);
            } else if (collectionName === 'gameMaps') {
                allMaps = [...allData];
                filteredMaps = [...allData];
                renderFilteredMaps(page);
            } else if (collectionName === 'gamePets') {
                allPets = [...allData];
                filteredPets = [...allData];

                // Populate filter options after loading
                await populateFilterOptions();

                renderFilteredPets(page);
            } else {
                const totalItems = allData.length;
                const totalPages = Math.ceil(totalItems / itemsPerPage);
                const startIndex = (page - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const pageData = allData.slice(startIndex, endIndex);

                renderTable(collectionName, pageData);
                renderPagination(collectionName, totalItems, page);
            }
        }
    } catch (error) {
        console.error(`Error loading ${collectionName}:`, error);
        showMessage(`Lỗi tải dữ liệu ${collectionName}!`, true);
    }
};

// Render table
const renderTable = (collectionName, data) => {
    const collectionToTabMap = {
        'gameCars': 'cars',
        'gameMaps': 'maps',
        'gamePets': 'pets',
        'raceRecords': 'records',
        'users': 'users'
    };

    const tabName = collectionToTabMap[collectionName];
    if (!tabName) return;

    const tableBody = document.getElementById(`${tabName}-table-body`);
    if (!tableBody) return;

    tableBody.innerHTML = '';

    // Empty state với UI đẹp
    if (data.length === 0) {
        const colSpan = collectionName === 'raceRecords' ? 9 :
            collectionName === 'users' ? 8 :
                collectionName === 'gameMaps' ? 7 : 6;

        const emptyIcons = {
            'gameCars': 'fa-car',
            'gameMaps': 'fa-map',
            'gamePets': 'fa-paw',
            'raceRecords': 'fa-trophy',
            'users': 'fa-users'
        };

        const emptyTitles = {
            'gameCars': 'Chưa có xe nào',
            'gameMaps': 'Chưa có bản đồ nào',
            'gamePets': 'Chưa có pet nào',
            'raceRecords': 'Chưa có kỷ lục nào',
            'users': 'Chưa có người dùng nào'
        };

        const emptyDescriptions = {
            'gameCars': 'Bắt đầu bằng cách thêm xe đầu tiên vào bộ sưu tập',
            'gameMaps': 'Thêm bản đồ đua để bắt đầu ghi nhận kỷ lục',
            'gamePets': 'Thêm pet để tăng sức mạnh cho tay đua',
            'raceRecords': 'Các kỷ lục sẽ xuất hiện khi có dữ liệu đua',
            'users': 'Người dùng sẽ xuất hiện khi đăng nhập vào hệ thống'
        };

        tableBody.innerHTML = `
            <tr>
                <td colspan="${colSpan}">
                    <div class="empty-state">
                        <i class="fas ${emptyIcons[collectionName]} empty-state-icon"></i>
                        <h3 class="empty-state-title">${emptyTitles[collectionName]}</h3>
                        <p class="empty-state-description">${emptyDescriptions[collectionName]}</p>
                        ${collectionName !== 'users' && collectionName !== 'raceRecords' ? `
                            <button onclick="openAddModal('${collectionName}')" class="empty-state-btn">
                                <i class="fas fa-plus"></i>Thêm mới
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    data.forEach((item, index) => {
        const row = document.createElement('tr');
        const globalIndex = (currentPage[collectionName] - 1) * itemsPerPage + index + 1;

        switch (collectionName) {
            case 'gameCars':
                const carImage = item.imageUrl || 'https://via.placeholder.com/60x40/1a1a2e/00f3ff?text=Car';
                row.innerHTML = `
        <td>
            <div class="map-image-cell">
                <img src="${carImage}" 
                     alt="${item.name || 'Xe'}" 
                     class="map-thumbnail"
                     onclick="viewMapImage('${carImage}', '${item.name || 'Xe'}')"
                     onerror="this.src='https://via.placeholder.com/60x40/1a1a2e/00f3ff?text=Car'">
                <div>
                    <div class="map-name-with-image">${item.name || 'N/A'}</div>
                    <div class="text-xs text-slate-400 mt-1">${item.type || 'N/A'}</div>
                </div>
            </div>
        </td>
        <td><span class="rarity-badge ${getRarityClass(item.rarity)}">${item.rarity || 'N/A'}</span></td>
        <td>${item.speed || 'N/A'}</td>
        <td>${item.acceleration || 'N/A'}</td>
        <td>
            <div class="action-buttons">
                <button onclick="editItem('${collectionName}', '${item.id}')" class="btn-edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteItem('${collectionName}', '${item.id}', '${item.name}')" class="btn-delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    `;
                break;

            case 'gameMaps':
                const mapImage = item.imageUrl || 'https://via.placeholder.com/60x40/1a1a2e/00f3ff?text=Map';
                row.innerHTML = `
                            <td>
                                <div class="map-image-cell">
                                    <img src="${mapImage}" 
                                         alt="${item.name || 'Bản đồ'}" 
                                         class="map-thumbnail"
                                         onclick="viewMapImage('${mapImage}', '${item.name || 'Bản đồ'}')"
                                         onerror="this.src='https://via.placeholder.com/60x40/1a1a2e/00f3ff?text=Map'">
                                    <div>
                                        <div class="map-name-with-image">${item.name || 'N/A'}</div>
                                        <div class="text-xs text-slate-400 mt-1">${item.difficulty || 'N/A'}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <span class="difficulty-badge ${getDifficultyColorClass(item.difficulty)}">
                                    ${item.difficulty || 'N/A'}
                                </span>
                            </td>
                            <td class="font-mono">${item.recordTime || '--\'--\'--'}</td>
                            <td>${item.recordRacer || 'N/A'}</td>
                            <td>${item.recordCar || 'N/A'}</td>
                            <td>${item.recordPet || 'N/A'}</td>
                            <td>
                                <div class="action-buttons">
                                    <button onclick="editItem('${collectionName}', '${item.id}')" class="btn-edit">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="deleteItem('${collectionName}', '${item.id}', '${item.name}')" class="btn-delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        `;
                break;

            case 'gamePets':
                const petImage = item.imageUrl || 'https://via.placeholder.com/60x40/1a1a2e/00f3ff?text=Pet';
                row.innerHTML = `
        <td>
            <div class="map-image-cell">
                <img src="${petImage}" 
                     alt="${item.name || 'Pet'}" 
                     class="map-thumbnail"
                     onclick="viewMapImage('${petImage}', '${item.name || 'Pet'}')"
                     onerror="this.src='https://via.placeholder.com/60x40/1a1a2e/00f3ff?text=Pet'">
                <div>
                    <div class="map-name-with-image">${item.name || 'N/A'}</div>
                    <div class="text-xs text-slate-400 mt-1">${item.skill?.name || 'N/A'}</div>
                </div>
            </div>
        </td>
        <td>${item.type || 'N/A'}</td>
        <td><span class="rarity-badge ${getRarityClass(item.rarity)}">${item.rarity || 'N/A'}</span></td>
        <td>
            <div class="action-buttons">
                <button onclick="editItem('${collectionName}', '${item.id}')" class="btn-edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteItem('${collectionName}', '${item.id}', '${item.name}')" class="btn-delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    `;
                break;

            case 'raceRecords':
                const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString('vi-VN') : 'N/A';

                // THAY ĐỔI: Escape chuỗi name an toàn hơn
                const deleteItemName = `${item.mapName || 'N/A'} - ${item.timeString || 'N/A'}`;
                const safeDeleteName = deleteItemName.replace(/'/g, "\\'").replace(/"/g, '\\"');

                // Check if this record is selected
                const isChecked = selectedRecords.has(item.id) ? 'checked' : '';

                row.innerHTML = `
        <td>
            <input type="checkbox" class="bulk-checkbox record-checkbox" 
                   data-id="${item.id}" ${isChecked}
                   onchange="toggleRecordSelection('${item.id}')">
        </td>
        <td class="font-semibold">${globalIndex}</td>
        <td>${item.mapName || 'N/A'}</td>
        <td>${item.racerName || 'N/A'}</td>
        <td class="font-mono font-bold ${globalIndex <= 3 ? 'text-yellow-400' : ''}">${item.timeString || 'N/A'}</td>
        <td>${item.car || 'N/A'}</td>
        <td class="text-sm">${date}</td>
        <td>
            <div class="action-buttons">
                <button onclick="editItem('${collectionName}', '${item.id}')" class="btn-edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteItem('${collectionName}', '${item.id}', \`${safeDeleteName}\`)" class="btn-delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    `;
                break;

            case 'users':
                const userId = item.uid || item.id || 'N/A';
                const userEmail = item.email || 'N/A';
                const userName = item.displayName || 'N/A';
                const userNickname = item.nickname || 'N/A';
                const userRole = item.role || 'viewer';
                const isAdminValue = item.isAdmin || false;
                const userStatus = item.status || 'active';
                // Ưu tiên photoBase64 (ảnh mới nhất), nếu không có thì dùng photoURL
                const avatarSrc = item.photoBase64 || item.photoURL || '';

                const safeUserId = String(userId).replace(/'/g, "\\'");
                const safeUserEmail = String(userEmail).replace(/'/g, "\\'");

                // Get first letter for placeholder
                const firstLetter = userName !== 'N/A' ? userName.charAt(0).toUpperCase() :
                    (userEmail !== 'N/A' ? userEmail.charAt(0).toUpperCase() : '?');

                row.innerHTML = `
        <td>
            <div class="user-avatar-cell">
                ${avatarSrc ?
                        `<img src="${avatarSrc}" alt="${userName}" class="user-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                     <div class="user-avatar-placeholder" style="display: none;">${firstLetter}</div>` :
                        `<div class="user-avatar-placeholder">${firstLetter}</div>`
                    }
            </div>
        </td>
        <td>${userEmail}</td>
        <td>${userName}</td>
        <td>${userNickname}</td>
        <td>
            <span class="px-2 py-1 rounded text-xs ${userRole === 'admin' ? 'bg-purple-500/20 text-purple-400' :
                        userRole === 'racer' ? 'bg-cyan-500/20 text-cyan-400' :
                            'bg-slate-500/20 text-slate-400'
                    }">
                ${userRole === 'admin' ? 'Quản trị viên' :
                        userRole === 'racer' ? 'Tay đua' : 'Người xem'}
            </span>
        </td>
        <td>
            <span class="px-2 py-1 rounded text-xs ${isAdminValue ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'
                    }">
                ${isAdminValue ? 'Có' : 'Không'}
            </span>
        </td>
        <td>
            <span class="px-2 py-1 rounded text-xs ${userStatus === 'active' ? 'bg-green-500/20 text-green-400' :
                        userStatus === 'banned' ? 'bg-red-500/20 text-red-400' :
                            'bg-orange-500/20 text-orange-400'
                    }">
                ${userStatus === 'active' ? 'Hoạt động' :
                        userStatus === 'banned' ? 'Bị cấm' : 'Không hoạt động'}
            </span>
        </td>
        <td>
            <div class="action-buttons">
                <button onclick="editUser('${safeUserId}')" class="btn-edit" title="Chỉnh sửa người dùng">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteUser('${safeUserId}', '${safeUserEmail}')" class="btn-delete" title="Xóa người dùng">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </td>
    `;
                break;
        }

        tableBody.appendChild(row);
    });
};

// Get rarity class
const getRarityClass = (rarity) => {
    const classes = {
        'Thần Thoại': 'rarity-mythical',
        'Huyền Thoại': 'rarity-legendary',
        'Hiếm': 'rarity-rare',
        'Thường': 'rarity-common'
    };
    return classes[rarity] || 'rarity-common';
};

// Get difficulty class
const getDifficultyClass = (difficulty) => {
    const classes = {
        'Dễ': 'difficulty-easy',
        'Trung bình': 'difficulty-medium',
        'Khó': 'difficulty-hard',
        'Rất khó': 'difficulty-very-hard',
        'Cực khó': 'difficulty-extreme'
    };
    return classes[difficulty] || '';
};

// Render pagination
const renderPagination = (collectionName, totalItems, currentPageNum) => {
    const collectionToTabMap = {
        'gameCars': 'cars',
        'gameMaps': 'maps',
        'gamePets': 'pets',
        'raceRecords': 'records',
        'users': 'users'
    };

    const tabName = collectionToTabMap[collectionName];
    if (!tabName) return;

    const paginationDiv = document.getElementById(`${tabName}-pagination`);
    if (!paginationDiv) return;

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }

    let paginationHTML = '';

    // Previous button
    paginationHTML += `
                <button onclick="changePage('${tabName}', ${currentPageNum - 1})" 
                        class="page-button ${currentPageNum === 1 ? 'disabled' : ''}"
                        ${currentPageNum === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
            `;

    // Page numbers
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPageNum - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
                    <button onclick="changePage('${tabName}', ${i})" 
                            class="page-button ${i === currentPageNum ? 'active' : ''}">
                        ${i}
                    </button>
                `;
    }

    // Next button
    paginationHTML += `
                <button onclick="changePage('${tabName}', ${currentPageNum + 1})" 
                        class="page-button ${currentPageNum === totalPages ? 'disabled' : ''}"
                        ${currentPageNum === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            `;

    // Page info
    paginationHTML += `
                <span class="text-slate-400 ml-4">
                    Trang ${currentPageNum} / ${totalPages} (${totalItems} mục)
                </span>
            `;

    paginationDiv.innerHTML = paginationHTML;
};

// Change page
window.changePage = (tabName, page) => {
    const tabToCollectionMap = {
        'cars': 'gameCars',
        'maps': 'gameMaps',
        'pets': 'gamePets',
        'records': 'raceRecords',
        'users': 'users'
    };

    const collectionName = tabToCollectionMap[tabName];
    if (!collectionName) return;

    if (collectionName === 'raceRecords') {
        filterRecords(page);
    } else if (collectionName === 'users') {
        renderFilteredUsers(page);
    } else if (collectionName === 'gameCars') {
        renderFilteredCars(page);
    } else if (collectionName === 'gameMaps') {
        renderFilteredMaps(page);
    } else if (collectionName === 'gamePets') {
        renderFilteredPets(page);
    } else {
        loadCollectionData(collectionName, page);
    }
};

// Switch tabs
window.switchTab = async (tab) => {
    currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });

    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        const onclickAttr = button.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${tab}'`)) {
            button.classList.add('active');
        }
    });

    // Hide all tab contents
    document.querySelectorAll('.tab-pane').forEach(content => {
        content.classList.add('hidden');
    });

    // Show current tab content
    const tabElement = document.getElementById(`${tab}-tab`);
    if (tabElement) {
        tabElement.classList.remove('hidden');
    }

    // Load data for the tab
    if (tab === 'dashboard') {
        await loadDashboardStats();
    } else if (tab === 'records') {
        if (allRecords.length === 0) {
            await loadRecordsData(1);
        } else {
            populateRecordsMapFilter();
            filterRecordsNew();
        }

        // THÊM: Load maps nếu chưa có
        if (allMaps.length === 0) {
            try {
                const mapsSnapshot = await getDocs(collection(db, "gameMaps"));
                allMaps = mapsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (error) {
                console.error("Error loading maps:", error);
            }
        }
    } else if (tab === 'users') {
        if (allUsers.length === 0) {
            await loadUsersData(1);
        } else {
            await loadUsersData(currentPage['users']);
        }
    } else if (tab === 'notifications') {
        if (allNotifications.length === 0) {
            await loadNotifications();
        } else {
            renderNotifications();
        }
    } else if (tab === 'racer-stats') {
        if (window.racerStatsTab) {
            await window.racerStatsTab.init();
        }
    } else {
        const collections = {
            'cars': 'gameCars',
            'maps': 'gameMaps',
            'pets': 'gamePets'
        };
        const collectionName = collections[tab];
        if (collectionName) {
            await loadCollectionData(collectionName, currentPage[collectionName] || 1);
        }
    }
};

// Load maps for filter
const loadMapsForFilter = async () => {
    try {
        const mapsSnapshot = await getDocs(collection(db, "gameMaps"));
        const mapFilter = document.getElementById('map-filter');

        mapFilter.innerHTML = '<option value="all">Tất cả bản đồ</option>';

        allMaps = [];
        mapsSnapshot.forEach(doc => {
            const mapData = { id: doc.id, ...doc.data() };
            allMaps.push(mapData);
        });

        // Sắp xếp bản đồ theo tên
        allMaps.sort((a, b) => a.name.localeCompare(b.name));

        // Thêm option "Top 10" cho mỗi map
        allMaps.forEach(map => {
            const option = document.createElement('option');
            option.value = `top10_${map.id}`;
            option.textContent = `🏆 ${map.name} - Top 10`;
            option.style.color = '#00f3ff';
            option.style.fontWeight = 'bold';
            option.style.backgroundColor = '#12121a';
            mapFilter.appendChild(option);
        });

        console.log("Loaded maps for filter:", allMaps.length, "maps");

    } catch (error) {
        console.error("Error loading maps for filter:", error);
    }
};

// ============ RECORDS FILTER - MỚI ============
window.filterRecordsNew = () => {
    const mapFilter = document.getElementById('records-filter-map');
    const racerInput = document.getElementById('records-filter-racer');
    const carInput = document.getElementById('records-filter-car');
    const timeFilter = document.getElementById('records-filter-time');
    const sortSelect = document.getElementById('records-sort');

    if (mapFilter) recordsFilters.map = mapFilter.value;
    if (racerInput) recordsFilters.racer = racerInput.value.toLowerCase();
    if (carInput) recordsFilters.car = carInput.value.toLowerCase();
    if (timeFilter) recordsFilters.time = timeFilter.value;
    if (sortSelect) recordsFilters.sort = sortSelect.value;

    filteredRecords = allRecords.filter(record => {
        // Filter by map
        if (recordsFilters.map !== 'all' && record.mapName !== recordsFilters.map) {
            return false;
        }

        // Filter by racer name
        if (recordsFilters.racer) {
            const racerName = (record.racerName || '').toLowerCase();
            if (!racerName.includes(recordsFilters.racer)) {
                return false;
            }
        }

        // Filter by car
        if (recordsFilters.car) {
            const carName = (record.car || '').toLowerCase();
            if (!carName.includes(recordsFilters.car)) {
                return false;
            }
        }

        // Filter by time range
        if (recordsFilters.time !== 'all') {
            const timeInSeconds = record.timeInSeconds || 0;
            switch (recordsFilters.time) {
                case 'under_60':
                    if (timeInSeconds >= 60) return false;
                    break;
                case '60_to_90':
                    if (timeInSeconds < 60 || timeInSeconds >= 90) return false;
                    break;
                case '90_to_120':
                    if (timeInSeconds < 90 || timeInSeconds >= 120) return false;
                    break;
                case 'over_120':
                    if (timeInSeconds < 120) return false;
                    break;
            }
        }

        return true;
    });

    // Apply sorting
    switch (recordsFilters.sort) {
        case 'time_asc':
            filteredRecords.sort((a, b) => (a.timeInSeconds || 0) - (b.timeInSeconds || 0));
            break;
        case 'time_desc':
            filteredRecords.sort((a, b) => (b.timeInSeconds || 0) - (a.timeInSeconds || 0));
            break;
        case 'date_new':
            filteredRecords.sort((a, b) => {
                const dateA = new Date(a.timestamp || 0);
                const dateB = new Date(b.timestamp || 0);
                return dateB - dateA;
            });
            break;
        case 'date_old':
            filteredRecords.sort((a, b) => {
                const dateA = new Date(a.timestamp || 0);
                const dateB = new Date(b.timestamp || 0);
                return dateA - dateB;
            });
            break;
        case 'map_name':
            filteredRecords.sort((a, b) => (a.mapName || '').localeCompare(b.mapName || ''));
            break;
        case 'racer_name':
            filteredRecords.sort((a, b) => (a.racerName || '').localeCompare(b.racerName || ''));
            break;
    }

    updateRecordsFilterDisplay();
    renderFilteredRecords(1);
};

// Update filter display
const updateRecordsFilterDisplay = () => {
    const resultEl = document.getElementById('records-filter-result');
    const countEl = document.getElementById('records-count-display');

    if (!resultEl || !countEl) return;

    let filterText = 'Hiển thị: ';
    const activeFilters = [];

    if (recordsFilters.map !== 'all') {
        activeFilters.push(`Map: ${recordsFilters.map}`);
    }
    if (recordsFilters.racer) {
        activeFilters.push(`Racer: "${recordsFilters.racer}"`);
    }
    if (recordsFilters.car) {
        activeFilters.push(`Xe: "${recordsFilters.car}"`);
    }
    if (recordsFilters.time !== 'all') {
        const timeLabels = {
            'under_60': 'Dưới 1 phút',
            '60_to_90': '1-1.5 phút',
            '90_to_120': '1.5-2 phút',
            'over_120': 'Trên 2 phút'
        };
        activeFilters.push(timeLabels[recordsFilters.time]);
    }

    if (activeFilters.length > 0) {
        filterText += activeFilters.join(' • ');
    } else {
        filterText = 'Hiển thị tất cả kỉ lục';
    }

    resultEl.textContent = filterText;
    countEl.textContent = `${filteredRecords.length} kỉ lục`;
};

// Render filtered records
const renderFilteredRecords = (page) => {
    currentPage['raceRecords'] = page;

    const totalItems = filteredRecords.length;
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredRecords.slice(startIndex, endIndex);

    renderTable('raceRecords', pageData);
    renderPagination('raceRecords', totalItems, page);
};

// Reset records filter
window.resetRecordsFilter = () => {
    const mapFilter = document.getElementById('records-filter-map');
    const racerInput = document.getElementById('records-filter-racer');
    const carInput = document.getElementById('records-filter-car');
    const timeFilter = document.getElementById('records-filter-time');
    const sortSelect = document.getElementById('records-sort');

    if (mapFilter) mapFilter.value = 'all';
    if (racerInput) racerInput.value = '';
    if (carInput) carInput.value = '';
    if (timeFilter) timeFilter.value = 'all';
    if (sortSelect) sortSelect.value = 'time_asc';

    recordsFilters = {
        map: 'all',
        racer: '',
        car: '',
        time: 'all',
        sort: 'time_asc'
    };

    filteredRecords = [...allRecords];
    filterRecordsNew();
    showMessage("Đã reset bộ lọc kỉ lục");
};

// Toggle Top 10 view
window.toggleTop10View = () => {
    const top10Section = document.getElementById('top10-by-map');
    const allRecordsSection = document.getElementById('all-records-table');
    const toggleBtn = document.getElementById('top10-toggle-text');

    if (top10Section.classList.contains('hidden')) {
        // Show top 10 for current filtered map
        if (recordsFilters.map !== 'all') {
            showTop10ForCurrentMap();
        } else {
            showMessage("Vui lòng chọn một bản đồ cụ thể để xem Top 10", true);
        }
    } else {
        // Hide top 10, show all records
        top10Section.classList.add('hidden');
        allRecordsSection.classList.remove('hidden');
        if (toggleBtn) toggleBtn.textContent = 'Xem Top 10';
    }
};

const showTop10ForCurrentMap = async () => {
    if (recordsFilters.map === 'all') {
        showMessage("Vui lòng chọn một bản đồ cụ thể!", true);
        return;
    }

    const top10Section = document.getElementById('top10-by-map');
    const allRecordsSection = document.getElementById('all-records-table');
    const toggleBtn = document.getElementById('top10-toggle-text');
    const tableBody = document.getElementById('top10-table-body');

    // Hiển thị loading ngay lập tức
    allRecordsSection.classList.add('hidden');
    top10Section.classList.remove('hidden');
    if (toggleBtn) toggleBtn.textContent = 'Quay lại danh sách';

    tableBody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center py-8">
                <div class="loading-spinner mx-auto mb-4"></div>
                <p class="text-slate-500">Đang tải top 10...</p>
            </td>
        </tr>
    `;

    try {
        // THÊM: Đảm bảo allMaps đã được load
        if (allMaps.length === 0) {
            const mapsSnapshot = await getDocs(collection(db, "gameMaps"));
            allMaps = mapsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        const selectedMap = allMaps.find(map => map.name === recordsFilters.map);

        if (!selectedMap) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-8 text-red-500">
                        <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
                        <p class="text-lg">Không tìm thấy bản đồ!</p>
                    </td>
                </tr>
            `;
            return;
        }

        document.getElementById('top10-map-title').innerHTML =
            `<i class="fas fa-trophy mr-2 text-yellow-400"></i>Top 10 Kỉ lục - ${selectedMap.name}`;

        // Sử dụng setTimeout để UI có thể render trước
        setTimeout(() => {
            const mapRecords = allRecords
                .filter(record => record.mapName === selectedMap.name)
                .sort((a, b) => a.timeInSeconds - b.timeInSeconds)
                .slice(0, 10);

            if (mapRecords.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center py-8 text-slate-500">
                            <i class="fas fa-clock text-3xl mb-3"></i>
                            <p class="text-lg">Chưa có kỉ lục nào cho bản đồ này</p>
                        </td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = '';
            mapRecords.forEach((record, index) => {
                const row = document.createElement('tr');
                const rank = index + 1;
                const date = record.timestamp ? new Date(record.timestamp).toLocaleDateString('vi-VN') : 'N/A';

                let rankClass = '';
                let rankIcon = '';

                if (rank === 1) {
                    rankClass = 'top-1';
                    rankIcon = '🥇';
                } else if (rank === 2) {
                    rankClass = 'top-2';
                    rankIcon = '🥈';
                } else if (rank === 3) {
                    rankClass = 'top-3';
                    rankIcon = '🥉';
                } else {
                    rankIcon = `#${rank}`;
                }

                row.className = rankClass;
                row.innerHTML = `
                    <td class="text-center">
                        <div class="text-xl font-bold">${rankIcon}</div>
                    </td>
                    <td class="font-semibold">${record.racerName || 'N/A'}</td>
                    <td class="font-mono font-bold text-lg ${rank <= 3 ? 'text-yellow-400' : 'text-cyan-400'}">
                        ${record.timeString || 'N/A'}
                    </td>
                    <td>${record.car || 'N/A'}</td>
                    <td>${record.pet || 'N/A'}</td>
                    <td class="text-sm text-slate-400">${date}</td>
                    <td>
                        <div class="action-buttons">
                            <button onclick="editItem('raceRecords', '${record.id}')" class="btn-edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="deleteItem('raceRecords', '${record.id}', \`${record.mapName}\`)" class="btn-delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        }, 0);

    } catch (error) {
        console.error("Error loading top 10:", error);
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-8 text-red-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
                    <p class="text-lg">Có lỗi xảy ra khi tải dữ liệu</p>
                    <p class="text-sm mt-2">${error.message}</p>
                </td>
            </tr>
        `;
    }
};
// Populate map filter options
const populateRecordsMapFilter = () => {
    const mapFilter = document.getElementById('records-filter-map');
    if (!mapFilter) return;

    // Clear existing options except "all"
    mapFilter.innerHTML = '<option value="all">🗺️ Tất cả bản đồ</option>';

    // Get unique map names from records
    const mapNames = [...new Set(allRecords.map(r => r.mapName).filter(Boolean))];
    mapNames.sort((a, b) => a.localeCompare(b));

    mapNames.forEach(mapName => {
        const option = document.createElement('option');
        option.value = mapName;
        option.textContent = mapName;
        mapFilter.appendChild(option);
    });
};

// Close top 10 view
window.closeTop10View = () => {
    isTop10View = false;
    document.getElementById('top10-by-map').classList.add('hidden');
    document.getElementById('all-records-table').classList.remove('hidden');
    document.getElementById('map-filter').value = 'all';
    currentMapFilter = 'all';
    filterRecords(1);
};

// Sort records by map
window.sortRecordsByMap = () => {
    filteredRecords.sort((a, b) => {
        const mapA = a.mapName || '';
        const mapB = b.mapName || '';
        return mapA.localeCompare(mapB);
    });

    filterRecords(currentPage['raceRecords']);
    showMessage("Đã sắp xếp theo tên bản đồ");
};

// Load records data
const loadRecordsData = async (page = 1) => {
    try {
        currentPage['raceRecords'] = page;

        const recordsQuery = query(collection(db, "raceRecords"), orderBy("timeInSeconds", "asc"));
        const querySnapshot = await getDocs(recordsQuery);
        allRecords = [];

        querySnapshot.forEach((doc) => {
            allRecords.push({ id: doc.id, ...doc.data() });
        });

        // Tự động xóa kỷ lục không hợp lệ (thời gian > 180 giây)
        await cleanupInvalidRecords();

        // Populate map filter dropdown
        populateRecordsMapFilter();

        // Apply filter
        filteredRecords = [...allRecords];
        filterRecordsNew();

    } catch (error) {
        console.error("Error loading records:", error);
        showMessage("Lỗi tải dữ liệu kỉ lục!", true);
    }
};

// Hàm xóa kỷ lục không hợp lệ (thời gian > 180 giây)
const cleanupInvalidRecords = async () => {
    try {
        const batch = writeBatch(db);
        let deletedCount = 0;

        allRecords.forEach((record) => {
            if (record.timeInSeconds > 180) {
                batch.delete(doc(db, "raceRecords", record.id));
                deletedCount++;
                console.log(`🗑️ Tự động xóa kỷ lục không hợp lệ: ${record.mapName} - ${record.racerName} (${record.timeInSeconds}s)`);
            }
        });

        if (deletedCount > 0) {
            await batch.commit();
            // Cập nhật lại mảng allRecords
            allRecords = allRecords.filter(record => record.timeInSeconds <= 180);
            console.log(`✅ Đã xóa ${deletedCount} kỷ lục vượt quá 3 phút`);
        }
    } catch (error) {
        console.error("Error cleaning up invalid records:", error);
    }
};

// Filter records
const filterRecords = (page = 1) => {
    currentPage['raceRecords'] = page;

    if (currentMapFilter !== 'all' && !isTop10View) {
        const selectedMap = allMaps.find(map => map.id === currentMapFilter);
        if (selectedMap) {
            filteredRecords = allRecords.filter(record => record.mapName === selectedMap.name);
        } else {
            filteredRecords = [...allRecords];
        }
    } else {
        filteredRecords = [...allRecords];
    }

    filteredRecords.sort((a, b) => a.timeInSeconds - b.timeInSeconds);

    const totalItems = filteredRecords.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = filteredRecords.slice(startIndex, endIndex);

    renderTable('raceRecords', pageData);
    renderPagination('raceRecords', totalItems, page);
};

// Delete all records
window.deleteAllRecords = async () => {
    if (!confirm("⚠️ BẠN CÓ CHẮC CHẮN MUỐN XÓA TẤT CẢ KỶ LỤC KHÔNG?\n\nHành động này không thể hoàn tác!")) {
        return;
    }

    try {
        const batch = writeBatch(db);
        const recordsSnapshot = await getDocs(collection(db, "raceRecords"));

        let deleteCount = 0;
        recordsSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
            deleteCount++;
        });

        await batch.commit();
        showMessage(`✅ Đã xóa ${deleteCount} kỷ lục thành công!`);
        await loadRecordsData(1);
    } catch (error) {
        console.error("Error deleting all records:", error);
        showMessage("Lỗi khi xóa kỷ lục!", true);
    }
};

// Load users data
const loadUsersData = async (page = 1) => {
    try {
        currentPage['users'] = page;
        const querySnapshot = await getDocs(collection(db, "users"));
        allUsers = [];

        querySnapshot.forEach((doc) => {
            allUsers.push({ id: doc.id, ...doc.data() });
        });

        filteredUsers = [...allUsers];
        renderFilteredUsers(page);
    } catch (error) {
        console.error("Error loading users:", error);
        showMessage("Lỗi tải dữ liệu người dùng!", true);
    }
};

// Update user role
window.updateUserRole = async (userId, newRole) => {
    try {
        await updateDoc(doc(db, "users", userId), { role: newRole });
        showMessage("Đã cập nhật vai trò người dùng!");
    } catch (error) {
        console.error("Error updating user role:", error);
        showMessage("Lỗi khi cập nhật vai trò!", true);
    }
};

// Update user admin status
window.updateUserAdminStatus = async (userId, isAdmin) => {
    try {
        await updateDoc(doc(db, "users", userId), { isAdmin: isAdmin === 'true' });
        showMessage("Đã cập nhật quyền admin!");
    } catch (error) {
        console.error("Error updating admin status:", error);
        showMessage("Lỗi khi cập nhật quyền admin!", true);
    }
};

// Update user status
window.updateUserStatus = async (userId, status) => {
    try {
        const updateData = {
            status: status,
            lastUpdated: serverTimestamp()
        };

        await updateDoc(doc(db, "users", userId), updateData);
        showMessage(`Đã cập nhật trạng thái người dùng thành: ${status === 'banned' ? 'Bị cấm' : 'Hoạt động'}!`);

        // Log activity
        await logActivity('update', `Cập nhật trạng thái người dùng: ${status}`, {
            userId: userId,
            status: status
        });
    } catch (error) {
        console.error("Error updating user status:", error);
        showMessage("Lỗi khi cập nhật trạng thái!", true);
    }
};

// Update user display name
window.updateUserDisplayName = async (userId, displayName) => {
    try {
        if (!displayName || displayName.trim() === '') {
            showMessage("Tên hiển thị không được để trống!", true);
            return;
        }

        await updateDoc(doc(db, "users", userId), {
            displayName: displayName.trim(),
            lastUpdated: serverTimestamp()
        });

        showMessage("Đã cập nhật tên hiển thị!");

        // Log activity
        await logActivity('update', `Cập nhật tên hiển thị người dùng: ${displayName}`, {
            userId: userId
        });

    } catch (error) {
        console.error("Error updating display name:", error);
        showMessage("Lỗi khi cập nhật tên hiển thị!", true);
    }
};

// Update user nickname
window.updateUserNickname = async (userId, nickname) => {
    try {
        await updateDoc(doc(db, "users", userId), {
            nickname: nickname.trim(),
            lastUpdated: serverTimestamp()
        });

        showMessage("Đã cập nhật biệt danh!");

        // Log activity
        await logActivity('update', `Cập nhật biệt danh người dùng: ${nickname}`, {
            userId: userId
        });

    } catch (error) {
        console.error("Error updating nickname:", error);
        showMessage("Lỗi khi cập nhật biệt danh!", true);
    }
};

// Edit user
window.editUser = async (userId) => {
    try {
        const userDoc = await getDoc(doc(db, "users", userId));

        if (!userDoc.exists()) {
            showMessage("Không tìm thấy người dùng!", true);
            return;
        }

        currentEditingItem = { id: userDoc.id, ...userDoc.data() };
        currentCollection = 'users';

        document.getElementById('modal-title').textContent = 'Chỉnh sửa Người dùng';
        generateForm('user');
        document.getElementById('modal').classList.remove('hidden');

    } catch (error) {
        console.error("Error loading user:", error);
        showMessage("Lỗi tải thông tin người dùng!", true);
    }
};

// Delete user
window.deleteUser = async (userId, userEmail) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa người dùng "${userEmail}" không?\n\nLưu ý: Điều này chỉ xóa thông tin trong Firestore, không xóa tài khoản Authentication.`)) return;

    try {
        await deleteDoc(doc(db, "users", userId));
        showMessage("Đã xóa thông tin người dùng!");
        loadUsersData(currentPage['users']);
    } catch (error) {
        console.error("Error deleting user:", error);
        showMessage("Lỗi khi xóa người dùng!", true);
    }
};

// Load notifications
const loadNotifications = async () => {
    try {
        const notificationsRef = collection(db, "notifications");
        const q = query(notificationsRef, orderBy("createdAt", "desc") || orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);

        allNotifications = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            read: doc.data().read !== undefined ? doc.data().read : false
        }));

        // Sort by date (newest first)
        allNotifications.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt) : (a.timestamp ? new Date(a.timestamp) : new Date(0));
            const dateB = b.createdAt ? new Date(b.createdAt) : (b.timestamp ? new Date(b.timestamp) : new Date(0));
            return dateB - dateA;
        });

        updateNotificationCount();

        if (currentTab === 'notifications') {
            renderNotifications();
        }

    } catch (error) {
        console.error("Error loading notifications:", error);
        try {
            const notificationsRef = collection(db, "notifications");
            const q = query(notificationsRef, orderBy("timestamp", "desc"));
            const snapshot = await getDocs(q);

            allNotifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                read: doc.data().read !== undefined ? doc.data().read : false
            }));

            allNotifications.sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt) : (a.timestamp ? new Date(a.timestamp) : new Date(0));
                const dateB = b.createdAt ? new Date(b.createdAt) : (b.timestamp ? new Date(b.timestamp) : new Date(0));
                return dateB - dateA;
            });

            updateNotificationCount();

            if (currentTab === 'notifications') {
                renderNotifications();
            }
        } catch (error2) {
            console.error("Error loading notifications with timestamp:", error2);
        }
    }
};

// Update notification count
const updateNotificationCount = () => {
    unreadNotificationCount = allNotifications.filter(n => !n.read).length;

    const notificationBadge = document.getElementById('notification-count');
    const tabBadge = document.getElementById('notification-tab-count');
    const unreadElement = document.getElementById('unread-notifications');

    if (unreadNotificationCount > 0) {
        if (notificationBadge) {
            notificationBadge.textContent = unreadNotificationCount;
            notificationBadge.classList.remove('hidden');
        }
        if (tabBadge) {
            tabBadge.textContent = unreadNotificationCount;
            tabBadge.classList.remove('hidden');
        }
        if (unreadElement) {
            unreadElement.textContent = `${unreadNotificationCount} chưa đọc`;
            unreadElement.className = 'text-sm text-red-400';
        }
    } else {
        if (notificationBadge) notificationBadge.classList.add('hidden');
        if (tabBadge) tabBadge.classList.add('hidden');
        if (unreadElement) {
            unreadElement.textContent = '0 chưa đọc';
            unreadElement.className = 'text-sm text-slate-400';
        }
    }
};

// Render notifications
const renderNotifications = () => {
    const notificationsList = document.getElementById('notifications-list');
    if (!notificationsList) return;

    // Apply filters
    applyNotificationFilters();

    // Update stats
    updateNotificationStats();

    notificationsList.innerHTML = '';

    if (filteredNotifications.length === 0) {
        notificationsList.innerHTML = `
            <div class="text-center py-16">
                <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-800/50 to-slate-900/50 flex items-center justify-center">
                    <i class="fas fa-bell-slash text-3xl text-slate-600"></i>
                </div>
                <h3 class="text-lg font-bold text-white mb-2">Không có thông báo</h3>
                <p class="text-slate-400 text-sm">
                    ${notificationFilters.type !== 'all' || notificationFilters.status !== 'all'
                ? 'Không tìm thấy thông báo phù hợp với bộ lọc'
                : 'Chưa có thông báo nào được gửi'}
                </p>
            </div>
        `;
        return;
    }

    filteredNotifications.forEach(notification => {
        const notificationDate = notification.createdAt || notification.timestamp;
        const timeAgo = getTimeAgo(new Date(notificationDate));
        const isUnread = !notification.read;

        // Get type-specific colors
        const typeColors = {
            'system': { bg: 'from-blue-500/20 to-cyan-500/20', border: 'border-blue-500/30', text: 'text-blue-400', icon: 'fa-cog' },
            'info': { bg: 'from-cyan-500/20 to-blue-500/20', border: 'border-cyan-500/30', text: 'text-cyan-400', icon: 'fa-info-circle' },
            'record': { bg: 'from-yellow-500/20 to-orange-500/20', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: 'fa-trophy' },
            'success': { bg: 'from-green-500/20 to-emerald-500/20', border: 'border-green-500/30', text: 'text-green-400', icon: 'fa-check-circle' },
            'warning': { bg: 'from-orange-500/20 to-red-500/20', border: 'border-orange-500/30', text: 'text-orange-400', icon: 'fa-exclamation-triangle' },
            'error': { bg: 'from-red-500/20 to-pink-500/20', border: 'border-red-500/30', text: 'text-red-400', icon: 'fa-times-circle' }
        };

        const typeColor = typeColors[notification.type] || typeColors['info'];

        const notificationCard = document.createElement('div');
        notificationCard.className = `
            bg-slate-900/40 backdrop-blur-md rounded-xl p-4 
            transition-all duration-300 cursor-pointer
            hover:scale-[1.01] hover:shadow-lg
            ${isUnread
                ? `border border-cyan-500/30 hover:shadow-cyan-500/20 bg-cyan-500/5`
                : `hover:shadow-white/5 ${notification.read ? 'opacity-70' : ''}`
            }
        `;

        notificationCard.innerHTML = `
            <div class="flex items-start gap-4">
                <!-- Icon -->
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br ${typeColor.bg} border ${typeColor.border} flex items-center justify-center flex-shrink-0">
                    <i class="fas ${typeColor.icon} ${typeColor.text}"></i>
                </div>
                
                <!-- Content -->
                <div class="flex-1 min-w-0">
                    <!-- Title Row -->
                    <div class="flex items-center gap-2 mb-2">
                        <h4 class="text-white font-bold text-sm">${notification.title || 'Thông báo'}</h4>
                        ${notification.important
                ? '<span class="px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-xs font-bold flex items-center gap-1"><i class="fas fa-star"></i>QUAN TRỌNG</span>'
                : ''}
                        ${isUnread
                ? '<span class="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>'
                : ''}
                    </div>
                    
                    <!-- Content -->
                    <p class="text-slate-300 text-sm mb-3 line-clamp-2">${notification.content || ''}</p>
                    
                    <!-- Meta Info -->
                    <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span class="flex items-center gap-1">
                            <i class="fas fa-clock"></i>
                            ${timeAgo}
                        </span>
                        <span class="flex items-center gap-1">
                            <i class="fas fa-user"></i>
                            ${notification.sender || 'Hệ thống'}
                        </span>
                        <span class="flex items-center gap-1">
                            <i class="fas fa-users"></i>
                            ${getTargetDisplayName(notification.target)}
                        </span>
                        <span class="flex items-center gap-1 ${typeColor.text}">
                            <i class="fas fa-tag"></i>
                            ${getTypeDisplayName(notification.type)}
                        </span>
                    </div>
                </div>
                
                <!-- Actions -->
                <div class="flex flex-col gap-2 flex-shrink-0">
                    ${!notification.read ? `
                        <button onclick="markNotificationAsRead('${notification.id}', event)" 
                                class="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30 transition-all text-xs font-medium flex items-center gap-1.5"
                                title="Đánh dấu đã đọc">
                            <i class="fas fa-check"></i>
                            Đọc
                        </button>
                    ` : `
                        <span class="px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/30 text-xs font-medium flex items-center gap-1.5">
                            <i class="fas fa-check-circle"></i>
                            Đã đọc
                        </span>
                    `}
                    <button onclick="deleteNotification('${notification.id}', event)" 
                            class="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 transition-all text-xs font-medium flex items-center gap-1.5"
                            title="Xóa thông báo">
                        <i class="fas fa-trash"></i>
                        Xóa
                    </button>
                </div>
            </div>
        `;

        notificationsList.appendChild(notificationCard);
    });
};

// Apply notification filters
const applyNotificationFilters = () => {
    filteredNotifications = allNotifications.filter(notification => {
        // Filter by type
        if (notificationFilters.type !== 'all' && notification.type !== notificationFilters.type) {
            return false;
        }

        // Filter by status
        if (notificationFilters.status === 'unread' && notification.read) {
            return false;
        }
        if (notificationFilters.status === 'read' && !notification.read) {
            return false;
        }

        return true;
    });
};

// Filter notifications
window.filterNotifications = () => {
    const typeFilter = document.getElementById('notification-filter-type');
    const statusFilter = document.getElementById('notification-filter-status');

    if (typeFilter) notificationFilters.type = typeFilter.value;
    if (statusFilter) notificationFilters.status = statusFilter.value;

    renderNotifications();
};

// Update notification stats
const updateNotificationStats = () => {
    const totalCount = allNotifications.length;
    const unreadCount = allNotifications.filter(n => !n.read).length;

    // Count today's notifications
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = allNotifications.filter(n => {
        const nDate = new Date(n.createdAt || n.timestamp);
        nDate.setHours(0, 0, 0, 0);
        return nDate.getTime() === today.getTime();
    }).length;

    // Update UI
    const totalEl = document.getElementById('total-notifications-count');
    const unreadEl = document.getElementById('unread-notifications-count');
    const todayEl = document.getElementById('today-notifications-count');

    if (totalEl) totalEl.textContent = totalCount;
    if (unreadEl) unreadEl.textContent = unreadCount;
    if (todayEl) todayEl.textContent = todayCount;
};

// Get type display name
const getTypeDisplayName = (type) => {
    const types = {
        'system': 'Hệ thống',
        'info': 'Thông tin',
        'record': 'Kỷ lục',
        'success': 'Thành công',
        'warning': 'Cảnh báo',
        'error': 'Lỗi'
    };
    return types[type] || type;
};

// Get notification icon
const getNotificationIcon = (type) => {
    const icons = {
        'record': 'fa-trophy',
        'system': 'fa-cog',
        'info': 'fa-info-circle',
        'warning': 'fa-exclamation-triangle',
        'success': 'fa-check-circle',
        'error': 'fa-times-circle'
    };
    return icons[type] || 'fa-bell';
};

// Get notification color
const getNotificationColor = (type) => {
    const colors = {
        'record': 'text-yellow-400',
        'system': 'text-cyan-400',
        'info': 'text-blue-400',
        'warning': 'text-orange-400',
        'success': 'text-green-400',
        'error': 'text-red-400'
    };
    return colors[type] || 'text-slate-400';
};

// Get target display name
const getTargetDisplayName = (target) => {
    const targets = {
        'all': 'Tất cả người dùng',
        'admins': 'Chỉ Admin',
        'racers': 'Chỉ tay đua',
        'viewers': 'Chỉ người xem'
    };
    return targets[target] || target;
};

// Send notification
window.sendNotification = async () => {
    try {
        const title = document.getElementById('notification-title').value.trim();
        const content = document.getElementById('notification-content').value.trim();
        const type = document.getElementById('notification-type').value;
        const target = document.getElementById('notification-target').value;
        const important = document.getElementById('notification-important').checked;

        if (!title || !content) {
            showMessage("Vui lòng nhập tiêu đề và nội dung!", true);
            return;
        }

        // Disable button to prevent double submit
        const sendBtn = event.target;
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';

        const notificationData = {
            title,
            content,
            type,
            target,
            important,
            sender: currentUser.email,
            senderId: currentUser.displayName || currentUser.email,
            read: false,
            createdAt: new Date().toISOString(),
            timestamp: new Date().toISOString()
        };

        await addDoc(collection(db, "notifications"), notificationData);

        // Clear form
        document.getElementById('notification-title').value = '';
        document.getElementById('notification-content').value = '';
        document.getElementById('notification-type').value = 'system';
        document.getElementById('notification-target').value = 'all';
        document.getElementById('notification-important').checked = false;

        showMessage("✅ Đã gửi thông báo thành công!");

        // Re-enable button
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi thông báo ngay';

        await loadNotifications();

        await logActivity('create', `Đã gửi thông báo: ${title}`, {
            target: target,
            important: important
        });

    } catch (error) {
        console.error("Error sending notification:", error);
        showMessage("Lỗi khi gửi thông báo!", true);

        // Re-enable button
        const sendBtn = event.target;
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi thông báo ngay';
    }
};

// Mark notification as read
window.markNotificationAsRead = async (notificationId, event) => {
    if (event) event.stopPropagation();

    try {
        await updateDoc(doc(db, "notifications", notificationId), {
            read: true
        });

        // Update local data
        const notification = allNotifications.find(n => n.id === notificationId);
        if (notification) {
            notification.read = true;
        }

        showMessage("✓ Đã đánh dấu đã đọc");
        renderNotifications();

    } catch (error) {
        console.error("Error marking notification as read:", error);
        showMessage("Lỗi khi đánh dấu đã đọc!", true);
    }
};

// Mark all notifications as read
window.markAllNotificationsAsRead = async () => {
    try {
        const batch = writeBatch(db);
        const unreadNotifications = allNotifications.filter(n => !n.read);

        if (unreadNotifications.length === 0) {
            showMessage("Không có thông báo nào chưa đọc!");
            return;
        }

        unreadNotifications.forEach(notification => {
            const notificationRef = doc(db, "notifications", notification.id);
            batch.update(notificationRef, { read: true });
        });

        await batch.commit();
        showMessage(`Đã đánh dấu ${unreadNotifications.length} thông báo là đã đọc!`);
        await loadNotifications();

    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        showMessage("Lỗi khi đánh dấu tất cả đã đọc!", true);
    }
};

// Delete notification
window.deleteNotification = async (notificationId, event) => {
    if (event) event.stopPropagation();

    if (!confirm("Bạn có chắc chắn muốn xóa thông báo này không?")) return;

    try {
        await deleteDoc(doc(db, "notifications", notificationId));

        // Update local data
        allNotifications = allNotifications.filter(n => n.id !== notificationId);

        showMessage("✓ Đã xóa thông báo");
        renderNotifications();

    } catch (error) {
        console.error("Error deleting notification:", error);
        showMessage("Lỗi khi xóa thông báo!", true);
    }
};

// Delete all notifications
window.deleteAllNotifications = async () => {
    if (!confirm("⚠️ BẠN CÓ CHẮC CHẮN MUỐN XÓA TẤT CẢ THÔNG BÁO KHÔNG?\n\nHành động này không thể hoàn tác!")) return;

    try {
        const batch = writeBatch(db);
        const notificationsSnapshot = await getDocs(collection(db, "notifications"));

        let deleteCount = 0;
        notificationsSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
            deleteCount++;
        });

        await batch.commit();
        showMessage(`✅ Đã xóa ${deleteCount} thông báo thành công!`);
        await loadNotifications();

    } catch (error) {
        console.error("Error deleting all notifications:", error);
        showMessage("Lỗi khi xóa thông báo!", true);
    }
};

// Refresh notifications
window.refreshNotifications = async () => {
    const notificationsList = document.getElementById('notifications-list');
    if (notificationsList) {
        notificationsList.innerHTML = `
            <div class="text-center py-12 text-slate-500">
                <div class="loading-spinner mx-auto mb-4"></div>
                <p>Đang làm mới...</p>
            </div>
        `;
    }

    await loadNotifications();
    showMessage("✓ Đã làm mới danh sách thông báo");
};

// Open notification modal
window.openNotificationModal = () => {
    document.getElementById('notification-modal').classList.remove('hidden');
};

// Close notification modal
window.closeNotificationModal = () => {
    document.getElementById('notification-modal').classList.add('hidden');
};

// Open send notification modal
window.openSendNotificationModal = () => {
    switchTab('notifications');
    setTimeout(() => {
        const formElement = document.getElementById('notification-title');
        if (formElement) {
            formElement.scrollIntoView({ behavior: 'smooth' });
            formElement.focus();
        }
    }, 100);
};

// View map image
window.viewMapImage = (imageUrl, mapName) => {
    document.getElementById('image-viewer-title').textContent = mapName;
    document.getElementById('image-viewer-img').src = imageUrl;
    document.getElementById('image-viewer-modal').classList.remove('hidden');
};

// Close image viewer
window.closeImageViewer = () => {
    document.getElementById('image-viewer-modal').classList.add('hidden');
};

// Generate unique ID
const generateUniqueId = (prefix) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `${prefix}_${timestamp}_${random}`;
};

// Open add modal
window.openAddModal = (type) => {
    currentEditingItem = null;

    const typeToCollectionMap = {
        'car': 'gameCars',
        'map': 'gameMaps',
        'pet': 'gamePets',
        'record': 'raceRecords',
        'user': 'users'
    };

    currentCollection = typeToCollectionMap[type] || '';

    const titles = {
        'car': 'Thêm Xe mới',
        'map': 'Thêm Bản đồ mới',
        'pet': 'Thêm Pet mới',
        'record': 'Thêm Kỷ lục mới',
        'user': 'Thêm Người dùng mới'
    };

    document.getElementById('modal-title').textContent = titles[type] || 'Thêm mới';
    generateForm(type);
    document.getElementById('modal').classList.remove('hidden');
};

// Generate form
const generateForm = (type) => {
    const form = document.getElementById('modal-form');
    form.innerHTML = '';

    const forms = {
        'car': generateCarForm(),
        'map': generateMapForm(),
        'pet': generatePetForm(),
        'record': generateRecordForm(),
        'user': generateUserForm()
    };

    form.innerHTML = forms[type] || '<p>Form không khả dụng</p>';
};

// Generate car form
const generateCarForm = () => {
    const isEditMode = !!currentEditingItem;

    return `
                <div class="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-4">
                    <i class="fas fa-key mr-2"></i>
                    ${isEditMode ? 'Đang chỉnh sửa xe:' : 'ID mới sẽ được tự động tạo:'}
                    <span class="font-bold ml-2">${isEditMode ? currentEditingItem.id : generateUniqueId('car')}</span>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="field-group">
                        <label class="field-label">Tên Xe *</label>
                        <input type="text" id="car-name" class="field-input" placeholder="Cực Dạ Chi Tinh EXA" value="${currentEditingItem?.name || ''}" required>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Loại Xe *</label>
                        <input type="text" id="car-type" class="field-input" placeholder="Xe Siêu Cấp" value="${currentEditingItem?.type || ''}" required>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Độ hiếm *</label>
                        <select id="car-rarity" class="field-input" required>
                            <option value="">Chọn độ hiếm</option>
                            <option value="Thường" ${currentEditingItem?.rarity === 'Thường' ? 'selected' : ''}>Thường</option>
                            <option value="Hiếm" ${currentEditingItem?.rarity === 'Hiếm' ? 'selected' : ''}>Hiếm</option>
                            <option value="Huyền Thoại" ${currentEditingItem?.rarity === 'Huyền Thoại' ? 'selected' : ''}>Huyền Thoại</option>
                            <option value="Thần Thoại" ${currentEditingItem?.rarity === 'Thần Thoại' ? 'selected' : ''}>Thần Thoại</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Tốc độ (Speed) *</label>
                        <input type="number" id="car-speed" class="field-input" placeholder="328" value="${currentEditingItem?.speed || ''}" required min="0">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Acceleration *</label>
                        <input type="number" id="car-acceleration" class="field-input" placeholder="96" value="${currentEditingItem?.acceleration || ''}" required min="0">
                    </div>
                    <div class="field-group col-span-2">
                        <label class="field-label">Ảnh Xe (URL)</label>
                        <input type="text" id="car-imageUrl" class="field-input" placeholder="https://..." value="${currentEditingItem?.imageUrl || ''}">
                    </div>
                </div>
                <p class="text-sm text-slate-400 mt-4">* Trường bắt buộc</p>
            `;
};

// Generate map form
const generateMapForm = () => {
    const isEditMode = !!currentEditingItem;

    return `
                <div class="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-4">
                    <i class="fas fa-key mr-2"></i>
                    ${isEditMode ? 'Đang chỉnh sửa bản đồ:' : 'ID mới sẽ được tự động tạo:'}
                    <span class="font-bold ml-2">${isEditMode ? currentEditingItem.id : generateUniqueId('map')}</span>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="field-group">
                        <label class="field-label">Tên Bản đồ *</label>
                        <input type="text" id="map-name" class="field-input" placeholder="Đại Lộ 1" value="${currentEditingItem?.name || ''}" required>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Độ khó *</label>
                        <select id="map-difficulty" class="field-input" required>
                            <option value="">Chọn độ khó</option>
                            <option value="Dễ" ${currentEditingItem?.difficulty === 'Dễ' ? 'selected' : ''}>Dễ</option>
                            <option value="Trung bình" ${currentEditingItem?.difficulty === 'Trung bình' ? 'selected' : ''}>Trung bình</option>
                            <option value="Khó" ${currentEditingItem?.difficulty === 'Khó' ? 'selected' : ''}>Khó</option>
                            <option value="Rất khó" ${currentEditingItem?.difficulty === 'Rất khó' ? 'selected' : ''}>Rất khó</option>
                            <option value="Cực khó" ${currentEditingItem?.difficulty === 'Cực khó' ? 'selected' : ''}>Cực khó</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Record Time</label>
                        <input type="text" id="map-recordTime" class="field-input" placeholder="01'04'23" value="${currentEditingItem?.recordTime || ''}">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Record Racer</label>
                        <input type="text" id="map-recordRacer" class="field-input" placeholder="Tên tay đua" value="${currentEditingItem?.recordRacer || ''}">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Record Car</label>
                        <input type="text" id="map-recordCar" class="field-input" placeholder="Tên xe" value="${currentEditingItem?.recordCar || ''}">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Record Pet</label>
                        <input type="text" id="map-recordPet" class="field-input" placeholder="Tên pet" value="${currentEditingItem?.recordPet || ''}">
                    </div>
                    <div class="field-group col-span-2">
                        <label class="field-label">Mô tả</label>
                        <textarea id="map-description" class="field-input" rows="3">${currentEditingItem?.description || ''}</textarea>
                    </div>
                    <div class="field-group col-span-2">
                        <label class="field-label">Ảnh Bản đồ (URL)</label>
                        <input type="text" id="map-imageUrl" class="field-input" placeholder="https://..." value="${currentEditingItem?.imageUrl || ''}">
                    </div>
                </div>
                <p class="text-sm text-slate-400 mt-4">* Trường bắt buộc</p>
            `;
};

// Generate pet form
const generatePetForm = () => {
    const isEditMode = !!currentEditingItem;

    return `
                <div class="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-4">
                    <i class="fas fa-key mr-2"></i>
                    ${isEditMode ? 'Đang chỉnh sửa pet:' : 'ID mới sẽ được tự động tạo:'}
                    <span class="font-bold ml-2">${isEditMode ? currentEditingItem.id : generateUniqueId('pet')}</span>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="field-group">
                        <label class="field-label">Tên Pet *</label>
                        <input type="text" id="pet-name" class="field-input" placeholder="Ngọc Tỉ Thần Hổ" value="${currentEditingItem?.name || ''}" required>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Loại Pet *</label>
                        <input type="text" id="pet-type" class="field-input" placeholder="Hổ" value="${currentEditingItem?.type || ''}" required>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Độ hiếm *</label>
                        <select id="pet-rarity" class="field-input" required>
                            <option value="">Chọn độ hiếm</option>
                            <option value="Thường" ${currentEditingItem?.rarity === 'Thường' ? 'selected' : ''}>Thường</option>
                            <option value="Hiếm" ${currentEditingItem?.rarity === 'Hiếm' ? 'selected' : ''}>Hiếm</option>
                            <option value="Huyền Thoại" ${currentEditingItem?.rarity === 'Huyền Thoại' ? 'selected' : ''}>Huyền Thoại</option>
                            <option value="Thần Thoại" ${currentEditingItem?.rarity === 'Thần Thoại' ? 'selected' : ''}>Thần Thoại</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Tên Skill</label>
                        <input type="text" id="pet-skillName" class="field-input" placeholder="Uy Vũ Hổ Vương" value="${currentEditingItem?.skill?.name || ''}">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Mô tả Skill</label>
                        <input type="text" id="pet-skillDesc" class="field-input" placeholder="Tăng 15% tốc độ..." value="${currentEditingItem?.skill?.description || ''}">
                    </div>
                    <div class="field-group col-span-2">
                        <label class="field-label">Ảnh Pet (URL)</label>
                        <input type="text" id="pet-imageUrl" class="field-input" placeholder="https://..." value="${currentEditingItem?.imageUrl || ''}">
                    </div>
                </div>
                <p class="text-sm text-slate-400 mt-4">* Trường bắt buộc</p>
            `;
};

// Generate record form
const generateRecordForm = () => {
    return `
                <div class="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-4">
                    <i class="fas fa-key mr-2"></i>
                    ID mới sẽ được tự động tạo
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="field-group">
                        <label class="field-label">Tên Bản đồ *</label>
                        <input type="text" id="record-mapName" class="field-input" placeholder="Công Trường Phố Cổ" value="${currentEditingItem?.mapName || ''}" required>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Tên Tay đua *</label>
                        <input type="text" id="record-racerName" class="field-input" placeholder="Derpug" value="${currentEditingItem?.racerName || ''}" required>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Index Tay đua</label>
                        <input type="number" id="record-racerIndex" class="field-input" placeholder="0" value="${currentEditingItem?.racerIndex || ''}" min="0" max="3">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Thời gian (giây) *</label>
                        <input type="number" step="0.01" id="record-timeInSeconds" class="field-input" placeholder="72.33" value="${currentEditingItem?.timeInSeconds || ''}" required min="0">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Thời gian (string) *</label>
                        <input type="text" id="record-timeString" class="field-input" placeholder="01'12'33" value="${currentEditingItem?.timeString || ''}" required>
                    </div>
                    <div class="field-group">
                        <label class="field-label">Xe</label>
                        <input type="text" id="record-car" class="field-input" placeholder="S-Huyễn Tinh" value="${currentEditingItem?.car || ''}">
                    </div>
                    <div class="field-group">
                        <label class="field-label">Pet</label>
                        <input type="text" id="record-pet" class="field-input" placeholder="Thụy Trạch Tường Lân" value="${currentEditingItem?.pet || ''}">
                    </div>
                </div>
                <p class="text-sm text-slate-400 mt-4">* Trường bắt buộc</p>
            `;
};

// Generate user form
const generateUserForm = () => {
    const isEditMode = !!currentEditingItem;

    if (!isEditMode) {
        return `
                <div class="bg-slate-500/10 border border-slate-500/30 rounded-lg p-4 mb-4">
                    <i class="fas fa-info-circle mr-2"></i>
                    Không thể thêm người dùng mới qua trang này. Người dùng phải đăng ký qua Authentication.
                </div>
                <div class="text-center py-8">
                    <i class="fas fa-user-slash text-4xl text-slate-500 mb-4"></i>
                    <p class="text-slate-400">Tính năng thêm người dùng không khả dụng.</p>
                    <p class="text-sm text-slate-500 mt-2">Vui lòng sử dụng Firebase Authentication Console để thêm người dùng mới.</p>
                </div>
            `;
    }

    return `
                <div class="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-4">
                    <i class="fas fa-user mr-2"></i>
                    Đang chỉnh sửa người dùng: <span class="font-bold ml-2">${currentEditingItem.email || 'N/A'}</span>
                </div>
                
                <div class="grid grid-cols-1 gap-4">
                    <div class="field-group">
                        <label class="field-label">Email (Không thể thay đổi)</label>
                        <input type="email" class="field-input bg-slate-800/50 cursor-not-allowed" 
                               value="${currentEditingItem.email || ''}" disabled>
                        <p class="text-xs text-slate-500 mt-1">Email là ID duy nhất và không thể thay đổi</p>
                    </div>

                    <div class="field-group">
                        <label class="field-label">📸 Ảnh đại diện (Avatar)</label>
                        <div class="flex gap-3 items-start mb-3">
                            <div class="flex-1">
                                <input type="file" id="admin-user-avatar-input" accept="image/*" 
                                       class="hidden" 
                                       onchange="handleAdminUserAvatarChange(event)">
                                <button type="button" onclick="document.getElementById('admin-user-avatar-input').click()" 
                                        class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-all w-full">
                                    <i class="fas fa-upload mr-2"></i>Tải ảnh lên
                                </button>
                                <p class="text-xs text-slate-500 mt-2">JPG, PNG, WebP (tối đa 2MB)</p>
                            </div>
                            
                            <div class="w-20 h-20 flex-shrink-0">
                                <div class="w-20 h-20 rounded-full border border-slate-600 overflow-hidden bg-slate-800 flex items-center justify-center">
                                    ${currentEditingItem.photoURL ? `
                                        <img id="admin-user-avatar-preview" src="${currentEditingItem.photoURL}" 
                                             alt="Avatar" class="w-full h-full object-cover"
                                             onerror="this.src='https://via.placeholder.com/80/1a1a2e/666?text=User'">
                                    ` : `
                                        <img id="admin-user-avatar-preview" src="https://via.placeholder.com/80/1a1a2e/666?text=User" 
                                             alt="Avatar" class="w-full h-full object-cover">
                                    `}
                                </div>
                            </div>
                        </div>
                        <input type="text" id="user-photoURL" class="field-input hidden" 
                               value="${currentEditingItem.photoURL || ''}">
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="field-group">
                            <label class="field-label">Tên hiển thị *</label>
                            <input type="text" id="user-displayName" class="field-input" 
                                   placeholder="Nguyễn Văn A" 
                                   value="${currentEditingItem.displayName || ''}" required>
                        </div>

                        <div class="field-group">
                            <label class="field-label">Biệt danh</label>
                            <input type="text" id="user-nickname" class="field-input" 
                                   placeholder="ProRacer123" 
                                   value="${currentEditingItem.nickname || ''}">
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="field-group">
                            <label class="field-label">Vai trò *</label>
                            <select id="user-role" class="field-input" required>
                                <option value="viewer" ${currentEditingItem.role === 'viewer' ? 'selected' : ''}>Người xem</option>
                                <option value="racer" ${currentEditingItem.role === 'racer' ? 'selected' : ''}>Tay đua</option>
                                <option value="admin" ${currentEditingItem.role === 'admin' ? 'selected' : ''}>Quản trị viên</option>
                            </select>
                        </div>

                        <div class="field-group">
                            <label class="field-label">Trạng thái *</label>
                            <select id="user-status" class="field-input" required>
                                <option value="active" ${currentEditingItem.status === 'active' ? 'selected' : ''}>Hoạt động</option>
                                <option value="inactive" ${currentEditingItem.status === 'inactive' ? 'selected' : ''}>Không hoạt động</option>
                                <option value="banned" ${currentEditingItem.status === 'banned' ? 'selected' : ''}>Bị cấm</option>
                            </select>
                        </div>
                    </div>

                    <div class="field-group">
                        <label class="field-label flex items-center gap-2">
                            <input type="checkbox" id="user-isAdmin" 
                                   ${currentEditingItem.isAdmin ? 'checked' : ''}>
                            <span>Cấp quyền Admin</span>
                        </label>
                        <p class="text-xs text-orange-400 mt-1">
                            <i class="fas fa-exclamation-triangle mr-1"></i>
                            Cẩn thận khi cấp quyền admin cho người dùng!
                        </p>
                    </div>

                    <div class="bg-slate-800/30 rounded-lg p-4">
                        <h4 class="text-sm font-semibold text-slate-300 mb-2">
                            <i class="fas fa-info-circle mr-2"></i>Thông tin bổ sung
                        </h4>
                        <div class="grid grid-cols-2 gap-2 text-xs text-slate-400">
                            <div>
                                <span class="font-semibold">UID:</span> ${currentEditingItem.uid || currentEditingItem.id || 'N/A'}
                            </div>
                            <div>
                                <span class="font-semibold">Ngày tạo:</span> 
                                ${currentEditingItem.createdAt ? new Date(currentEditingItem.createdAt).toLocaleDateString('vi-VN') : 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>

                <p class="text-sm text-slate-400 mt-4">* Trường bắt buộc</p>
            `;
};
// Edit item
window.editItem = async (collection, id) => {
    try {
        const docRef = doc(db, collection, id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentEditingItem = { id: docSnap.id, ...docSnap.data() };
            currentCollection = collection;
        }

        if (docSnap.exists()) {
            currentEditingItem = { id: docSnap.id, ...docSnap.data() };
            currentCollection = collection;

            const titles = {
                'gameCars': 'Chỉnh sửa Xe',
                'gameMaps': 'Chỉnh sửa Bản đồ',
                'gamePets': 'Chỉnh sửa Pet',
                'raceRecords': 'Chỉnh sửa Kỷ lục',
                'users': 'Chỉnh sửa Người dùng'
            };

            document.getElementById('modal-title').textContent = titles[collection] || 'Chỉnh sửa';

            const typeMap = {
                'gameCars': 'car',
                'gameMaps': 'map',
                'gamePets': 'pet',
                'raceRecords': 'record',
                'users': 'user'
            };

            generateForm(typeMap[collection]);
            document.getElementById('modal').classList.remove('hidden');
        }
    } catch (error) {
        console.error("Error loading item:", error);
        showMessage("Lỗi tải dữ liệu!", true);
    }
};

// Delete item
window.deleteItem = async (collection, id, name) => {
    // Sử dụng SweetAlert2 thay vì confirm
    const result = await Swal.fire({
        title: 'Xác nhận xóa?',
        html: `Bạn có chắc muốn xóa <strong>"${name}"</strong>?<br><small class="text-slate-400">${collection === 'raceRecords' ? 'Bạn có thể hoàn tác trong vòng 5 giây' : ''}</small>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff0066',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fas fa-trash-alt mr-2"></i>Xóa',
        cancelButtonText: 'Hủy'
    });

    if (!result.isConfirmed) return;

    try {
        // Backup cho undo (chỉ với raceRecords)
        if (collection === 'raceRecords') {
            const record = allRecords.find(r => r.id === id);
            if (record) {
                deletedRecordsBackup = [{ ...record }];
            }
        }

        await deleteDoc(doc(db, collection, id));

        if (collection === 'raceRecords') {
            // Xóa khỏi local arrays
            allRecords = allRecords.filter(r => r.id !== id);
            filteredRecords = filteredRecords.filter(r => r.id !== id);
            filterRecordsNew();

            // Hiển thị undo toast
            showUndoToast(`Đã xóa kỷ lục "${name}"`);
        } else if (collection === 'users') {
            showMessage("Đã xóa thành công!");
            await loadUsersData(currentPage['users']);
        } else {
            showMessage("Đã xóa thành công!");
            loadCollectionData(collection, currentPage[collection]);
        }
    } catch (error) {
        console.error("Error deleting item:", error);
        showMessage("Lỗi khi xóa!", true);
    }
};

// Hàm xử lý kỷ lục trùng lặp
// - Xóa kỷ lục trùng: cùng map, racer, car, pet, thời gian
// - Xóa kỷ lục vượt quá 3 phút
const handleDuplicateRecords = async (newRecord) => {
    try {
        const recordsSnapshot = await getDocs(collection(db, "raceRecords"));
        const batch = writeBatch(db);
        let deletedCount = 0;

        recordsSnapshot.forEach((doc) => {
            const existingRecord = doc.data();

            // Kiểm tra 1: Xóa kỷ lục nếu trùng (cùng map, racer, car, pet, time)
            const isSameMap = existingRecord.mapName === newRecord.mapName;
            const isSameRacer = existingRecord.racerName === newRecord.racerName;
            const isSameCar = existingRecord.car === newRecord.car;
            const isSamePet = existingRecord.pet === newRecord.pet;
            const isSameTime = existingRecord.timeInSeconds === newRecord.timeInSeconds;

            if (isSameMap && isSameRacer && isSameCar && isSamePet && isSameTime) {
                // Xóa kỷ lục cũ vì trùng lặp
                batch.delete(doc.ref);
                deletedCount++;
                console.log(`🗑️ Xóa kỷ lục trùng lặp: ${existingRecord.mapName} - ${existingRecord.racerName}`);
            }

            // Kiểm tra 2: Xóa kỷ lục nếu thời gian > 3 phút (180 giây)
            else if (existingRecord.timeInSeconds > 180) {
                batch.delete(doc.ref);
                deletedCount++;
                console.log(`🗑️ Xóa kỷ lục vượt quá 3 phút: ${existingRecord.mapName} - ${existingRecord.racerName} (${existingRecord.timeInSeconds}s)`);
            }
        });

        // Xóa kỷ lục cũ nếu có record mới cùng map
        if (deletedCount > 0) {
            await batch.commit();
            console.log(`✅ Đã xóa ${deletedCount} kỷ lục trùng lặp hoặc không hợp lệ`);
        }
    } catch (error) {
        console.error("Error handling duplicate records:", error);
    }
};

// Biến lưu instance cropper cho admin avatar
let adminCropper = null;

// Hàm xử lý thay đổi ảnh avatar khi admin chỉnh sửa người dùng
window.handleAdminUserAvatarChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showMessage('Kích thước file không được vượt quá 2MB', true);
        return;
    }

    if (!file.type.startsWith('image/')) {
        showMessage('Vui lòng chọn file ảnh', true);
        return;
    }

    try {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result;

            // Đặt ảnh vào modal crop
            const cropImage = document.getElementById('admin-crop-image');
            cropImage.src = base64;

            // Mở modal crop
            document.getElementById('admin-crop-image-modal').classList.remove('hidden');
            document.getElementById('admin-crop-image-modal').classList.add('flex');

            // Khởi tạo Cropper
            if (adminCropper) {
                adminCropper.destroy();
            }

            setTimeout(() => {
                adminCropper = new Cropper(cropImage, {
                    aspectRatio: 1,
                    viewMode: 1,
                    autoCropArea: 1,
                    responsive: true,
                    restore: true,
                    guides: true,
                    highlight: true,
                    cropBoxMovable: true,
                    cropBoxResizable: true,
                    toggleDragModeOnDblclick: true,
                    background: true,
                    modal: true,
                });
            }, 100);
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Lỗi khi xử lý ảnh:', error);
        showMessage('Lỗi khi xử lý ảnh. Vui lòng thử lại.', true);
    }
};

// Save item
window.saveItem = async () => {
    try {
        if (!currentCollection) {
            showMessage("Lỗi: Không xác định được loại dữ liệu!", true);
            return;
        }

        let data = {};
        let idToUse = '';

        switch (currentCollection) {
            case 'gameCars':
                data = {
                    name: document.getElementById('car-name').value.trim(),
                    type: document.getElementById('car-type').value.trim(),
                    rarity: document.getElementById('car-rarity').value,
                    speed: parseInt(document.getElementById('car-speed').value),
                    acceleration: parseInt(document.getElementById('car-acceleration').value),
                    imageUrl: document.getElementById('car-imageUrl').value.trim()
                };
                idToUse = currentEditingItem ? currentEditingItem.id : generateUniqueId('car');
                break;

            case 'gameMaps':
                data = {
                    name: document.getElementById('map-name').value.trim(),
                    difficulty: document.getElementById('map-difficulty').value,
                    recordTime: document.getElementById('map-recordTime').value.trim(),
                    recordRacer: document.getElementById('map-recordRacer').value.trim(),
                    recordCar: document.getElementById('map-recordCar').value.trim(),
                    recordPet: document.getElementById('map-recordPet').value.trim(),
                    description: document.getElementById('map-description').value.trim(),
                    imageUrl: document.getElementById('map-imageUrl').value.trim()
                };
                idToUse = currentEditingItem ? currentEditingItem.id : generateUniqueId('map');
                break;

            case 'gamePets':
                data = {
                    name: document.getElementById('pet-name').value.trim(),
                    type: document.getElementById('pet-type').value.trim(),
                    rarity: document.getElementById('pet-rarity').value,
                    skill: {
                        name: document.getElementById('pet-skillName').value.trim(),
                        description: document.getElementById('pet-skillDesc').value.trim()
                    },
                    imageUrl: document.getElementById('pet-imageUrl').value.trim()
                };
                idToUse = currentEditingItem ? currentEditingItem.id : generateUniqueId('pet');
                break;

            case 'raceRecords':
                const recordId = currentEditingItem ? currentEditingItem.id :
                    `${document.getElementById('record-mapName').value.trim().replace(/\s+/g, '_')}_${Date.now()}`;
                data = {
                    mapName: document.getElementById('record-mapName').value.trim(),
                    racerName: document.getElementById('record-racerName').value.trim(),
                    racerIndex: parseInt(document.getElementById('record-racerIndex').value) || 0,
                    timeInSeconds: parseFloat(document.getElementById('record-timeInSeconds').value),
                    timeString: document.getElementById('record-timeString').value.trim(),
                    car: document.getElementById('record-car').value.trim(),
                    pet: document.getElementById('record-pet').value.trim(),
                    timestamp: new Date().toISOString()
                };

                // Kiểm tra thời gian trên 3 phút (180 giây)
                if (data.timeInSeconds > 180) {
                    showMessage("❌ Kỷ lục không hợp lệ: Thời gian vượt quá 3 phút (180 giây)!", true);
                    return;
                }

                idToUse = recordId;
                break;

            case 'users':
                if (!currentEditingItem) {
                    showMessage("Không thể thêm người dùng mới qua trang này!", true);
                    closeModal();
                    return;
                }

                data = {
                    displayName: document.getElementById('user-displayName').value.trim(),
                    nickname: document.getElementById('user-nickname').value.trim(),
                    photoURL: document.getElementById('user-photoURL').value.trim(),
                    role: document.getElementById('user-role').value,
                    status: document.getElementById('user-status').value,
                    isAdmin: document.getElementById('user-isAdmin').checked,
                    lastUpdated: serverTimestamp()
                };

                // Giữ lại các trường quan trọng không được thay đổi
                if (currentEditingItem.email) data.email = currentEditingItem.email;
                if (currentEditingItem.uid) data.uid = currentEditingItem.uid;
                if (currentEditingItem.createdAt) data.createdAt = currentEditingItem.createdAt;

                idToUse = currentEditingItem.id;
                break;

            default:
                showMessage(`Loại dữ liệu không hợp lệ: ${currentCollection}`, true);
                return;
        }

        if (!validateFormData(currentCollection, data)) {
            showMessage("Vui lòng điền đầy đủ các trường bắt buộc!", true);
            return;
        }

        if (currentEditingItem) {
            await updateDoc(doc(db, currentCollection, currentEditingItem.id), data);
            showMessage("Đã cập nhật thành công!");

            // Log activity
            const itemName = data.name || data.displayName || data.mapName || 'Item';
            await logActivity('update', `Đã cập nhật ${getCollectionDisplayName(currentCollection)}: ${itemName}`, {
                collection: currentCollection,
                itemId: currentEditingItem.id
            });
        } else {
            // Kiểm tra nếu là record, xử lý trùng lặp
            if (currentCollection === 'raceRecords') {
                await handleDuplicateRecords(data);
            }

            await setDoc(doc(db, currentCollection, idToUse), data);
            showMessage("Đã thêm mới thành công!");

            // Log activity
            const itemName = data.name || data.displayName || data.mapName || 'Item';
            await logActivity('create', `Đã thêm mới ${getCollectionDisplayName(currentCollection)}: ${itemName}`, {
                collection: currentCollection,
                itemId: idToUse
            });
        }

        closeModal();
        switchTab(currentTab);

    } catch (error) {
        console.error("Error saving item:", error);
        showMessage("Lỗi khi lưu dữ liệu!", true);
    }
};

// Get collection display name
const getCollectionDisplayName = (collection) => {
    const names = {
        'gameCars': 'Xe',
        'gameMaps': 'Bản đồ',
        'gamePets': 'Pet',
        'raceRecords': 'Kỷ lục',
        'users': 'Người dùng'
    };
    return names[collection] || collection;
};

// Validate form data
const validateFormData = (collection, data) => {
    switch (collection) {
        case 'gameCars':
            return data.name && data.type && data.rarity && data.speed && data.acceleration;
        case 'gameMaps':
            return data.name && data.difficulty;
        case 'gamePets':
            return data.name && data.type && data.rarity;
        case 'raceRecords':
            return data.mapName && data.racerName && data.timeInSeconds && data.timeString;
        case 'users':
            return data.displayName && data.role && data.status;
        default:
            return true;
    }
};

// Close modal
window.closeModal = () => {
    document.getElementById('modal').classList.add('hidden');
    currentEditingItem = null;
    currentCollection = '';
};

// Show message
const showMessage = (message, isError = false) => {
    const container = document.getElementById('status-message');
    const className = isError
        ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-2xl p-4 rounded-xl'
        : 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-2xl p-4 rounded-xl';

    container.innerHTML = `<div class="flex items-center justify-center">
                <i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'} mr-3"></i>
                <span>${message}</span>
            </div>`;
    container.className = `fixed top-6 right-6 z-50 transition-all duration-300 transform opacity-100 translate-y-0 ${className}`;

    setTimeout(() => {
        container.classList.add('opacity-0', 'translate-y-[-20px]');
        container.classList.remove('opacity-100', 'translate-y-0');
    }, 4000);
};

// Logout
window.logout = async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Logout error:", error);
        showMessage("Lỗi khi đăng xuất!", true);
    }
};

// Reset all records to 00'00'00
window.handleResetAllRecords = async () => {
    if (!confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn thiết lập lại record của TÂT CẢ các map về 00'00'00 không?\n\nHành động này sẽ xóa tất cả kỷ lục hiện có và không thể hoàn tác!")) {
        return;
    }

    try {
        showMessage("⏳ Đang thiết lập lại record của tất cả các map...", false);

        const mapsSnapshot = await getDocs(collection(db, "gameMaps"));
        let updatedCount = 0;
        const batch = writeBatch(db);

        mapsSnapshot.forEach((docSnap) => {
            const mapRef = doc(db, "gameMaps", docSnap.id);
            batch.update(mapRef, {
                recordTime: "00'00'00",
                recordRacer: "",
                recordCar: "",
                recordPet: "",
                recordRacerIndex: -1,
                lastUpdated: serverTimestamp()
            });
            updatedCount++;
        });

        await batch.commit();

        showMessage(`✅ Đã làm mới record của ${updatedCount} map về 00'00'00`);

        // Refresh lại dữ liệu
        if (currentTab === 'maps') {
            await loadCollectionData('gameMaps', currentPage['gameMaps']);
        }

        // Log activity
        await logActivity('update', `Đã reset tất cả records về 00'00'00`, {
            mapsAffected: updatedCount
        });

    } catch (error) {
        console.error("Lỗi khi làm mới record:", error);
        showMessage("❌ Có lỗi xảy ra khi làm mới record. Vui lòng thử lại!", true);
    }
};

// ===== CROP MODAL FUNCTIONS FOR ADMIN AVATAR =====

// Hàm đóng modal crop avatar admin
window.closeAdminCropModal = () => {
    document.getElementById('admin-crop-image-modal').classList.add('hidden');
    document.getElementById('admin-crop-image-modal').classList.remove('flex');

    if (adminCropper) {
        adminCropper.destroy();
        adminCropper = null;
    }

    // Reset input file
    document.getElementById('admin-user-avatar-input').value = '';
};

// Hàm áp dụng crop cho avatar admin
window.applyAdminCrop = () => {
    if (!adminCropper) {
        showMessage('Lỗi: Không thể cắt ảnh. Vui lòng thử lại.', true);
        return;
    }

    try {
        // Lấy canvas từ cropper
        const canvas = adminCropper.getCroppedCanvas({
            maxWidth: 4096,
            maxHeight: 4096,
            fillColor: '#fff',
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        // Chuyển sang Base64
        const base64 = canvas.toDataURL('image/jpeg', 0.8);

        // Cập nhật preview
        const preview = document.getElementById('admin-user-avatar-preview');
        preview.src = base64;

        // Lưu Base64 vào input hidden
        document.getElementById('user-photoURL').value = base64;

        // Đóng modal
        closeAdminCropModal();

        showMessage('✅ Ảnh được cắt và tải lên thành công!');
    } catch (error) {
        console.error('Lỗi khi cắt ảnh:', error);
        showMessage('Lỗi khi cắt ảnh. Vui lòng thử lại.', true);
    }
};

// Hàm quay ảnh trong crop modal
window.rotateCropImageAdmin = () => {
    if (adminCropper) {
        adminCropper.rotate(45);
    }
};

// Hàm lật ảnh theo chiều ngang trong crop modal
window.flipCropImageHAdmin = () => {
    if (adminCropper) {
        const imageData = adminCropper.getImageData();
        adminCropper.setImageData({
            ...imageData,
            scaleX: (imageData.scaleX || 1) * -1,
        });
    }
};

// Hàm lật ảnh theo chiều dọc trong crop modal
window.flipCropImageVAdmin = () => {
    if (adminCropper) {
        const imageData = adminCropper.getImageData();
        adminCropper.setImageData({
            ...imageData,
            scaleY: (imageData.scaleY || 1) * -1,
        });
    }
};

// Hàm đặt tỷ lệ khung hình trong crop modal
window.setCropAspectRatioAdmin = (ratio) => {
    if (adminCropper) {
        adminCropper.setAspectRatio(ratio);
    }
};

// Initialize the app
initFirebase();

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const userAvatar = document.getElementById('user-avatar');
    if (userAvatar) {
        userAvatar.addEventListener('click', () => {
            const userMenu = document.getElementById('user-menu');
            if (userMenu) {
                userMenu.classList.toggle('hidden');
            }
        });
    }

    document.addEventListener('click', (e) => {
        const userAvatar = document.getElementById('user-avatar');
        const userMenu = document.getElementById('user-menu');

        if (userAvatar && userMenu) {
            if (!e.target.closest('#user-avatar') && !e.target.closest('#user-menu')) {
                userMenu.classList.add('hidden');
            }
        }
    });
});

// ========== SKELETON LOADING FUNCTIONS ==========

// Hiển thị skeleton loading cho table
const showSkeletonTable = (tableBodyId, rows = 5, cols = 6) => {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;

    let skeletonHTML = '';
    for (let i = 0; i < rows; i++) {
        skeletonHTML += '<tr>';
        for (let j = 0; j < cols; j++) {
            const width = j === 0 ? '40px' : (j === cols - 1 ? '100px' : 'auto');
            skeletonHTML += `
                <td>
                    <div class="skeleton skeleton-text" style="width: ${width === 'auto' ? Math.random() * 40 + 60 + '%' : width}; height: 20px;"></div>
                </td>
            `;
        }
        skeletonHTML += '</tr>';
    }
    tableBody.innerHTML = skeletonHTML;
};

// Hiển thị skeleton loading cho cards
const showSkeletonCards = (containerId, count = 4) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    let skeletonHTML = '';
    for (let i = 0; i < count; i++) {
        skeletonHTML += `
            <div class="skeleton skeleton-card"></div>
        `;
    }
    container.innerHTML = skeletonHTML;
};

// ========== BULK DELETE FUNCTIONS ==========

// Toggle chọn một record
window.toggleRecordSelection = (recordId) => {
    if (selectedRecords.has(recordId)) {
        selectedRecords.delete(recordId);
    } else {
        selectedRecords.add(recordId);
    }
    updateBulkActionsUI();
};

// Toggle chọn tất cả records
window.toggleSelectAllRecords = (checkbox) => {
    const checkboxes = document.querySelectorAll('.record-checkbox');

    if (checkbox.checked) {
        // Chọn tất cả records đang hiển thị
        checkboxes.forEach(cb => {
            selectedRecords.add(cb.dataset.id);
            cb.checked = true;
        });
    } else {
        // Bỏ chọn tất cả
        checkboxes.forEach(cb => {
            selectedRecords.delete(cb.dataset.id);
            cb.checked = false;
        });
    }
    updateBulkActionsUI();
};

// Cập nhật UI bulk actions
const updateBulkActionsUI = () => {
    const bulkActions = document.getElementById('bulk-actions');
    const bulkCount = document.getElementById('bulk-count');
    const selectAllCheckbox = document.getElementById('select-all-records');

    if (selectedRecords.size > 0) {
        bulkActions.classList.add('show');
        bulkCount.textContent = selectedRecords.size;
    } else {
        bulkActions.classList.remove('show');
    }

    // Update "select all" checkbox state
    const checkboxes = document.querySelectorAll('.record-checkbox');
    if (selectAllCheckbox && checkboxes.length > 0) {
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        const someChecked = Array.from(checkboxes).some(cb => cb.checked);
        selectAllCheckbox.checked = allChecked;
        selectAllCheckbox.indeterminate = someChecked && !allChecked;
    }
};

// Hủy bulk select
window.cancelBulkSelect = () => {
    selectedRecords.clear();
    document.querySelectorAll('.record-checkbox').forEach(cb => cb.checked = false);
    const selectAllCheckbox = document.getElementById('select-all-records');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    updateBulkActionsUI();
};

// Bulk delete records
window.bulkDeleteRecords = async () => {
    if (selectedRecords.size === 0) {
        showMessage('Vui lòng chọn ít nhất một kỷ lục để xóa', true);
        return;
    }

    const count = selectedRecords.size;

    // Confirm với SweetAlert2
    const result = await Swal.fire({
        title: 'Xác nhận xóa?',
        html: `Bạn có chắc muốn xóa <strong>${count}</strong> kỷ lục đã chọn?<br><small class="text-slate-400">Bạn có thể hoàn tác trong vòng 5 giây</small>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ff0066',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fas fa-trash-alt mr-2"></i>Xóa tất cả',
        cancelButtonText: 'Hủy'
    });

    if (!result.isConfirmed) return;

    try {
        // Backup dữ liệu để có thể undo
        deletedRecordsBackup = [];
        for (const recordId of selectedRecords) {
            const record = allRecords.find(r => r.id === recordId);
            if (record) {
                deletedRecordsBackup.push({ ...record });
            }
        }

        // Xóa từ Firestore
        const batch = writeBatch(db);
        for (const recordId of selectedRecords) {
            const docRef = doc(db, 'raceRecords', recordId);
            batch.delete(docRef);
        }
        await batch.commit();

        // Xóa khỏi local arrays
        allRecords = allRecords.filter(r => !selectedRecords.has(r.id));
        filteredRecords = filteredRecords.filter(r => !selectedRecords.has(r.id));

        // Clear selection
        selectedRecords.clear();
        updateBulkActionsUI();

        // Refresh table
        filterRecordsNew();

        // Hiển thị undo toast
        showUndoToast(`Đã xóa ${count} kỷ lục`);

    } catch (error) {
        console.error('Lỗi khi xóa records:', error);
        showMessage('Lỗi khi xóa kỷ lục. Vui lòng thử lại!', true);
    }
};

// ========== UNDO DELETE FUNCTIONS ==========

// Hiển thị undo toast
const showUndoToast = (message) => {
    const toast = document.getElementById('undo-toast');
    const toastText = document.getElementById('undo-toast-text');
    const timerBar = document.getElementById('undo-timer-bar');

    if (!toast || !toastText) return;

    toastText.textContent = message;

    // Reset animation
    if (timerBar) {
        timerBar.style.animation = 'none';
        timerBar.offsetHeight; // Trigger reflow
        timerBar.style.animation = 'timer-countdown 5s linear forwards';
    }

    // Show toast
    toast.classList.add('show');

    // Clear previous timeout
    if (undoTimeoutId) {
        clearTimeout(undoTimeoutId);
    }

    // Hide toast after 5 seconds
    undoTimeoutId = setTimeout(() => {
        hideUndoToast();
        deletedRecordsBackup = []; // Clear backup after timeout
    }, 5000);
};

// Ẩn undo toast
const hideUndoToast = () => {
    const toast = document.getElementById('undo-toast');
    if (toast) {
        toast.classList.remove('show');
    }
};

// Hoàn tác xóa
window.undoDelete = async () => {
    if (deletedRecordsBackup.length === 0) {
        showMessage('Không có dữ liệu để hoàn tác', true);
        return;
    }

    // Clear timeout
    if (undoTimeoutId) {
        clearTimeout(undoTimeoutId);
        undoTimeoutId = null;
    }

    try {
        // Khôi phục dữ liệu vào Firestore
        const batch = writeBatch(db);
        for (const record of deletedRecordsBackup) {
            const docRef = doc(db, 'raceRecords', record.id);
            const { id, ...recordData } = record; // Remove id from data
            batch.set(docRef, recordData);
        }
        await batch.commit();

        // Khôi phục vào local arrays
        allRecords.push(...deletedRecordsBackup);

        const count = deletedRecordsBackup.length;
        deletedRecordsBackup = [];

        // Hide toast
        hideUndoToast();

        // Refresh table
        filterRecordsNew();

        showMessage(`✅ Đã hoàn tác ${count} kỷ lục!`);

    } catch (error) {
        console.error('Lỗi khi hoàn tác:', error);
        showMessage('Lỗi khi hoàn tác. Vui lòng thử lại!', true);
    }
};