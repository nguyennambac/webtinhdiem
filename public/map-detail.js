import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDtFpBAuZ_3JHmMXq1uVShq4sm0zK9xqEI",
    authDomain: "tinhdiemtheog.firebaseapp.com",
    projectId: "tinhdiemtheog",
    storageBucket: "tinhdiemtheog.firebasestorage.app",
    messagingSenderId: "52564586448",
    appId: "1:52564586448:web:983bdc321423b81f5a53d5",
    measurementId: "G-PFTMHMTF6J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Global variables
let ALL_MAPS = [];
let currentMapData = null;
let currentMapIndex = 0;
let raceState = null;

// Utility Functions
const timeToSeconds = (timeString) => {
    if (!timeString || typeof timeString !== 'string') return null;
    timeString = timeString.trim();

    const match = timeString.match(/(\d+)'(\d+)'(\d+)/);
    if (match) {
        const minutes = parseInt(match[1]) || 0;
        const seconds = parseInt(match[2]) || 0;
        const milliseconds = parseInt(match[3]) || 0;
        return minutes * 60 + seconds + (milliseconds / 100);
    }

    if (timeString.length >= 5 && /^\d+$/.test(timeString)) {
        const ms = parseInt(timeString.slice(-2));
        const ss = parseInt(timeString.slice(-4, -2));
        const mm = parseInt(timeString.slice(0, -4));
        return mm * 60 + ss + (ms / 100);
    }

    return null;
};

