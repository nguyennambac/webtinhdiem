import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, onSnapshot, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
let ALL_USERS = [];
let ALL_CARS = [];
let ALL_PETS = [];
let ALL_RECORDS = [];
let currentMapData = null;
let currentMapIndex = 0;
let raceState = null;
let GLOBAL_CACHE_LOADED = false;

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

        onSnapshot(raceDocRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                console.log("⚡ Real-time update received!");

                const oldMapCount = raceState ? raceState.maps.length : 0;
                raceState = docSnapshot.data();
                const newMapCount = raceState.maps.length;

                // Khi có update, cũng nên làm mới cache records vì có thể vừa submit xong
                await refreshGlobalCache(['records']);

                if (newMapCount > oldMapCount) {
                    await autoNavigateToLatestMap();
                } else {
                    if (currentMapIndex >= 0 && currentMapIndex < raceState.maps.length) {
                        currentMapData = raceState.maps[currentMapIndex];
                        const mapInfo = ALL_MAPS.find(m => m.name === currentMapData.name);

                        // Render updated data - don't await everything to keep UI responsive
                        renderMapDetails(currentMapData, mapInfo, raceState, currentMapIndex);
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

// 🖼️ Preload images for nearby maps
const preloadAdjacentMapImages = () => {
    if (!raceState || !raceState.maps) return;

    const indicesToPreload = [currentMapIndex - 1, currentMapIndex + 1];
    indicesToPreload.forEach(idx => {
        if (idx >= 0 && idx < raceState.maps.length) {
            const mapName = raceState.maps[idx].name;
            const mapInfo = ALL_MAPS.find(m => m.name === mapName);
            if (mapInfo && mapInfo.imageUrl) {
                const img = new Image();
                img.src = mapInfo.imageUrl;
            }
        }
    });
};

const renderTop5RecordsBroadcast = async (mapName) => {
    if (!mapName) return;
    try {
        // Get from CACHE and sort in memory
        const records = ALL_RECORDS
            .filter(r => (r.mapName || "").trim().toLowerCase() === mapName.trim().toLowerCase())
            .sort((a, b) => (a.timeInSeconds || Infinity) - (b.timeInSeconds || Infinity))
            .slice(0, 6);

        // Use global findImg

        // 1. Update Best Racer (Global Record Holder)
        const best = records[0];
        const bestNameEl = document.getElementById('broadcast-best-racer-name');
        const bestRecordEl = document.getElementById('broadcast-best-record');
        const bestCarIcon = document.getElementById('broadcast-best-racer-car');
        const bestPetIcon = document.getElementById('broadcast-best-racer-pet');

        if (!bestNameEl || !bestRecordEl) return;

        if (best) {
            const carName = best.car || best.carName;
            const petName = best.pet || best.petName;

            bestNameEl.textContent = best.racerName;
            bestRecordEl.textContent = best.timeString;

            let carUrl = findImg("gameCars", carName);
            let petUrl = findImg("gamePets", petName);

            if (bestCarIcon) bestCarIcon.innerHTML = carUrl ? `<img src="${carUrl}" class="h-10 object-contain w-full">` : `<div class="text-xs text-slate-500">${carName || 'N/A'}</div>`;
            if (bestPetIcon) bestPetIcon.innerHTML = petUrl ? `<img src="${petUrl}" class="h-10 object-contain w-full">` : `<div class="text-xs text-slate-500">${petName || 'N/A'}</div>`;
        } else {
            bestNameEl.textContent = "CHƯA CÓ KỶ LỤC";
            bestRecordEl.textContent = "--:--.--";
            if (bestCarIcon) bestCarIcon.innerHTML = '<i class="fas fa-car text-slate-300"></i>';
            if (bestPetIcon) bestPetIcon.innerHTML = '<i class="fas fa-paw text-slate-300"></i>';
        }

        // 2. Update Top 2-6 Rankings List
        for (let i = 2; i <= 6; i++) {
            const record = records[i - 1];
            const nameEl = document.getElementById(`rank-${i}-name`);
            const timeEl = document.getElementById(`rank-${i}-time`);
            if (nameEl) {
                nameEl.textContent = record ? record.racerName : "Chưa có";
                if (timeEl) timeEl.textContent = record ? record.timeString : "--'--'--";
            }
        }
    } catch (error) {
        console.error("❌ Lỗi khi render Top Records:", error);
    }
};

// Render Popular Stats Section (Compact Images Only)
const renderPopularStats = async (mapName) => {
    const carsListEl = document.getElementById('popular-cars-list');
    const petsListEl = document.getElementById('popular-pets-list');

    if (!carsListEl || !petsListEl) return;

    const data = getTop3PopularEquipment(mapName);

    // Render Compact Cars
    carsListEl.innerHTML = data.cars.length > 0 ? '' : '<span class="text-sm text-slate-500 italic">Chưa có</span>';
    data.cars.forEach((item, i) => {
        const imgUrl = findImg("gameCars", item.name);
        let badgeClass = i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : 'bg-orange-600';
        carsListEl.innerHTML += `
            <div class="relative group" title="${item.name} (${item.count} lượt)">
                 <div class="w-20 h-14 flex items-center justify-center">
                    ${imgUrl ? `<img src="${imgUrl}" class="h-full object-contain hover:scale-110 transition-transform drop-shadow-md">` : '<i class="fas fa-car text-slate-600"></i>'}
                 </div>
                 <div class="absolute -top-1 -left-1 w-3 h-3 ${badgeClass} text-[8px] font-bold flex items-center justify-center rounded-full text-white shadow-sm">${i + 1}</div>
            </div>`;
    });

    // Render Compact Pets
    petsListEl.innerHTML = data.pets.length > 0 ? '' : '<span class="text-sm text-slate-500 italic">Chưa có</span>';
    data.pets.forEach((item, i) => {
        const imgUrl = findImg("gamePets", item.name);
        let badgeClass = i === 0 ? 'bg-yellow-500' : (i === 1 ? 'bg-gray-400' : 'bg-orange-600');
        petsListEl.innerHTML += `
            <div class="relative group" title="${item.name} (${item.count} lượt)">
                 <div class="w-20 h-14 flex items-center justify-center">
                    ${imgUrl ? `<img src="${imgUrl}" class="h-full object-contain hover:scale-110 transition-transform drop-shadow-md">` : '<i class="fas fa-paw text-slate-600"></i>'}
                 </div>
                 <div class="absolute -top-1 -left-1 w-3 h-3 ${badgeClass} text-[8px] font-bold flex items-center justify-center rounded-full text-white shadow-sm">${i + 1}</div>
            </div>`;
    });
};

// Show update notification
const showUpdateNotification = (message = 'Dữ liệu đã được cập nhật!') => {
    console.log("🔔 Notification:", message);
};

// HELPER: Fetch Car/Pet Images from cache
const findImg = (collectionName, itemName) => {
    if (!itemName) return null;
    const target = itemName.trim().toLowerCase();
    const collection = (collectionName === "gameCars" || collectionName === "cars") ? ALL_CARS : ALL_PETS;
    const found = collection.find(item => (item.name || "").trim().toLowerCase() === target);
    return found ? found.imageUrl : null;
};

// Get personal record for a racer on a specific map
const getPersonalRecord = (racerName, mapName) => {
    if (!racerName || !mapName) return null;
    const targetMap = mapName.trim().toLowerCase();
    const targetRacer = racerName.trim().toLowerCase();

    const personalRecords = ALL_RECORDS.filter(r =>
        (r.racerName || "").trim().toLowerCase() === targetRacer &&
        (r.mapName || "").trim().toLowerCase() === targetMap
    );

    if (personalRecords.length === 0) return null;

    const best = personalRecords.sort((a, b) => (a.timeInSeconds || Infinity) - (b.timeInSeconds || Infinity))[0];

    return {
        timeString: best.timeString || "--'--'--",
        timeInSeconds: best.timeInSeconds,
        car: best.car || "N/A",
        pet: best.pet || "N/A"
    };
};

// Get Top 3 most popular car and pet for a map
const getTop3PopularEquipment = (mapName) => {
    if (!mapName) return { cars: [], pets: [] };
    const carCount = {};
    const petCount = {};
    const targetMap = mapName.trim().toLowerCase();

    ALL_RECORDS.forEach(data => {
        if ((data.mapName || "").trim().toLowerCase() === targetMap) {
            const carName = data.car || data.carName;
            const petName = data.pet || data.petName;

            if (carName && carName !== "N/A") carCount[carName] = (carCount[carName] || 0) + 1;
            if (petName && petName !== "N/A") petCount[petName] = (petCount[petName] || 0) + 1;
        }
    });

    const sortedCars = Object.keys(carCount).sort((a, b) => carCount[b] - carCount[a]).slice(0, 3);
    const sortedPets = Object.keys(petCount).sort((a, b) => petCount[b] - petCount[a]).slice(0, 3);

    return {
        cars: sortedCars.map(name => ({ name, count: carCount[name] })),
        pets: sortedPets.map(name => ({ name, count: petCount[name] }))
    };
};

// Calculate map selection percentage
const calculateMapSelectionRate = (mapName) => {
    if (!mapName || ALL_RECORDS.length === 0) return 0;
    const target = mapName.trim().toLowerCase();
    const mapRecordsCount = ALL_RECORDS.filter(r => (r.mapName || "").trim().toLowerCase() === target).length;
    return Math.round((mapRecordsCount / ALL_RECORDS.length) * 100);
};

// Add 3D Tilt Effect to cards
const addCardEffects = (card, type = 'normal') => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 10;
        const rotateY = (centerX - x) / 10;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
};

// Auto navigate to the latest map (called on real-time update)
const autoNavigateToLatestMap = async () => {
    if (raceState && raceState.maps.length > 0) {
        const latestIndex = raceState.maps.length - 1;
        if (latestIndex !== currentMapIndex) {
            await window.jumpToMap(latestIndex);
        }
    }
};

// Get URL Parameters
const getUrlParameter = (name) => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
};

// 🚀 TURBO LOAD SYSTEM: Fetch all core data in parallel
const refreshGlobalCache = async (types = ['maps', 'users', 'cars', 'pets', 'records']) => {
    console.log("🔄 Refreshing Global Cache for:", types.join(', '));
    const startTime = performance.now();

    const tasks = [];

    if (types.includes('maps')) tasks.push(getDocs(collection(db, "gameMaps")).then(snap => {
        ALL_MAPS = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }));

    if (types.includes('users')) tasks.push(getDocs(collection(db, "users")).then(snap => {
        ALL_USERS = snap.docs.map(doc => doc.data());
    }));

    if (types.includes('cars')) tasks.push(getDocs(collection(db, "gameCars")).then(snap => {
        ALL_CARS = snap.docs.map(doc => doc.data());
    }));

    if (types.includes('pets')) tasks.push(getDocs(collection(db, "gamePets")).then(snap => {
        ALL_PETS = snap.docs.map(doc => doc.data());
    }));

    if (types.includes('records')) tasks.push(getDocs(collection(db, "raceRecords")).then(snap => {
        ALL_RECORDS = snap.docs.map(doc => doc.data());
    }));

    await Promise.all(tasks);
    GLOBAL_CACHE_LOADED = true;
    console.log(`✅ Global Cache loaded in ${(performance.now() - startTime).toFixed(2)}ms`);
};

// Legacy shim for fetchGameDataFromFirestore
const fetchGameDataFromFirestore = async () => {
    if (!GLOBAL_CACHE_LOADED) await refreshGlobalCache(['maps']);
    return ALL_MAPS;
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

// Render map details
const renderMapDetails = async (mapData, mapInfo, raceState, mapIndex) => {
    // Update map number
    document.getElementById('map-number').textContent = `#${mapIndex + 1}`;

    // Update Broadcast Map Hero
    const mapHeroImage = document.getElementById('map-hero-image');
    if (mapHeroImage && mapInfo && mapInfo.imageUrl) {
        mapHeroImage.style.backgroundImage = `url('${mapInfo.imageUrl}')`;
    }

    const broadcastMapName = document.getElementById('broadcast-map-name');
    if (broadcastMapName) {
        broadcastMapName.textContent = mapData.name || "NONAME";
    }

    const translateDifficulty = (diff) => {
        const translations = {
            "Cực khó": "Extreme",
            "Rất khó": "Very Hard",
            "Khó": "Hard",
            "Trung bình": "Medium",
            "Dễ": "Easy"
        };
        return translations[diff] || diff || "Medium";
    };

    const broadcastMapDifficulty = document.getElementById('broadcast-map-difficulty');
    if (broadcastMapDifficulty) {
        broadcastMapDifficulty.textContent = translateDifficulty(mapInfo?.difficulty);
    }

    // Update map selection rate (as Laps placeholder if needed or additional info)
    const selectionRate = await calculateMapSelectionRate(mapData.name);
    // document.getElementById('broadcast-map-laps').textContent = "2"; // Default or from data if available

    // Render racers - NOW ASYNC
    await renderRacersBroadcast(mapData, raceState);

    // Update navigation buttons
    updateNavigationButtons(mapIndex, raceState.maps.length);

    // Render Popular Statistics
    await renderPopularStats(mapData.name);
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

// Render racers cards with Broadcast Broadcast Layout
const renderRacersBroadcast = async (mapData, raceState) => {
    // Calculate points for all racers first
    const timeStrings = mapData.times;
    const timesInSeconds = timeStrings.map(ts => timeToSeconds(ts));
    const validTimes = timesInSeconds.filter(t => t !== null && t > 0);
    const bestTime = validTimes.length > 0 ? Math.min(...validTimes) : null;

    // 🚀 Optimize: Parallel processing for all racers using CACHE lookups
    const racersData = raceState.racers.slice(0, 4).map((racer, index) => {
        // Find avatar in cache
        const targetName = (racer.name || "").trim().toLowerCase();
        const userData = ALL_USERS.find(u => (u.nickname || "").trim().toLowerCase() === targetName);
        const photoURL = userData ? (userData.photoBase64 || userData.photoURL) : null;

        // Fetch Car/Pet Images from cache
        const carName = (mapData.cars[index] || "").trim().toLowerCase();
        const petName = (mapData.pets[index] || "").trim().toLowerCase();

        const carInfo = ALL_CARS.find(d => (d.name || "").trim().toLowerCase() === carName);
        const petInfo = ALL_PETS.find(d => (d.name || "").trim().toLowerCase() === petName);

        // Lấy kỷ lục cá nhân từ cache
        const personalRecord = getPersonalRecord(racer.name, mapData.name);

        // Tính điểm (Bonus Points)
        let bonus = null;
        const myTime = timesInSeconds[index];

        if (myTime && myTime > 0 && bestTime !== null) {
            if (myTime === bestTime) {
                const isKingMapOwner = racer.kingMap && racer.kingMap.trim() === mapData.name.trim();
                bonus = isKingMapOwner ? 12 : 11;
            } else {
                const diff = myTime - bestTime;
                const baseScore = 10;
                const penalty = Math.floor(diff);
                bonus = Math.max(0, baseScore - penalty);
            }
        }

        return {
            index: index,
            name: racer.name || `Player ${index + 1}`,
            time: mapData.times[index] || "0:00.00",
            timeInSeconds: timeToSeconds(mapData.times[index]),
            car: mapData.cars[index] || "None",
            pet: mapData.pets[index] || "None",
            carImageUrl: carInfo?.imageUrl || null,
            petImageUrl: petInfo?.imageUrl || null,
            photoURL: photoURL,
            personalRecord: personalRecord ? personalRecord.timeString : "--'--'--",
            bonus: bonus
        };
    });

    // 2. Render Player Cards to Slots
    racersData.forEach(racer => {
        const slotId = `player-slot-${racer.index + 1}`;
        const slotElement = document.getElementById(slotId);

        // Define bonus HTML
        const bonusHtml = racer.bonus !== null ?
            `<div class="absolute top-2 right-2 bg-yellow-500/20 text-yellow-500 text-xs font-bold px-2 py-1 rounded border border-yellow-500/30 shadow-sm z-10 flex items-center gap-1">
                <i class="fas fa-plus"></i>${racer.bonus}
             </div>` : '';

        if (slotElement) {
            slotElement.innerHTML = `
                <div class="broadcast-player-card animate__animated animate__fadeIn relative">
                    ${bonusHtml}
                    <div class="player-main-area">
                        <div class="player-photo-container mx-auto">
                            <img src="${racer.photoURL || 'assets/images/default-avatar.png'}" alt="${racer.name}">
                        </div>
                        <div class="player-equipment-area flex justify-center gap-6 mt-3">
                            <!-- Car Slot -->
                            <div class="equipment-box flex flex-col items-center group">
                                <div class="name truncate max-w-[140px] text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide opacity-80" title="${racer.car}">${racer.car || 'Chưa chọn'}</div>
                                ${racer.carImageUrl ?
                    `<div class="w-28 h-16 flex items-center justify-center"><img class="w-full h-full object-contain drop-shadow-md hover:scale-110 transition-transform" src="${racer.carImageUrl}" alt="Car"></div>` :
                    `<div class="w-28 h-16 flex items-center justify-center bg-black/20 rounded-lg border border-white/5 group-hover:border-cyan-500/20 transition-colors backdrop-blur-sm">
                                        <i class="fas fa-car-side text-2xl text-slate-800 group-hover:text-cyan-500/30 transition-colors"></i>
                                     </div>`
                }
                            </div>
                            
                            <!-- Pet Slot -->
                            <div class="equipment-box flex flex-col items-center group">
                                <div class="name truncate max-w-[140px] text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wide opacity-80" title="${racer.pet}">${racer.pet || 'Chưa chọn'}</div>
                                ${racer.petImageUrl ?
                    `<div class="w-28 h-16 flex items-center justify-center"><img class="w-full h-full object-contain drop-shadow-md hover:scale-110 transition-transform" src="${racer.petImageUrl}" alt="Pet"></div>` :
                    `<div class="w-28 h-16 flex items-center justify-center bg-black/20 rounded-lg border border-white/5 group-hover:border-purple-500/20 transition-colors backdrop-blur-sm">
                                        <i class="fas fa-paw text-2xl text-slate-800 group-hover:text-purple-500/30 transition-colors"></i>
                                     </div>`
                }
                            </div>
                        </div>
                    </div>
                    <div class="player-footer">
                        <div class="player-name-plate">
                            <div class="player-name-text truncate max-w-[140px]" title="${racer.name}">${racer.name}</div>
                            <div class="player-personal-record"><i class="fas fa-trophy mr-1"></i> ${racer.personalRecord}</div>
                        </div>
                        <div class="w-[1px] h-full bg-white/10"></div>
                        <div class="player-time-plate font-numeric tracking-wider text-xl">${racer.time}</div>
                    </div>
                </div>
            `;
        }
    });

    // 3. Update Map Stats and Global Records
    await renderTop5RecordsBroadcast(mapData.name);
};


// Render 2x2 grid layout (before race finishes)
const renderRacersGrid2x2 = (racersData, mapData, container) => {
    const gridContainer = document.createElement('div');
    gridContainer.className = 'racers-grid-2x2';

    racersData.forEach(racer => {
        const isKingMapOwner = racer.kingMap && racer.kingMap.trim() === mapData.name.trim();
        const personalRecord = getPersonalRecord(racer.name, mapData.name);

        const racerCard = document.createElement('div');
        racerCard.className = 'racer-card-2x2';
        addCardEffects(racerCard);

        racerCard.innerHTML = `
            <div class="flex flex-col items-center">
                <div class="racer-photo-2x2 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-xl flex items-center justify-center border-2 border-cyan-500/30 overflow-hidden">
                    ${racer.photoURL ? `<img src="${racer.photoURL}" alt="${racer.name}" class="w-full h-full object-cover">` : `<i class="fas fa-user text-5xl text-cyan-400"></i>`}
                </div>
                <div class="text-center mt-4 w-full">
                    <div class="flex items-center justify-center gap-2 mb-2">
                        <h4 class="text-xl font-bold text-white">${racer.name}</h4>
                        ${isKingMapOwner ? '<i class="fas fa-crown text-amber-400 text-sm"></i>' : ''}
                    </div>
                    <div class="text-sm text-slate-400 mb-3">Player ${racer.index + 1}</div>
                    <div class="mb-4">
                        <span class="text-yellow-400 text-sm bg-yellow-500/20 px-4 py-2 rounded-full border border-yellow-500/30 inline-flex items-center gap-2">
                            <i class="fas fa-hourglass-half"></i> Đang đua
                        </span>
                    </div>
                    <div class="mb-4 p-3 ${personalRecord ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30' : 'bg-slate-800/30 border-slate-700/30'} rounded-lg border">
                        <div class="text-xs ${personalRecord ? 'text-green-400' : 'text-slate-500'} mb-1 uppercase tracking-wide font-semibold">
                            <i class="fas fa-trophy mr-1"></i> Kỷ luật cá nhân
                        </div>
                        <div class="${personalRecord ? 'text-2xl text-green-400' : 'text-lg text-slate-500'} font-bold font-orbitron">
                            ${personalRecord ? personalRecord.timeString : 'Chưa có kỷ lục'}
                        </div>
                    </div>
                    <div class="flex items-center justify-center gap-3">
                        <div class="equipment-image-large flex items-center justify-center">${racer.carImageUrl ? `<img src="${racer.carImageUrl}" class="w-full h-full object-contain">` : `<i class="fas fa-car text-cyan-400 text-xs"></i>`}</div>
                        <div class="equipment-image-large flex items-center justify-center">${racer.petImageUrl ? `<img src="${racer.petImageUrl}" class="w-full h-full object-contain">` : `<i class="fas fa-paw text-purple-400 text-xs"></i>`}</div>
                    </div>
                </div>
            </div>`;
        gridContainer.appendChild(racerCard);
    });
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
    // Logic Time Diff (Giữ lại nếu cần)
    const times = mapData.times.map(timeToSeconds).filter(t => t && t > 0);

    if (times.length > 0) {
        const fastest = Math.min(...times);
        const slowest = Math.max(...times);
        const diff = slowest - fastest;
        const diffEl = document.getElementById('time-diff');
        if (diffEl) diffEl.textContent = `+${diff.toFixed(2)}s`;
    } else {
        const diffEl = document.getElementById('time-diff');
        if (diffEl) diffEl.textContent = '-';
    }

    // Legacy popular equipment logic removed (Moved to new Popular Stats Section)
    // await getMostPopularEquipment(...) -> Removed to prevent crash
};

// Navigate between maps - KHÔNG RELOAD TRANG
// Jump to specific map logic
window.jumpToMap = async (index) => {
    // Validate index
    if (index < 0 || index >= raceState.maps.length) return;

    // Skip if already on this map (optional, but good for performance)
    if (index === currentMapIndex) return;

    // Update currentMapIndex
    currentMapIndex = index;

    // Update URL without reload
    const newUrl = `${window.location.pathname}?map=${index}`;
    window.history.pushState({ mapIndex: index }, '', newUrl);

    // Advanced Staggered Transition using GSAP
    const leftCol = document.getElementById('player-column-left');
    const midCol = document.getElementById('middle-column-broadcast');
    const rightCol = document.getElementById('player-column-right');
    const targets = [leftCol, midCol, rightCol];

    const tl = gsap.timeline();

    // Phase 1: Staggered Out
    await tl.to(targets, {
        opacity: 0,
        y: 40,
        scale: 0.9,
        filter: "blur(10px)",
        duration: 0.4,
        stagger: {
            each: 0.1,
            from: "center"
        },
        ease: "power3.in"
    });

    // Update Data
    currentMapData = raceState.maps[currentMapIndex];
    const mapInfo = ALL_MAPS.find(m => m.name === currentMapData.name);

    // Render Content
    await renderMapDetails(currentMapData, mapInfo, raceState, currentMapIndex);
    updateNavigationButtons(currentMapIndex, raceState.maps.length);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'auto' }); // Use auto to not fight with GSAP

    // Phase 2: Staggered In with "Digital Bounce"
    gsap.set(targets, {
        y: -60,
        scale: 1.1,
        filter: "blur(20px) brightness(2) contrast(1.5)",
        opacity: 0
    });

    // Digital "Glitch" Flash
    gsap.fromTo("#broadcast-container",
        { filter: "hue-rotate(90deg) brightness(3)" },
        { filter: "hue-rotate(0deg) brightness(1)", duration: 0.4, ease: "rough" }
    );

    await tl.to(targets, {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px) brightness(1) contrast(1)",
        duration: 0.6,
        stagger: {
            each: 0.15,
            from: "edges"
        },
        ease: "back.out(1.2)"
    });

    // Sub-animation for hero image for extra "pop"
    gsap.from("#map-hero-image", {
        scale: 1.2,
        duration: 2,
        ease: "power2.out"
    });
};

