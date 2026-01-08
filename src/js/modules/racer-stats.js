/**
 * Racer Statistics System - Enhanced Version
 * Dashboard riêng cho từng tay đua với giao diện đẹp mắt
 * Load dữ liệu users với role "racer" từ Firestore
 */

class RacerStatsSystem {
    constructor() {
        this.allRacers = [];        // Users có role = 'racer'
        this.allRecords = [];       // Tất cả kỷ lục
        this.racerRecords = {};     // Records theo racer
        this.selectedRacer = null;
        this.charts = {};
        this.isLoaded = false;
        
        console.log('📊 RacerStatsSystem initialized');
        this.loadExternalLibraries();
    }

    // Load các thư viện cần thiết
    loadExternalLibraries() {
        // Load jsPDF cho export PDF
        if (!document.querySelector('script[src*="jspdf"]')) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            document.head.appendChild(script);
            
            const script2 = document.createElement('script');
            script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
            document.head.appendChild(script2);
        }
    }

    // Load dữ liệu users với role "racer" - SỬ DỤNG DỮ LIỆU ĐÃ CÓ SẴN
    loadRacersFromCache() {
        // Sử dụng allUsers đã load sẵn trong configdata.js thay vì query lại Firestore
        if (window.allUsers && window.allUsers.length > 0) {
            this.allRacers = window.allUsers.filter(user => user.role === 'racer');
            console.log(`✅ Loaded ${this.allRacers.length} racers from cache (allUsers: ${window.allUsers.length})`);
            return this.allRacers;
        }
        
        console.log('⚠️ window.allUsers not ready yet');
        return [];
    }

    // Load records - SỬ DỤNG DỮ LIỆU ĐÃ CÓ SẴN
    loadRecordsFromCache() {
        // Sử dụng allRecords đã load sẵn trong configdata.js
        if (window.allRecords && window.allRecords.length > 0) {
            this.allRecords = window.allRecords;
            console.log(`✅ Loaded ${this.allRecords.length} records from cache`);
            return this.allRecords;
        }
        console.log('⚠️ window.allRecords not ready yet');
        return [];
    }

    // Load và process data - TỐI ƯU: dùng cache trước
    async loadAndProcessData() {
        // Nếu đã loaded rồi thì chỉ render lại UI
        if (this.isLoaded && this.allRacers.length > 0) {
            console.log('📊 Data already loaded, re-rendering UI...');
            this.updateOverviewStats();
            this.renderRacerList();
            return;
        }

        try {
            console.log('📊 Loading racer stats data...');
            console.log('📊 window.allUsers:', window.allUsers?.length || 0);
            console.log('📊 window.allRecords:', window.allRecords?.length || 0);
            
            // Thử load từ cache trước (nhanh)
            this.loadRacersFromCache();
            this.loadRecordsFromCache();
            
            // Nếu đã có data thì process ngay
            if (this.allRacers.length > 0 && this.allRecords.length > 0) {
                console.log('✅ Data loaded from cache immediately');
                this.processRecordsByRacer();
                this.isLoaded = true;
                this.updateOverviewStats();
                this.renderRacerList();
                return;
            }
            
            // Nếu không có dữ liệu cache, chờ và thử lại
            console.log('⏳ Waiting for data from configdata.js...');
            
            // Chờ tối đa 5 giây để dữ liệu được load
            let attempts = 0;
            const maxAttempts = 25;
            
            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 200));
                this.loadRacersFromCache();
                this.loadRecordsFromCache();
                
                console.log(`⏳ Attempt ${attempts + 1}: racers=${this.allRacers.length}, records=${this.allRecords.length}`);
                
                if (this.allRacers.length > 0 && this.allRecords.length > 0) {
                    console.log('✅ Data loaded from cache after waiting');
                    break;
                }
                attempts++;
            }
            
            // Nếu có racers nhưng không có records, vẫn tiến hành (có thể racer chưa có kỷ lục)
            if (this.allRacers.length > 0) {
                console.log('✅ Racers found, proceeding...');
                this.processRecordsByRacer();
                this.isLoaded = true;
                this.updateOverviewStats();
                this.renderRacerList();
                return;
            }
            
            // Nếu vẫn không có racers, query Firestore (fallback)
            if (this.allRacers.length === 0) {
                console.log('🔄 Fallback: Loading racers from Firestore...');
                await this.loadRacersFromFirestore();
            }
            
            if (this.allRecords.length === 0) {
                console.log('🔄 Fallback: Loading records from Firestore...');
                await this.loadRecordsFromFirestore();
            }

            // Process records by racer
            this.processRecordsByRacer();
            
            this.isLoaded = true;
            console.log(`✅ Racer stats ready: ${this.allRacers.length} racers, ${this.allRecords.length} records`);
            
            // Update UI
            this.updateOverviewStats();
            this.renderRacerList();
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Lỗi tải dữ liệu. Vui lòng thử lại.');
        }
    }

    // Fallback: Load racers từ Firestore nếu cache rỗng
    async loadRacersFromFirestore() {
        try {
            const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
            
            if (!window.firestoreDb) {
                console.error('Firestore DB not found');
                return [];
            }
            
            const usersRef = collection(window.firestoreDb, 'users');
            const racerQuery = query(usersRef, where('role', '==', 'racer'));
            const snapshot = await getDocs(racerQuery);
            
            this.allRacers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            console.log(`✅ Loaded ${this.allRacers.length} racers from Firestore`);
            return this.allRacers;
        } catch (error) {
            console.error('Error loading racers from Firestore:', error);
            return [];
        }
    }

    // Fallback: Load records từ Firestore nếu cache rỗng
    async loadRecordsFromFirestore() {
        try {
            const { collection, getDocs, orderBy, query } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
            
            if (!window.firestoreDb) {
                console.error('Firestore DB not found');
                return [];
            }
            
            const recordsRef = collection(window.firestoreDb, 'raceRecords');
            const recordsQuery = query(recordsRef, orderBy('timestamp', 'desc'));
            const snapshot = await getDocs(recordsQuery);
            
            this.allRecords = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            console.log(`✅ Loaded ${this.allRecords.length} records from Firestore`);
            return this.allRecords;
        } catch (error) {
            console.error('Error loading records from Firestore:', error);
            return [];
        }
    }

    // Hiển thị lỗi
    showError(message) {
        const container = document.getElementById('racer-list');
        if (container) {
            container.innerHTML = `
                <div class="p-8 text-center">
                    <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                        <i class="fas fa-exclamation-triangle text-2xl text-red-400"></i>
                    </div>
                    <p class="text-red-400">${message}</p>
                    <button onclick="window.racerStatsTab.refresh()" class="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm">
                        <i class="fas fa-redo mr-2"></i>Thử lại
                    </button>
                </div>
            `;
        }
    }

    // Lấy tên hiển thị của racer - ƯU TIÊN NICKNAME
    getRacerDisplayName(racer) {
        return racer.nickname || racer.displayName || racer.email || 'Unknown';
    }

    // Process records và gán cho mỗi racer
    processRecordsByRacer() {
        this.racerRecords = {};
        
        // Tạo object lưu records cho mỗi racer - ƯU TIÊN NICKNAME
        this.allRacers.forEach(racer => {
            const racerName = this.getRacerDisplayName(racer);
            this.racerRecords[racerName] = {
                racer: racer,
                records: [],
                totalRecords: 0,
                bestTimes: {},
                mapsPlayed: new Set(),
                carsUsed: new Set(),
                firstRecord: null,
                lastRecord: null
            };
        });

        // Phân bổ records cho mỗi racer
        this.allRecords.forEach(record => {
            const racerName = record.racerName;
            if (!racerName) return;

            // Tìm trong allRacers - match với cả nickname và displayName
            const matchedRacer = this.allRacers.find(r => 
                r.nickname === racerName ||
                r.displayName === racerName || 
                (r.nickname && r.nickname.toLowerCase() === racerName.toLowerCase()) ||
                (r.displayName && r.displayName.toLowerCase() === racerName.toLowerCase())
            );

            if (matchedRacer) {
                const key = this.getRacerDisplayName(matchedRacer);
                if (this.racerRecords[key]) {
                    this.racerRecords[key].records.push(record);
                    this.racerRecords[key].totalRecords++;
                    this.racerRecords[key].mapsPlayed.add(record.mapName);
                    if (record.car) this.racerRecords[key].carsUsed.add(record.car);

                    // Track best times per map
                    const mapName = record.mapName;
                    const time = record.timeInSeconds || Infinity;
                    if (!this.racerRecords[key].bestTimes[mapName] || time < this.racerRecords[key].bestTimes[mapName].time) {
                        this.racerRecords[key].bestTimes[mapName] = {
                            time: time,
                            car: record.car,
                            date: record.timestamp
                        };
                    }

                    // Track dates
                    const recordDate = record.timestamp ? new Date(record.timestamp) : null;
                    if (recordDate) {
                        if (!this.racerRecords[key].firstRecord || recordDate < this.racerRecords[key].firstRecord) {
                            this.racerRecords[key].firstRecord = recordDate;
                        }
                        if (!this.racerRecords[key].lastRecord || recordDate > this.racerRecords[key].lastRecord) {
                            this.racerRecords[key].lastRecord = recordDate;
                        }
                    }
                }
            }
        });

        // Sort racers by total records
        const sortedRacers = Object.entries(this.racerRecords)
            .sort((a, b) => b[1].totalRecords - a[1].totalRecords);
        
        // Assign rankings
        sortedRacers.forEach(([name, data], index) => {
            this.racerRecords[name].ranking = index + 1;
        });
    }

    // Update overview stats
    updateOverviewStats() {
        const totalRacers = this.allRacers.length;
        const totalRecords = this.allRecords.length;
        const totalMaps = new Set(this.allRecords.map(r => r.mapName)).size;
        
        // Find top racer
        let topRacer = 'N/A';
        let maxRecords = 0;
        Object.entries(this.racerRecords).forEach(([name, data]) => {
            if (data.totalRecords > maxRecords) {
                maxRecords = data.totalRecords;
                topRacer = name;
            }
        });

        // Update DOM
        const el1 = document.getElementById('racer-stats-total');
        const el2 = document.getElementById('racer-stats-records');
        const el3 = document.getElementById('racer-stats-maps');
        const el4 = document.getElementById('racer-stats-top');
        
        if (el1) el1.innerHTML = totalRacers;
        if (el2) el2.innerHTML = totalRecords;
        if (el3) el3.innerHTML = totalMaps;
        if (el4) el4.innerHTML = topRacer;
    }

    // Render danh sách tay đua
    renderRacerList() {
        const container = document.getElementById('racer-list');
        const skeleton = document.getElementById('racer-list-skeleton');
        
        if (!container) return;

        // Hide skeleton, show list
        if (skeleton) skeleton.classList.add('hidden');
        container.classList.remove('hidden');

        if (this.allRacers.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center">
                    <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                        <i class="fas fa-users-slash text-2xl text-slate-500"></i>
                    </div>
                    <p class="text-slate-400">Không có tay đua nào</p>
                    <p class="text-slate-500 text-sm mt-1">Chưa có người dùng với role "racer"</p>
                </div>
            `;
            return;
        }

        // Sort racers by total records
        const sortedRacers = Object.entries(this.racerRecords)
            .sort((a, b) => b[1].totalRecords - a[1].totalRecords);

        container.innerHTML = `
            <div class="p-2 space-y-2">
                ${sortedRacers.map(([name, data], index) => {
                    const racer = data.racer;
                    const avatar = racer.photoURL || null;
                    const initial = name.charAt(0).toUpperCase();
                    const isActive = this.selectedRacer === name;
                    const rank = index + 1;
                    
                    let rankBadge = '';
                    if (rank <= 3) {
                        rankBadge = `<div class="racer-rank-badge racer-rank-${rank}">${rank}</div>`;
                    }

                    return `
                        <div class="racer-card relative p-3 rounded-xl bg-slate-800/50 ${isActive ? 'active' : ''}"
                             onclick="window.racerStatsTab.selectRacer('${name.replace(/'/g, "\\'")}')">
                            ${rankBadge}
                            <div class="flex items-center gap-3">
                                <div class="relative">
                                    ${avatar 
                                        ? `<img src="${avatar}" class="w-10 h-10 rounded-full object-cover border-2 border-slate-600" alt="${name}">`
                                        : `<div class="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white font-bold">${initial}</div>`
                                    }
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="font-medium text-white truncate">${name}</div>
                                    <div class="text-xs text-slate-400 flex items-center gap-2">
                                        <span><i class="fas fa-trophy text-yellow-400 mr-1"></i>${data.totalRecords}</span>
                                        <span><i class="fas fa-map text-cyan-400 mr-1"></i>${data.mapsPlayed.size}</span>
                                    </div>
                                </div>
                                <i class="fas fa-chevron-right text-slate-500"></i>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        // Populate compare selects
        this.populateCompareSelects();
    }

    // Populate compare dropdowns
    populateCompareSelects() {
        const sortedRacers = Object.keys(this.racerRecords).sort();
        
        for (let i = 1; i <= 4; i++) {
            const select = document.getElementById(`compare-racer-${i}`);
            if (select) {
                const defaultText = i <= 2 ? `Tay đua ${i}` : `Tay đua ${i} (tùy chọn)`;
                select.innerHTML = `
                    <option value="">${defaultText}</option>
                    ${sortedRacers.map(name => `<option value="${name}">${name}</option>`).join('')}
                `;
            }
        }
    }

    // Filter racer list by search
    filterRacerList() {
        const searchInput = document.getElementById('racer-search-input');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        
        const cards = document.querySelectorAll('.racer-card');
        cards.forEach(card => {
            const name = card.querySelector('.font-medium').textContent.toLowerCase();
            card.style.display = name.includes(searchTerm) ? '' : 'none';
        });
    }

    // Select and show racer detail
    selectRacer(racerName) {
        this.selectedRacer = racerName;
        const data = this.racerRecords[racerName];
        
        if (!data) {
            console.error('Racer data not found:', racerName);
            return;
        }

        // Update active state in list
        document.querySelectorAll('.racer-card').forEach(card => {
            card.classList.remove('active');
            if (card.querySelector('.font-medium').textContent === racerName) {
                card.classList.add('active');
            }
        });

        // Show detail content
        const emptyState = document.getElementById('racer-detail-empty');
        const detailContent = document.getElementById('racer-detail-content');
        
        if (emptyState) emptyState.classList.add('hidden');
        if (detailContent) detailContent.classList.remove('hidden');

        // Update racer header
        this.updateRacerHeader(racerName, data);
        
        // Update stats
        this.updateRacerStats(data);
        
        // Render charts
        this.renderRacerCharts(data);
        
        // Render best times table
        this.renderBestTimesTable(data);
        
        // Render recent records
        this.renderRecentRecords(data);
    }

    // Update racer header
    updateRacerHeader(name, data) {
        const racer = data.racer;
        const avatar = racer.photoURL;
        const initial = name.charAt(0).toUpperCase();
        
        // Avatar
        const avatarEl = document.getElementById('racer-detail-avatar');
        if (avatarEl) {
            if (avatar) {
                avatarEl.innerHTML = `<img src="${avatar}" class="w-full h-full rounded-full object-cover" alt="${name}">`;
            } else {
                avatarEl.innerHTML = initial;
            }
        }
        
        // Name
        const nameEl = document.getElementById('racer-detail-name');
        if (nameEl) nameEl.textContent = name;
        
        // Info
        const ranking = data.ranking || 0;
        const totalRecords = data.totalRecords;
        const infoEl = document.getElementById('racer-detail-info');
        if (infoEl) infoEl.textContent = `Hạng #${ranking} • ${totalRecords} kỷ lục`;
        
        // Last active
        const lastActive = data.lastRecord ? data.lastRecord.toLocaleDateString('vi-VN') : '--/--/----';
        const lastActiveEl = document.getElementById('racer-detail-lastactive');
        if (lastActiveEl) lastActiveEl.textContent = lastActive;
    }

    // Update racer stats
    updateRacerStats(data) {
        // Total records
        const recordsEl = document.getElementById('racer-stat-records');
        if (recordsEl) recordsEl.textContent = data.totalRecords;
        
        // Best time
        let bestTime = Infinity;
        Object.values(data.bestTimes).forEach(bt => {
            if (bt.time < bestTime) bestTime = bt.time;
        });
        const bestEl = document.getElementById('racer-stat-best');
        if (bestEl) bestEl.textContent = this.formatTime(bestTime);
        
        // Average time
        const totalTime = data.records.reduce((sum, r) => sum + (r.timeInSeconds || 0), 0);
        const avgTime = data.records.length > 0 ? totalTime / data.records.length : 0;
        const avgEl = document.getElementById('racer-stat-avg');
        if (avgEl) avgEl.textContent = this.formatTime(avgTime);
        
        // Maps played
        const mapsEl = document.getElementById('racer-stat-maps');
        if (mapsEl) mapsEl.textContent = data.mapsPlayed.size;
        
        const mapsCountEl = document.getElementById('racer-maps-count');
        if (mapsCountEl) mapsCountEl.textContent = `${data.mapsPlayed.size} maps`;
    }

    // Render charts
    renderRacerCharts(data) {
        // Destroy existing charts
        if (this.charts.progress) {
            this.charts.progress.destroy();
            this.charts.progress = null;
        }
        if (this.charts.mapDist) {
            this.charts.mapDist.destroy();
            this.charts.mapDist = null;
        }

        // Progress Chart
        const progressCtx = document.getElementById('racer-progress-chart');
        if (progressCtx && data.records.length > 0) {
            // Group records by month
            const monthlyData = {};
            data.records.forEach(record => {
                if (!record.timestamp) return;
                const date = new Date(record.timestamp);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { count: 0, sum: 0, best: Infinity };
                }
                monthlyData[monthKey].count++;
                monthlyData[monthKey].sum += record.timeInSeconds || 0;
                monthlyData[monthKey].best = Math.min(monthlyData[monthKey].best, record.timeInSeconds || Infinity);
            });

            const sortedMonths = Object.keys(monthlyData).sort();
            const labels = sortedMonths.map(m => {
                const [year, month] = m.split('-');
                return `${month}/${year.slice(2)}`;
            });

            this.charts.progress = new Chart(progressCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Thời gian TB (giây)',
                        data: sortedMonths.map(m => (monthlyData[m].sum / monthlyData[m].count).toFixed(2)),
                        borderColor: '#00f3ff',
                        backgroundColor: 'rgba(0, 243, 255, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#00f3ff',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 4
                    }, {
                        label: 'Thời gian tốt nhất',
                        data: sortedMonths.map(m => monthlyData[m].best === Infinity ? null : monthlyData[m].best.toFixed(2)),
                        borderColor: '#00ff9d',
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        tension: 0.4,
                        pointBackgroundColor: '#00ff9d',
                        pointRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { 
                            labels: { color: '#e2e8f0', usePointStyle: true }
                        }
                    },
                    scales: {
                        x: { 
                            ticks: { color: '#94a3b8' }, 
                            grid: { color: 'rgba(148, 163, 184, 0.1)' } 
                        },
                        y: { 
                            ticks: { color: '#94a3b8' }, 
                            grid: { color: 'rgba(148, 163, 184, 0.1)' },
                            title: { display: true, text: 'Giây', color: '#94a3b8' }
                        }
                    }
                }
            });
        }

        // Map Distribution Chart
        const mapCtx = document.getElementById('racer-map-chart');
        if (mapCtx && data.records.length > 0) {
            const mapCounts = {};
            data.records.forEach(r => {
                mapCounts[r.mapName] = (mapCounts[r.mapName] || 0) + 1;
            });

            const sortedMaps = Object.entries(mapCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8);

            const colors = [
                '#00f3ff', '#9d00ff', '#00ff9d', '#ff0066',
                '#ffcc00', '#0066ff', '#ff6600', '#00ccff'
            ];

            this.charts.mapDist = new Chart(mapCtx, {
                type: 'doughnut',
                data: {
                    labels: sortedMaps.map(m => m[0]),
                    datasets: [{
                        data: sortedMaps.map(m => m[1]),
                        backgroundColor: colors.slice(0, sortedMaps.length),
                        borderColor: 'rgba(30, 30, 50, 1)',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { 
                                color: '#e2e8f0', 
                                font: { size: 11 },
                                usePointStyle: true,
                                padding: 15
                            }
                        }
                    }
                }
            });
        }
    }

    // Render best times table
    renderBestTimesTable(data) {
        const tbody = document.getElementById('racer-best-times-table');
        if (!tbody) return;

        const sortedMaps = Object.entries(data.bestTimes)
            .sort((a, b) => a[1].time - b[1].time);

        if (sortedMaps.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-slate-500">
                        <i class="fas fa-inbox text-2xl mb-2"></i>
                        <p>Chưa có kỷ lục nào</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sortedMaps.map(([mapName, bt], index) => {
            const playCount = data.records.filter(r => r.mapName === mapName).length;
            const rankIcon = index === 0 ? '<i class="fas fa-crown text-yellow-400 mr-2"></i>' : '';
            
            return `
                <tr class="hover:bg-slate-800/50 transition-colors">
                    <td class="px-4 py-3">
                        <div class="flex items-center">
                            ${rankIcon}
                            <span class="text-white">${mapName}</span>
                        </div>
                    </td>
                    <td class="px-4 py-3">
                        <span class="font-mono text-cyan-400 font-medium">${this.formatTime(bt.time)}</span>
                    </td>
                    <td class="px-4 py-3 text-slate-300">${bt.car || 'N/A'}</td>
                    <td class="px-4 py-3">
                        <span class="px-2 py-1 rounded-full bg-slate-700 text-xs text-slate-300">${playCount} lần</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Render recent records
    renderRecentRecords(data) {
        const container = document.getElementById('racer-recent-records');
        if (!container) return;

        const recentRecords = data.records.slice(0, 10);

        if (recentRecords.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-slate-500">
                    <i class="fas fa-history text-2xl mb-2"></i>
                    <p>Chưa có kỷ lục nào</p>
                </div>
            `;
            return;
        }

        container.innerHTML = recentRecords.map(record => {
            const date = record.timestamp ? new Date(record.timestamp).toLocaleDateString('vi-VN') : 'N/A';
            const time = this.formatTime(record.timeInSeconds);
            
            return `
                <div class="p-4 hover:bg-slate-800/50 transition-colors flex items-center gap-4">
                    <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                        <i class="fas fa-flag-checkered text-cyan-400"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="font-medium text-white truncate">${record.mapName || 'Unknown Map'}</div>
                        <div class="text-sm text-slate-400">${record.car || 'N/A'} • ${date}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-mono text-cyan-400 font-medium">${time}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Toggle compare section
    toggleCompareSection() {
        const section = document.getElementById('compare-section');
        const icon = document.getElementById('compare-toggle-icon');
        
        if (section) {
            section.classList.toggle('hidden');
            if (icon) {
                icon.classList.toggle('fa-chevron-down');
                icon.classList.toggle('fa-chevron-up');
            }
        }
    }

    // Compare racers
    compareRacers() {
        const selectedRacers = [];
        for (let i = 1; i <= 4; i++) {
            const select = document.getElementById(`compare-racer-${i}`);
            if (select && select.value) {
                const data = this.racerRecords[select.value];
                if (data) {
                    selectedRacers.push({ name: select.value, data: data });
                }
            }
        }

        if (selectedRacers.length < 2) {
            Swal.fire({
                icon: 'warning',
                title: 'Chọn ít nhất 2 tay đua',
                text: 'Vui lòng chọn ít nhất 2 tay đua để so sánh',
                background: '#1e1e2e',
                color: '#fff'
            });
            return;
        }

        // Show compare results
        const resultsContainer = document.getElementById('compare-results');
        if (!resultsContainer) return;
        resultsContainer.classList.remove('hidden');

        const colors = ['#00f3ff', '#9d00ff', '#00ff9d', '#ff0066'];

        // Find common maps
        const commonMaps = new Set();
        selectedRacers.forEach((racer, i) => {
            const maps = Object.keys(racer.data.bestTimes);
            if (i === 0) {
                maps.forEach(m => commonMaps.add(m));
            } else {
                commonMaps.forEach(m => {
                    if (!maps.includes(m)) commonMaps.delete(m);
                });
            }
        });

        const gridCols = selectedRacers.length === 2 ? '2' : selectedRacers.length === 3 ? '3' : '4';

        resultsContainer.innerHTML = `
            <!-- Racer Cards -->
            <div class="grid grid-cols-2 md:grid-cols-${gridCols} gap-4 mb-6">
                ${selectedRacers.map((racer, i) => {
                    const avgTime = racer.data.records.length > 0 
                        ? racer.data.records.reduce((sum, r) => sum + (r.timeInSeconds || 0), 0) / racer.data.records.length 
                        : 0;
                    let bestTime = Infinity;
                    Object.values(racer.data.bestTimes).forEach(bt => {
                        if (bt.time < bestTime) bestTime = bt.time;
                    });
                    
                    return `
                        <div class="rounded-xl p-4 text-center" style="background: ${colors[i]}15; border: 2px solid ${colors[i]}50;">
                            <div class="w-14 h-14 mx-auto rounded-full flex items-center justify-center text-xl font-bold text-white mb-3" style="background: ${colors[i]}">
                                ${racer.name.charAt(0)}
                            </div>
                            <h4 class="font-bold text-white mb-3 truncate">${racer.name}</h4>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between px-2">
                                    <span class="text-slate-400">Kỷ lục:</span>
                                    <span class="text-white font-mono">${racer.data.totalRecords}</span>
                                </div>
                                <div class="flex justify-between px-2">
                                    <span class="text-slate-400">TB:</span>
                                    <span class="text-white font-mono">${this.formatTime(avgTime)}</span>
                                </div>
                                <div class="flex justify-between px-2">
                                    <span class="text-slate-400">Tốt nhất:</span>
                                    <span class="text-white font-mono">${this.formatTime(bestTime)}</span>
                                </div>
                                <div class="flex justify-between px-2">
                                    <span class="text-slate-400">Maps:</span>
                                    <span class="text-white">${racer.data.mapsPlayed.size}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <!-- Comparison Chart -->
            <div class="data-card p-4">
                <h4 class="text-lg font-bold text-white mb-4">So sánh theo Map chung (${commonMaps.size} maps)</h4>
                ${commonMaps.size > 0 
                    ? '<canvas id="compare-chart" height="300"></canvas>'
                    : '<p class="text-center text-slate-400 py-8">Không có map chung giữa các tay đua được chọn</p>'
                }
            </div>
        `;

        // Render comparison chart
        if (commonMaps.size > 0) {
            setTimeout(() => {
                const ctx = document.getElementById('compare-chart');
                if (ctx) {
                    if (this.charts.compare) this.charts.compare.destroy();
                    
                    this.charts.compare = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: Array.from(commonMaps),
                            datasets: selectedRacers.map((racer, i) => ({
                                label: racer.name,
                                data: Array.from(commonMaps).map(m => racer.data.bestTimes[m]?.time || 0),
                                backgroundColor: colors[i] + '80',
                                borderColor: colors[i],
                                borderWidth: 2
                            }))
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: { labels: { color: '#e2e8f0' } }
                            },
                            scales: {
                                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148, 163, 184, 0.1)' } },
                                y: { 
                                    ticks: { color: '#94a3b8' }, 
                                    grid: { color: 'rgba(148, 163, 184, 0.1)' },
                                    title: { display: true, text: 'Thời gian (giây)', color: '#94a3b8' }
                                }
                            }
                        }
                    });
                }
            }, 100);
        }
    }

    // Export PDF
    async exportPDF() {
        if (!this.selectedRacer) {
            Swal.fire({
                icon: 'info',
                title: 'Chọn tay đua',
                text: 'Vui lòng chọn một tay đua để xuất báo cáo PDF',
                background: '#1e1e2e',
                color: '#fff'
            });
            return;
        }

        if (typeof window.jspdf === 'undefined') {
            Swal.fire({
                icon: 'info',
                title: 'Đang tải...',
                text: 'Vui lòng thử lại sau vài giây',
                background: '#1e1e2e',
                color: '#fff',
                timer: 2000
            });
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const data = this.racerRecords[this.selectedRacer];

        // Title
        doc.setFontSize(20);
        doc.setTextColor(0, 150, 200);
        doc.text(`Bao cao Thanh tich - ${this.selectedRacer}`, 20, 20);

        // Date
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Xuat ngay: ${new Date().toLocaleDateString('vi-VN')}`, 20, 30);

        // Stats
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(`Tong ky luc: ${data.totalRecords}`, 20, 45);
        doc.text(`So ban do: ${data.mapsPlayed.size}`, 20, 55);

        const avgTime = data.records.reduce((sum, r) => sum + (r.timeInSeconds || 0), 0) / data.records.length;
        let bestTime = Infinity;
        Object.values(data.bestTimes).forEach(bt => {
            if (bt.time < bestTime) bestTime = bt.time;
        });
        
        doc.text(`Thoi gian TB: ${this.formatTime(avgTime)}`, 20, 65);
        doc.text(`Thoi gian tot nhat: ${this.formatTime(bestTime)}`, 20, 75);

        // Best times table
        doc.setFontSize(14);
        doc.text('Ky luc theo Map:', 20, 95);

        const tableData = Object.entries(data.bestTimes)
            .sort((a, b) => a[1].time - b[1].time)
            .map(([mapName, bt]) => [mapName, this.formatTime(bt.time), bt.car || 'N/A']);

        doc.autoTable({
            startY: 100,
            head: [['Ban do', 'Thoi gian', 'Xe']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [0, 150, 200] }
        });

        // Save
        doc.save(`racer-report-${this.selectedRacer.replace(/\s/g, '_')}.pdf`);

        Swal.fire({
            icon: 'success',
            title: 'Xuất PDF thành công!',
            text: `Đã tải xuống báo cáo của ${this.selectedRacer}`,
            background: '#1e1e2e',
            color: '#fff',
            timer: 2000
        });
    }

    // Init - Load lần đầu khi vào tab (không hiển thị thông báo)
    async init() {
        console.log('🚀 Initializing racer stats tab...');
        
        // Reset state
        this.selectedRacer = null;
        this.isLoaded = false;
        this.allRacers = [];
        this.allRecords = [];
        
        // Show skeleton
        const skeleton = document.getElementById('racer-list-skeleton');
        const list = document.getElementById('racer-list');
        if (skeleton) skeleton.classList.remove('hidden');
        if (list) list.classList.add('hidden');

        // Reset detail view
        const emptyState = document.getElementById('racer-detail-empty');
        const detailContent = document.getElementById('racer-detail-content');
        if (emptyState) emptyState.classList.remove('hidden');
        if (detailContent) detailContent.classList.add('hidden');

        // Reset stats to skeleton
        ['racer-stats-total', 'racer-stats-records', 'racer-stats-maps', 'racer-stats-top'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="skeleton-loading h-8 w-16 rounded"></div>';
        });

        // Load data - force reload từ cache hoặc Firestore
        await this.forceLoadData();
    }

    // Force load data - bỏ qua isLoaded check
    async forceLoadData() {
        try {
            console.log('📊 Force loading racer stats data...');
            
            // Load từ cache
            this.loadRacersFromCache();
            this.loadRecordsFromCache();
            
            // Nếu có data, process ngay
            if (this.allRacers.length > 0) {
                console.log(`✅ Loaded ${this.allRacers.length} racers, ${this.allRecords.length} records`);
                this.processRecordsByRacer();
                this.isLoaded = true;
                this.updateOverviewStats();
                this.renderRacerList();
                return;
            }
            
            // Nếu không có, chờ một chút rồi thử lại
            console.log('⏳ Waiting for data...');
            let attempts = 0;
            while (attempts < 20) {
                await new Promise(resolve => setTimeout(resolve, 250));
                this.loadRacersFromCache();
                this.loadRecordsFromCache();
                
                if (this.allRacers.length > 0) {
                    console.log(`✅ Loaded after ${attempts + 1} attempts`);
                    break;
                }
                attempts++;
            }
            
            // Fallback to Firestore
            if (this.allRacers.length === 0) {
                console.log('🔄 Loading from Firestore...');
                await this.loadRacersFromFirestore();
                await this.loadRecordsFromFirestore();
            }
            
            // Process và render
            this.processRecordsByRacer();
            this.isLoaded = true;
            this.updateOverviewStats();
            this.renderRacerList();
            
            console.log(`✅ Racer stats ready: ${this.allRacers.length} racers`);
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Lỗi tải dữ liệu. Vui lòng thử lại.');
        }
    }

    // Refresh data - với thông báo
    async refresh() {
        // Reset state
        this.selectedRacer = null;
        this.isLoaded = false;
        this.allRacers = [];
        this.allRecords = [];
        
        // Show skeleton
        const skeleton = document.getElementById('racer-list-skeleton');
        const list = document.getElementById('racer-list');
        if (skeleton) skeleton.classList.remove('hidden');
        if (list) list.classList.add('hidden');

        // Reset detail view
        const emptyState = document.getElementById('racer-detail-empty');
        const detailContent = document.getElementById('racer-detail-content');
        if (emptyState) emptyState.classList.remove('hidden');
        if (detailContent) detailContent.classList.add('hidden');

        // Reset stats to skeleton
        ['racer-stats-total', 'racer-stats-records', 'racer-stats-maps', 'racer-stats-top'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="skeleton-loading h-8 w-16 rounded"></div>';
        });

        // Force load data
        await this.forceLoadData();

        Swal.fire({
            icon: 'success',
            title: 'Đã làm mới!',
            background: '#1e1e2e',
            color: '#fff',
            timer: 1500
        });
    }

    // Format time helper
    formatTime(seconds) {
        if (!seconds || seconds === Infinity || isNaN(seconds)) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 100);
        return `${String(mins).padStart(2, '0')}'${String(secs).padStart(2, '0')}"${String(ms).padStart(2, '0')}`;
    }
}

// Initialize global instance
window.racerStatsTab = new RacerStatsSystem();

// Global functions for HTML onclick
window.filterRacerList = () => window.racerStatsTab.filterRacerList();
window.refreshRacerStats = () => window.racerStatsTab.refresh();
window.exportRacerPDF = () => window.racerStatsTab.exportPDF();
window.toggleCompareSection = () => window.racerStatsTab.toggleCompareSection();
window.compareRacers = () => window.racerStatsTab.compareRacers();

console.log('✅ RacerStatsSystem loaded');