const secondsToTimeString = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds <= 0) return "--'--'--";
    const totalMs = Math.round(totalSeconds * 100);
    const ms = totalMs % 100;
    const totalS = Math.floor(totalMs / 100);
    const seconds = totalS % 60;
    const minutes = Math.floor(totalS / 60);
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(minutes)}'${pad(seconds)}'${pad(ms)}`;
};

// Calculate map points
const calculateMapPoints = (timeStrings, mapName) => {
    const numRacers = raceState.racers.length;
    const points = new Array(numRacers).fill(0);
    const timesInSeconds = timeStrings.map(ts => timeToSeconds(ts));
    const validTimes = timesInSeconds.filter(t => t !== null && t > 0);

    if (validTimes.length === 0) return points;

    const bestTime = Math.min(...validTimes);

    for (let i = 0; i < numRacers; i++) {
        const racerTime = timesInSeconds[i];
        if (racerTime === null || racerTime <= 0) {
            points[i] = 0;
            continue;
        }

        const isKingMapWinner = raceState.racers[i].kingMap.trim() === mapName.trim();

        if (racerTime === bestTime) {
            points[i] = isKingMapWinner ? 12 : 11;
            continue;
        }

        const diff = racerTime - bestTime;
        const baseScore = 10;
        const penalty = Math.floor(diff);
        let score = Math.max(0, baseScore - penalty);
        points[i] = score;
    }

    return points;
};

// Calculate ranking
const calculateRanking = () => {
    const numRacers = raceState.racers.length;
    const rankingData = raceState.racers.map((racer, index) => ({
        originalIndex: index,
        name: racer.name.trim() || `Tay đua ${index + 1}`,
        totalScore: 0,
        rank: index + 1,
    }));

    raceState.maps.forEach(map => {
        const mapPoints = calculateMapPoints(map.times, map.name);
        mapPoints.forEach((points, racerIndex) => {
            rankingData[racerIndex].totalScore += points;
        });
    });

    rankingData.sort((a, b) => b.totalScore - a.totalScore);

    let currentRank = 1;
    for (let i = 0; i < rankingData.length; i++) {
        if (i > 0 && rankingData[i].totalScore < rankingData[i - 1].totalScore) {
            currentRank = i + 1;
        }
        rankingData[i].rank = currentRank;
    }

    return rankingData;
};

// Setup real-time listener for race state changes
const setupRealtimeListener = () => {
    try {
        const raceDocRef = doc(db, "raceState", "current");

        // Set up real-time listener
        onSnapshot(raceDocRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                console.log("Real-time update received!");

                const oldMapCount = raceState ? raceState.maps.length : 0;

                // Update race state
                raceState = docSnapshot.data();

                const newMapCount = raceState.maps.length;

                // Kiểm tra nếu có map mới được thêm vào
                if (newMapCount > oldMapCount) {
                    console.log(`New map detected! Old count: ${oldMapCount}, New count: ${newMapCount}`);
                    // Tự động chuyển đến map mới nhất
                    await autoNavigateToLatestMap();
                } else {
                    // Cập nhật map hiện tại nếu không có map mới
                    if (currentMapIndex >= 0 && currentMapIndex < raceState.maps.length) {
                        currentMapData = raceState.maps[currentMapIndex];

                        // Find map info from ALL_MAPS
                        const mapInfo = ALL_MAPS.find(m => m.name === currentMapData.name);

                        // Render map details with smooth transition
                        const mainContent = document.getElementById('main-content');
                        mainContent.style.opacity = '0.7';
                        mainContent.style.transition = 'opacity 0.3s';

                        // Render updated data
                        await renderMapDetails(currentMapData, mapInfo, raceState, currentMapIndex);
                        renderDetailedScoreboard();
                        updateNavigationButtons(currentMapIndex, raceState.maps.length);

                        // Fade back in
                        setTimeout(() => {
                            mainContent.style.opacity = '1';
                        }, 100);

                        // Show notification
                        showUpdateNotification();
                    }
                }
            }
        }, (error) => {
            console.error("Real-time listener error:", error);
        });

    } catch (error) {
        console.error("Error setting up real-time listener:", error);
    }
};

// Auto navigate to latest map
const autoNavigateToLatestMap = async () => {
    if (!raceState || !raceState.maps) return;

    const totalMaps = raceState.maps.length;
    const latestMapIndex = totalMaps - 1;

    // Nếu có map mới hơn map hiện tại
    if (latestMapIndex > currentMapIndex) {
        console.log(`Auto navigating to latest map: ${latestMapIndex}`);

        // Cập nhật currentMapIndex
        currentMapIndex = latestMapIndex;

        // Cập nhật URL
        const newUrl = `${window.location.pathname}?map=${currentMapIndex}`;
        window.history.pushState({ mapIndex: currentMapIndex }, '', newUrl);

        // Lấy dữ liệu map mới
        currentMapData = raceState.maps[currentMapIndex];
        const mapInfo = ALL_MAPS.find(m => m.name === currentMapData.name);

        // Thêm hiệu ứng fade out
        const mainContent = document.getElementById('main-content');
        mainContent.style.opacity = '0.5';
        mainContent.style.transition = 'opacity 0.3s';

        // Đợi animation
        await new Promise(resolve => setTimeout(resolve, 300));

        // Render lại nội dung
        await renderMapDetails(currentMapData, mapInfo, raceState, currentMapIndex);
        renderDetailedScoreboard();
        updateNavigationButtons(currentMapIndex, raceState.maps.length);

        // Scroll lên đầu trang
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Fade in
        mainContent.style.opacity = '1';

        // Hiển thị thông báo
        showUpdateNotification('Đã chuyển đến map mới nhất!');
    }
};

// Render Top 4 Records
const renderTop5Records = async (mapName) => {
    const recordsList = document.getElementById('top-records-list');

    if (!recordsList) return;

    try {
        // Lấy tất cả records của map này từ Firestore
        const recordsSnapshot = await getDocs(collection(db, "raceRecords"));

        // Lấy danh sách xe và pet từ database
        const carsSnapshot = await getDocs(collection(db, "gameCars"));
        const petsSnapshot = await getDocs(collection(db, "gamePets"));

        // Tạo map để tìm kiếm nhanh
        const carMap = new Map();
        const petMap = new Map();

        carsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            carMap.set(data.name, data.imageUrl);
        });

        petsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            petMap.set(data.name, data.imageUrl);
        });

        // Filter records cho map hiện tại
        const mapRecords = [];
        recordsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.mapName === mapName) {
                // Tìm imageUrl từ tên xe và pet
                const carName = data.car || "N/A";
                const petName = data.pet || "N/A";

                mapRecords.push({
                    id: doc.id,
                    racerName: data.racerName || "Unknown",
                    timeInSeconds: data.timeInSeconds || 0,
                    timeString: data.timeString || "--'--'--",
                    car: carName,
                    pet: petName,
                    carImageUrl: carMap.get(carName) || null,
                    petImageUrl: petMap.get(petName) || null,
                    timestamp: data.timestamp || ""
                });
            }
        });

        // Nếu không có records
        if (mapRecords.length === 0) {
            recordsList.innerHTML = `
                <div class="text-center text-slate-500 py-4">
                    <i class="fas fa-trophy text-3xl mb-2 opacity-30"></i>
                    <p>Chưa có record nào cho map này</p>
                </div>
            `;
            return;
        }

        // Sort theo thời gian tăng dần (nhanh nhất lên đầu)
        mapRecords.sort((a, b) => a.timeInSeconds - b.timeInSeconds);

        // Lấy top 4
        const top4 = mapRecords.slice(0, 4);

        // Render
        recordsList.innerHTML = '';

        top4.forEach((record, index) => {
            const rank = index + 1;
            let rankClass = '';
            let badgeClass = 'default';
            let rankIcon = rank;

            if (rank === 1) {
                rankClass = 'rank-1';
                badgeClass = 'gold';
                rankIcon = '🥇';
            } else if (rank === 2) {
                rankClass = 'rank-2';
                badgeClass = 'silver';
                rankIcon = '🥈';
            } else if (rank === 3) {
                rankClass = 'rank-3';
                badgeClass = 'bronze';
                rankIcon = '🥉';
            }

            const recordItem = document.createElement('div');
            recordItem.className = `record-item ${rankClass}`;

            recordItem.innerHTML = `
                <div class="record-rank-badge ${badgeClass}">
                    ${rank <= 3 ? rankIcon : rank}
                </div>
                
                <div class="flex items-start justify-between pr-10">
                    <div class="flex-1">
                        <!-- Racer Name -->
                        <div class="flex items-center gap-2 mb-1">
                            <i class="fas fa-user text-cyan-400 text-xs"></i>
                            <span class="font-semibold text-white text-sm">${record.racerName}</span>
                            ${rank === 1 ? '<i class="fas fa-crown text-yellow-400 text-xs ml-1"></i>' : ''}
                        </div>
                        
                        <!-- Time -->
                        <div class="text-2xl font-bold ${rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-orange-400' : 'text-cyan-400'} mb-2">
                            ${record.timeString}
                        </div>
                        
                        <!-- Equipment -->
                        <div style="display: flex; flex-direction: row; gap: 10px; align-items: center; margin-top: 8px;">
                           <div class="equipment-tag" style="min-width: 100px;">
    ${record.carImageUrl ?
                    `<img src="${record.carImageUrl}" alt="${record.car}" class="w-25 h-25 object-contain" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'inline-block\';">
                                     <i class="fas fa-car text-cyan-400" style="display:none;"></i>`
                    :
                    `<i class="fas fa-car text-cyan-400"></i>`
                }
                            </div>
                            <div class="equipment-tag" style="min-width: 100px;">
    ${record.petImageUrl ?
                    `<img src="${record.petImageUrl}" alt="${record.pet}" class="w-25 h-25 object-contain" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'inline-block\';">
                                     <i class="fas fa-paw text-purple-400" style="display:none;"></i>`
                    :
                    `<i class="fas fa-paw text-purple-400"></i>`
                }
                            </div>
                        </div>
                    </div>
                </div>
            `;

            recordsList.appendChild(recordItem);
        });

    } catch (error) {
        console.error("Lỗi khi tải top records:", error);
        recordsList.innerHTML = `
            <div class="text-center text-red-400 py-4">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                Không thể tải records
            </div>
        `;
    }
};

// Get most popular car and pet from race records
const getMostPopularEquipment = async (mapName) => {
    try {
        const recordsSnapshot = await getDocs(collection(db, "raceRecords"));
        const carsSnapshot = await getDocs(collection(db, "gameCars"));
        const petsSnapshot = await getDocs(collection(db, "gamePets"));

        // Create maps for quick lookup
        const carMap = new Map();
        const petMap = new Map();

        carsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            carMap.set(data.name, data.imageUrl);
        });

        petsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            petMap.set(data.name, data.imageUrl);
        });

        // Count cars and pets for this map
        const carCount = {};
        const petCount = {};

        recordsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.mapName === mapName) {
                const carName = data.car || "N/A";
                const petName = data.pet || "N/A";

                carCount[carName] = (carCount[carName] || 0) + 1;
                petCount[petName] = (petCount[petName] || 0) + 1;
            }
        });

        // Find most popular
        let popularCar = null;
        let popularCarImage = null;
        let popularPet = null;
        let popularPetImage = null;

        if (Object.keys(carCount).length > 0) {
            popularCar = Object.keys(carCount).reduce((a, b) =>
                carCount[a] > carCount[b] ? a : b
            );
            popularCarImage = carMap.get(popularCar) || null;
        }

        if (Object.keys(petCount).length > 0) {
            popularPet = Object.keys(petCount).reduce((a, b) =>
                petCount[a] > petCount[b] ? a : b
            );
            popularPetImage = petMap.get(popularPet) || null;
        }

        return {
            car: popularCar,
            carImage: popularCarImage,
            pet: popularPet,
            petImage: popularPetImage
        };

    } catch (error) {
        console.error("Lỗi khi lấy equipment phổ biến:", error);
        return {
            car: null,
            carImage: null,
            pet: null,
            petImage: null
        };
    }
};

// Get personal record for a racer on a specific map
const getPersonalRecord = async (racerName, mapName) => {
    try {
        const recordsSnapshot = await getDocs(collection(db, "raceRecords"));

        let bestRecord = null;
        let bestTime = Infinity;

        recordsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.racerName === racerName && data.mapName === mapName) {
                const timeInSeconds = data.timeInSeconds || 0;
                if (timeInSeconds > 0 && timeInSeconds < bestTime) {
                    bestTime = timeInSeconds;
                    bestRecord = {
                        timeString: data.timeString || "--'--'--",
                        timeInSeconds: timeInSeconds,
                        car: data.car || "N/A",
                        pet: data.pet || "N/A"
                    };
                }
            }
        });

        return bestRecord;
    } catch (error) {
        console.error(`Lỗi khi lấy kỷ lục cho ${racerName}:`, error);
        return null;
    }
};

// Calculate map selection percentage
const calculateMapSelectionRate = async (mapName) => {
    try {
        const recordsSnapshot = await getDocs(collection(db, "raceRecords"));

        let totalRecords = 0;
        let mapRecordsCount = 0;

        recordsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            totalRecords++;

            if (data.mapName === mapName) {
                mapRecordsCount++;
            }
        });

        if (totalRecords === 0) {
            return 0;
        }

        const percentage = ((mapRecordsCount / totalRecords) * 100).toFixed(1);
        return percentage;

    } catch (error) {
        console.error("Lỗi khi tính tỉ lệ chọn map:", error);
        return 0;
    }
};

// Show update notification
const showUpdateNotification = (message = 'Dữ liệu đã được cập nhật!') => {
    return;
};

// Get URL Parameters
const getUrlParameter = (name) => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
};

// Fetch game data from Firestore
const fetchGameDataFromFirestore = async () => {
    try {
        const mapsSnapshot = await getDocs(collection(db, "gameMaps"));
        ALL_MAPS = [];

        mapsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            ALL_MAPS.push({
                id: doc.id,
                name: data.name || "",
                description: data.description || "",
                imageUrl: data.imageUrl || null,
                difficulty: data.difficulty || "Medium",
                recordTime: data.recordTime || "00'00'00",
                recordRacer: data.recordRacer || "",
                recordCar: data.recordCar || "",
                recordPet: data.recordPet || ""
            });
        });

        return ALL_MAPS;
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu từ Firestore:", error);
        return [];
    }
};

// Load race state and map data
const loadMapData = async () => {
    try {
        // Get map index from URL
        const mapIndexParam = getUrlParameter('map');
        if (mapIndexParam !== null) {
            currentMapIndex = parseInt(mapIndexParam);
        }

        // Load race state
        const raceDocRef = doc(db, "raceState", "current");
        const raceDoc = await getDoc(raceDocRef);

        if (!raceDoc.exists()) {
            throw new Error("Không tìm thấy dữ liệu race state");
        }

        raceState = raceDoc.data();

        // Get map data
        if (currentMapIndex >= 0 && currentMapIndex < raceState.maps.length) {
            currentMapData = raceState.maps[currentMapIndex];

            // Find map info from ALL_MAPS
            const mapInfo = ALL_MAPS.find(m => m.name === currentMapData.name);

            // Render map details - NOW AWAIT
            await renderMapDetails(currentMapData, mapInfo, raceState, currentMapIndex);

            // Render detailed scoreboard
            renderDetailedScoreboard();

            // Update navigation buttons
            updateNavigationButtons(currentMapIndex, raceState.maps.length);
        } else {
            throw new Error("Index map không hợp lệ");
        }

    } catch (error) {
        console.error("Lỗi khi tải dữ liệu map:", error);
        showError("Không thể tải thông tin map. Vui lòng thử lại sau.");
    }
};

// Render detailed scoreboard
const renderDetailedScoreboard = () => {
    const thead = document.getElementById('detailed-scoreboard-header');
    const tbody = document.getElementById('detailed-scoreboard-body');
    const table = thead.closest('table');

    if (!raceState || raceState.maps.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = `<tr><td colspan="100%" class="text-center py-8 text-slate-500">Chưa có bản đồ nào được thêm vào.</td></tr>`;
        return;
    }

    const rankingData = calculateRanking();
    const mapPointsMatrix = raceState.maps.map(map => calculateMapPoints(map.times, map.name));

    // Tạo colgroup để áp dụng background cho cả cột
    let colgroupHtml = '<colgroup>';
    colgroupHtml += '<col style="width: 80px; min-width: 80px;">'; // Cột Hạng
    colgroupHtml += '<col style="width: 180px; min-width: 180px;">'; // Cột Tay Đua

    raceState.maps.forEach((map) => {
        // Tìm thông tin map từ ALL_MAPS để lấy imageUrl
        const mapInfo = ALL_MAPS.find(m => m.name === map.name);
        const mapImageUrl = mapInfo?.imageUrl || '';

        const backgroundStyle = mapImageUrl ?
            `background-image: url('${mapImageUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` :
            '';

        colgroupHtml += `<col class="map-column-bg" style="${backgroundStyle} width: 210px; min-width: 210px; max-width: 210px;">`;
    });

    colgroupHtml += '<col style="width: 150px; min-width: 150px;">'; // Cột Tổng Điểm
    colgroupHtml += '</colgroup>';

    // Xóa colgroup cũ nếu có
    const oldColgroup = table.querySelector('colgroup');
    if (oldColgroup) {
        oldColgroup.remove();
    }

    // Thêm colgroup mới
    table.insertAdjacentHTML('afterbegin', colgroupHtml);

    // Tạo header
    let headerRow1 = `<tr>
        <th scope="col" class="px-6 py-4 text-center text-sm font-extrabold uppercase tracking-wider text-cyan-400" style="width: 80px;">Hạng</th> 
        <th scope="col" class="px-6 py-4 text-center text-sm font-extrabold uppercase tracking-wider text-cyan-400" style="width: 180px;">Tay Đua</th>`;

    raceState.maps.forEach((map, mapIndex) => {
        const isBtcMap = mapIndex === 0 && map.name.trim() === raceState.firstMapBtc.trim();
        const isKingMap = raceState.racers.some(r => r.kingMap.trim() === map.name.trim());
        let mapTypeIcon = '';

        if (isBtcMap) {
            mapTypeIcon = '<i class="fas fa-flag text-red-400 ml-1"></i>';
        } else if (isKingMap) {
            mapTypeIcon = '<i class="fas fa-crown text-amber-400 ml-1"></i>';
        }

        // Tìm thông tin map từ ALL_MAPS để lấy imageUrl cho header
        const mapInfo = ALL_MAPS.find(m => m.name === map.name);
        const mapImageUrl = mapInfo?.imageUrl || '';

        const backgroundStyle = mapImageUrl ?
            `background-image: url('${mapImageUrl}');` :
            '';

        headerRow1 += `<th scope="col" class="map-column-header px-4 py-4 text-center text-xs font-extrabold text-cyan-400 uppercase tracking-wider" style="${backgroundStyle} width: 210px; min-width: 210px; max-width: 210px;">
            <div class="map-column-header-content flex flex-col items-center justify-center">
                <span class="text-white font-bold drop-shadow-lg text-base">Trận ${mapIndex + 1}</span>
                <span class="text-slate-100 text-xs mt-2 flex items-center justify-center drop-shadow-md font-semibold">
                    ${map.name.trim() || 'Chưa đặt tên'} ${mapTypeIcon}
                </span>
            </div>
        </th>`;
    });

    headerRow1 += `<th scope="col" class="px-6 py-4 text-center text-base font-extrabold text-white bg-gradient-to-r from-red-700 to-red-800 uppercase tracking-wider" style="width: 150px;">Tổng Điểm</th></tr>`;
    thead.innerHTML = headerRow1;

    // Tạo body
    tbody.innerHTML = '';
    rankingData.forEach((racer, rankIndex) => {
        const racerIndex = racer.originalIndex;
        const racerName = racer.name;

        let rowHtml = `<tr class="hover:bg-slate-700/50 transition-colors ${racer.rank <= 3 ? 'font-bold' : ''}">`;

        rowHtml += `<td class="px-3 py-4 text-center text-lg font-extrabold text-white">${racer.rank}</td>`;
        rowHtml += `<td class="px-3 py-3 text-left text-sm font-semibold text-white">${racerName}</td>`;

        raceState.maps.forEach((map, mapIndex) => {
            const pointValue = mapPointsMatrix[mapIndex][racerIndex];

            rowHtml += `<td class="px-3 py-4 text-center">
                <div class="map-score-cell">+${pointValue}</div>
            </td>`;
        });

        rowHtml += `<td class="px-6 py-3 text-center text-lg font-extrabold bg-gradient-to-r from-red-800 to-red-900 text-white">${racer.totalScore}</td>`;
        rowHtml += `</tr>`;
        tbody.insertAdjacentHTML('beforeend', rowHtml);
    });
};