// Navigate relative (legacy wrapper)
window.navigateMap = (direction) => {
    window.jumpToMap(currentMapIndex + direction);
};

// Update navigation UI (Buttons & Pagination)
const updateNavigationButtons = (currentIndex, totalMaps) => {
    // Buttons logic is handled in HTML/CSS mostly, but if we have prev/next buttons somewhere else (we do in HTML <button id="prev-map-btn">)
    // we should still toggle them.
    /*
    const prevBtn = document.getElementById('prev-map-btn'); // Currently HTML might not have these IDs if I removed the container?
    // Wait, I replaced the MIDDLE container. The Prev/Next buttons are SIDE buttons in the grid.
    // Let's check HTML structure again.
    // <div class="container... items-center justify-between">
    //    <button id="prev-map-btn"...>
    //    <div class="map-nav-info"...> (Use to be map 1/4)
    //    <button id="next-map-btn"...>
    // So IDs exist.
    */

    // Legacy logic for side arrow buttons
    // Only update if elements exist
    const prevBtn = document.getElementById('prev-map-btn');
    const nextBtn = document.getElementById('next-map-btn');

    if (prevBtn) {
        if (currentIndex === 0) {
            prevBtn.disabled = true;
            prevBtn.classList.add('opacity-30', 'cursor-not-allowed', 'grayscale');
        } else {
            prevBtn.disabled = false;
            prevBtn.classList.remove('opacity-30', 'cursor-not-allowed', 'grayscale');
        }
    }

    if (nextBtn) {
        if (currentIndex === totalMaps - 1) {
            nextBtn.disabled = true;
            nextBtn.classList.add('opacity-30', 'cursor-not-allowed', 'grayscale');
        } else {
            nextBtn.disabled = false;
            nextBtn.classList.remove('opacity-30', 'cursor-not-allowed', 'grayscale');
        }
    }

    // Update Mini Pagination (Dots)
    const minPagination = document.getElementById('min-pagination-indicator');
    if (minPagination) {
        minPagination.innerHTML = '';
        const limit = 6; // Max dots to show to avoid overflow
        // Simple logic for now: show all or max 6.
        // If maps > 8, maybe just show current?
        // User has ~4 maps.

        for (let i = 0; i < totalMaps; i++) {
            const dot = document.createElement('div');
            const isActive = i === currentIndex;

            // CSS for dots
            dot.className = `h-1.5 rounded-full transition-all duration-300 cursor-pointer ${isActive ? 'bg-cyan-400 w-8 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-slate-700 w-2 hover:bg-slate-600 hover:w-4'}`;
            dot.onclick = () => window.jumpToMap(i);
            minPagination.appendChild(dot);
        }
    }
};

