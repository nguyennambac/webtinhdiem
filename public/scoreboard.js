import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
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

// Global variables
let ALL_MAPS = [];
let ALL_RECORDS = [];
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
    return null;
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
        points[i] = Math.max(0, baseScore - penalty);
    }
    return points;
};

// Calculate ranking
const calculateRanking = () => {
    const rankingData = raceState.racers.map((racer, index) => ({
        originalIndex: index,
        name: racer.name.trim() || `Tay đua ${index + 1}`,
        totalScore: 0,
        rank: 0,
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

// Refresh Cache
const refreshGlobalCache = async (types = ['maps', 'records']) => {
    const tasks = [];
    if (types.includes('maps')) tasks.push(getDocs(collection(db, "gameMaps")).then(snap => {
        ALL_MAPS = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }));
    if (types.includes('records')) tasks.push(getDocs(collection(db, "raceRecords")).then(snap => {
        ALL_RECORDS = snap.docs.map(doc => doc.data());
    }));

    await Promise.all(tasks);
    GLOBAL_CACHE_LOADED = true;
};

// Render Scoreboard - SYNCED WITH ORIGINAL map-detail.js LATEST
const renderDetailedScoreboard = () => {
    const thead = document.getElementById('detailed-scoreboard-header');
    const tbody = document.getElementById('detailed-scoreboard-body');
    const table = thead.closest('table');

    if (!raceState || raceState.maps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="100%" class="text-center py-20 text-slate-500">Chưa có dữ liệu.</td></tr>`;
        return;
    }

    const rankingData = calculateRanking();
    const mapPointsMatrix = raceState.maps.map(map => calculateMapPoints(map.times, map.name));

    // Handle colgroup - MATCHING ORIGINAL EXACTLY
    let colgroupHtml = '<colgroup>';
    colgroupHtml += '<col style="width: 80px; min-width: 80px;">'; // Hạng
    colgroupHtml += '<col style="width: 180px; min-width: 180px;">'; // Tay Đua

    raceState.maps.forEach((map) => {
        const mapInfo = ALL_MAPS.find(m => m.name === map.name);
        const mapImageUrl = mapInfo?.imageUrl || '';
        const backgroundStyle = mapImageUrl ?
            `background-image: url('${mapImageUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` :
            '';
        colgroupHtml += `<col class="map-column-bg" style="${backgroundStyle} width: 210px; min-width: 210px; max-width: 210px;">`;
    });
    colgroupHtml += '<col style="width: 150px; min-width: 150px;">'; // Tổng Điểm
    colgroupHtml += '</colgroup>';

    const oldColgroup = table.querySelector('colgroup');
    if (oldColgroup) oldColgroup.remove();
    table.insertAdjacentHTML('afterbegin', colgroupHtml);

    // Header - MATCHING ORIGINAL EXACTLY (Case, text, icons)
    let headerRow = `<tr>
        <th scope="col" class="px-6 py-4 text-center text-sm font-extrabold uppercase tracking-wider text-cyan-400">Hạng</th>
        <th scope="col" class="px-6 py-4 text-center text-sm font-extrabold uppercase tracking-wider text-cyan-400">Tay Đua</th>`;

    raceState.maps.forEach((map, mapIndex) => {
        const isBtcMap = mapIndex === 0 && map.name.trim() === raceState.firstMapBtc.trim();
        const isKingMap = raceState.racers.some(r => r.kingMap.trim() === map.name.trim());
        let mapTypeIcon = '';
        if (isBtcMap) mapTypeIcon = '<i class="fas fa-flag text-red-400 ml-1"></i>';
        else if (isKingMap) mapTypeIcon = '<i class="fas fa-crown text-amber-400 ml-1"></i>';

        const mapInfo = ALL_MAPS.find(m => m.name === map.name);
        const mapImageUrl = mapInfo?.imageUrl || '';
        const backgroundStyle = mapImageUrl ? `background-image: url('${mapImageUrl}'); background-size: cover; background-position: center;` : '';

        headerRow += `<th scope="col" class="map-column-header px-4 py-4 text-center text-xs font-extrabold text-cyan-400 uppercase tracking-wider" style="${backgroundStyle} width: 210px; min-width: 210px; max-width: 210px;">
            <div class="map-column-header-content flex flex-col items-center justify-center">
                <span class="text-white font-bold drop-shadow-lg text-base">Trận ${mapIndex + 1}</span>
                <span class="text-slate-100 text-xs mt-2 flex items-center justify-center drop-shadow-md font-semibold">
                    ${map.name.trim() || 'Chưa đặt tên'} ${mapTypeIcon}
                </span>
            </div>
        </th>`;
    });

    headerRow += `<th scope="col" class="px-6 py-4 text-center text-base font-extrabold text-white bg-gradient-to-r from-red-700 to-red-800 uppercase tracking-wider" style="width: 150px;">Tổng Điểm</th></tr>`;
    thead.innerHTML = headerRow;

    // Body - MATCHING ORIGINAL EXACTLY
    tbody.innerHTML = '';
    rankingData.forEach((racer) => {
        const racerIndex = racer.originalIndex;
        let rowHtml = `<tr class="hover:bg-slate-700/50 transition-colors ${racer.rank <= 3 ? 'font-bold' : ''}">
            <td class="px-3 py-4 text-center text-lg font-extrabold text-white">${racer.rank}</td>
            <td class="px-3 py-3 text-left text-sm font-semibold text-white">${racer.name}</td>`;

        raceState.maps.forEach((_, mapIndex) => {
            const points = mapPointsMatrix[mapIndex][racerIndex];
            rowHtml += `<td class="px-3 py-4 text-center">
                <div class="map-score-cell">+${points}</div>
            </td>`;
        });

        rowHtml += `<td class="px-6 py-3 text-center text-lg font-extrabold bg-gradient-to-r from-red-800 to-red-900 text-white">${racer.totalScore}</td></tr>`;
        tbody.insertAdjacentHTML('beforeend', rowHtml);
    });
};

// Setup Listener
const setupRealtimeListener = () => {
    onSnapshot(doc(db, "raceState", "current"), async (snap) => {
        if (snap.exists()) {
            raceState = snap.data();
            await refreshGlobalCache(['records']);
            renderDetailedScoreboard();
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
        }
    });
};

// Init
const init = async () => {
    try {
        await refreshGlobalCache();
        setupRealtimeListener();
    } catch (err) {
        console.error("Init error:", err);
    }
};

init();