// Render map details
const renderMapDetails = async (mapData, mapInfo, raceState, mapIndex) => {
    // Update map number
    document.getElementById('map-number').textContent = `#${mapIndex + 1}`;

    // Update map preview
    const mapPreview = document.getElementById('map-preview');
    if (mapInfo && mapInfo.imageUrl) {
        mapPreview.style.backgroundImage = `url('${mapInfo.imageUrl}')`;
    }

    // Update map name
    document.getElementById('map-name').textContent = mapData.name || "NONAME";

    // Render stars based on difficulty
    renderMapStars(mapInfo?.difficulty);

    // Update difficulty badge
    const difficultyBadge = document.getElementById('difficulty-badge');
    if (difficultyBadge) {
        const difficulty = (mapInfo?.difficulty || "Medium").toLowerCase();
        difficultyBadge.className = `difficulty-badge difficulty-${difficulty} text-xs px-2 py-1`;
        difficultyBadge.innerHTML = `<i></i> <span class="text-l md:text-l font-bold"">${mapInfo?.difficulty || "Medium"}</span>`;
    }

    // Update map type badge
    const mapTypeBadge = document.getElementById('map-type-badge');
    if (mapTypeBadge) {
        const isBtcMap = mapIndex === 0 && mapData.name.trim() === raceState.firstMapBtc.trim();
        const isKingMap = raceState.racers.some(r => r.kingMap.trim() === mapData.name.trim());

        if (isBtcMap) {
            mapTypeBadge.innerHTML = '<i class="fas fa-flag mr-1"></i>Map BTC';
        } else if (isKingMap) {
            const kingOwner = raceState.racers.find(r => r.kingMap.trim() === mapData.name.trim());
            mapTypeBadge.innerHTML = `<i class="fas fa-crown mr-1"></i>King Map (${kingOwner?.name || 'N/A'})`;
        } else {
            mapTypeBadge.innerHTML = '<i class="fas fa-map mr-1"></i>Map Pick';
        }
    }

    // Update record info
    const mapRecordElement = document.getElementById('map-record');
    const recordHolderElement = document.getElementById('record-holder');

    if (mapRecordElement && recordHolderElement) {
        if (mapInfo && mapInfo.recordTime && mapInfo.recordTime !== "00'00'00") {
            mapRecordElement.textContent = mapInfo.recordTime;
            recordHolderElement.textContent = mapInfo.recordRacer || "未知";
        } else {
            mapRecordElement.textContent = "--'--'--";
            recordHolderElement.textContent = "暂无记录";
        }
    }

    // Update current lap time (fastest time in this race)
    const currentLapTimeElement = document.getElementById('current-lap-time');

    if (currentLapTimeElement) {
        const times = mapData.times.map(timeToSeconds).filter(t => t && t > 0);
        if (times.length > 0) {
            const fastestTime = Math.min(...times);
            currentLapTimeElement.textContent = secondsToTimeString(fastestTime);
        } else {
            currentLapTimeElement.textContent = "--'--'--";
        }
    }

    // Update map selection rate
    const averageTimeElement = document.getElementById('average-time');
    if (averageTimeElement) {
        const selectionRate = await calculateMapSelectionRate(mapData.name);
        averageTimeElement.textContent = `${selectionRate}%`;
    }

    await renderTop5Records(mapData.name);

    // Render racer legends
    renderRacerLegends(raceState.racers);

    // Render racers - NOW ASYNC
    await renderRacers(mapData, raceState);

    // Calculate and display statistics
    await calculateStatistics(mapData);
};