// ==================== MAP MODAL LOGIC ====================
window.openMapModal = () => {
    const modal = document.getElementById('map-selection-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderMapModalGrid();
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }
};

window.closeMapModal = () => {
    const modal = document.getElementById('map-selection-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
};

const renderMapModalGrid = () => {
    const grid = document.getElementById('modal-map-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!raceState || !raceState.maps || !Array.isArray(raceState.maps)) {
        grid.innerHTML = '<div class="col-span-full text-center text-slate-500 py-10 font-orbitron">DỮ LIỆU ĐANG TẢI HOẶC TRỐNG...</div>';
        return;
    }

    raceState.maps.forEach((map, index) => {
        const isCurrent = index === currentMapIndex;
        // Find map info (for image)
        const mapInfo = ALL_MAPS.find(m => m.name === map.name);
        // Use placeholder if no image
        const bgImage = mapInfo && (mapInfo.imageUrl || mapInfo.image) ? (mapInfo.imageUrl || mapInfo.image) : 'assets/images/map-placeholder.jpg';

        const card = document.createElement('div');
        card.className = `
            relative group rounded-xl overflow-hidden cursor-pointer border transition-all duration-300 bg-slate-800
            ${isCurrent ? 'border-cyan-400 ring-2 ring-cyan-400/50 scale-[1.02] shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'border-white/5 hover:border-cyan-400/50 hover:scale-[1.02] hover:shadow-lg'}
        `;
        card.onclick = () => {
            window.jumpToMap(index);
            window.closeMapModal();
        };

        // Format difficulty stars if available
        let starsHtml = '';
        if (mapInfo && mapInfo.difficulty) {
            for (let i = 0; i < mapInfo.difficulty; i++) starsHtml += '<i class="fas fa-star text-[8px] text-yellow-400"></i>';
        }

        card.innerHTML = `
            <!-- Image Area -->
            <div class="h-32 relative overflow-hidden">
                <div class="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" style="background-image: url('${bgImage}')"></div>
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-90"></div>
                
                <!-- Status Badge -->
                ${isCurrent ? '<div class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/50 text-[9px] font-bold text-cyan-300 uppercase tracking-wider backdrop-blur-sm">Đang xem</div>' : ''}
            </div>
            
            <!-- Content Area -->
            <div class="p-3 relative bg-slate-900/50 backdrop-blur-sm">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Map ${index + 1}</div>
                        <div class="text-sm font-bold text-white font-orbitron group-hover:text-cyan-400 transition-colors line-clamp-1">${map.name}</div>
                    </div>
                </div>
                
                <div class="mt-2 flex items-center gap-2 pt-2 border-t border-white/5">
                    <div class="flex gap-0.5 opacity-80">${starsHtml}</div>
                    <div class="ml-auto text-[10px] text-slate-500 font-mono">${(map.racers || []).length} Tay đua</div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
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
        // TEMPORARY: Bypass authentication for public viewing
        // Check authentication
        // onAuthStateChanged(auth, async (user) => {
        //     if (user) {
        // Turbo Initial Load
        await refreshGlobalCache();
        await loadMapData();

        // Setup real-time listener
        setupRealtimeListener();

        // Preload nearby images for better UX
        preloadAdjacentMapImages();

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
                updateNavigationButtons(currentMapIndex, raceState.maps.length);

                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
        //     } else {
        //         window.location.href = 'login.html';
        //     }
        // });
    } catch (error) {
        console.error("Lỗi khởi tạo:", error);
        showError("Có lỗi xảy ra khi tải dữ liệu");
    }
};

// Start app
init();