// Render stars based on difficulty
const renderMapStars = (difficulty) => {
    const starsContainer = document.getElementById('map-stars');
    if (!starsContainer) return;

    // Map difficulty to star count
    const starCounts = {
        "Cực khó": 7,
        "Rất khó": 6,
        "Khó": 5,
        "Trung bình": 4,
        "Dễ": 3
    };

    const starCount = starCounts[difficulty] || 1;

    // Clear existing stars
    starsContainer.innerHTML = '';

    // Add stars
    for (let i = 0; i < starCount; i++) {
        const star = document.createElement('i');
        star.className = 'fas fa-star text-cyan-400';
        starsContainer.appendChild(star);
    }
};

// Render racer legends with colors
const renderRacerLegends = (racers) => {
    const legendsContainer = document.getElementById('racer-legends');
    if (!legendsContainer) return;

    // Colors for each racer
    const racerColors = [
        'bg-yellow-400',   // Racer 1
        'bg-purple-400',   // Racer 2
        'bg-red-400',      // Racer 3
        'bg-green-400'     // Racer 4
    ];

    // Clear existing legends
    legendsContainer.innerHTML = '';

    // Add legend for each racer
    racers.forEach((racer, index) => {
        const racerName = racer.name || `Tay đua ${index + 1}`;
        const colorClass = racerColors[index] || 'bg-slate-400';

        const legend = document.createElement('div');
        legend.className = 'flex items-center gap-2';
        legend.innerHTML = `
            <div class="w-3 h-3 ${colorClass} rounded-sm"></div>
            <span class="text-xs text-slate-400">${racerName}</span>
        `;

        legendsContainer.appendChild(legend);
    });
};

// Render racers cards with dynamic layout
const renderRacers = async (mapData, raceState) => {
    const racersContainer = document.getElementById('racers-display-container');
    racersContainer.innerHTML = '';

    // Create racer data array with photo URLs
    const racersData = await Promise.all(raceState.racers.map(async (racer, index) => {
        let photoURL = null;
        let carImageUrl = null;
        let petImageUrl = null;

        try {
            const usersRef = collection(db, "users");
            const querySnapshot = await getDocs(usersRef);

            querySnapshot.forEach((doc) => {
                const userData = doc.data();
                if (userData.nickname === racer.name) {
                    // Ưu tiên photoBase64 nếu có (ảnh mới cập nhật), nếu không thì dùng photoURL
                    if (userData.photoBase64) {
                        photoURL = userData.photoBase64;
                    } else if (userData.photoURL && !userData.photoURL.includes('custom_avatar_')) {
                        photoURL = userData.photoURL;
                    }
                    return;
                }
            });
        } catch (error) {
            console.log(`Không tìm thấy ảnh cho ${racer.name}:`, error);
        }

        // Lấy hình ảnh xe
        const carName = mapData.cars[index];
        if (carName) {
            try {
                const carsSnapshot = await getDocs(collection(db, "gameCars"));
                carsSnapshot.forEach((doc) => {
                    if (doc.data().name === carName) {
                        carImageUrl = doc.data().imageUrl || null;
                    }
                });
            } catch (error) {
                console.log(`Không tìm thấy ảnh xe ${carName}:`, error);
            }
        }

        // Lấy hình ảnh pet
        const petName = mapData.pets[index];
        if (petName) {
            try {
                const petsSnapshot = await getDocs(collection(db, "gamePets"));
                petsSnapshot.forEach((doc) => {
                    if (doc.data().name === petName) {
                        petImageUrl = doc.data().imageUrl || null;
                    }
                });
            } catch (error) {
                console.log(`Không tìm thấy ảnh pet ${petName}:`, error);
            }
        }

        return {
            index: index,
            name: racer.name || `Tay đua ${index + 1}`,
            time: mapData.times[index] || null,
            timeInSeconds: timeToSeconds(mapData.times[index]),
            car: mapData.cars[index] || "Chưa chọn",
            pet: mapData.pets[index] || "Chưa chọn",
            carImageUrl: carImageUrl,
            petImageUrl: petImageUrl,
            kingMap: racer.kingMap,
            photoURL: photoURL
        };
    }));

    // Check if any racer has finished
    const hasAnyFinished = racersData.some(r => r.timeInSeconds && r.timeInSeconds > 0);

    if (!hasAnyFinished) {
        // Layout 2x2 when no one has finished
        await renderRacersGrid2x2(racersData, mapData, racersContainer);
    } else {
        // Leader + Top 3 layout when someone has finished
        renderLeaderLayout(racersData, mapData, racersContainer);
    }
};


// Render 2x2 grid layout (before race finishes)
const renderRacersGrid2x2 = async (racersData, mapData, container) => {
    const gridContainer = document.createElement('div');
    gridContainer.className = 'racers-grid-2x2';

    for (const racer of racersData) {
        const isKingMapOwner = racer.kingMap.trim() === mapData.name.trim();

        // Lấy kỷ lục cá nhân
        const personalRecord = await getPersonalRecord(racer.name, mapData.name);

        const racerCard = document.createElement('div');
        racerCard.className = 'racer-card-2x2';

        addCardEffects(racerCard);

        racerCard.innerHTML = `
            <div class="flex flex-col items-center">
                <!-- Player Photo -->
                <div class="racer-photo-2x2 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-xl flex items-center justify-center border-2 border-cyan-500/30 overflow-hidden">
                    ${racer.photoURL ?
                `<img src="${racer.photoURL}" alt="${racer.name}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                         <i class="fas fa-user text-5xl text-cyan-400" style="display:none;"></i>`
                :
                `<i class="fas fa-user text-5xl text-cyan-400"></i>`
            }
                </div>
                
                <!-- Player Info -->
                <div class="text-center mt-4 w-full">
                    <div class="flex items-center justify-center gap-2 mb-2">
                        <h4 class="text-xl font-bold text-white">
                            ${racer.name}
                        </h4>
                        ${isKingMapOwner ? '<i class="fas fa-crown text-amber-400 text-sm" title="King Map Owner"></i>' : ''}
                    </div>
                    
                    <div class="text-sm text-slate-400 mb-3">Player ${racer.index + 1}</div>
                    
                    <!-- Status -->
                    <div class="mb-4">
                        <span class="text-yellow-400 text-sm bg-yellow-500/20 px-4 py-2 rounded-full border border-yellow-500/30 inline-flex items-center gap-2">
                            <i class="fas fa-hourglass-half"></i>
                            Đang đua
                        </span>
                    </div>
                    
                    <!-- Personal Record -->
                    ${personalRecord ? `
                    <div class="mb-4 p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/30">
                        <div class="text-xs text-green-400 mb-1 uppercase tracking-wide font-semibold">
                            <i class="fas fa-trophy mr-1"></i>
                            Kỷ lục cá nhân
                        </div>
                        <div class="text-2xl font-bold text-green-400 font-orbitron">
                            ${personalRecord.timeString}
                        </div>
                    </div>
                    ` : `
                    <div class="mb-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                        <div class="text-xs text-slate-500 mb-1 uppercase tracking-wide">
                            <i class="fas fa-trophy mr-1"></i>
                            Kỷ lục cá nhân
                        </div>
                        <div class="text-lg text-slate-500">
                            Chưa có kỷ lục
                        </div>
                    </div>
                    `}
                    
                    <!-- Equipment Info -->
                    <div class="space-y-2">
                        <div class="flex items-center justify-center gap-3">
                            <div class="equipment-image-large car-image">
                                ${racer.carImageUrl ?
                `<img src="${racer.carImageUrl}" alt="${racer.car}" class="w-full h-full object-contain p-1" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <i class="fas fa-car text-cyan-400 text-xs" style="display:none;"></i>`
                :
                `<i class="fas fa-car text-cyan-400 text-xs"></i>`
            }
                            </div>
                            <div class="equipment-image-large pet-image">
                                ${racer.petImageUrl ?
                `<img src="${racer.petImageUrl}" alt="${racer.pet}" class="w-full h-full object-contain p-1" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <i class="fas fa-paw text-purple-400 text-xs" style="display:none;"></i>`
                :
                `<i class="fas fa-paw text-purple-400 text-xs"></i>`
            }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        gridContainer.appendChild(racerCard);
    }

    container.appendChild(gridContainer);
};

// Render leader + top 3 layout (after race finishes)
const renderLeaderLayout = (racersData, mapData, container) => {
    // Sort by time
    const sortedRacers = [...racersData].sort((a, b) => {
        if (!a.timeInSeconds) return 1;
        if (!b.timeInSeconds) return -1;
        return a.timeInSeconds - b.timeInSeconds;
    });

    const layoutContainer = document.createElement('div');
    layoutContainer.className = 'racers-leader-layout';

    // Render Leader (1st place)
    const leader = sortedRacers[0];
    if (leader && leader.timeInSeconds) {
        const isKingMapOwner = leader.kingMap.trim() === mapData.name.trim();
        const bonusPoints = isKingMapOwner ? 12 : 11;

        const leaderCard = document.createElement('div');
        leaderCard.className = 'leader-card-large';

        addCardEffects(leaderCard, 'leader');


        leaderCard.innerHTML = `
        <div class="racer-bonus-badge" style="position: absolute; top: 16px; right: 16px; z-index: 10;">+${bonusPoints}</div>
        
        <div class="flex flex-col items-center justify-center h-full">
            <!-- Leader Photo -->
            <div class="leader-photo-large bg-gradient-to-br from-yellow-500/20 to-orange-600/20 rounded-2xl flex items-center justify-center border-4 border-yellow-500/50 overflow-hidden shadow-2xl">
                ${leader.photoURL ?
                `<img src="${leader.photoURL}" alt="${leader.name}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                     <i class="fas fa-user text-7xl text-yellow-400" style="display:none;"></i>`
                :
                `<i class="fas fa-user text-7xl text-yellow-400"></i>`
            }
            </div>
            
            <!-- Leader Badge -->
            <div class="mt-6 mb-4">
                <div class="text-8xl font-bold text-yellow-400 drop-shadow-2xl">1</div>
                <div class="text-center mt-2">
                    <span class="text-yellow-400 text-sm font-semibold bg-yellow-500/20 px-4 py-1 rounded-full border border-yellow-500/30">
                        🏆
                    </span>
                </div>
            </div>
            
            <!-- Leader Name -->
            <div class="text-center mb-4">
                <h4 class="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-2">
                    ${leader.name}
                    ${isKingMapOwner ? '<i class="fas fa-crown text-amber-400" title="King Map Owner"></i>' : ''}
                </h4>
            </div>
            
            <!-- Leader Time -->
            <div class="text-5xl font-bold text-cyan-400 mb-6 drop-shadow-xl">
                ${leader.time}
            </div>
            
            <!-- Equipment (SIMPLIFIED - NO BORDERS) -->
            <div class="flex items-center justify-center gap-8 w-full mt-4">
                <!-- Car -->
                <div class="equipment-item-leader text-center">
                    <div class="mb-2">
                        ${leader.carImageUrl ?
                `<img src="${leader.carImageUrl}" alt="${leader.car}" class="w-50 h-50 object-contain mx-auto" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                             <i class="fas fa-car text-cyan-400 text-4xl" style="display:none;"></i>`
                :
                `<i class="fas fa-car text-cyan-400 text-4xl"></i>`
            }
                    </div>
                </div>
                
                <!-- Pet -->
                <div class="equipment-item-leader text-center">
                    <div class="mb-2">
                        ${leader.petImageUrl ?
                `<img src="${leader.petImageUrl}" alt="${leader.pet}" class="w-50 h-50 object-contain mx-auto" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                             <i class="fas fa-paw text-purple-400 text-4xl" style="display:none;"></i>`
                :
                `<i class="fas fa-paw text-purple-400 text-4xl"></i>`
            }
                    </div>
                </div>
            </div>
        </div>
    `;

        layoutContainer.appendChild(leaderCard);
    }

    // Render Top 3 (2nd, 3rd, 4th place)
    const top3Container = document.createElement('div');
    top3Container.className = 'top3-cards-container';

    for (let i = 1; i < Math.min(4, sortedRacers.length); i++) {
        const racer = sortedRacers[i];
        if (!racer.timeInSeconds) continue;

        const rank = i + 1;
        const isKingMapOwner = racer.kingMap.trim() === mapData.name.trim();

        // Calculate time difference and points
        const timeDiff = `+${(racer.timeInSeconds - sortedRacers[0].timeInSeconds).toFixed(2)}s`;
        const bestTime = sortedRacers[0].timeInSeconds;
        const diff = racer.timeInSeconds - bestTime;
        const baseScore = 10;
        const penalty = Math.floor(diff);
        const points = Math.max(0, baseScore - penalty);

        const top3Card = document.createElement('div');
        top3Card.className = 'top3-card-compact';

        addCardEffects(top3Card, 'top3');

        top3Card.innerHTML = `
            <div class="racer-bonus-badge" style="background: linear-gradient(135deg, #3b82f6, #2563eb); position: absolute; top: 12px; right: 12px; z-index: 10;">+${points}</div>
            <div class="flex items-center gap-4 w-full">
                <!-- Photo -->
                <div class="top3-photo-compact bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-xl flex items-center justify-center border-2 border-cyan-500/30 overflow-hidden flex-shrink-0">
                    ${racer.photoURL ?
                `<img src="${racer.photoURL}" alt="${racer.name}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                         <i class="fas fa-user text-3xl text-cyan-400" style="display:none;"></i>`
                :
                `<i class="fas fa-user text-3xl text-cyan-400"></i>`
            }
                </div>
                
                <!-- Info -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-2">
                        <h4 class="text-lg font-bold text-white truncate">
                            ${racer.name}
                        </h4>
                        ${isKingMapOwner ? '<i class="fas fa-crown text-amber-400 text-xs" title="King Map Owner"></i>' : ''}
                    </div>
                    
                    <div class="flex items-center gap-3 mb-3">
                        <div class="text-2xl font-bold text-cyan-400">
                            ${racer.time}
                        </div>
                        <div class="text-sm text-red-400">${timeDiff}</div>
                    </div>
                    
                    <div class="flex items-center gap-4 mt-2">
    <div class="flex items-center gap-4 mt-2">
            <div class="flex items-center gap-2">
                ${racer.carImageUrl ?
                `<img src="${racer.carImageUrl}" alt="${racer.car}" class="w-40 h-40 object-contain" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
                    <i class="fas fa-car text-cyan-400 text-lg" style="display:none;"></i>`
                :
                `<i class="fas fa-car text-cyan-400 text-lg"></i>`
            }
            </div>
            <div class="flex items-center gap-1">
                ${racer.petImageUrl ?
                `<img src="${racer.petImageUrl}" alt="${racer.pet}" class="w-40 h-40 object-contain" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
                    <i class="fas fa-paw text-purple-400 text-lg" style="display:none;"></i>`
                :
                `<i class="fas fa-paw text-purple-400 text-lg"></i>`
            }
            </div>
</div>
</div>
                </div>
                
                <!-- Rank -->
                <div class="text-right flex-shrink-0">
                    <div class="text-5xl font-bold ${rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-orange-400' : 'text-slate-500'}">
                        ${rank}
                    </div>
                </div>
            </div>
        `;

        top3Container.appendChild(top3Card);
    }

    layoutContainer.appendChild(top3Container);
    container.appendChild(layoutContainer);
};

// Calculate and display statistics
const calculateStatistics = async (mapData) => {
    const times = mapData.times.map(timeToSeconds).filter(t => t && t > 0);

    if (times.length > 0) {
        const fastest = Math.min(...times);
        const slowest = Math.max(...times);
        const diff = slowest - fastest;

        document.getElementById('time-diff').textContent = `+${diff.toFixed(2)}s`;
    } else {
        document.getElementById('time-diff').textContent = '-';
    }

    // Get most popular equipment from race records
    const popularEquipment = await getMostPopularEquipment(mapData.name);

    // Display popular car with image
    const popularCarElement = document.getElementById('popular-car');
    if (popularEquipment.car) {
        if (popularEquipment.carImage) {
            popularCarElement.innerHTML = `
                <div class="flex flex-col items-center gap-2">
                    <img src="${popularEquipment.carImage}" 
                         alt="${popularEquipment.car}" 
                         class="w-50 h-50 object-contain"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <i class="fas fa-car text-cyan-400 text-3xl" style="display:none;"></i>
                    <span class="text-sm text-slate-300 mt-1">${popularEquipment.car}</span>
                </div>
            `;
        } else {
            popularCarElement.innerHTML = `
                <div class="flex flex-col items-center gap-2">
                    <i class="fas fa-car text-cyan-400 text-3xl"></i>
                    <span class="text-sm text-slate-300 mt-1">${popularEquipment.car}</span>
                </div>
            `;
        }
    } else {
        popularCarElement.innerHTML = '<span class="text-slate-500">-</span>';
    }

    // Display popular pet with image
    const popularPetElement = document.getElementById('popular-pet');
    if (popularEquipment.pet) {
        if (popularEquipment.petImage) {
            popularPetElement.innerHTML = `
                <div class="flex flex-col items-center gap-2">
                    <img src="${popularEquipment.petImage}" 
                         alt="${popularEquipment.pet}" 
                         class="w-50 h-50 object-contain"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <i class="fas fa-paw text-purple-400 text-3xl" style="display:none;"></i>
                    <span class="text-sm text-slate-300 mt-1">${popularEquipment.pet}</span>
                </div>
            `;
        } else {
            popularPetElement.innerHTML = `
                <div class="flex flex-col items-center gap-2">
                    <i class="fas fa-paw text-purple-400 text-3xl"></i>
                    <span class="text-sm text-slate-300 mt-1">${popularEquipment.pet}</span>
                </div>
            `;
        }
    } else {
        popularPetElement.innerHTML = '<span class="text-slate-500">-</span>';
    }
};

// Navigate between maps - KHÔNG RELOAD TRANG
window.navigateMap = async (direction) => {
    const newIndex = currentMapIndex + direction;

    // Kiểm tra index hợp lệ
    if (newIndex < 0 || newIndex >= raceState.maps.length) {
        return;
    }

    // Cập nhật currentMapIndex
    currentMapIndex = newIndex;

    // Cập nhật URL không reload trang
    const newUrl = `${window.location.pathname}?map=${newIndex}`;
    window.history.pushState({ mapIndex: newIndex }, '', newUrl);

    // Lấy dữ liệu map mới
    currentMapData = raceState.maps[currentMapIndex];
    const mapInfo = ALL_MAPS.find(m => m.name === currentMapData.name);

    // Thêm hiệu ứng fade out
    const mainContent = document.getElementById('main-content');
    mainContent.style.opacity = '0.5';
    mainContent.style.transition = 'opacity 0.3s';

    // Đợi animation
    await new Promise(resolve => setTimeout(resolve, 300));

    // Render lại nội dung - NOW AWAIT
    await renderMapDetails(currentMapData, mapInfo, raceState, currentMapIndex);
    renderDetailedScoreboard();
    updateNavigationButtons(currentMapIndex, raceState.maps.length);

    // Scroll lên đầu trang mượt mà
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Fade in
    mainContent.style.opacity = '1';
};

// Update navigation buttons
const updateNavigationButtons = (currentIndex, totalMaps) => {
    const prevBtn = document.getElementById('prev-map-btn');
    const nextBtn = document.getElementById('next-map-btn');
    const navInfo = document.getElementById('map-navigation-info');

    // Update info text
    navInfo.textContent = `Map ${currentIndex + 1} / ${totalMaps}`;

    // Disable/enable buttons
    if (currentIndex === 0) {
        prevBtn.disabled = true;
        prevBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        prevBtn.disabled = false;
        prevBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    if (currentIndex === totalMaps - 1) {
        nextBtn.disabled = true;
        nextBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        nextBtn.disabled = false;
        nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
};

// Go back function
window.goBack = () => {
    window.location.href = 'index.html';
};

// Show error message
const showError = (message) => {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.innerHTML = `
        <div class="text-center">
            <i class="fas fa-exclamation-triangle text-red-400 text-5xl mb-4"></i>
            <p class="text-red-400 text-xl mb-2">${message}</p>
            <button onclick="goBack()" class="speed-button mt-4">
                <i class="fas fa-arrow-left mr-2"></i>
                Quay lại trang chủ
            </button>
        </div>
    `;
};

// Initialize
const init = async () => {
    try {
        // Check authentication
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Load data
                await fetchGameDataFromFirestore();
                await loadMapData();

                // Setup real-time listener
                setupRealtimeListener();

                // Hide loading screen
                document.getElementById('loading-screen').classList.add('hidden');
                document.getElementById('main-content').classList.remove('hidden');

                // Xử lý nút back/forward của browser
                window.addEventListener('popstate', async (event) => {
                    if (event.state && event.state.mapIndex !== undefined) {
                        currentMapIndex = event.state.mapIndex;

                        // Render lại với map index mới - NOW AWAIT
                        currentMapData = raceState.maps[currentMapIndex];
                        const mapInfo = ALL_MAPS.find(m => m.name === currentMapData.name);

                        await renderMapDetails(currentMapData, mapInfo, raceState, currentMapIndex);
                        renderDetailedScoreboard();
                        updateNavigationButtons(currentMapIndex, raceState.maps.length);

                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                });
            } else {
                window.location.href = 'login.html';
            }
        });
    } catch (error) {
        console.error("Lỗi khởi tạo:", error);
        showError("Có lỗi xảy ra khi tải dữ liệu");
    }
};

// Start app
init();