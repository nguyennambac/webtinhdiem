import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, setDoc, deleteDoc, getDoc, onSnapshot, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// ================ MOBILE SIDEBAR TOGGLE ================
window.toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar-modern');
    const overlay = document.getElementById('sidebar-overlay');
    const body = document.body;

    if (!sidebar) return;

    // Desktop: Toggle collapsed state
    if (window.innerWidth >= 1024) {
        body.classList.toggle('sidebar-collapsed');
        const isCollapsed = body.classList.contains('sidebar-collapsed');
        localStorage.setItem('sidebar-collapsed', isCollapsed);
    } else {
        // Mobile: Toggle active class for slide-in
        sidebar.classList.toggle('active');
        if (overlay) {
            overlay.classList.toggle('active');
        }
    }
};

// Initial state check for sidebar
if (window.innerWidth >= 1024 && localStorage.getItem('sidebar-collapsed') === 'true') {
    document.body.classList.add('sidebar-collapsed');
}

// Close sidebar when clicking on a link
document.addEventListener('DOMContentLoaded', () => {
    const sidebarLinks = document.querySelectorAll('.sidebar-modern a, .sidebar-modern button');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar-modern');
            const overlay = document.getElementById('sidebar-overlay');
            if (sidebar) {
                sidebar.classList.remove('active');
            }
            if (overlay) {
                overlay.classList.remove('active');
            }
        });
    });
});

// Biến toàn cục để lưu dữ liệu từ Firestore
let ALL_MAPS = [];
let ALL_CARS = [];
let ALL_PETS = [];

// ================ Hàm lấy dữ liệu từ Firestore ================
const fetchGameDataFromFirestore = async () => {
    try {
        // Helper function để chuẩn hóa thời gian
        const normalizeTimeFormat = (timeString) => {
            if (!timeString || typeof timeString !== 'string') return null;

            const trimmed = timeString.trim();
            if (!trimmed) return null;

            // Nếu đã là định dạng mm'ss'ms, giữ nguyên (không cần chuyển đổi)
            if (trimmed.match(/^\d{2}'\d{2}'\d{2}$/)) {
                return trimmed;
            }

            // Các định dạng khác có thể cần chuyển đổi
            if (trimmed.includes(":")) {
                const match = trimmed.match(/^(\d+):(\d+)\.?(\d+)?$/);
                if (match) {
                    const mm = match[1].padStart(2, '0');
                    const ss = match[2].padStart(2, '0');
                    const ms = (match[3] || '00').padStart(2, '0');
                    return `${mm}'${ss}'${ms}`;
                }
            }

            // Nếu là số nguyên (10423), chuyển sang mm'ss'ms
            if (/^\d+$/.test(trimmed)) {
                const totalSeconds = timeToSeconds(trimmed);
                if (totalSeconds) {
                    return secondsToTimeString(totalSeconds);
                }
            }

            return null; // Không hợp lệ
        };

        // Tối ưu hóa: Lấy dữ liệu Maps, Cars, Pets song song
        const [mapsSnapshot, carsSnapshot, petsSnapshot] = await Promise.all([
            getDocs(collection(db, "gameMaps")),
            getDocs(collection(db, "gameCars")),
            getDocs(collection(db, "gamePets"))
        ]);

        ALL_MAPS = mapsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                recordTime: normalizeTimeFormat(data.recordTime)
            };
        });

        ALL_CARS = carsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })).filter(car => car.name);

        ALL_PETS = petsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })).filter(pet => pet.name);

        // Expose to window for other modules
        window.ALL_MAPS = ALL_MAPS;
        window.ALL_CARS = ALL_CARS;
        window.ALL_PETS = ALL_PETS;

        // Cập nhật datalist sau khi có dữ liệu
        setupMapDatalist();

        return {
            ALL_MAPS,
            ALL_CARS,
            ALL_PETS,
            loadedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error("❌ Lỗi khi tải dữ liệu từ Firestore:", error);
        // Trả về mảng rỗng nhưng log lỗi chi tiết
        displayMessage("Không thể tải dữ liệu từ Firestore. Vui lòng kiểm tra kết nối.", true);
        return {
            ALL_MAPS: [],
            ALL_CARS: [],
            ALL_PETS: [],
            error: error.message
        };
    }
};

// ================ HÀM THỐNG KÊ VINH DANH ================
const fetchRacerStatistics = async () => {
    try {


        const recordsSnapshot = await getDocs(collection(db, "raceRecords"));

        // Thống kê tay đua
        const racerStats = new Map();
        // Thống kê combo xe/pet toàn cục
        const comboStats = new Map();
        // **MỚI: Thống kê combo theo từng Map**
        const mapComboStats = new Map();

        recordsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const car = (data.car || "").trim();
            const pet = (data.pet || "").trim();
            const mName = (data.mapName || "").trim();

            // Đếm số trận của tay đua
            if (data.racerName) {
                const racerName = data.racerName.trim();
                racerStats.set(racerName, (racerStats.get(racerName) || 0) + 1);
            }

            // Đếm combo xe/pet toàn cục
            if (car && pet) {
                const comboKey = `${car}|${pet}`;
                const comboData = comboStats.get(comboKey) || {
                    car: car,
                    pet: pet,
                    count: 0
                };
                comboData.count += 1;
                comboStats.set(comboKey, comboData);

                // Thống kê theo Map
                if (mName) {
                    if (!mapComboStats.has(mName)) mapComboStats.set(mName, new Map());
                    const mCombos = mapComboStats.get(mName);
                    const mComboData = mCombos.get(comboKey) || { car: car, pet: pet, count: 0 };
                    mComboData.count += 1;
                    mCombos.set(comboKey, mComboData);
                }
            }
        });

        // Chuyển thành array và sắp xếp
        const topRacers = Array.from(racerStats.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const topCombos = Array.from(comboStats.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Chuyển mapComboStats thành window.MAP_COMBOS
        window.MAP_COMBOS = {};
        mapComboStats.forEach((combosMap, mName) => {
            window.MAP_COMBOS[mName] = Array.from(combosMap.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, 4);
        });
        console.log("📊 Đã nạp Combo cho các Map:", Object.keys(window.MAP_COMBOS));

        // **MỚI: THỐNG KÊ TOP RECORD HOLDERS**
        const recordHolderStats = new Map();

        // Lấy tất cả maps từ gameMaps collection
        const mapsSnapshot = await getDocs(collection(db, "gameMaps"));

        mapsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const recordRacer = data.recordRacer;
            const recordTime = data.recordTime;

            // Chỉ đếm nếu có record hợp lệ
            if (recordRacer && recordTime &&
                recordTime !== "00'00'00" &&
                recordTime !== "--'--'--") {

                const count = recordHolderStats.get(recordRacer) || 0;
                recordHolderStats.set(recordRacer, count + 1);
            }
        });

        const topRecordHolders = Array.from(recordHolderStats.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        console.log("✅ Đã tải thống kê:", {
            topRacers,
            topCombos,
            topRecordHolders
        });

        return { topRacers, topCombos, topRecordHolders };
    } catch (error) {
        console.error("❌ Lỗi khi tải thống kê:", error);
        return { topRacers: [], topCombos: [], topRecordHolders: [] };
    }
};

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyDtFpBAuZ_3JHmMXq1uVShq4sm0zK9xqEI",
    authDomain: "tinhdiemtheog.firebaseapp.com",
    projectId: "tinhdiemtheog",
    storageBucket: "tinhdiemtheog.firebasestorage.app",
    messagingSenderId: "52564586448",
    appId: "1:52564586448:web:983bdc321423b81f5a53d5",
    measurementId: "G-PFTMHMTF6J"
};

const getRaceDocRef = () => doc(db, "raceState", "current");

let db, auth;
let userId = null;
let isAdminUser = false;
let isAuthReady = false;
let ALL_USERS = [];
let racersCacheLoaded = false;
const NUM_RACERS = 4;
let mapIdToScroll = null;
let tempMapEdits = new Map(); // Key: mapIndex, Value: { times: [], cars: [], pets: [] }
let isEditing = false; // Flag để tắt auto-update khi đang edit

// Cấu trúc dữ liệu
const defaultMapData = () => ({
    id: crypto.randomUUID(),
    name: '',
    times: new Array(NUM_RACERS).fill(null),
    cars: new Array(NUM_RACERS).fill(null),
    pets: new Array(NUM_RACERS).fill(null),
});

const defaultState = {
    racers: [
        { name: '', kingMap: '' },
        { name: '', kingMap: '' },
        { name: '', kingMap: '' },
        { name: '', kingMap: '' },
    ],
    firstMapBtc: '',
    maps: [],
    version: 7,
};

let raceState = defaultState;

// --- Utility Functions ---
const setupMapDatalist = () => {
    // Xóa nội dung cũ
    const mapDatalist = document.getElementById('map-suggestions');
    const carDatalist = document.getElementById('car-suggestions');
    const petDatalist = document.getElementById('pet-suggestions');

    if (!mapDatalist || !carDatalist || !petDatalist) {
        console.warn("Không tìm thấy các datalist, sẽ thử lại sau");
        return;
    }

    // Thêm options từ dữ liệu Firestore
    mapDatalist.innerHTML = ALL_MAPS.map(map => `<option value="${map.name}">${map.name}</option>`).join('');
    carDatalist.innerHTML = ALL_CARS.map(car => `<option value="${car.name}">${car.name}</option>`).join('');
    petDatalist.innerHTML = ALL_PETS.map(pet => `<option value="${pet.name}">${pet.name}</option>`).join('');
};

const timeToSeconds = (timeString) => {
    if (!timeString || typeof timeString !== 'string') return null;
    timeString = timeString.trim();

    const match = timeString.match(/(\d+)'(\d+)'(\d+)/);
    if (match) {
        const minutes = parseInt(match[1]) || 0;
        const seconds = parseInt(match[2]) || 0;
        const milliseconds = parseInt(match[3]) || 0;
        let totalSeconds = minutes * 60 + seconds;
        totalSeconds += milliseconds / 100;
        return totalSeconds > 0 ? totalSeconds : null;
    }

    if (timeString.length >= 5 && /^\d+$/.test(timeString)) {
        let ms = parseInt(timeString.slice(-2));
        let ss = parseInt(timeString.slice(-4, -2));
        let mm = parseInt(timeString.slice(0, -4));
        let totalSeconds = mm * 60 + ss + (ms / 100);
        return totalSeconds > 0 ? totalSeconds : null;
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
}

const displayMessage = (message, isError = false) => {
    showStatusMessage(message, isError);
};

const saveRaceState = async (newState) => {
    const stateToSave = newState;
    try {
        await setDoc(getRaceDocRef(), stateToSave, { merge: false });
    } catch (error) {
        console.error("Lỗi khi lưu trạng thái:", error);
        displayMessage("Lỗi khi lưu dữ liệu!", true);
    }
};

// Thêm hàm này vào phần JavaScript (gần với các hàm handleDataRefresh, exportToExcel)
window.handleResetAllRecords = async () => {
    if (!confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn thiết lập lại record của TẤT CẢ các map về 00'00'00 không?\n\nHành động này sẽ xóa tất cả kỷ lục hiện có và không thể hoàn tác!")) {
        return;
    }

    try {
        // Hiển thị loading
        displayMessage("⏳ Đang thiết lập lại record của tất cả các map...", false);

        // Lặp qua tất cả các map trong ALL_MAPS và reset record
        let updatedCount = 0;

        for (const map of ALL_MAPS) {
            try {
                // Reset record về 00'00'00 và xóa thông tin liên quan
                await setDoc(doc(db, "gameMaps", map.id), {
                    recordTime: "00'00'00",
                    recordRacer: "",
                    recordCar: "",
                    recordPet: "",
                    recordRacerIndex: -1
                }, { merge: true });

                updatedCount++;
                console.log(`Đã reset record cho map: ${map.name}`);
            } catch (error) {
                console.error(`Lỗi khi reset record cho map ${map.name}:`, error);
            }
        }

        // Cập nhật lại dữ liệu từ Firestore
        await fetchGameDataFromFirestore();

        // Cập nhật UI
        updateStatistics();

        // Hiển thị thông báo thành công
        const successMessage = `✅ Đã làm mới record của ${updatedCount} map về 00'00'00`;
        displayMessage(successMessage, false);

        // Log kết quả
        console.log(`Đã reset record cho ${updatedCount}/${ALL_MAPS.length} map`);

    } catch (error) {
        console.error("Lỗi khi làm mới record:", error);
        displayMessage("❌ Có lỗi xảy ra khi làm mới record. Vui lòng thử lại!", true);
    }
};

// Đảm bảo hàm này có thể gọi được từ HTML
// Thêm vào cuối script hoặc trong phần khai báo hàm toàn cục

const checkAndUpdateRecordForLatestMap = async () => {
    try {
        const stats = calculateStatistics();

        // Kiểm tra nếu có map vừa HOÀN THÀNH (có latestCompletedMapIndex)
        if (stats.latestCompletedMapIndex >= 0) {
            const latestMap = raceState.maps[stats.latestCompletedMapIndex];

            // Kiểm tra xem map này đã hoàn thành chưa (tất cả tay đua có thời gian hợp lệ)
            const isMapCompleted = latestMap.times && latestMap.times.every(time => {
                return time && time.trim() && time.trim() !== "--'--'--" && timeToSeconds(time) > 0;
            });

            if (!isMapCompleted) {
                console.log(`Map ${latestMap.name} chưa hoàn thành, bỏ qua kiểm tra record`);
                return;
            }

            const timesInSeconds = latestMap.times.map(timeToSeconds);
            const validTimes = timesInSeconds.filter(t => t > 0);

            if (validTimes.length === NUM_RACERS) { // CHỈ khi tất cả 4 tay đua đều có thời gian
                const bestTimeInMap = Math.min(...validTimes);
                const bestRacerIndexInMap = timesInSeconds.indexOf(bestTimeInMap);

                // Lấy thông tin xe và pet từ map
                const bestCar = latestMap.cars && latestMap.cars[bestRacerIndexInMap] || '';
                const bestPet = latestMap.pets && latestMap.pets[bestRacerIndexInMap] || '';
                const bestRacerName = raceState.racers[bestRacerIndexInMap]?.name || `Tay Đua ${bestRacerIndexInMap + 1}`;

                // Kiểm tra xem map này đã được kiểm tra record chưa
                const mapKey = `checked_${latestMap.name}_${stats.latestCompletedMapIndex}`;
                const lastCheckedTime = localStorage.getItem(mapKey);
                const now = Date.now();

                // Chỉ kiểm tra nếu chưa kiểm tra trong vòng 30 giây trở lại
                if (!lastCheckedTime || (now - parseInt(lastCheckedTime) > 30000)) {
                    // Cập nhật record nếu tốt hơn
                    const isUpdated = await updateMapRecord(latestMap.name, {
                        timeInSeconds: bestTimeInMap,
                        timeString: secondsToTimeString(bestTimeInMap),
                        racerName: bestRacerName,
                        racerIndex: bestRacerIndexInMap,
                        car: bestCar,
                        pet: bestPet,
                        timestamp: new Date().toISOString()
                    });

                    if (isUpdated) {
                        displayMessage(`🎉 Đã cập nhật kỷ lục mới cho ${map.name}: ${secondsToTimeString(bestTimeInMap)}! (Xe: ${bestCar}, Pet: ${bestPet})`, false);
                        // Cập nhật lại dữ liệu từ Firestore
                        await fetchGameDataFromFirestore();
                        // Cập nhật UI
                        updateStatistics();

                        // Thêm hiệu ứng cho bản ghi mới
                        const mapRow = document.getElementById(`map-row-${map.id}`);
                        if (mapRow) {
                            mapRow.classList.add('record-updated');
                            setTimeout(() => {
                                mapRow.classList.remove('record-updated');
                            }, 2000);
                        }
                    }
                    // Lưu thời điểm kiểm tra
                    localStorage.setItem(mapKey, now.toString());
                } else {
                    console.log(`Đã kiểm tra record cho ${latestMap.name} gần đây, bỏ qua`);
                }
            }
        }
    } catch (error) {
        console.error("Lỗi khi kiểm tra và cập nhật record:", error);
    }
};

// Biến lưu trữ các thông báo đã gửi gần đây (chống trùng lặp)
const recentNotifications = new Map();
const NOTIFICATION_COOLDOWN = 5000; // 5 giây chống trùng

// Hàm kiểm tra và ngăn thông báo trùng lặp
const isDuplicateNotification = (notificationData) => {
    const key = `${notificationData.type}_${notificationData.content || notificationData.message}`;

    if (recentNotifications.has(key)) {
        const lastTime = recentNotifications.get(key);
        const now = Date.now();

        // Nếu thông báo tương tự đã gửi trong 5 giây gần đây
        if (now - lastTime < NOTIFICATION_COOLDOWN) {
            console.log(`⚠️ Bỏ qua thông báo trùng lặp: ${key}`);
            return true;
        }
    }

    // Lưu thời điểm gửi
    recentNotifications.set(key, Date.now());

    // Tự động xóa sau 10 giây để tránh memory leak
    setTimeout(() => {
        recentNotifications.delete(key);
    }, 10000);

    return false;
};


const sendNotificationToAllUsers = async (notificationData) => {
    try {
        // KIỂM TRA TRÙNG LẶP TRƯỚC KHI GỬI
        if (isDuplicateNotification(notificationData)) {
            console.log("Thông báo đã được gửi gần đây, bỏ qua");
            return true;
        }

        const notificationId = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const notificationToSave = {
            title: notificationData.title || "Thông báo",
            content: notificationData.content || notificationData.message || "",
            type: notificationData.type || "info",
            target: notificationData.target || "all",
            important: notificationData.important || false,
            sender: notificationData.sender || "Hệ thống",
            senderId: notificationData.senderId || "system",
            read: false,
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        // Lấy danh sách tất cả users để gửi thông báo cá nhân
        const usersSnapshot = await getDocs(collection(db, "users"));
        const batch = [];

        usersSnapshot.docs.forEach(userDoc => {
            const userNotificationRef = doc(db, "users", userDoc.id, "notifications", notificationId);
            batch.push(setDoc(userNotificationRef, notificationToSave));
        });

        if (batch.length > 0) {
            await Promise.all(batch);
            console.log(`✅ Đã gửi thông báo tới ${batch.length} người dùng:`, notificationToSave);
        } else {
            // Fallback nếu không có user nào trong collection users (ví dụ: lỗi DB)
            // Vẫn lưu vào global để đảm bảo flow cũ không chết hoàn toàn nếu cần
            await setDoc(doc(db, "notifications", notificationId), notificationToSave);
            console.warn("⚠️ Không tìm thấy người dùng nào trong DB, lưu vào global notifications");
        }

        return true;
    } catch (error) {
        console.error("❌ Lỗi khi gửi thông báo:", error);
        return false;
    }
};

const normalizeTimeFormat = (timeString) => {
    if (!timeString) return "--'--'--";

    const trimmed = timeString.trim();

    // Nếu đã là định dạng mm'ss'ms, giữ nguyên
    if (trimmed.includes("'")) {
        return trimmed;
    }

    // Nếu là định dạng mm:ss.ms, chuyển sang mm'ss'ms
    if (trimmed.includes(":")) {
        return trimmed.replace(':', "'").replace('.', "'");
    }

    // Nếu là số nguyên (10423), chuyển sang mm'ss'ms
    if (/^\d+$/.test(trimmed)) {
        const totalSeconds = timeToSeconds(trimmed);
        return secondsToTimeString(totalSeconds);
    }

    return trimmed;
};

// --- Tính toán thống kê ---
const calculateStatistics = () => {
    const stats = {
        completedMaps: 0,
        latestCompletedMap: null,
        latestCompletedMapName: "Chưa có",
        latestCompletedMapIndex: -1,
        latestCompletedMapImageUrl: null,
        latestCompletedMapDescription: "Map mới nhất", // Thêm trường description
        bestTimeInLatestMap: null,
        bestTimeInLatestMapString: "--'--'--",
        bestTimeRacerInLatestMap: "-",
        bestTimeCarInLatestMap: "-",
        bestTimePetInLatestMap: "-",
        currentRunningMap: null,
        currentMapRecordTime: "--'--'--",
        currentMapRecordRacer: "-",
        currentMapRecordCar: "-",
        currentMapRecordPet: "-"
    };

    // Tìm map hoàn thành mới nhất
    let latestCompletedIndex = -1;

    raceState.maps.forEach((map, index) => {
        const hasAllTimes = map.times && map.times.every(time =>
            time && time.trim() && time.trim() !== "--'--'--" && timeToSeconds(time) > 0
        );

        if (hasAllTimes) {
            stats.completedMaps++;

            // Tìm map hoàn thành mới nhất (index lớn nhất)
            if (index > latestCompletedIndex) {
                latestCompletedIndex = index;
                stats.latestCompletedMap = map.name;
                stats.latestCompletedMapName = map.name;
                stats.latestCompletedMapIndex = index;

                // Tìm thông tin map từ ALL_MAPS
                const mapInfo = ALL_MAPS.find(m => (m.name || "").trim() === (map.name || "").trim());
                if (mapInfo) {
                    if (mapInfo.imageUrl) {
                        stats.latestCompletedMapImageUrl = mapInfo.imageUrl;
                    }
                    if (mapInfo.description) {
                        stats.latestCompletedMapDescription = mapInfo.description;
                    }
                }
            }
        }
    });

    // Nếu có map vừa hoàn thành, tính thời gian nhanh nhất của map đó
    if (stats.latestCompletedMapIndex >= 0) {
        const latestMap = raceState.maps[stats.latestCompletedMapIndex];
        const timesInSeconds = latestMap.times.map(timeToSeconds);
        const validTimes = timesInSeconds.filter(t => t > 0);

        if (validTimes.length > 0) {
            const bestTimeInMap = Math.min(...validTimes);
            const bestRacerIndexInMap = timesInSeconds.indexOf(bestTimeInMap);

            stats.bestTimeInLatestMap = bestTimeInMap;
            stats.bestTimeInLatestMapString = secondsToTimeString(bestTimeInMap);
            stats.bestTimeRacerInLatestMap = raceState.racers[bestRacerIndexInMap]?.name || `Tay Đua ${bestRacerIndexInMap + 1}`;

            // Lấy thông tin xe và pet từ map
            if (latestMap.cars && latestMap.cars[bestRacerIndexInMap]) {
                stats.bestTimeCarInLatestMap = latestMap.cars[bestRacerIndexInMap];
            }

            if (latestMap.pets && latestMap.pets[bestRacerIndexInMap]) {
                stats.bestTimePetInLatestMap = latestMap.pets[bestRacerIndexInMap];
            }
        }
    }

    // Xác định map đang chạy
    for (let i = 0; i < raceState.maps.length; i++) {
        const map = raceState.maps[i];
        const hasAllTimes = map.times && map.times.every(time =>
            time && time.trim() && time.trim() !== "--'--'--" && timeToSeconds(time) > 0
        );

        if (!hasAllTimes) {
            stats.currentRunningMap = map.name;

            // Tìm recordTime của map này từ gameMaps
            const mapInfo = ALL_MAPS.find(m => (m.name || "").trim() === (map.name || "").trim());
            if (mapInfo) {
                stats.currentMapRecordTime = mapInfo.recordTime || "--'--'--";
                stats.currentMapRecordRacer = mapInfo.recordRacer || "-";
                stats.currentMapRecordCar = mapInfo.recordCar || "-";
                stats.currentMapRecordPet = mapInfo.recordPet || "-";
            }
            break;
        }
    }

    // Nếu tất cả map đã hoàn thành, không có map đang chạy
    if (stats.completedMaps === raceState.maps.length && raceState.maps.length > 0) {
        stats.currentRunningMap = "Chưa có (Đã hoàn thành tất cả)";
    }

    // Xác định map đang chạy
    for (let i = 0; i < raceState.maps.length; i++) {
        const map = raceState.maps[i];
        const hasAllTimes = map.times && map.times.every(time =>
            time && time.trim() && time.trim() !== "--'--'--" && timeToSeconds(time) > 0
        );

        if (!hasAllTimes) {
            stats.currentRunningMap = map.name;

            // Tìm recordTime của map này từ gameMaps
            const mapInfo = ALL_MAPS.find(m => (m.name || "").trim() === (map.name || "").trim());
            if (mapInfo && mapInfo.recordTime) {
                // Chuẩn hóa định dạng thời gian record
                let recordTimeFormatted = mapInfo.recordTime;
                if (recordTimeFormatted.includes(":")) {
                    // Chuyển từ mm:ss.ms sang mm'ss'ms để hiển thị
                    recordTimeFormatted = recordTimeFormatted.replace(':', "'").replace('.', "'");
                }

                stats.currentMapRecordTime = recordTimeFormatted;
                stats.currentMapRecordRacer = mapInfo.recordRacer || "-";
                stats.currentMapRecordCar = mapInfo.recordCar || "-";
                stats.currentMapRecordPet = mapInfo.recordPet || "-";
            }
            break;
        }
    }

    return stats;
};

const updateStatistics = () => {
    const stats = calculateStatistics();

    // Cập nhật Map Đã hoàn thành
    document.getElementById('completed-maps-count').textContent = stats.completedMaps;

    // Cập nhật Map vừa hoàn thành với hình ảnh và description
    const mapNameElement = document.getElementById('latest-completed-map-name');
    const mapImageElement = document.getElementById('latest-map-image');
    const mapPlaceholderElement = document.getElementById('latest-map-placeholder');
    const mapImageContainer = document.getElementById('latest-completed-map-image');
    const statsCard = mapImageContainer.closest('.stats-card');
    const mapIndicator = document.getElementById('map-indicator');

    // Tìm element hiển thị description
    const mapDescriptionElement = document.getElementById('latest-map-description');

    if (stats.latestCompletedMapName !== "Chưa có" && stats.latestCompletedMapName) {
        mapNameElement.textContent = stats.latestCompletedMapName;

        // Cập nhật description
        if (mapDescriptionElement) {
            mapDescriptionElement.textContent = stats.latestCompletedMapDescription || "Chi tiết map";

            // Thêm tooltip cho description dài
            if (stats.latestCompletedMapDescription && stats.latestCompletedMapDescription.length > 30) {
                mapDescriptionElement.setAttribute('data-tooltip', stats.latestCompletedMapDescription);
                mapDescriptionElement.style.cursor = 'help';
            } else {
                mapDescriptionElement.removeAttribute('data-tooltip');
                mapDescriptionElement.style.cursor = 'default';
            }
        }

        if (stats.latestCompletedMapImageUrl) {
            // Thêm class khi có ảnh
            statsCard.classList.add('has-map-image');
            if (mapIndicator) mapIndicator.classList.remove('hidden');

            mapImageElement.src = stats.latestCompletedMapImageUrl;
            mapImageElement.alt = stats.latestCompletedMapName;
            mapImageElement.style.display = 'block';
            mapPlaceholderElement.style.display = 'none';

            // Hiệu ứng fade in
            mapImageElement.style.opacity = '0';
            mapImageElement.style.transition = 'opacity 0.8s ease';

            mapImageElement.onload = function () {
                setTimeout(() => {
                    mapImageElement.style.opacity = '1';

                    // Thêm hiệu ứng glow
                    if (gsap) {
                        gsap.to(mapImageContainer, {
                            duration: 1,
                            boxShadow: "0 0 25px rgba(0, 243, 255, 0.4), 0 0 40px rgba(0, 102, 255, 0.2)",
                            ease: "power2.out"
                        });
                    }
                }, 100);
            };

            // Xử lý lỗi khi tải ảnh
            mapImageElement.onerror = function () {
                console.warn(`Không thể tải hình ảnh map: ${stats.latestCompletedMapImageUrl}`);
                statsCard.classList.remove('has-map-image');
                if (mapIndicator) mapIndicator.classList.add('hidden');
                mapImageElement.style.display = 'none';
                mapPlaceholderElement.style.display = 'flex';
                mapPlaceholderElement.innerHTML = `<i class="fas fa-map text-cyan-400 text-2xl"></i>`;
            };
        } else {
            statsCard.classList.remove('has-map-image');
            if (mapIndicator) mapIndicator.classList.add('hidden');
            mapImageElement.style.display = 'none';
            mapPlaceholderElement.style.display = 'flex';
            mapPlaceholderElement.innerHTML = `<i class="fas fa-map text-cyan-400 text-2xl"></i>`;
        }
    } else {
        statsCard.classList.remove('has-map-image');
        if (mapIndicator) mapIndicator.classList.add('hidden');
        mapNameElement.textContent = "Chưa có";

        // Cập nhật description mặc định
        if (mapDescriptionElement) {
            mapDescriptionElement.textContent = "Chưa có map hoàn thành";
        }

        mapImageElement.style.display = 'none';
        mapPlaceholderElement.style.display = 'flex';
        mapPlaceholderElement.innerHTML = `<i class="fas fa-map text-slate-600 text-2xl"></i>`;
    }

    // Cập nhật Thời gian nhanh nhất với đầy đủ thông tin
    document.getElementById('best-time').textContent = stats.bestTimeInLatestMapString;

    // Cập nhật thông tin chi tiết: tay đua, xe, pet
    if (stats.bestTimeRacerInLatestMap !== "-") {
        document.getElementById('best-time-racer').textContent = stats.bestTimeRacerInLatestMap;
        document.getElementById('best-time-car').textContent = stats.bestTimeCarInLatestMap !== "-" ? stats.bestTimeCarInLatestMap : "Chưa có";
        document.getElementById('best-time-pet').textContent = stats.bestTimePetInLatestMap !== "-" ? stats.bestTimePetInLatestMap : "Chưa có";
    } else {
        document.getElementById('best-time-racer').textContent = "-";
        document.getElementById('best-time-car').textContent = "-";
        document.getElementById('best-time-pet').textContent = "-";
    }

    // Cập nhật hình ảnh và độ khó map đấu kế tiếp
    const nextMapImageContainer = document.getElementById('next-map-image-container');
    const nextMapImage = document.getElementById('next-map-image-content');
    const nextMapPlaceholder = document.getElementById('next-map-placeholder');
    const nextMapName = document.getElementById('next-map-name');
    const difficultyBadge = document.getElementById('next-map-difficulty').querySelector('span');
    const difficultyText = document.getElementById('difficulty-text');

    // Tìm map đấu kế tiếp (map đầu tiên chưa hoàn thành)
    let nextMap = null;
    for (let i = 0; i < raceState.maps.length; i++) {
        const map = raceState.maps[i];
        const hasAllTimes = map.times && map.times.every(time =>
            time && time.trim() && time.trim() !== "--'--'--" && timeToSeconds(time) > 0
        );

        if (!hasAllTimes) {
            nextMap = map;
            break;
        }
    }

    if (nextMap) {
        // Cập nhật tên map
        document.getElementById('current-running-map').textContent = nextMap.name;

        // Tìm thông tin map từ ALL_MAPS
        const mapInfo = ALL_MAPS.find(m => (m.name || "").trim() === (nextMap.name || "").trim());

        // Hiển thị tên map
        if (nextMapName) {
            nextMapName.textContent = nextMap.name;
        }

        // Cập nhật độ khó của map
        if (mapInfo && mapInfo.difficulty) {
            const difficulty = mapInfo.difficulty.toLowerCase();
            const difficultyClasses = {
                'easy': 'difficulty-easy',
                'medium': 'difficulty-medium',
                'hard': 'difficulty-hard',
                'expert': 'difficulty-expert',
                'extreme': 'difficulty-extreme'
            };

            // Xóa tất cả các class độ khó cũ
            Object.values(difficultyClasses).forEach(cls => {
                difficultyBadge.classList.remove(cls);
            });

            // Thêm class độ khó mới
            const difficultyClass = difficultyClasses[difficulty] || 'difficulty-medium';
            difficultyBadge.classList.add(difficultyClass);

            // Cập nhật text độ khó
            if (difficultyText) {
                // Hiển thị độ khó với chữ cái đầu viết hoa
                const displayDifficulty = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
                difficultyText.textContent = displayDifficulty;

                // Thêm icon tương ứng
                let icon = 'fa-signal';
                if (difficulty === 'easy') icon = 'fa-signal text-green-400';
                else if (difficulty === 'medium') icon = 'fa-signal text-yellow-400';
                else if (difficulty === 'hard') icon = 'fa-signal text-orange-400';
                else if (difficulty === 'expert') icon = 'fa-signal-alt text-purple-400';
                else if (difficulty === 'extreme') icon = 'fa-skull-crossbones text-red-400';

                difficultyBadge.innerHTML = `<i class="fas ${icon} mr-1"></i><span id="difficulty-text">${displayDifficulty}</span>`;
            }
        } else {
            // Nếu không có thông tin độ khó
            difficultyBadge.className = 'text-xs px-3 py-1 rounded-full font-bold bg-slate-800 text-slate-300 border border-slate-700';
            if (difficultyText) {
                difficultyText.textContent = "Không xác định";
            }
        }

        if (mapInfo && mapInfo.imageUrl) {
            // Thêm class khi có ảnh
            nextMapImageContainer.classList.add('has-next-map-image');

            nextMapImage.src = mapInfo.imageUrl;
            nextMapImage.alt = nextMap.name;
            nextMapImage.style.display = 'block';
            nextMapPlaceholder.style.display = 'none';

            // Hiệu ứng fade in
            nextMapImage.style.opacity = '0';
            nextMapImage.style.transition = 'opacity 0.8s ease';

            nextMapImage.onload = function () {
                setTimeout(() => {
                    nextMapImage.style.opacity = '1';

                    // Thêm hiệu ứng glow
                    if (gsap) {
                        gsap.to(document.getElementById('next-map-image'), {
                            duration: 1,
                            boxShadow: "0 0 25px rgba(0, 243, 255, 0.4), 0 0 40px rgba(0, 102, 255, 0.2)",
                            ease: "power2.out"
                        });
                    }
                }, 100);
            };

            // Xử lý lỗi khi tải ảnh
            nextMapImage.onerror = function () {
                console.warn(`Không thể tải hình ảnh map: ${mapInfo.imageUrl}`);
                nextMapImageContainer.classList.remove('has-next-map-image');
                nextMapImage.style.display = 'none';
                nextMapPlaceholder.style.display = 'flex';
                nextMapPlaceholder.innerHTML = `
                    <i class="fas fa-map-marked-alt text-3xl text-cyan-400 mb-2"></i>
                    <span class="text-xs text-slate-400 text-center px-2">${nextMap.name}</span>
                `;
            };
        } else {
            nextMapImageContainer.classList.remove('has-next-map-image');
            nextMapImage.style.display = 'none';
            nextMapPlaceholder.style.display = 'flex';
            nextMapPlaceholder.innerHTML = `
                <i class="fas fa-map-marked-alt text-3xl text-cyan-400 mb-2"></i>
                <span class="text-xs text-slate-400 text-center px-2">${nextMap.name}</span>
            `;
        }
    } else {
        // Không có map đấu kế tiếp (đã hoàn thành tất cả)
        document.getElementById('current-running-map').textContent = "Đã hoàn thành tất cả";
        if (nextMapName) {
            nextMapName.textContent = "Đã hoàn thành";
        }

        // Reset badge độ khó
        difficultyBadge.className = 'text-xs px-3 py-1 rounded-full font-bold bg-slate-800 text-slate-300 border border-slate-700';
        if (difficultyText) {
            difficultyText.textContent = "Đã hoàn thành";
            difficultyBadge.innerHTML = `<i class="fas fa-flag-checkered mr-1 text-green-400"></i><span id="difficulty-text">Đã hoàn thành</span>`;
        }

        nextMapImageContainer.classList.remove('has-next-map-image');
        nextMapImage.style.display = 'none';
        nextMapPlaceholder.style.display = 'flex';
        nextMapPlaceholder.innerHTML = `
            <i class="fas fa-flag-checkered text-3xl text-green-400 mb-2"></i>
            <span class="text-xs text-slate-400 text-center px-2">Đã hoàn thành tất cả map</span>
        `;
    }

    // Cập nhật Thống kê Đua - Thời gian nhanh nhất (recordTime) cho map đang chạy
    if (stats.currentMapRecordTime !== "--'--'--" && stats.currentMapRecordTime !== "00'00'00") {
        // Cập nhật thời gian record
        const timeValueElement = document.getElementById('current-best-time-value');
        if (timeValueElement) {
            timeValueElement.textContent = stats.currentMapRecordTime;
        }

        // Cập nhật tên tay đua và Avatar
        const bestRacerElement = document.getElementById('current-best-racer');
        if (bestRacerElement) {
            const userInfo = ALL_USERS.find(u => u.displayName === stats.currentMapRecordRacer);
            const userAvatar = (userInfo && userInfo.photoURL && userInfo.photoURL !== 'logoWS.png') ?
                `<img src="${userInfo.photoURL}" class="w-8 h-8 rounded-full object-cover border-2 border-white/20 shadow-lg animate-pulse-subtle" alt="avatar">` :
                `<div class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-white/10 opacity-70">
                    <i class="fas fa-user-ninja text-slate-500 text-xs"></i>
                </div>`;

            bestRacerElement.innerHTML = `
                <div class="flex items-center space-x-3 justify-end group cursor-help">
                    <div class="text-right">
                        <div class="text-xs font-black text-white truncate leading-tight group-hover:text-cyan-400 transition-colors">${stats.currentMapRecordRacer}</div>
                        <div class="text-[8px] text-slate-500 uppercase tracking-widest font-black opacity-60">Record Holder</div>
                    </div>
                    ${userAvatar}
                </div>
            `;
        }

        // Cập nhật xe
        const bestCarElement = document.getElementById('current-best-car');
        if (bestCarElement) {
            const carInfo = ALL_CARS.find(c => c.name === stats.currentMapRecordCar);
            const carIcon = carInfo && carInfo.imageUrl ?
                `<img src="${carInfo.imageUrl}" class="w-5 h-5 object-contain mr-1 inline-block" alt="car">` :
                `<i class="fas fa-car mr-1 text-cyan-400"></i>`;

            bestCarElement.innerHTML = `
                ${carIcon}
                <span>${stats.currentMapRecordCar !== "-" ? stats.currentMapRecordCar : "Không có"}</span>
            `;
        }

        // Cập nhật pet
        const bestPetElement = document.getElementById('current-best-pet');
        if (bestPetElement) {
            const petInfo = ALL_PETS.find(p => p.name === stats.currentMapRecordPet);
            const petIcon = petInfo && petInfo.imageUrl ?
                `<img src="${petInfo.imageUrl}" class="w-5 h-5 object-contain mr-1 inline-block" alt="pet">` :
                `<i class="fas fa-paw mr-1 text-purple-400"></i>`;

            bestPetElement.innerHTML = `
                ${petIcon}
                <span>${stats.currentMapRecordPet !== "-" ? stats.currentMapRecordPet : "Không có"}</span>
            `;
        }

        // Hiển thị container xe và pet
        const equipmentContainer = document.getElementById('current-best-equipment');
        if (equipmentContainer) {
            equipmentContainer.classList.remove('hidden');
        }
    } else if (stats.currentMapRecordTime === "00'00'00") {
        // Hiển thị khi record đã bị reset
        document.getElementById('current-best-time-value').textContent = "00'00'00";
        document.getElementById('current-best-racer').innerHTML = `
            <div class="flex items-center space-x-2 justify-end opacity-50">
                <span class="text-[10px] font-bold text-slate-500 italic">No Record</span>
                <i class="fas fa-user-circle text-slate-700 text-xl"></i>
            </div>
        `;
        document.getElementById('current-best-car').innerHTML = `
            <i class="fas fa-car mr-1 text-slate-500"></i>
            <span class="text-slate-500">-</span>
        `;
        document.getElementById('current-best-pet').innerHTML = `
            <i class="fas fa-paw mr-1 text-slate-500"></i>
            <span class="text-slate-500">-</span>
        `;
    } else {
        // Nếu không có record, hiển thị mặc định
        document.getElementById('current-best-time-value').textContent = "--'--'--";
        document.getElementById('current-best-racer').innerHTML = `
            <div class="flex items-center space-x-2 justify-end opacity-30">
                <span class="text-[10px] font-bold text-slate-500">-</span>
                <i class="fas fa-user-circle text-slate-700 text-xl"></i>
            </div>
        `;
        document.getElementById('current-best-car').innerHTML = `
            <i class="fas fa-car mr-1 text-cyan-400"></i>
            <span>-</span>
        `;
        document.getElementById('current-best-pet').innerHTML = `
            <i class="fas fa-paw mr-1 text-purple-400"></i>
            <span>-</span>
        `;
    }

    // Cập nhật số lượng tay đua
    const racerCountEl = document.getElementById('racer-count-badge');
    if (racerCountEl) {
        racerCountEl.textContent = raceState.racers.length;
    }

    // Cập nhật số lượng map
    const mapCountEl = document.getElementById('map-count');
    if (mapCountEl) {
        mapCountEl.textContent = raceState.maps.length;
    }

    // Cập nhật Progress Bar
    const progressBar = document.getElementById('race-progress-bar');
    if (progressBar && raceState.maps.length > 0) {
        const progress = (stats.completedMapsCount / raceState.maps.length) * 100;
        progressBar.style.width = `${progress}%`;
    }
};

// ================ RENDER VINH DANH ================
const renderHallOfFame = async () => {
    const topRacersList = document.getElementById('top-racers-list');
    const topCombosList = document.getElementById('top-combos-list');
    const topRecordHoldersList = document.getElementById('top-record-holders-list');

    if (!topRacersList || !topCombosList || !topRecordHoldersList) return;

    try {
        const { topRacers, topCombos, topRecordHolders } = await fetchRacerStatistics();

        // Render Top Racers
        if (topRacers.length === 0) {
            topRacersList.innerHTML = `
                <div class="text-center text-slate-500 py-3">
                    <i class="fas fa-inbox text-xl mb-2"></i>
                    <p class="text-xs">Chưa có dữ liệu</p>
                </div>
            `;
        } else {
            topRacersList.innerHTML = topRacers.map((racer, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = medals[index] || '';
                const bgClass = 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10';

                return `
                    <div class="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r ${bgClass} border hover:scale-[1.02] transition-all duration-300">
                        <div class="flex items-center space-x-3 flex-1 min-w-0">
                            <span class="text-xl w-8 h-8 flex items-center justify-center bg-black/20 rounded-lg flex-shrink-0 font-bold text-white shadow-inner">
                                ${medal || index + 1}
                            </span>
                            <div class="min-w-0 flex-1">
                                <div class="font-black text-white text-sm truncate uppercase tracking-tight">${racer.name}</div>
                                <div class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">${racer.count} Trận Đấu</div>
                            </div>
                        </div>
                        <div class="flex space-x-0.5 text-[8px] opacity-50">
                            ${index < 3 ? '⭐⭐⭐' : '⭐'}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // **MỚI: Render Top Record Holders**
        if (topRecordHolders.length === 0) {
            topRecordHoldersList.innerHTML = `
        <div class="text-center text-slate-500 py-3">
            <i class="fas fa-inbox text-xl mb-2"></i>
            <p class="text-xs">Chưa có dữ liệu</p>
        </div>
    `;
        } else {
            topRecordHoldersList.innerHTML = topRecordHolders.map((holder, index) => {
                const crowns = ['👑', '🏆', '🎖️'];
                const crown = crowns[index] || '';
                const bgClass = 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'; // Simplified background

                // Lấy Avatar của Holder
                const userInfo = ALL_USERS.find(u => u.displayName === holder.name);
                const userAvatar = (userInfo && userInfo.photoURL && userInfo.photoURL !== 'logoWS.png') ?
                    `<img src="${userInfo.photoURL}" class="w-8 h-8 rounded-lg object-cover border border-white/10" alt="avatar">` :
                    `<span class="text-xl w-8 h-8 flex items-center justify-center bg-black/20 rounded-lg flex-shrink-0 shadow-inner">
                        ${crown || index + 1}
                    </span>`;

                return `
                    <div class="flex items-center justify-between p-3 rounded-xl ${bgClass} border hover:scale-[1.02] transition-all duration-300 cursor-pointer shadow-lg hover:shadow-cyan-500/10"
                         onclick="openRecordHolderModal('${holder.name.replace(/'/g, "\\\'")}')">
                        <div class="flex items-center space-x-3 flex-1 min-w-0">
                            ${userAvatar}
                            <div class="min-w-0 flex-1">
                                <div class="font-black text-white text-sm truncate uppercase tracking-tight">${holder.name}</div>
                                <div class="text-[10px] text-white/50 font-black uppercase tracking-widest">${holder.count} Kỷ Lục</div>
                            </div>
                        </div>
                        <i class="fas fa-chevron-right text-[10px] text-slate-700"></i>
                    </div>
                `;
            }).join('');
        }

        // Render Top Combos
        if (topCombos.length === 0) {
            topCombosList.innerHTML = `
                <div class="text-center text-slate-500 py-3">
                    <i class="fas fa-inbox text-xl mb-2"></i>
                    <p class="text-xs">Chưa có dữ liệu</p>
                </div>
            `;
        } else {
            topCombosList.innerHTML = topCombos.map((combo, index) => {
                const bgClass = index === 0 ? 'from-purple-500/10 to-pink-500/5 border-purple-500/20' : 'from-slate-800/20 to-slate-700/10 border-slate-700/30';

                return `
                    <div class="p-3 rounded-xl bg-gradient-to-br ${bgClass} border hover:scale-[1.02] transition-all duration-300 group">
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em]">Rank #${index + 1}</span>
                            <span class="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded font-black">
                                ${combo.count} Lần sử dụng
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div class="flex items-center bg-black/30 p-2 rounded-lg border border-slate-800/50">
                                ${(() => {
                        const carInfo = ALL_CARS.find(c => (c.name || '').trim() === (combo.car || '').trim());
                        return carInfo && carInfo.imageUrl ?
                            `<img src="${carInfo.imageUrl}" class="w-8 h-8 object-contain mr-2 group-hover:scale-110 transition-transform" alt="car">` :
                            `<i class="fas fa-car text-cyan-400 mr-2"></i>`;
                    })()}
                                <span class="text-white text-[10px] font-bold truncate">${combo.car}</span>
                            </div>
                            <div class="flex items-center bg-black/30 p-2 rounded-lg border border-slate-800/50">
                                ${(() => {
                        const petInfo = ALL_PETS.find(p => (p.name || '').trim() === (combo.pet || '').trim());
                        return petInfo && petInfo.imageUrl ?
                            `<img src="${petInfo.imageUrl}" class="w-8 h-8 object-contain mr-2 group-hover:scale-110 transition-transform" alt="pet">` :
                            `<i class="fas fa-paw text-pink-400 mr-2"></i>`;
                    })()}
                                <span class="text-white text-[10px] font-bold truncate">${combo.pet}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

    } catch (error) {
        console.error("❌ Lỗi khi render vinh danh:", error);
        topRacersList.innerHTML = '<div class="text-center text-red-400 py-3 text-xs">Lỗi tải dữ liệu</div>';
        topCombosList.innerHTML = '<div class="text-center text-red-400 py-3 text-xs">Lỗi tải dữ liệu</div>';
        topRecordHoldersList.innerHTML = '<div class="text-center text-red-400 py-3 text-xs">Lỗi tải dữ liệu</div>';
    }
};
// --- Validation Functions ---
const validateUniqueCars = (state) => {
    const errors = [];
    const requiredMapNames = getRequiredMapNames(state);

    for (let racerIndex = 0; racerIndex < NUM_RACERS; racerIndex++) {
        const usageMap = new Map();

        state.maps.forEach((map, mapIndex) => {
            const carName = (map.cars && map.cars[racerIndex]) || '';
            const trimmedCarName = carName.trim();
            const isFixedMap = requiredMapNames.includes(map.name.trim());

            if (trimmedCarName && !isFixedMap) {
                if (usageMap.has(trimmedCarName)) {
                    usageMap.get(trimmedCarName).push(mapIndex);
                } else {
                    usageMap.set(trimmedCarName, [mapIndex]);
                }
            }
        });

        usageMap.forEach((mapIndices, car) => {
            if (mapIndices.length > 1) {
                errors.push({ racerIndex: racerIndex, car: car, mapIndices: mapIndices });
            }
        });
    }
    return errors;
};

const validateMapConfiguration = (state) => {
    const errors = [];
    const numRacers = state.racers.length;

    if (!state.firstMapBtc.trim()) {
        errors.push("Map BTC chưa được nhập. Vui lòng nhập Map BTC.");
    }

    const kingMaps = [];
    for (let i = 0; i < numRacers; i++) {
        const kingMapName = state.racers[i].kingMap ? state.racers[i].kingMap.trim() : '';
        if (!kingMapName) {
            errors.push(`King Map của Tay Đua ${i + 1} chưa được nhập.`);
        } else {
            kingMaps.push(kingMapName);
        }
    }

    if (kingMaps.length === numRacers && kingMaps.every(km => km)) {
        const uniqueKingMaps = new Set(kingMaps);
        if (uniqueKingMaps.size !== numRacers) {
            const duplicates = kingMaps.filter((item, index) => kingMaps.indexOf(item) !== index);
            const uniqueDuplicates = Array.from(new Set(duplicates));
            errors.push(`King Map bị trùng: ${uniqueDuplicates.join(', ')}. 4 King Map phải khác nhau.`);
        }
    }

    return errors;
};

// --- Core Logic ---
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


const calculateRanking = () => {
    const numRacers = raceState.racers.length;
    const rankingData = raceState.racers.map((racer, index) => ({
        originalIndex: index,
        name: racer.name.trim() || `Tay Đua ${index + 1}`,
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

const getRequiredMapNames = (state) => {
    const requiredMaps = [];
    if (state.firstMapBtc.trim()) {
        requiredMaps.push(state.firstMapBtc.trim());
    }

    state.racers.forEach(racer => {
        if (racer.kingMap.trim()) {
            requiredMaps.push(racer.kingMap.trim());
        }
    });

    const uniqueRequiredMaps = Array.from(new Set(requiredMaps));
    return uniqueRequiredMaps.slice(0, 5);
};

const ensureInitialMaps = (currentState) => {
    const initialMapNames = getRequiredMapNames(currentState);
    const finalMaps = [];
    let mapsChanged = false;

    initialMapNames.forEach(name => {
        const trimmedName = name.trim();
        const existingMap = currentState.maps.find(m => m.name.trim() === trimmedName);

        if (existingMap) {
            const updatedMap = {
                ...defaultMapData(),
                ...existingMap,
                cars: existingMap.cars || defaultMapData().cars,
                pets: existingMap.pets || defaultMapData().pets,
            };
            finalMaps.push(updatedMap);
        } else {
            finalMaps.push({ ...defaultMapData(), name: trimmedName });
            mapsChanged = true;
        }
    });

    currentState.maps.forEach(map => {
        if (!initialMapNames.includes(map.name.trim())) {
            const updatedMap = {
                ...defaultMapData(),
                ...map,
                cars: map.cars || defaultMapData().cars,
                pets: map.pets || defaultMapData().pets,
            };
            finalMaps.push(updatedMap);
        }
    });

    const fixedMaps = finalMaps.filter(map => initialMapNames.includes(map.name.trim()));
    const freeMaps = finalMaps.filter(map => !initialMapNames.includes(map.name.trim()));

    const sortedFixedMaps = initialMapNames.map(name =>
        fixedMaps.find(m => m.name.trim() === name)
    ).filter(map => map);

    const newState = {
        ...currentState,
        maps: [...sortedFixedMaps, ...freeMaps],
    };

    return newState;
};

// --- Render Functions ---
const renderRacerInputs = () => {
    const container = document.getElementById('racer-names');
    container.innerHTML = '';
    document.getElementById('btc-map-name').value = raceState.firstMapBtc;

    // Thêm disabled cho ô Map BTC nếu không phải admin
    const btcMapInput = document.getElementById('btc-map-name');
    if (btcMapInput && !isAdminUser) {
        btcMapInput.disabled = true;
        btcMapInput.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
    }

    raceState.racers.forEach((racer, index) => {
        const displayName = racer.name.trim() || `Tay Đua ${index + 1}`;
        const racerTitle = `${displayName} (Player ${index + 1})`;

        // Kiểm tra xem có phải admin không để thêm thuộc tính disabled
        const disabledAttr = !isAdminUser ? 'disabled' : '';
        const disabledClass = !isAdminUser ? 'opacity-50 cursor-not-allowed bg-slate-800' : '';
        const placeholderClass = !isAdminUser ? 'placeholder-slate-500' : '';

        const inputHtml = `
                <div class="neon-card p-5 hover:border-cyan-500/30 transition-all duration-300">
                    <div class="flex items-center mb-4 pb-3 border-b border-slate-800">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mr-3">
                            <span class="text-white font-bold">${index + 1}</span>
                        </div>
                        <label class="text-lg font-bold text-cyan-300">${racerTitle}</label>
                    </div>
                    <div class="mb-4">
                        <label for="racer-name-${index}" class="block text-sm font-medium text-slate-400 mb-2">
                            <i class="fas fa-user mr-1"></i> Tên Tay Đua
                        </label>
                        <input type="text" id="racer-name-${index}" value="${racer.name}" 
                            ${disabledAttr}
                            class="speed-input w-full text-center ${disabledClass} ${placeholderClass}" 
                            placeholder="${!isAdminUser ? 'Chỉ xem' : `Nhập tên tay đua (Player ${index + 1})`}" 
                            onchange="${isAdminUser ? `handleNameChange(this.value, ${index})` : ''}" />
                    </div>
                    <div>
                        <label for="king-map-${index}" class="block text-sm font-medium text-slate-400 mb-2">
                            <i class="fas fa-crown mr-1"></i> King Map
                        </label>
                        <input type="text" id="king-map-${index}" value="${racer.kingMap}" 
                            ${disabledAttr}
                            list="map-suggestions" class="speed-input w-full text-center ${disabledClass} ${placeholderClass}" 
                            placeholder="${!isAdminUser ? 'Chỉ xem' : 'Nhập King Map'}" 
                            onchange="${isAdminUser ? `handleKingMapChange(this.value, ${index})` : ''}" />
                        <p class="text-xs text-slate-500 mt-2 italic text-center">
                            <i class="fas fa-star text-amber-400 mr-1"></i> King Map Owner được 
                            <span class="text-amber-400 font-bold">+1 điểm</span> nếu về nhất map đó.
                        </p>
                    </div>
                </div>
            `;
        container.insertAdjacentHTML('beforeend', inputHtml);
    });
};

const renderMapTables = () => {
    const tbodyTimePoints = document.getElementById('map-time-points-body');
    const tbodyCarPet = document.getElementById('map-car-pet-body');
    tbodyTimePoints.innerHTML = '';
    tbodyCarPet.innerHTML = '';

    const numRacerCols = raceState.racers.length;
    const racerNames = raceState.racers.map((r, i) => r.name.trim() || `P${i + 1}`);
    const requiredMapNames = getRequiredMapNames(raceState);

    // Cập nhật colspan cho header chính
    const racerTimeHeader = document.getElementById('racer-time-header');
    if (racerTimeHeader) {
        racerTimeHeader.setAttribute('colspan', numRacerCols);
    }

    // Header Time
    const subHeaderTimePoints = document.getElementById('racer-sub-header-time-points');
    let subHeaderTimePointsHtml = '';
    subHeaderTimePointsHtml += `<th class="px-4 py-3 bg-slate-900/80"></th><th class="px-4 py-3 bg-slate-900/80"></th>`;
    for (let i = 0; i < numRacerCols; i++) {
        subHeaderTimePointsHtml += `<th class="px-4 py-3 text-center text-xs font-bold text-slate-300 border-l border-slate-700">${racerNames[i]}</th>`;
    }
    subHeaderTimePointsHtml += `<th class="px-4 py-3 bg-slate-900/80"></th>`;
    subHeaderTimePoints.innerHTML = subHeaderTimePointsHtml;

    // Header Car/Pet
    const subHeaderCarPet = document.getElementById('racer-sub-header-car-pet');
    let subHeaderCarPetHtml = '';
    subHeaderCarPetHtml += `<th class="px-4 py-3 bg-slate-900/80"></th><th class="px-4 py-3 bg-slate-900/80"></th>`;
    for (let i = 0; i < numRacerCols; i++) {
        subHeaderCarPetHtml += `<th class="px-4 py-3 text-center text-xs font-bold text-slate-300 border-l border-slate-700">${racerNames[i]}</th>`;
    }
    for (let i = 0; i < numRacerCols; i++) {
        subHeaderCarPetHtml += `<th class="px-4 py-3 text-center text-xs font-bold text-slate-300 border-l border-slate-700">${racerNames[i]}</th>`;
    }
    subHeaderCarPetHtml += `<th class="px-4 py-3 bg-slate-900/80"></th>`;
    subHeaderCarPet.innerHTML = subHeaderCarPetHtml;

    if (raceState.maps.length === 0) {
        tbodyTimePoints.innerHTML = `<tr><td colspan="${2 + numRacerCols * 2 + 1}" class="text-center py-8 text-slate-500">Chưa có bản đồ nào được thêm vào. Vui lòng cấu hình Map BTC và King Maps.</td></tr>`;
        tbodyCarPet.innerHTML = `<tr><td colspan="${2 + numRacerCols * 2 + 1}" class="text-center py-8 text-slate-500">Chưa có bản đồ nào được thêm vào. Vui lòng cấu hình Map BTC và King Maps.</td></tr>`;
        return;
    }

    raceState.maps.forEach((map, mapIndex) => {
        const mapTimeStrings = map.times || new Array(numRacerCols).fill(null);
        const mapCars = map.cars || new Array(numRacerCols).fill(null);
        const mapPets = map.pets || new Array(numRacerCols).fill(null);
        const mapPoints = calculateMapPoints(mapTimeStrings, map.name);
        const isFixedMap = requiredMapNames.includes(map.name.trim());

        let mapTypeBadge = '';
        if (mapIndex === 0 && map.name.trim() === raceState.firstMapBtc.trim()) {
            mapTypeBadge = '<span class="text-xs bg-red-500 text-white px-2 py-1 rounded ml-2">BTC</span>';
        } else if (raceState.racers.some(r => r.kingMap.trim() === map.name.trim())) {
            mapTypeBadge = '<span class="text-xs bg-amber-500 text-white px-2 py-1 rounded ml-2">KING</span>';
        }

        // Tìm thông tin map từ ALL_MAPS để lấy imageUrl
        const mapInfo = ALL_MAPS.find(m => (m.name || "").trim() === (map.name || "").trim());
        const mapImageHtml = mapInfo && mapInfo.imageUrl ?
            `<img src="${mapInfo.imageUrl}" class="w-10 h-10 rounded-lg object-cover mr-3 border border-slate-700/50 shadow-sm" onerror="this.style.display='none'">` :
            `<div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center mr-3 border border-slate-700/50">
                <i class="fas fa-map-marked-alt text-slate-600 text-xs"></i>
            </div>`;

        // Kiểm tra isAdminUser để hiển thị input hoặc text
        let mapNameDisplay;
        if (isAdminUser) {
            mapNameDisplay = isFixedMap ?
                `<div class="font-semibold text-white flex items-center">${mapImageHtml} ${map.name} ${mapTypeBadge}</div>` :
                `<div class="flex items-center">
                    ${mapImageHtml}
                    <input type="text" value="${map.name}" list="map-suggestions" onchange="handleMapNameChange(this.value, ${mapIndex})" class="speed-input w-full text-left text-sm" placeholder="Tên Map Tự Do" />
                </div>`;
        } else {
            // Người xem chỉ thấy text, không có input
            mapNameDisplay = `<div class="font-semibold text-white flex items-center">${mapImageHtml} ${map.name} ${mapTypeBadge}</div>`;
        }

        const rowBgClass = isFixedMap ? 'bg-slate-900/50' : 'bg-slate-800/30';

        let timeCellsHtml = '';
        let pointCellsHtml = '';
        let carCellsHtml = '';
        let petCellsHtml = '';

        for (let racerIndex = 0; racerIndex < numRacerCols; racerIndex++) {
            const timeString = mapTimeStrings[racerIndex] || '';
            const pointValue = mapPoints[racerIndex];
            const carValue = mapCars[racerIndex] || '';
            const petValue = mapPets[racerIndex] || '';

            let pointBgClass = 'bg-slate-700';
            let pointTextClass = 'text-white';

            if (pointValue === 12) {
                pointBgClass = 'bg-gradient-to-br from-amber-400 to-yellow-500';
                pointTextClass = 'text-slate-900 font-extrabold';
            } else if (pointValue === 11) {
                pointBgClass = 'bg-gradient-to-br from-teal-500 to-cyan-500';
                pointTextClass = 'text-slate-900 font-bold';
            } else if (pointValue > 0 && pointValue < 11) {
                pointBgClass = 'bg-gradient-to-br from-cyan-600 to-blue-600';
            } else if (pointValue === 0 && timeString) {
                pointBgClass = 'bg-gradient-to-br from-red-600 to-red-700';
            }

            if (isAdminUser) {
                // Admin: Hiển thị input có thể chỉnh sửa
                const timeInputId = `time-${mapIndex}-${racerIndex}`;
                const carInputId = `car-${mapIndex}-${racerIndex}`;
                const petInputId = `pet-${mapIndex}-${racerIndex}`;

                timeCellsHtml += `
    <td class="px-2 py-3 text-center border-l border-slate-700">
        <input type="text" id="${timeInputId}" value="${timeString}" 
            data-map-index="${mapIndex}" data-racer-index="${racerIndex}"
            class="speed-input w-full text-center text-sm temp-edit-input" 
            placeholder="--'--'--" />
    </td>
`;

                carCellsHtml += `
    <td class="px-2 py-3 text-center border-l border-slate-700 relative group/cell">
        <div class="flex items-center gap-1">
            <input type="text" id="${carInputId}" value="${carValue}" 
                data-map-index="${mapIndex}" data-racer-index="${racerIndex}"
                class="speed-input w-full text-center text-sm temp-edit-input" 
                placeholder="Xe" list="car-suggestions" />
            
            <div class="relative">
                <button onclick="toggleComboMenu(event, ${mapIndex}, ${racerIndex}, '${map.name.replace(/'/g, "\\'")}')" 
                        class="text-amber-400 hover:text-amber-300 transition-all opacity-0 group-hover/cell:opacity-100 flex-shrink-0" 
                        title="Gợi ý Combo">
                    <i class="fas fa-magic text-xs"></i>
                </button>
                <div id="combo-menu-${mapIndex}-${racerIndex}" 
                     class="hidden absolute right-0 top-full z-[100] mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 text-left backdrop-blur-md">
                     <!-- Populated by JS -->
                </div>
            </div>
        </div>
    </td>
`;

                petCellsHtml += `
    <td class="px-2 py-3 text-center border-l border-slate-700">
        <input type="text" id="${petInputId}" value="${petValue}" 
            data-map-index="${mapIndex}" data-racer-index="${racerIndex}"
            class="speed-input w-full text-center text-sm temp-edit-input" 
            style="background: rgba(18, 18, 26, 0.6); margin: -8px 0;"
            placeholder="Pet" list="pet-suggestions" />
    </td>
`;
            } else {
                // Người xem: Hiển thị hình ảnh hoặc text nếu không có ảnh
                const displayTime = timeString || "--'--'--";

                // Tìm thông tin ảnh xe và pet
                const carInfo = ALL_CARS.find(c => c.name === carValue);
                const petInfo = ALL_PETS.find(p => p.name === petValue);

                const carHtml = carValue ? `
                    <div class="equipment-tag">
                        ${carInfo && carInfo.imageUrl ?
                        `<img src="${carInfo.imageUrl}" alt="${carValue}" onerror="this.parentElement.innerHTML='${carValue}'">` :
                        `<i class="fas fa-car text-cyan-400 mr-2"></i>`}
                        <span class="text-white font-medium">${carValue}</span>
                    </div>` : `-`;

                const petHtml = petValue ? `
                    <div class="equipment-tag">
                        ${petInfo && petInfo.imageUrl ?
                        `<img src="${petInfo.imageUrl}" alt="${petValue}" onerror="this.parentElement.innerHTML='${petValue}'">` :
                        `<i class="fas fa-paw text-pink-400 mr-2"></i>`}
                        <span class="text-white font-medium">${petValue}</span>
                    </div>` : `-`;

                timeCellsHtml += `
                        <td class="px-2 py-3 text-center border-l border-slate-700">
                            <div class="text-white font-medium bg-slate-800/50 rounded px-2 py-1.5">${displayTime}</div>
                        </td>
                    `;

                carCellsHtml += `
                        <td class="px-2 py-3 text-center border-l border-slate-700">
                            <div class="flex justify-center">${carHtml}</div>
                        </td>
                    `;

                petCellsHtml += `
                        <td class="px-2 py-3 text-center border-l border-slate-700">
                            <div class="flex justify-center">${petHtml}</div>
                        </td>
                    `;
            }

        }

        const actionButtons = isAdminUser ?
            `<div class="flex flex-col gap-2">
                <button onclick="saveMapData(${mapIndex})" id="save-map-${mapIndex}" 
                    class="speed-button px-3 py-1 text-xs bg-green-600/20 border-green-500/30 hover:bg-green-600/30" 
                    title="Lưu dữ liệu map này">
                    <i class="fas fa-save mr-1"></i> Lưu
                </button>
                ${isFixedMap ?
                `<button disabled class="text-slate-600 p-2 cursor-not-allowed" title="Không thể xóa Map cố định (BTC/King)">
                        <i class="fas fa-trash-alt"></i>
                    </button>` :
                `<button onclick="deleteMap(${mapIndex})" 
                        class="text-red-400 hover:text-red-300 p-2 transition duration-150" 
                        title="Xóa Map Tự Do">
                        <i class="fas fa-trash-alt"></i>
                    </button>`
            }
            </div>` :
            `<div class="flex flex-col gap-2">
                <button disabled class="text-slate-600 p-2 cursor-not-allowed" title="Chế độ xem">
                    <i class="fas fa-save"></i>
                </button>
                <button disabled class="text-slate-600 p-2 cursor-not-allowed" title="Chế độ xem">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>`;

        const rowId = `map-row-${map.id}`;

        // Time/Points Row
        const timePointsRow = `
    <tr id="${rowId}" class="${rowBgClass} hover:bg-slate-700/50 transition-colors">
        <td class="px-4 py-3 text-center text-sm font-semibold text-slate-400">${mapIndex + 1}</td>
        <td class="px-4 py-3 text-left map-name-column text-sm font-semibold">${mapNameDisplay}</td>
        ${timeCellsHtml}
        <td class="px-4 py-3 text-center">${actionButtons}</td>
    </tr>
`;
        tbodyTimePoints.insertAdjacentHTML('beforeend', timePointsRow);

        // Car/Pet Row
        const carPetRow = `
                <tr class="${rowBgClass} hover:bg-slate-700/50 transition-colors">
                    <td class="px-4 py-3 text-center text-sm font-semibold text-slate-400">${mapIndex + 1}</td>
                    <td class="px-4 py-3 text-left map-name-column text-sm font-semibold">${mapNameDisplay}</td>
                    ${carCellsHtml}
                    ${petCellsHtml}
                    <td class="px-4 py-3 text-center"></td>
                </tr>
            `;
        tbodyCarPet.insertAdjacentHTML('beforeend', carPetRow);
    });
};

const renderDetailedScoreboard = (rankingData) => {
    const thead = document.getElementById('detailed-scoreboard-header');
    const tbody = document.getElementById('detailed-scoreboard-body');
    const table = thead.closest('table');

    if (raceState.maps.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = `<tr><td colspan="100%" class="text-center py-8 text-slate-500">Chưa có bản đồ nào được thêm vào. Vui lòng cấu hình Map BTC và King Maps.</td></tr>`;
        return;
    }

    const mapPointsMatrix = raceState.maps.map(map => calculateMapPoints(map.times, map.name));

    // Tạo colgroup để áp dụng style cho cả cột
    let colgroupHtml = '<colgroup>';
    colgroupHtml += '<col>'; // Cột Hạng
    colgroupHtml += '<col>'; // Cột Tay Đua

    raceState.maps.forEach((map, mapIndex) => {
        // Tìm thông tin map từ ALL_MAPS để lấy imageUrl
        const mapInfo = ALL_MAPS.find(m => (m.name || "").trim() === (map.name || "").trim());
        const mapImageUrl = mapInfo?.imageUrl || '';

        // Bỏ overlay gradient, chỉ giữ background image
        const backgroundStyle = mapImageUrl ?
            `background-image: url('${mapImageUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;` :
            '';

        colgroupHtml += `<col class="map-column-bg" style="${backgroundStyle}">`;
    });

    colgroupHtml += '<col>'; // Cột Tổng Điểm
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
            <th scope="col" class="px-6 py-4 text-center text-sm font-extrabold uppercase tracking-wider text-cyan-400">Hạng</th> 
            <th scope="col" class="px-6 py-4 text-center text-sm font-extrabold uppercase tracking-wider text-cyan-400 min-w-[150px]">Tay Đua</th>`;

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
        const mapInfo = ALL_MAPS.find(m => (m.name || "").trim() === (map.name || "").trim());
        const mapImageUrl = mapInfo?.imageUrl || '';

        const backgroundStyle = mapImageUrl ?
            `background-image: url('${mapImageUrl}');` :
            '';

        headerRow1 += `<th scope="col" class="map-column-header px-4 py-4 text-center text-xs font-extrabold text-cyan-400 uppercase tracking-wider min-w-[80px]" style="${backgroundStyle}">
                <div class="map-column-header-content flex flex-col items-center justify-center">
                    <span class="text-white font-bold drop-shadow-lg text-base">Trận ${mapIndex + 1}</span>
                    <span class="text-slate-100 text-xs mt-2 flex items-center justify-center drop-shadow-md font-semibold">
                        ${map.name.trim() || 'Chưa đặt tên'} ${mapTypeIcon}
                    </span>
                </div>
            </th>`;
    });

    headerRow1 += `<th scope="col" class="px-6 py-4 text-center text-base font-extrabold text-white bg-gradient-to-r from-red-700 to-red-800 uppercase tracking-wider">Tổng Điểm</th></tr>`;
    thead.innerHTML = headerRow1;


    // Tạo body
    tbody.innerHTML = '';
    rankingData.forEach((racer, rankIndex) => {
        const racerIndex = racer.originalIndex;
        const racerName = racer.name;

        // Giống map-detail: có hover effect
        let rowHtml = `<tr class="hover:bg-slate-700/50 transition-colors ${racer.rank <= 3 ? 'font-bold' : ''}">`;

        rowHtml += `<td class="px-3 py-4 text-center text-lg font-extrabold text-white">${racer.rank}</td>`;
        rowHtml += `<td class="px-3 py-3 text-left map-name-column text-sm font-semibold text-white">${racerName}</td>`;

        raceState.maps.forEach((map, mapIndex) => {
            const pointValue = mapPointsMatrix[mapIndex][racerIndex];

            // Giống map-detail: chỉ dùng class map-score-cell
            rowHtml += `<td class="px-3 py-4 text-center">
                    <div class="map-score-cell">+${pointValue}</div>
                </td>`;
        });

        rowHtml += `<td class="px-6 py-3 text-center text-lg font-extrabold bg-gradient-to-r from-red-800 to-red-900 text-white">${racer.totalScore}</td>`;
        rowHtml += `</tr>`;
        tbody.insertAdjacentHTML('beforeend', rowHtml);
    });
};

const renderRankingTable = (rankingData) => {
    const tbody = document.getElementById('ranking-table-body');
    tbody.innerHTML = '';

    const topRacers = rankingData.slice(0, Math.min(rankingData.length, 4));

    topRacers.forEach((racer, index) => {
        let rankContent = racer.rank;
        let scoreClass = 'text-white';
        let trendIcon = '';

        if (racer.rank === 1) {
            rankContent = '<div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-amber-500/30 shadow-[0_0_15px_rgba(251,191,36,0.1)]"><span class="text-xl">🥇</span></div>';
            scoreClass = 'text-white';
        } else if (racer.rank === 2) {
            rankContent = '<div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-slate-400/30"><span class="text-xl">🥈</span></div>';
            scoreClass = 'text-slate-300';
        } else if (racer.rank === 3) {
            rankContent = '<div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-orange-500/30"><span class="text-xl">🥉</span></div>';
            scoreClass = 'text-slate-400';
        } else {
            rankContent = `<div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5 text-slate-500 text-xs font-black">#${racer.rank}</div>`;
        }

        const trendValue = (racer.originalIndex + 1) - racer.rank;
        if (trendValue > 0) {
            trendIcon = `<span class="flex items-center text-green-400 text-[10px] font-black uppercase"><i class="fas fa-caret-up mr-1 text-sm"></i> +${trendValue}</span>`;
        } else if (trendValue < 0) {
            trendIcon = `<span class="flex items-center text-red-400 text-[10px] font-black uppercase"><i class="fas fa-caret-down mr-1 text-sm"></i> ${trendValue}</span>`;
        } else {
            trendIcon = `<span class="flex items-center text-slate-600 text-[10px] font-black uppercase"><i class="fas fa-minus mr-1"></i> 0</span>`;
        }

        const rowHtml = `
            <tr class="group hover:bg-white/5 transition-all duration-200">
                <td class="px-6 py-5 flex justify-center items-center">
                    ${rankContent}
                </td>
                <td class="px-6 py-5">
                    <div class="flex flex-col items-center">
                        <span class="text-sm font-black text-white uppercase tracking-tight">${racer.name}</span>
                        <span class="text-[9px] text-slate-600 uppercase font-black tracking-widest mt-1">Player ${racer.originalIndex + 1}</span>
                    </div>
                </td>
                <td class="px-6 py-5">
                    <div class="text-center font-black ${scoreClass} text-2xl tracking-tighter">${racer.totalScore}</div>
                </td>
                <td class="px-6 py-5">
                    <div class="flex justify-center">${trendIcon}</div>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', rowHtml);
    });
};

const updateUI = () => {
    const rankingData = calculateRanking();
    renderRacerInputsWithDropdown();
    renderMapTables();
    renderDetailedScoreboard(rankingData);
    renderRankingTable(rankingData);
    updateStatistics();
    initBtcWheel();

    // THÊM: Attach event listeners cho input
    attachInputListeners();

    renderHallOfFame();

    // TẮT auto-scroll khi đang edit
    if (!isEditing && mapIdToScroll) {
        requestAnimationFrame(() => {
            const newMapRow = document.getElementById(`map-row-${mapIdToScroll}`);
            if (newMapRow) {
                newMapRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                gsap.to(newMapRow, {
                    backgroundColor: 'rgba(0, 243, 255, 0.1)',
                    duration: 0.5,
                    yoyo: true,
                    repeat: 1
                });
            }
            mapIdToScroll = null;
        });
    }

    const lastUpdateEl = document.getElementById('last-update');
    if (lastUpdateEl) {
        lastUpdateEl.textContent = 'Vừa xong';
    }
};

// --- Global Event Handlers ---
window.handleNameChange = (newName, index) => {
    const newState = { ...raceState, racers: [...raceState.racers] };
    const updatedRacer = { ...newState.racers[index], name: newName.trim() };
    newState.racers[index] = updatedRacer;
    raceState = ensureInitialMaps(newState);
    saveRaceState(raceState);
    displayMessage("Đã cập nhật tên tay đua!");
};

window.handleKingMapChange = (newValue, index) => {
    const inputElement = document.getElementById(`king-map-${index}`);
    const trimmedKingMap = newValue.trim();
    const currentBtcMap = raceState.firstMapBtc.trim();

    if (!trimmedKingMap) {
        const newState = { ...raceState, racers: [...raceState.racers] };
        newState.racers[index].kingMap = '';
        raceState = ensureInitialMaps(newState);
        saveRaceState(raceState);
        return;
    }

    if (trimmedKingMap === currentBtcMap) {
        inputElement.value = raceState.racers[index].kingMap;
        displayMessage(`⚠️ King Map "${trimmedKingMap}" không được trùng với Map BTC ("${currentBtcMap}")! Vui lòng chọn Map khác.`, true);
        return;
    }

    const otherKingMaps = raceState.racers.filter((_, i) => i !== index).map(r => r.kingMap.trim());
    if (otherKingMaps.includes(trimmedKingMap)) {
        inputElement.value = raceState.racers[index].kingMap;
        displayMessage(`⚠️ King Map "${trimmedKingMap}" đã bị trùng với tay đua khác! Vui lòng chọn Map khác.`, true);
        return;
    }

    const newState = { ...raceState, racers: [...raceState.racers] };
    const updatedRacer = { ...newState.racers[index], kingMap: trimmedKingMap };
    newState.racers[index] = updatedRacer;
    raceState = ensureInitialMaps(newState);
    saveRaceState(raceState);
    displayMessage("Đã cập nhật King Map!");
};

window.handleBtcMapChange = (newName) => {
    const newState = { ...raceState, firstMapBtc: newName.trim() };
    raceState = ensureInitialMaps(newState);
    saveRaceState(newState);
    displayMessage("Đã cập nhật Map BTC!");
};

window.handleTimeInputAndSave = (input) => {
    const mapIndex = parseInt(input.getAttribute('data-map-index'));
    const racerIndex = parseInt(input.getAttribute('data-racer-index'));
    const timeString = input.value.trim();
    const seconds = timeToSeconds(timeString);
    const newState = { ...raceState, maps: [...raceState.maps] };

    if (seconds === null || seconds === 0) {
        newState.maps[mapIndex].times[racerIndex] = null;
        input.value = '';
        if (timeString) {
            displayMessage("⚠️ Thời gian nhập không đúng format! (MM'SS'MS hoặc 10423). Đã reset ô này.", true);
        }
    } else {
        const formattedTime = secondsToTimeString(seconds);
        newState.maps[mapIndex].times[racerIndex] = formattedTime;
        input.value = formattedTime;

        // Lưu thành tích vào Firestore
        const mapName = raceState.maps[mapIndex].name;
        const car = raceState.maps[mapIndex].cars[racerIndex];
        const pet = raceState.maps[mapIndex].pets[racerIndex];

        saveRaceRecord(mapName, racerIndex, seconds, car, pet);
    }

    raceState = newState;
    saveRaceState(raceState);

    // Kiểm tra xem map đã hoàn thành chưa sau khi nhập thời gian
    setTimeout(() => {
        checkIfMapCompleted(mapIndex);
    }, 500);
};

window.handleCarChange = (input) => {
    const mapIndex = parseInt(input.getAttribute('data-map-index'));
    const racerIndex = parseInt(input.getAttribute('data-racer-index'));
    const newCar = input.value.trim();
    const newState = { ...raceState, maps: [...raceState.maps] };
    const racerName = raceState.racers[racerIndex].name || `Tay Đua ${racerIndex + 1}`;

    if (newCar) {
        const mapUsedElsewhere = isCarUsedByRacerInOtherMap(raceState, newCar, racerIndex, mapIndex);

        if (mapUsedElsewhere) {
            const errorMessage = `⚠️ Xe "${newCar}" đã được sử dụng bởi ${racerName} ở Map "${mapUsedElsewhere}". Vui lòng chọn xe khác.`;
            displayMessage(errorMessage, true);

            input.value = '';
            newState.maps[mapIndex].cars[racerIndex] = null;
            raceState = newState;
            saveRaceState(raceState);
            return;
        }
    }

    newState.maps[mapIndex].cars[racerIndex] = newCar;
    raceState = newState;
    saveRaceState(raceState);

    // Kiểm tra xem map đã hoàn thành chưa sau khi nhập xe
    setTimeout(() => {
        checkIfMapCompleted(mapIndex);
    }, 500);
};

window.handlePetChange = (input) => {
    const mapIndex = parseInt(input.getAttribute('data-map-index'));
    const racerIndex = parseInt(input.getAttribute('data-racer-index'));
    const newState = { ...raceState, maps: [...raceState.maps] };
    newState.maps[mapIndex].pets[racerIndex] = input.value.trim();
    raceState = newState;
    saveRaceState(raceState);

    // Kiểm tra xem map đã hoàn thành chưa sau khi nhập pet
    setTimeout(() => {
        checkIfMapCompleted(mapIndex);
    }, 500);
};

// Hàm kiểm tra xem map đã hoàn thành chưa
const checkIfMapCompleted = async (mapIndex) => {
    try {
        const map = raceState.maps[mapIndex];
        if (!map || !map.times || !map.cars || !map.pets) return;

        // Đếm số tay đua đã có thông tin đầy đủ (thời gian, xe, pet)
        const completedRacers = map.times.filter((time, index) => {
            const hasValidTime = time && time.trim() && time.trim() !== "--'--'--" && timeToSeconds(time) > 0;
            const hasValidCar = map.cars[index] && map.cars[index].trim() !== '';
            const hasValidPet = map.pets[index] && map.pets[index].trim() !== '';

            return hasValidTime && hasValidCar && hasValidPet;
        }).length;

        console.log(`Map ${map.name}: ${completedRacers}/${NUM_RACERS} tay đua đã hoàn thành đầy đủ`);

        // Nếu tất cả 4 tay đua đã có thông tin đầy đủ (thời gian, xe, pet)
        if (completedRacers === NUM_RACERS) {


            // Kiểm tra và cập nhật record
            await checkAndUpdateRecordForMap(mapIndex);

            // Hiển thị thông báo thành công
            displayMessage(`✅ Map "${map.name}" đã hoàn thành!`, false);
        } else {
            // Hiển thị thông báo nếu còn thiếu thông tin
            const incompleteCount = NUM_RACERS - completedRacers;
            if (incompleteCount > 0) {
                console.log(`⚠️ Còn thiếu thông tin của ${incompleteCount} tay đua cho map ${map.name}`);

                // Tìm ra những tay đua nào còn thiếu thông tin
                const missingInfo = [];
                for (let i = 0; i < NUM_RACERS; i++) {
                    const racerName = raceState.racers[i]?.name || `Tay Đua ${i + 1}`;
                    const missingFields = [];

                    if (!map.times[i] || map.times[i].trim() === "--'--'--") {
                        missingFields.push('thời gian');
                    }
                    if (!map.cars[i] || map.cars[i].trim() === '') {
                        missingFields.push('xe');
                    }
                    if (!map.pets[i] || map.pets[i].trim() === '') {
                        missingFields.push('pet');
                    }

                    if (missingFields.length > 0) {
                        missingInfo.push(`${racerName} (thiếu ${missingFields.join(', ')})`);
                    }
                }

                if (missingInfo.length > 0) {
                    console.log(`Thiếu thông tin:`, missingInfo);
                }
            }
        }
    } catch (error) {
        console.error("Lỗi khi kiểm tra hoàn thành map:", error);
    }
};

// Hàm kiểm tra xem map đã có đầy đủ thông tin chưa
const isMapFullyCompleted = (map) => {
    if (!map || !map.times || !map.cars || !map.pets) return false;

    for (let i = 0; i < NUM_RACERS; i++) {
        const hasValidTime = map.times[i] && map.times[i].trim() && map.times[i].trim() !== "--'--'--" && timeToSeconds(map.times[i]) > 0;
        const hasValidCar = map.cars[i] && map.cars[i].trim() !== '';
        const hasValidPet = map.pets[i] && map.pets[i].trim() !== '';

        if (!hasValidTime || !hasValidCar || !hasValidPet) {
            return false;
        }
    }

    return true;
};

// Hàm kiểm tra record cho map cụ thể
const checkAndUpdateRecordForMap = async (mapIndex) => {
    try {


        const map = raceState.maps[mapIndex];
        if (!map) {
            console.log(`❌ Không tìm thấy map tại index ${mapIndex}`);
            return;
        }

        // KIỂM TRA TẤT CẢ THÔNG TIN ĐẦY ĐỦ
        const isFullyCompleted = map.times.every(time =>
            time && time.trim() && time.trim() !== "--'--'--" && timeToSeconds(time) > 0
        ) && map.cars.every(car => car && car.trim() !== '')
            && map.pets.every(pet => pet && pet.trim() !== '');

        if (!isFullyCompleted) {
            console.log(`⏸️ Map ${map.name} chưa hoàn thành đầy đủ`);
            return;
        }

        const timesInSeconds = map.times.map(timeToSeconds);
        const validTimes = timesInSeconds.filter(t => t > 0);

        // Kiểm tra có đủ 4 tay đua không
        if (validTimes.length === NUM_RACERS) {
            const bestTimeInMap = Math.min(...validTimes);
            const bestRacerIndexInMap = timesInSeconds.indexOf(bestTimeInMap);

            // Lấy thông tin xe và pet
            const bestCar = map.cars && map.cars[bestRacerIndexInMap];
            const bestPet = map.pets && map.pets[bestRacerIndexInMap];
            const bestRacerName = raceState.racers[bestRacerIndexInMap]?.name || `Tay Đua ${bestRacerIndexInMap + 1}`;

            // KIỂM TRA XE VÀ PET
            const hasValidCar = bestCar && bestCar.trim() !== '';
            const hasValidPet = bestPet && bestPet.trim() !== '';

            if (!hasValidCar || !hasValidPet) {
                console.log(`⚠️ Không thể cập nhật: Thiếu xe hoặc pet`);
                return;
            }

            console.log(`📋 Thông tin tốt nhất trong map:`);
            console.log(`- Tay đua: ${bestRacerName}`);
            console.log(`- Thời gian: ${secondsToTimeString(bestTimeInMap)}`);
            console.log(`- Xe: ${bestCar}`);
            console.log(`- Pet: ${bestPet}`);

            // Kiểm tra xem đã cập nhật record cho map này chưa
            const mapKey = `record_checked_${map.name}`;
            const lastChecked = localStorage.getItem(mapKey);
            const now = Date.now();

            // Chỉ cập nhật nếu chưa kiểm tra trong 30 giây
            if (!lastChecked || (now - parseInt(lastChecked) > 30000)) {
                console.log(`🔄 Kiểm tra và cập nhật record...`);

                const isUpdated = await updateMapRecord(map.name, {
                    timeInSeconds: bestTimeInMap,
                    timeString: secondsToTimeString(bestTimeInMap),
                    racerName: bestRacerName,
                    racerIndex: bestRacerIndexInMap,
                    car: bestCar,
                    pet: bestPet,
                    timestamp: new Date().toISOString()
                });

                if (isUpdated) {
                    // Hiển thị thông báo thành công (chỉ 1 lần)
                    showStatusMessage(`🎉 Đã cập nhật kỷ lục mới cho ${map.name}!`, false);

                    // Cập nhật lại dữ liệu từ Firestore
                    await fetchGameDataFromFirestore();
                    // Cập nhật UI
                    updateStatistics();

                    // Thêm hiệu ứng
                    const mapRow = document.getElementById(`map-row-${map.id}`);
                    if (mapRow) {
                        mapRow.classList.add('record-updated');
                        setTimeout(() => {
                            mapRow.classList.remove('record-updated');
                        }, 2000);
                    }
                } else {
                    console.log(`📭 Không có record mới để cập nhật`);
                }

                // Lưu thời điểm kiểm tra
                localStorage.setItem(mapKey, now.toString());
            } else {
                console.log(`⏰ Đã kiểm tra record gần đây, bỏ qua`);
            }
        }
    } catch (error) {
        console.error(`❌ Lỗi khi kiểm tra record cho map ${mapIndex}:`, error);
    }
};

window.handleMapNameChange = (newName, mapIndex) => {
    const trimmedNewName = newName.trim();
    const newState = { ...raceState, maps: [...raceState.maps] };

    if (trimmedNewName) {
        const isDuplicated = newState.maps.some((map, index) => {
            return index !== mapIndex && map.name.trim() === trimmedNewName;
        });

        if (isDuplicated) {
            newState.maps[mapIndex].name = '';
            displayMessage(`⚠️ Bản đồ "${trimmedNewName}" đã được sử dụng, hãy chọn bản đồ khác!.`, true);
        } else {
            newState.maps[mapIndex].name = trimmedNewName;
        }
    } else {
        newState.maps[mapIndex].name = trimmedNewName;
    }

    raceState = newState;
    saveRaceState(raceState);
};

const isCarUsedByRacerInOtherMap = (state, carName, racerIndex, currentMapIndex) => {
    if (!carName) return null;
    const trimmedCarName = carName.trim().toLowerCase();

    for (let mapIndex = 0; mapIndex < state.maps.length; mapIndex++) {
        if (mapIndex === currentMapIndex) continue;

        const usedCar = state.maps[mapIndex].cars[racerIndex];
        if (usedCar && usedCar.trim().toLowerCase() === trimmedCarName) {
            return state.maps[mapIndex].name;
        }
    }
    return null;
};

window.handleCarChange = (input) => {
    const mapIndex = parseInt(input.getAttribute('data-map-index'));
    const racerIndex = parseInt(input.getAttribute('data-racer-index'));
    const newCar = input.value.trim();
    const newState = { ...raceState, maps: [...raceState.maps] };
    const racerName = raceState.racers[racerIndex].name || `Tay Đua ${racerIndex + 1}`;

    if (newCar) {
        const mapUsedElsewhere = isCarUsedByRacerInOtherMap(raceState, newCar, racerIndex, mapIndex);

        if (mapUsedElsewhere) {
            const errorMessage = `⚠️ Xe "${newCar}" đã được sử dụng bởi ${racerName} ở Map "${mapUsedElsewhere}". Vui lòng chọn xe khác.`;
            displayMessage(errorMessage, true);

            input.value = '';
            newState.maps[mapIndex].cars[racerIndex] = null;
            raceState = newState;
            saveRaceState(raceState);
            return;
        }
    }

    newState.maps[mapIndex].cars[racerIndex] = newCar;
    raceState = newState;
    saveRaceState(raceState);

    // Kiểm tra xem map đã hoàn thành chưa sau khi cập nhật xe
    setTimeout(() => {
        checkIfMapCompleted(mapIndex);
    }, 500);
};

window.handlePetChange = (input) => {
    const mapIndex = parseInt(input.getAttribute('data-map-index'));
    const racerIndex = parseInt(input.getAttribute('data-racer-index'));
    const newState = { ...raceState, maps: [...raceState.maps] };
    newState.maps[mapIndex].pets[racerIndex] = input.value.trim();
    raceState = newState;
    saveRaceState(raceState);

    // Kiểm tra xem map đã hoàn thành chưa sau khi cập nhật pet
    setTimeout(() => {
        checkIfMapCompleted(mapIndex);
    }, 500);
};

// Hàm hiển thị tất cả thông báo (dành cho cả người xem)
window.showAllNotifications = () => {
    // Đóng dropdown
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) {
        dropdown.classList.add('hidden');
    }

    // Tạo modal hiển thị tất cả thông báo
    const modalHtml = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" onclick="closeAllNotificationsModal()"></div>
            <div class="relative bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
                <div class="p-6 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-800">
                    <div class="flex items-center justify-between">
                        <h3 class="text-xl font-bold text-white">
                            <i class="fas fa-bell mr-2"></i>
                            Tất cả thông báo (${notifications.length})
                        </h3>
                        <button onclick="closeAllNotificationsModal()" class="text-slate-400 hover:text-white p-2">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                </div>
                <div class="p-6 overflow-y-auto max-h-[60vh]">
                    ${notifications.length === 0 ?
            '<div class="text-center text-slate-500 py-8"><i class="fas fa-bell-slash text-3xl mb-4"></i><p>Không có thông báo nào</p></div>' :
            notifications.map(notification => `
                            <div class="notification-item ${notification.read ? 'read' : 'unread'} mb-4 p-4 bg-slate-800/50 rounded-lg border ${notification.important ? 'border-red-500/30' : 'border-slate-700'}">
                                <div class="flex items-start">
                                    <div class="mr-3">
                                        <i class="${getNotificationIcon(notification.type)} ${getNotificationIconColor(notification.type)} text-lg"></i>
                                    </div>
                                    <div class="flex-1">
                                        <div class="font-bold text-white mb-1">${notification.title}</div>
                                        <div class="text-slate-300 mb-2">${notification.content || notification.message || ''}</div>
                                        <div class="text-xs text-slate-500 flex justify-between">
                                            <span>${notification.sender || 'Hệ thống'}</span>
                                            <span>${getTimeAgo(notification.timestamp)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join('')
        }
                </div>
                <div class="p-4 border-t border-slate-800 text-center bg-slate-900/50">
                    <button onclick="closeAllNotificationsModal()" class="speed-button px-6 py-2">
                        <i class="fas fa-times mr-2"></i> Đóng
                    </button>
                </div>
            </div>
        </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.id = 'all-notifications-modal';
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    document.body.style.overflow = 'hidden';
};

// Hàm đóng modal tất cả thông báo
window.closeAllNotificationsModal = () => {
    const modal = document.getElementById('all-notifications-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
};

window.addMap = () => {
    const configErrors = validateMapConfiguration(raceState);
    if (configErrors.length > 0) {
        const errorHtml = configErrors.map(e => `<li>${e}</li>`).join('');
        document.getElementById('error-message').innerHTML = `
                <p class="font-bold mb-2">Vui lòng hoàn thiện cấu hình trước:</p>
                <ul class="list-disc list-inside space-y-1">${errorHtml}</ul>
            `;
        document.getElementById('error-message').classList.remove('hidden');
        document.getElementById('config').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    } else {
        document.getElementById('error-message').classList.add('hidden');
    }

    const newMap = defaultMapData();
    const newState = { ...raceState, maps: [...raceState.maps, newMap] };
    mapIdToScroll = newMap.id;
    raceState = newState;
    saveRaceState(raceState);
    displayMessage("Đã thêm Map tự do thành công!");
};

document.getElementById('add-map-btn').onclick = window.addMap;

window.deleteMap = (mapIndex) => {
    const mapName = raceState.maps[mapIndex].name || `Map ${mapIndex + 1}`;
    if (!confirm(`Bạn có chắc chắn muốn xóa bản đồ "${mapName}" không?`)) return;
    const newState = { ...raceState, maps: raceState.maps.filter((_, index) => index !== mapIndex) };
    raceState = newState;
    saveRaceState(raceState);
    displayMessage("Đã xóa bản đồ thành công.", false);
};

window.handleDataRefresh = () => {
    if (!confirm("⚠️ CẢNH BÁO: Thao tác này sẽ XÓA TẤT CẢ cấu hình tay đua và map. Bạn có chắc chắn muốn tiếp tục không?")) return;
    const resetState = {
        racers: defaultState.racers.map(r => ({ name: '', kingMap: '' })),
        firstMapBtc: '',
        maps: [],
        version: defaultState.version,
    };
    raceState = resetState;
    saveRaceState(raceState);
    displayMessage("Đã làm mới dữ liệu thành công (xoá cấu hình tay đua và tất cả map).", false);
};

window.exportToExcel = () => {
    if (raceState.maps.length === 0) {
        displayMessage("Không có dữ liệu Map (bản đồ) để xuất. Vui lòng thêm Map vào bảng tính điểm.", true);
        return;
    }
    const numRacers = raceState.racers.length;
    const racerNames = raceState.racers.map((r, i) => r.name.trim() || `Tay Đua ${i + 1}`);
    const csvRows = [];
    const rankingData = calculateRanking();

    const addRankingSection = (data) => {
        csvRows.push('');
        csvRows.push(['BẢNG XẾP HẠNG CHUNG CUỘC'].join(','));
        csvRows.push(['Hạng', 'Tay Đua', 'Tổng Điểm'].join(','));
        data.forEach(racer => {
            const safeName = `"${racer.name.replace(/"/g, '""')}"`;
            csvRows.push([racer.rank, safeName, racer.totalScore].join(','));
        });
    };

    const addDetailedScoreboard = () => {
        csvRows.push('');
        let headerRow1 = ['#', 'Tay Đua'];
        raceState.maps.forEach((map, index) => {
            headerRow1.push(`${map.name.trim() || 'Chưa đặt tên'}`);
        });
        headerRow1.push('Tổng Điểm');
        csvRows.push(headerRow1.map(item => `"${item.replace(/"/g, '""')}"`).join(','));

        rankingData.forEach((racer) => {
            const row = [racer.rank, racer.name];
            raceState.maps.forEach(map => {
                const mapPoints = calculateMapPoints(map.times, map.name);
                row.push(mapPoints[racer.originalIndex]);
            });
            row.push(racer.totalScore);
            const safeRow = row.map(item => {
                const strItem = String(item);
                if (strItem.includes(',') || strItem.includes('"') || strItem.includes('\n')) {
                    return `"${strItem.replace(/"/g, '""')}"`;
                }
                return strItem;
            });
            csvRows.push(safeRow.join(','));
        });
    };

    const addPivotedSection = (title, mapDataKey) => {
        csvRows.push('');
        csvRows.push([`BẢNG ${title}`].join(','));
        let header = ['#', 'Tên Map'];
        racerNames.forEach(name => header.push(name));
        csvRows.push(header.map(item => `"${item.replace(/"/g, '""')}"`).join(','));

        raceState.maps.forEach((map, index) => {
            const row = [index + 1, map.name];
            for (let i = 0; i < numRacers; i++) {
                const data = (map[mapDataKey] && map[mapDataKey][i]) || '';
                row.push(data);
            }
            const safeRow = row.map(item => {
                const strItem = String(item);
                if (strItem.includes(',') || strItem.includes('"') || strItem.includes('\n')) {
                    return `"${strItem.replace(/"/g, '""')}"`;
                }
                return strItem;
            });
            csvRows.push(safeRow.join(','));
        });
    };

    addRankingSection(rankingData);
    addDetailedScoreboard();
    addPivotedSection('THỜI GIAN CHI TIẾT THEO MAP', 'times');
    addPivotedSection('XE SỬ DỤNG', 'cars');
    addPivotedSection('PET SỬ DỤNG', 'pets');

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bao_Cao_Diem_Thanh_Tich_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    displayMessage("Đã xuất file CSV thành công!", false);
};

window.handleLogout = async () => {
    if (confirm("Bạn có chắc chắn muốn đăng xuất?")) {
        try {
            await signOut(auth);
            displayMessage("Đã đăng xuất thành công. Đang chuyển hướng...", false);
            setTimeout(() => { window.location.href = "login.html"; }, 500);
        } catch (error) {
            console.error("Lỗi khi đăng xuất:", error);
            displayMessage("Lỗi khi đăng xuất. Vui lòng thử lại.", true);
        }
    }
};

// ================ USER PROFILE MANAGEMENT ================

// Hàm mở modal profile
window.openUserProfileModal = () => {
    const modal = document.getElementById('user-profile-modal');
    if (!modal) {
        createUserProfileModal();
    }

    const displayNameInput = document.getElementById('profile-displayName');
    const nicknameInput = document.getElementById('profile-nickname');
    const previewAvatar = document.getElementById('profile-preview-avatar');

    if (auth.currentUser) {
        displayNameInput.value = auth.currentUser.displayName || '';

        // Load nickname from Firestore
        getDoc(doc(db, "users", auth.currentUser.uid)).then(docSnap => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                nicknameInput.value = userData.nickname || '';

                // Ưu tiên Base64 nếu có, nếu không thì dùng photoURL hoặc logo mặc định
                if (userData.photoBase64) {
                    previewAvatar.src = userData.photoBase64;
                } else if (userData.photoURL && !userData.photoURL.includes('custom_avatar_')) {
                    // Nếu photoURL không phải marker string, thì dùng nó
                    previewAvatar.src = userData.photoURL;
                } else {
                    // Dùng logo mặc định
                    previewAvatar.src = 'logoWS.png';
                }
            }
        });
    }

    // ĐẢM BẢO tất cả input trong modal profile hoạt động cho cả admin và user thường
    setTimeout(() => {
        const profileModal = document.getElementById('user-profile-modal');
        if (profileModal) {
            // Enable tất cả input, button, textarea trong modal
            const profileElements = profileModal.querySelectorAll('input, button, textarea, label');
            profileElements.forEach(el => {
                el.disabled = false;
                el.readOnly = false;
                el.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-slate-800', 'pointer-events-none');
                el.style.pointerEvents = 'auto';
                el.style.cursor = 'pointer';
            });

            // Đặc biệt cho file input và preview avatar
            const fileInput = profileModal.querySelector('input[type="file"]');
            if (fileInput) {
                fileInput.disabled = false;
                fileInput.style.pointerEvents = 'auto';
            }

            const avatarPreview = profileModal.querySelector('#profile-preview-avatar');
            if (avatarPreview && avatarPreview.parentElement) {
                avatarPreview.parentElement.style.pointerEvents = 'auto';
                avatarPreview.parentElement.style.cursor = 'pointer';
                avatarPreview.parentElement.classList.remove('pointer-events-none');
            }
        }
    }, 100);

    document.getElementById('user-profile-modal').classList.remove('hidden');
    document.getElementById('user-profile-modal').classList.add('flex');
    document.body.style.overflow = 'hidden';
};

// Hàm đóng modal profile
window.closeUserProfileModal = () => {
    document.getElementById('user-profile-modal').classList.add('hidden');
    document.getElementById('user-profile-modal').classList.remove('flex');
    document.body.style.overflow = '';
};

// Global variable for cropper instance
let cropperInstance = null;

// Hàm xử lý thay đổi ảnh avatar
window.handleProfileImageChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        displayMessage('Kích thước file không được vượt quá 2MB', true);
        return;
    }

    if (!file.type.startsWith('image/')) {
        displayMessage('Vui lòng chọn file ảnh', true);
        return;
    }

    try {
        // Tạo Data URL từ file
        const reader = new FileReader();
        reader.onload = (e) => {
            // Lưu file gốc để crop
            window.originalImageData = e.target.result;

            // Hiển thị modal crop
            const cropModal = document.getElementById('crop-image-modal');
            const cropImage = document.getElementById('crop-image');

            cropImage.src = e.target.result;
            cropModal.classList.remove('hidden');
            cropModal.classList.add('flex');
            document.body.style.overflow = 'hidden';

            // ĐẢM BẢO tất cả elements trong crop modal hoạt động
            setTimeout(() => {
                const cropModalElements = cropModal.querySelectorAll('button, input, *');
                cropModalElements.forEach(el => {
                    el.disabled = false;
                    el.classList.remove('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
                    el.style.pointerEvents = 'auto';
                    if (el.tagName === 'BUTTON') {
                        el.style.cursor = 'pointer';
                    }
                });
            }, 50);

            // Khởi tạo cropper sau khi ảnh load xong
            cropImage.onload = () => {
                if (cropperInstance) {
                    cropperInstance.destroy();
                }
                cropperInstance = new Cropper(cropImage, {
                    aspectRatio: 1, // Vuông mặc định
                    autoCropArea: 1,
                    responsive: true,
                    restore: true,
                    guides: true,
                    center: true,
                    highlight: true,
                    cropBoxMovable: true,
                    cropBoxResizable: true,
                    toggleDragModeOnDblclick: true,
                    background: false
                });
            };
        };
        reader.readAsDataURL(file);
    } catch (error) {
        console.error('Lỗi khi xử lý ảnh:', error);
        displayMessage('Lỗi khi xử lý ảnh. Vui lòng thử lại.', true);
    }
};

// Hàm đóng modal crop
window.closeCropModal = () => {
    const cropModal = document.getElementById('crop-image-modal');
    cropModal.classList.add('hidden');
    cropModal.classList.remove('flex');
    document.body.style.overflow = '';

    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }
};

// Hàm quay ảnh
window.rotateCropImage = () => {
    if (cropperInstance) {
        cropperInstance.rotate(45);
    }
};

// Hàm lật ảnh ngang
window.flipCropImageH = () => {
    if (cropperInstance) {
        const data = cropperInstance.getData();
        cropperInstance.setData({
            ...data,
            scaleX: (data.scaleX || 1) * -1
        });
    }
};

// Hàm lật ảnh dọc
window.flipCropImageV = () => {
    if (cropperInstance) {
        const data = cropperInstance.getData();
        cropperInstance.setData({
            ...data,
            scaleY: (data.scaleY || 1) * -1
        });
    }
};

// Hàm thiết lập tỷ lệ khung hình
window.setCropAspectRatio = (ratio) => {
    if (cropperInstance) {
        cropperInstance.setAspectRatio(ratio);
    }
};

// Hàm áp dụng crop
window.applyCrop = async () => {
    if (!cropperInstance) return;

    try {
        const canvas = cropperInstance.getCroppedCanvas({
            maxWidth: 300,
            maxHeight: 300,
            fillColor: '#0a0a0f',
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });

        // Chuyển canvas sang Base64 với chất lượng tối ưu
        let quality = 0.8;
        let base64 = canvas.toDataURL('image/jpeg', quality);

        // Nếu vẫn quá lớn, giảm chất lượng tiếp
        while (base64.length > 1000000 && quality > 0.1) {
            quality -= 0.1;
            base64 = canvas.toDataURL('image/jpeg', quality);
        }

        console.log('✅ Đã crop ảnh thành công, kích thước:', base64.length, 'bytes');

        // Cập nhật preview
        document.getElementById('profile-preview-avatar').src = base64;

        // Lưu Base64 để save sau
        window.selectedProfileImageBase64 = base64;
        delete window.originalImageData;

        // Đóng modal crop
        closeCropModal();

        displayMessage('Cắt ảnh thành công! Nhấn "Lưu" để cập nhật avatar.', false);
    } catch (error) {
        console.error('Lỗi khi crop ảnh:', error);
        displayMessage('Lỗi khi cắt ảnh. Vui lòng thử lại.', true);
    }
};

// HÀm lưu profile
window.saveUserProfile = async () => {
    const displayName = document.getElementById('profile-displayName').value.trim();
    const nickname = document.getElementById('profile-nickname').value.trim();

    if (!displayName) {
        displayMessage('Vui lòng nhập tên hiển thị', true);
        return;
    }

    // KIỂM TRA: Đảm bảo user đã đăng nhập
    if (!auth.currentUser) {
        displayMessage('Bạn cần đăng nhập để cập nhật thông tin', true);
        return;
    }

    const saveBtn = document.getElementById('save-profile-btn');
    const originalContent = saveBtn.innerHTML;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Đang lưu...';

    try {
        let photoBase64 = null; // Lưu Base64 riêng
        let photoURLForAuth = auth.currentUser.photoURL || 'logoWS.png'; // Cho Auth (URL ngắn)

        // CẬP NHẬT ẢNH BẰNG BASE64 nếu có ảnh mới
        if (window.selectedProfileImageBase64) {
            try {
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Đang xử lý ảnh...';

                // Sử dụng Base64 đã nén
                photoBase64 = window.selectedProfileImageBase64;

                console.log('✅ Sử dụng ảnh đã nén, kích thước:', photoBase64.length, 'bytes');

                // Kiểm tra kích thước Base64 (Firestore giới hạn ~1MB per field)
                if (photoBase64.length > 1000000) {
                    displayMessage('Ảnh vẫn quá lớn sau nén. Vui lòng chọn ảnh khác.', true);
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalContent;
                    return;
                }

                // Đặt URL đơn giản cho Auth (chỉ là marker)
                photoURLForAuth = `custom_avatar_${auth.currentUser.uid}`;

                // Xóa biến tạm
                delete window.selectedProfileImageBase64;
            } catch (uploadError) {
                console.error('Lỗi khi xử lý ảnh:', uploadError);
                displayMessage('Lỗi khi xử lý ảnh. Vui lòng thử lại.', true);
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalContent;
                return;
            }
        }

        // Update Firebase Auth profile (với URL ngắn, không phải Base64)
        await updateProfile(auth.currentUser, {
            displayName: displayName,
            photoURL: photoURLForAuth
        });

        // Chuẩn bị dữ liệu lưu vào Firestore
        const userDataToSave = {
            displayName: displayName,
            nickname: nickname,
            photoURL: photoURLForAuth,
            updatedAt: new Date().toISOString()
        };

        // Nếu có ảnh Base64 mới, lưu riêng vào trường photoBase64
        if (photoBase64) {
            userDataToSave.photoBase64 = photoBase64;
        }

        // Update Firestore user document
        await setDoc(doc(db, "users", auth.currentUser.uid), userDataToSave, { merge: true });

        // Update UI
        document.getElementById('user-display-name').textContent = displayName;

        // Cập nhật hiển thị với nickname (nếu có)
        if (nickname) {
            const roleBadge = isAdminUser ?
                '<span class="text-xs bg-gradient-to-r from-red-600 to-red-700 text-white px-2 py-1 rounded ml-2">ADMIN</span>' :
                '<span class="text-xs bg-gradient-to-r from-blue-600 to-blue-700 text-white px-2 py-1 rounded ml-2">USER</span>';

            document.getElementById('user-display-name').innerHTML =
                `${displayName} <span class="text-xs bg-gradient-to-r from-cyan-600 to-blue-700 text-white px-2 py-1 rounded ml-2">@${nickname}</span> ${roleBadge}`;
        } else {
            // Chỉ hiển thị role badge
            const roleBadge = isAdminUser ?
                '<span class="text-xs bg-gradient-to-r from-red-600 to-red-700 text-white px-2 py-1 rounded ml-2">ADMIN</span>' :
                '<span class="text-xs bg-gradient-to-r from-blue-600 to-blue-700 text-white px-2 py-1 rounded ml-2">USER</span>';

            document.getElementById('user-display-name').innerHTML = `${displayName} ${roleBadge}`;
        }

        // Cập nhật avatar ở header và sidebar
        // Ưu tiên dùng Base64 nếu có, nếu không thì dùng photoURL
        const avatarSrc = photoBase64 || photoURLForAuth;
        const avatarElements = document.querySelectorAll('#user-avatar, #profile-preview-avatar');
        avatarElements.forEach(el => {
            el.src = avatarSrc;
        });

        closeUserProfileModal();
        displayMessage('Cập nhật thông tin thành công!', false);

    } catch (error) {
        console.error('Error updating profile:', error);
        displayMessage('Có lỗi xảy ra khi cập nhật thông tin: ' + error.message, true);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalContent;
    }
};

// ================ RACER SELECTION FROM FIRESTORE ================

// Hàm load danh sách racers từ Firestore
const loadAvailableRacers = async () => {
    try {
        const availableRacers = [];
        if (racersCacheLoaded && ALL_USERS.length > 0) return ALL_USERS;

        const usersSnapshot = await getDocs(collection(db, "users"));
        usersSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.role === 'racer') {
                availableRacers.push({
                    id: doc.id,
                    displayName: data.displayName || 'Unnamed',
                    nickname: data.nickname || '',
                    photoURL: data.photoURL || 'logoWS.png'
                });
            }
        });

        ALL_USERS = availableRacers;
        racersCacheLoaded = true;
        return availableRacers;
    } catch (error) {
        console.error('Error loading racers:', error);
        return [];
    }
};

// Hàm render racer inputs với dropdown
const renderRacerInputsWithDropdown = async () => {
    const container = document.getElementById('racer-names');

    // THÊM KIỂM TRA NÀY
    if (!container) {
        console.error("❌ Không tìm thấy container #racer-names");
        return;
    }

    // Hiển thị loading
    container.innerHTML = `
        <div class="col-span-2 text-center py-12 text-slate-500">
            <div class="flex flex-col items-center justify-center space-y-4">
                <div class="speed-loader h-12 w-12"></div>
                <span>Đang tải cấu hình tay đua...</span>
            </div>
        </div>
    `;

    const availableRacers = await loadAvailableRacers();
    ALL_USERS = availableRacers;

    container.innerHTML = '';

    // THÊM KIỂM TRA CHO BTC MAP INPUT
    const btcMapInput = document.getElementById('btc-map-name');
    if (btcMapInput) {
        btcMapInput.value = raceState.firstMapBtc;

        if (!isAdminUser) {
            btcMapInput.disabled = true;
            btcMapInput.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
        }
    } else {
        console.warn("⚠️ Không tìm thấy element #btc-map-name");
    }

    for (let index = 0; index < NUM_RACERS; index++) {
        const racer = raceState.racers[index];
        const racerTitle = `Tay đua ${index + 1}`;

        const disabledAttr = !isAdminUser ? 'disabled' : '';
        const disabledClass = !isAdminUser ? 'opacity-50 cursor-not-allowed bg-slate-800' : '';

        // Tìm racer đã được chọn (theo tên hoặc nickname)
        let selectedRacerId = '';
        if (racer.name) {
            const selectedRacer = availableRacers.find(r =>
                r.displayName === racer.name || r.nickname === racer.name
            );
            if (selectedRacer) {
                selectedRacerId = selectedRacer.id;
            }
        }

        let inputHtml = `
            <div class="neon-card p-5 hover:border-cyan-500/30 transition-all duration-300">
                <div class="flex items-center mb-4 pb-3 border-b border-slate-800">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mr-3">
                        <span class="text-white font-bold">${index + 1}</span>
                    </div>
                    <label class="text-lg font-bold text-cyan-300">${racerTitle}</label>
                </div>
                <div class="mb-4">
                    <label for="racer-select-${index}" class="block text-sm font-medium text-slate-400 mb-2">
                        <i class="fas fa-user mr-1"></i> Chọn Tay Đua
                    </label>
                    <select id="racer-select-${index}" ${disabledAttr}
                        class="speed-input w-full text-center ${disabledClass}" 
                        onchange="${isAdminUser ? `handleRacerSelection(${index}, this.value)` : ''}">
                        <option value="">-- Chọn tay đua --</option>
                        ${availableRacers.map(r => {
            const isSelected = r.id === selectedRacerId;
            const isUsedByOther = raceState.racers.some((rc, i) =>
                i !== index && (rc.name === r.displayName || rc.name === r.nickname)
            );

            let displayText;
            if (r.nickname) {
                displayText = r.nickname;
                if (isUsedByOther && !isSelected) {
                    displayText += ' (Đã được chọn)';
                }
            } else {
                displayText = `${r.displayName} (Chưa đặt biệt danh)`;
            }

            return `<option value="${r.id}" ${isSelected ? 'selected' : ''} ${isUsedByOther && !isSelected ? 'disabled' : ''}>
                                ${displayText}
                            </option>`;
        }).join('')}
                    </select>
                </div>
                <div>
                    <label for="king-map-${index}" class="block text-sm font-medium text-slate-400 mb-2">
                        <i class="fas fa-crown mr-1"></i> King Map
                    </label>
                    <input type="text" id="king-map-${index}" value="${racer.kingMap}" 
                        ${disabledAttr}
                        list="map-suggestions" class="speed-input w-full text-center ${disabledClass}" 
                        placeholder="${!isAdminUser ? 'Chỉ xem' : 'Nhập King Map'}" 
                        onchange="${isAdminUser ? `handleKingMapChange(this.value, ${index})` : ''}" />
                    <p class="text-xs text-slate-500 mt-2 italic text-center">
                        <i class="fas fa-star text-amber-400 mr-1"></i> King Map Owner được 
                        <span class="text-amber-400 font-bold">+1 điểm</span> nếu về nhất map đó.
                    </p>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', inputHtml);
    }

    console.log("✅ Đã render xong racer inputs");
};

// Hàm xử lý chọn racer
window.handleRacerSelection = async (index, userId) => {
    if (!userId) {
        const newState = { ...raceState, racers: [...raceState.racers] };
        newState.racers[index].name = '';
        raceState = ensureInitialMaps(newState);
        saveRaceState(raceState);
        renderRacerInputsWithDropdown();
        return;
    }

    try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const newState = { ...raceState, racers: [...raceState.racers] };

            // Ưu tiên lưu biệt danh, không có thì lưu tên
            const displayName = userData.nickname || userData.displayName || 'Unnamed';
            newState.racers[index].name = displayName;
            newState.racers[index].userId = userId;
            newState.racers[index].nickname = userData.nickname || '';
            newState.racers[index].fullName = userData.displayName || '';

            raceState = ensureInitialMaps(newState);
            saveRaceState(raceState);
            renderRacerInputsWithDropdown();
            displayMessage(`Đã chọn ${displayName} làm Tay đua ${index + 1}!`);
        }
    } catch (error) {
        console.error('Error loading racer:', error);
        displayMessage('Lỗi khi tải thông tin tay đua', true);
    }
};

// ================ VÒNG QUAY MAP BTC ================

let wheelCanvas;
let wheelCtx;
let wheelRotation = 0;
let isSpinning = false;
let mapImages = {}; // Cache cho hình ảnh map
let imagesLoaded = false;

// Tải trước hình ảnh map
const preloadMapImages = async () => {
    if (imagesLoaded) return;

    const maps = ALL_MAPS.filter(m => m.name && m.name.trim() && m.imageUrl);
    if (maps.length === 0) {
        imagesLoaded = true;
        return;
    }

    const loadPromises = maps.map(map => {
        // Tránh tải lại nếu đã có trong cache
        if (mapImages[map.name]) return Promise.resolve();

        return new Promise((resolve) => {
            const img = new Image();
            img.src = map.imageUrl;
            img.onload = () => {
                mapImages[map.name] = img;
                resolve();
            };
            img.onerror = () => {
                console.warn(`Không thể tải ảnh cho map: ${map.name}`);
                resolve(); // Tiếp tục dù lỗi
            };
        });
    });

    await Promise.all(loadPromises);
    imagesLoaded = true;
    drawWheel(); // Vẽ lại khi đã có ảnh
};

// Khởi tạo vòng quay
const initBtcWheel = async () => {
    wheelCanvas = document.getElementById('btc-wheel-canvas');
    if (!wheelCanvas) return;

    wheelCtx = wheelCanvas.getContext('2d');

    // Bắt đầu tải ảnh ngay lập tức
    preloadMapImages();

    drawWheel();

    // Kiểm tra nếu đã có Map BTC được chọn
    if (raceState.firstMapBtc && raceState.firstMapBtc.trim()) {
        showSelectedBtcMap(raceState.firstMapBtc);
    }
};

// Vẽ vòng quay
const drawWheel = () => {
    if (!wheelCtx || !wheelCanvas) return;

    const maps = ALL_MAPS.filter(m => m.name && m.name.trim());
    if (maps.length === 0) {
        // Vẽ placeholder nếu chưa có map
        wheelCtx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);
        wheelCtx.fillStyle = 'rgba(14, 14, 20, 0.8)';
        wheelCtx.beginPath();
        wheelCtx.arc(200, 200, 180, 0, Math.PI * 2);
        wheelCtx.fill();

        wheelCtx.fillStyle = '#94a3b8';
        wheelCtx.font = 'bold 16px Inter';
        wheelCtx.textAlign = 'center';
        wheelCtx.fillText('Chưa có map nào', 200, 200);
        return;
    }

    const centerX = 200;
    const centerY = 200;
    const radius = 180;
    const sliceAngle = (Math.PI * 2) / maps.length;

    wheelCtx.clearRect(0, 0, wheelCanvas.width, wheelCanvas.height);

    // 1. Vẽ viền ngoài kim loại (Rim)
    wheelCtx.beginPath();
    wheelCtx.arc(centerX, centerY, radius + 10, 0, Math.PI * 2);
    const rimGradient = wheelCtx.createRadialGradient(centerX, centerY, radius, centerX, centerY, radius + 10);
    rimGradient.addColorStop(0, '#1a1a24');
    rimGradient.addColorStop(0.5, '#2a2a35');
    rimGradient.addColorStop(1, '#0e0e14');
    wheelCtx.fillStyle = rimGradient;
    wheelCtx.fill();

    // 2. Vẽ các phần của vòng quay (Slices)
    maps.forEach((map, index) => {
        const startAngle = wheelRotation + (sliceAngle * index);
        const endAngle = startAngle + sliceAngle;

        wheelCtx.save();

        // Vẽ lát cắt và Clip
        wheelCtx.beginPath();
        wheelCtx.moveTo(centerX, centerY);
        wheelCtx.arc(centerX, centerY, radius, startAngle, endAngle);
        wheelCtx.closePath();
        wheelCtx.clip();

        // Kiểm tra xem có ảnh không
        const img = mapImages[map.name];
        if (img) {
            // Vẽ ảnh map làm nền
            // Scale and center the image in the slice
            const imgScale = Math.max(radius * 2 / img.width, radius * 2 / img.height);
            const imgW = img.width * imgScale;
            const imgH = img.height * imgScale;

            wheelCtx.globalAlpha = 0.8; // Độ trong suốt nhẹ để thấy màu nền
            wheelCtx.drawImage(img, centerX - imgW / 2, centerY - imgH / 2, imgW, imgH);
            wheelCtx.globalAlpha = 1.0;

            // Thêm lớp phủ (Overlay) để text dễ đọc
            const overlayGradient = wheelCtx.createRadialGradient(centerX, centerY, radius * 0.4, centerX, centerY, radius);
            overlayGradient.addColorStop(0, 'rgba(14, 14, 20, 0.4)');
            overlayGradient.addColorStop(1, 'rgba(14, 14, 20, 0.7)');
            wheelCtx.fillStyle = overlayGradient;
            wheelCtx.fill();
        } else {
            // Fallback nếu không có ảnh
            let baseColor = (index % 2 === 0) ? '#161621' : '#0e0e14';
            const sliceGradient = wheelCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            sliceGradient.addColorStop(0.7, baseColor);
            sliceGradient.addColorStop(1, '#2a2a35');
            wheelCtx.fillStyle = sliceGradient;
            wheelCtx.fill();
        }

        // Viền lát cắt
        wheelCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        wheelCtx.lineWidth = 1;
        wheelCtx.stroke();

        wheelCtx.restore();
    });

    // 4. Các điểm nhấn phát sáng (Dots) trên viền
    maps.forEach((_, index) => {
        const angle = wheelRotation + (sliceAngle * index);
        wheelCtx.beginPath();
        wheelCtx.arc(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 2, 0, Math.PI * 2);
        wheelCtx.fillStyle = 'rgba(0, 243, 255, 0.3)';
        wheelCtx.fill();
    });

    // 5. Vẽ vòng tròn giữa (Hub)
    const centerGradient = wheelCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 45);
    centerGradient.addColorStop(0, '#0e0e14');
    centerGradient.addColorStop(0.6, '#161621');
    centerGradient.addColorStop(1, '#2a2a35');

    wheelCtx.beginPath();
    wheelCtx.arc(centerX, centerY, 45, 0, Math.PI * 2);
    wheelCtx.fillStyle = centerGradient;
    wheelCtx.fill();

    // Viền kim loại cho Hub
    wheelCtx.strokeStyle = '#2a2a35';
    wheelCtx.lineWidth = 4;
    wheelCtx.stroke();

    // Viền phát sáng cho hub
    wheelCtx.strokeStyle = 'rgba(0, 243, 255, 0.1)';
    wheelCtx.lineWidth = 1;
    wheelCtx.stroke();

    // 6. Text "BTC" phong cách Tech
    wheelCtx.fillStyle = '#00f3ff';
    wheelCtx.font = '900 14px Inter';
    wheelCtx.textAlign = 'center';
    wheelCtx.letterSpacing = '2px';
    wheelCtx.fillText('BTC', centerX, centerY + 5);

    // Icon tia chớp hoặc radar nhỏ dưới chữ BTC (tùy chọn)
};

// Quay vòng
window.spinWheel = async () => {
    if (isSpinning) return;
    if (!isAdminUser) {
        displayMessage("Chỉ Admin mới có quyền quay chọn Map BTC", true);
        return;
    }

    const maps = ALL_MAPS.filter(m => m.name && m.name.trim());
    if (maps.length === 0) {
        displayMessage("Chưa có map nào để quay. Vui lòng thêm map vào hệ thống.", true);
        return;
    }

    isSpinning = true;
    const spinBtn = document.getElementById('spin-wheel-btn');
    spinBtn.disabled = true;
    spinBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ĐANG QUAY...';

    wheelCanvas.classList.add('spinning');

    // Random số vòng quay và góc dừng
    const minSpins = 5;
    const maxSpins = 8;
    const spins = minSpins + Math.random() * (maxSpins - minSpins);
    const randomAngle = Math.random() * Math.PI * 2;
    const totalRotation = (Math.PI * 2 * spins) + randomAngle;

    // Animation
    const startTime = Date.now();
    const duration = 4000; // 4 giây

    const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-out)
        const eased = 1 - Math.pow(1 - progress, 3);

        wheelRotation = totalRotation * eased;
        drawWheel();

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            wheelCanvas.classList.remove('spinning');
            finishSpin(maps);
        }
    };

    animate();
};

// Kết thúc quay và chọn map
const finishSpin = async (maps) => {
    // Tính góc cuối cùng
    const normalizedRotation = wheelRotation % (Math.PI * 2);
    const sliceAngle = (Math.PI * 2) / maps.length;

    // Mũi tên ở phía trên (góc 270 độ hoặc 3π/2)
    const pointerAngle = Math.PI * 1.5;

    // Tính index của map được chọn
    let selectedIndex = Math.floor(((pointerAngle - normalizedRotation) % (Math.PI * 2)) / sliceAngle);
    if (selectedIndex < 0) selectedIndex += maps.length;
    selectedIndex = maps.length - 1 - selectedIndex;

    const selectedMap = maps[selectedIndex];

    // Hiệu ứng kết quả
    await new Promise(resolve => setTimeout(resolve, 500));

    // Lưu Map BTC
    const newState = { ...raceState, firstMapBtc: selectedMap.name.trim() };
    raceState = ensureInitialMaps(newState);
    await saveRaceState(raceState);

    // Hiển thị kết quả
    showSelectedBtcMap(selectedMap.name);

    // Hiển thị thông báo
    displayMessage(`🎉 Map BTC đã được chọn: ${selectedMap.name}!`, false);

    // Gửi notification
    if (isAdminUser) {
        await sendNotificationToAllUsers({
            title: "🎲 Map BTC đã được chọn!",
            content: `Ban Tổ Chức đã quay và chọn Map BTC: "${selectedMap.name}"`,
            type: "info",
            important: true
        });
    }

    // Reset button
    const spinBtn = document.getElementById('spin-wheel-btn');
    spinBtn.disabled = false;
    spinBtn.innerHTML = '<i class="fas fa-sync-alt mr-3"></i> QUAY NGẪU NHIÊN';

    isSpinning = false;
};

// Hiển thị map đã chọn
const showSelectedBtcMap = (mapName) => {
    const wheelContainer = document.getElementById('btc-wheel-container');
    const selectedContainer = document.getElementById('selected-btc-map');
    const displayElement = document.getElementById('btc-map-display');

    if (wheelContainer && selectedContainer && displayElement) {
        wheelContainer.classList.add('hidden');
        selectedContainer.classList.remove('hidden');
        selectedContainer.classList.add('wheel-result-announce');
        displayElement.textContent = mapName;
    }
};

// Reset để quay lại
window.resetBtcMap = async () => {
    if (!isAdminUser) {
        displayMessage("Chỉ Admin mới có quyền reset Map BTC", true);
        return;
    }

    if (!confirm("Bạn có chắc chắn muốn reset Map BTC và quay lại không?")) {
        return;
    }

    const wheelContainer = document.getElementById('btc-wheel-container');
    const selectedContainer = document.getElementById('selected-btc-map');

    if (wheelContainer && selectedContainer) {
        wheelContainer.classList.remove('hidden');
        selectedContainer.classList.add('hidden');
    }

    // Reset state
    const newState = { ...raceState, firstMapBtc: '' };
    raceState = ensureInitialMaps(newState);
    await saveRaceState(raceState);

    // Reset rotation
    wheelRotation = 0;
    drawWheel();

    displayMessage("Đã reset Map BTC. Có thể quay lại.", false);
};

window.saveMapData = async (mapIndex) => {
    if (!isAdminUser) {
        displayMessage("Chỉ Admin mới có quyền chỉnh sửa dữ liệu", true);
        return;
    }

    const saveBtn = document.getElementById(`save-map-${mapIndex}`);
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Đang kiểm tra...';
        saveBtn.disabled = true;
    }

    try {
        isEditing = true;
        const newState = { ...raceState, maps: [...raceState.maps] };
        const errors = [];

        // ============================================
        // BƯỚC 1: KIỂM TRA XE VÀ PET TRƯỚC
        // ============================================
        console.log("🔍 BƯỚC 1: Kiểm tra Xe và Pet...");

        let missingCarsPets = [];
        for (let racerIndex = 0; racerIndex < NUM_RACERS; racerIndex++) {
            const carInput = document.getElementById(`car-${mapIndex}-${racerIndex}`);
            const petInput = document.getElementById(`pet-${mapIndex}-${racerIndex}`);

            const carValue = carInput ? carInput.value.trim() : '';
            const petValue = petInput ? petInput.value.trim() : '';

            const racerName = raceState.racers[racerIndex]?.name || `Tay đua ${racerIndex + 1}`;

            if (!carValue || !petValue) {
                missingCarsPets.push({
                    racer: racerName,
                    missingCar: !carValue,
                    missingPet: !petValue
                });
            }
        }

        // Nếu thiếu Xe hoặc Pet -> DỪNG NGAY, KHÔNG CHO LƯU
        if (missingCarsPets.length > 0) {
            let errorMsg = "⚠️ BẮT BUỘC: Phải nhập đầy đủ Xe và Pet trước khi lưu thời gian!\n\n";
            errorMsg += "Thiếu thông tin:\n";

            missingCarsPets.forEach(item => {
                let missing = [];
                if (item.missingCar) missing.push("Xe");
                if (item.missingPet) missing.push("Pet");
                errorMsg += `• ${item.racer}: thiếu ${missing.join(' và ')}\n`;
            });

            errorMsg += "\n👉 Vui lòng vào bảng 'Xe và Pet sử dụng' bên dưới để nhập đầy đủ!";

            displayMessage(errorMsg, true);

            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Lưu';
                saveBtn.disabled = false;
            }

            isEditing = false;

            // Cuộn đến bảng Xe & Pet
            const carPetTable = document.getElementById('map-car-pet-body');
            if (carPetTable) {
                carPetTable.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            return;
        }

        console.log("✅ BƯỚC 1 PASSED: Đã có đầy đủ Xe và Pet");

        // ============================================
        // BƯỚC 2: KIỂM TRA THỜI GIAN (4/4 TAY ĐUA)
        // ============================================
        console.log("🔍 BƯỚC 2: Kiểm tra Thời gian...");

        let missingTimes = [];
        let invalidTimes = [];
        const recordsToSave = [];

        for (let racerIndex = 0; racerIndex < NUM_RACERS; racerIndex++) {
            const timeInput = document.getElementById(`time-${mapIndex}-${racerIndex}`);
            const timeValue = timeInput ? timeInput.value.trim() : '';

            const racerName = raceState.racers[racerIndex]?.name || `Tay đua ${racerIndex + 1}`;

            // Kiểm tra thiếu thời gian
            if (!timeValue || timeValue === "--'--'--") {
                missingTimes.push(racerName);
                continue;
            }

            // Kiểm tra format thời gian
            const seconds = timeToSeconds(timeValue);
            if (seconds === null || seconds === 0) {
                invalidTimes.push({
                    racer: racerName,
                    value: timeValue
                });
                continue;
            }

            // Nếu hợp lệ, chuẩn bị lưu
            const formattedTime = secondsToTimeString(seconds);
            newState.maps[mapIndex].times[racerIndex] = formattedTime;

            if (timeInput) {
                timeInput.value = formattedTime;
            }

            // Lưu thông tin để save record
            recordsToSave.push({
                racerIndex,
                timeInSeconds: seconds,
                racerName
            });
        }

        // Nếu có lỗi về thời gian -> DỪNG
        if (missingTimes.length > 0 || invalidTimes.length > 0) {
            let errorMsg = "⚠️ BẮT BUỘC: Phải nhập đầy đủ thời gian cho 4 tay đua!\n\n";

            if (missingTimes.length > 0) {
                errorMsg += `Thiếu thời gian:\n• ${missingTimes.join('\n• ')}\n\n`;
            }

            if (invalidTimes.length > 0) {
                errorMsg += "Thời gian không đúng format:\n";
                invalidTimes.forEach(item => {
                    errorMsg += `• ${item.racer}: "${item.value}" (phải là MM'SS'MS, ví dụ: 01'23'45)\n`;
                });
                errorMsg += "\n";
            }

            errorMsg += "👉 Vui lòng nhập đủ 4 thời gian hợp lệ trước khi lưu!";

            displayMessage(errorMsg, true);

            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Lưu';
                saveBtn.disabled = false;
            }

            isEditing = false;
            return;
        }

        console.log("✅ BƯỚC 2 PASSED: Đã có đầy đủ 4 thời gian hợp lệ");

        // ============================================
        // BƯỚC 3: LƯU DỮ LIỆU XE VÀ PET
        // ============================================
        console.log("💾 BƯỚC 3: Lưu Xe và Pet...");

        for (let racerIndex = 0; racerIndex < NUM_RACERS; racerIndex++) {
            const carInput = document.getElementById(`car-${mapIndex}-${racerIndex}`);
            const petInput = document.getElementById(`pet-${mapIndex}-${racerIndex}`);

            const carValue = carInput ? carInput.value.trim() : '';
            const petValue = petInput ? petInput.value.trim() : '';

            // Kiểm tra trùng xe
            if (carValue) {
                const mapUsedElsewhere = isCarUsedByRacerInOtherMap(newState, carValue, racerIndex, mapIndex);
                if (mapUsedElsewhere) {
                    const racerName = raceState.racers[racerIndex]?.name || `Tay đua ${racerIndex + 1}`;
                    errors.push(`❌ Xe "${carValue}" đã được sử dụng bởi ${racerName} ở Map "${mapUsedElsewhere}"`);

                    if (carInput) {
                        carInput.value = '';
                    }
                }
            }

            newState.maps[mapIndex].cars[racerIndex] = carValue;
            newState.maps[mapIndex].pets[racerIndex] = petValue;
        }

        // Nếu có lỗi trùng xe -> DỪNG
        if (errors.length > 0) {
            displayMessage(errors.join('\n'), true);

            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Lưu';
                saveBtn.disabled = false;
            }

            isEditing = false;
            return;
        }

        console.log("✅ BƯỚC 3 PASSED: Đã lưu Xe và Pet");

        // ============================================
        // BƯỚC 4: LƯU DỮ LIỆU LÊN FIRESTORE
        // ============================================
        console.log("💾 BƯỚC 4: Lưu lên Firestore...");

        raceState = newState;
        await saveRaceState(raceState);

        console.log("✅ BƯỚC 4 PASSED: Đã lưu lên Firestore");

        // ============================================
        // BƯỚC 5: LƯU RACE RECORDS
        // ============================================
        console.log("💾 BƯỚC 5: Lưu Race Records...");

        if (recordsToSave.length === NUM_RACERS) {
            const mapName = newState.maps[mapIndex].name;

            for (const recordData of recordsToSave) {
                const car = newState.maps[mapIndex].cars[recordData.racerIndex];
                const pet = newState.maps[mapIndex].pets[recordData.racerIndex];

                await saveRaceRecord(
                    mapName,
                    recordData.racerIndex,
                    recordData.timeInSeconds,
                    car,
                    pet
                );

                console.log(`✅ Đã lưu record cho ${recordData.racerName}`);
            }

            console.log("✅ BƯỚC 5 PASSED: Đã lưu tất cả Race Records");
        }

        // ============================================
        // BƯỚC 6: KIỂM TRA VÀ CẬP NHẬT RECORD
        // ============================================
        console.log("🏆 BƯỚC 6: Kiểm tra và cập nhật record...");

        setTimeout(() => {
            checkIfMapCompleted(mapIndex);
        }, 500);

        // ============================================
        // HOÀN THÀNH
        // ============================================
        displayMessage("✅ Đã lưu đầy đủ: Xe, Pet, Thời gian và Race Records!", false);

        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-check mr-1"></i> Đã lưu';
            setTimeout(() => {
                saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Lưu';
                saveBtn.disabled = false;
            }, 2000);
        }

    } catch (error) {
        console.error("❌ Lỗi khi lưu dữ liệu map:", error);
        displayMessage("❌ Lỗi khi lưu dữ liệu. Vui lòng thử lại!", true);

        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i> Lưu';
            saveBtn.disabled = false;
        }
    } finally {
        isEditing = false;
    }
};

// Thêm event listener cho các input khi render xong
const attachInputListeners = () => {
    // Chỉ attach cho admin
    if (!isAdminUser) return;

    document.querySelectorAll('.temp-edit-input').forEach(input => {
        // Highlight khi focus
        input.addEventListener('focus', function () {
            this.style.borderColor = 'rgba(0, 243, 255, 0.5)';
            this.style.boxShadow = '0 0 0 2px rgba(0, 243, 255, 0.1)';
        });

        // Reset khi blur
        input.addEventListener('blur', function () {
            this.style.borderColor = '';
            this.style.boxShadow = '';
        });

        // Hiển thị nút lưu khi có thay đổi
        input.addEventListener('input', function () {
            const mapIndex = parseInt(this.getAttribute('data-map-index'));
            const saveBtn = document.getElementById(`save-map-${mapIndex}`);
            if (saveBtn && !this.classList.contains('save-btn-highlighted')) {
                saveBtn.classList.add('save-btn-pulse');
                input.classList.add('save-btn-highlighted');
            }
        });
    });
};


// ================ HÀM LƯU TOÀN BỘ XE & PET ================
window.saveAllCarsPets = async () => {
    if (!isAdminUser) {
        displayMessage("Chỉ Admin mới có quyền lưu dữ liệu", true);
        return;
    }

    const saveBtn = document.getElementById('save-all-cars-pets-btn');
    if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Đang lưu...';
        saveBtn.disabled = true;
    }

    try {
        isEditing = true;
        const newState = { ...raceState, maps: [...raceState.maps] };
        let hasChanges = false;
        let hasErrors = false;
        const errors = [];

        // Thu thập dữ liệu xe và pet từ tất cả các map
        for (let mapIndex = 0; mapIndex < raceState.maps.length; mapIndex++) {
            for (let racerIndex = 0; racerIndex < NUM_RACERS; racerIndex++) {
                // Lấy xe
                const carInput = document.getElementById(`car-${mapIndex}-${racerIndex}`);
                if (carInput) {
                    const carValue = carInput.value.trim();

                    // MỚI: Kiểm tra tính hợp lệ của xe (Bắt buộc trong thư viện)
                    if (carValue && !ALL_CARS.some(c => c.name === carValue)) {
                        errors.push(`Xe "${carValue}" (Map ${mapIndex + 1}, Tay đua ${racerIndex + 1}) không tồn tại trong thư viện!`);
                        hasErrors = true;
                    }

                    // Kiểm tra trùng xe
                    if (carValue) {
                        const mapUsedElsewhere = isCarUsedByRacerInOtherMap(newState, carValue, racerIndex, mapIndex);
                        if (mapUsedElsewhere) {
                            errors.push(`Xe "${carValue}" đã được sử dụng bởi ${raceState.racers[racerIndex]?.name || `Tay đua ${racerIndex + 1}`} ở Map "${mapUsedElsewhere}"`);
                            hasErrors = true;
                        }
                    }

                    if (newState.maps[mapIndex].cars[racerIndex] !== carValue) {
                        newState.maps[mapIndex].cars[racerIndex] = carValue;
                        hasChanges = true;
                    }
                }

                // Lấy pet
                const petInput = document.getElementById(`pet-${mapIndex}-${racerIndex}`);
                if (petInput) {
                    const petValue = petInput.value.trim();

                    // MỚI: Kiểm tra tính hợp lệ của pet (Bắt buộc trong thư viện)
                    if (petValue && !ALL_PETS.some(p => p.name === petValue)) {
                        errors.push(`Pet "${petValue}" (Map ${mapIndex + 1}, Tay đua ${racerIndex + 1}) không tồn tại trong thư viện!`);
                        hasErrors = true;
                    }

                    if (newState.maps[mapIndex].pets[racerIndex] !== petValue) {
                        newState.maps[mapIndex].pets[racerIndex] = petValue;
                        hasChanges = true;
                    }
                }
            }
        }

        if (hasErrors) {
            displayMessage(errors.join('\n'), true);
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Lưu toàn bộ Xe & Pet';
                saveBtn.disabled = false;
            }
            isEditing = false;
            return;
        }

        if (!hasChanges) {
            displayMessage("Không có thay đổi nào để lưu", false);
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Lưu toàn bộ Xe & Pet';
                saveBtn.disabled = false;
            }
            isEditing = false;
            return;
        }

        // Lưu vào Firestore
        raceState = newState;
        await saveRaceState(raceState);

        displayMessage("✅ Đã lưu toàn bộ Xe & Pet thành công!", false);

        // // Gửi thông báo
        // await sendNotificationToAllUsers({
        //     title: "🚗 Xe & Pet đã được cập nhật",
        //     content: "Thông tin xe và pet của tất cả các map đã được cập nhật.",
        //     type: "success",
        //     important: false
        // });

        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Đã lưu';
            setTimeout(() => {
                saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Lưu toàn bộ Xe & Pet';
                saveBtn.disabled = false;
            }, 2000);
        }
    } catch (error) {
        console.error("Lỗi khi lưu Xe & Pet:", error);
        displayMessage("❌ Lỗi khi lưu dữ liệu", true);

        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Lưu toàn bộ Xe & Pet';
            saveBtn.disabled = false;
        }
    } finally {
        isEditing = false;
    }
};

// ================ RECORD HOLDER MODAL FUNCTIONS ================

// Hàm mở modal chi tiết record holder
window.openRecordHolderModal = async (racerName) => {
    const modal = document.getElementById('record-holder-detail-modal');
    const nameElement = document.getElementById('record-holder-name');
    const countElement = document.getElementById('record-holder-count');
    const mapsList = document.getElementById('record-holder-maps-list');

    if (!modal) return;

    // Hiển thị modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';

    // Hiển thị tên tay đua
    nameElement.textContent = racerName;

    // Hiển thị loading
    mapsList.innerHTML = `
        <div class="flex items-center justify-center py-8">
            <div class="speed-loader h-12 w-12"></div>
        </div>
    `;

    try {
        // Lấy danh sách maps mà tay đua này giữ record
        const mapsSnapshot = await getDocs(collection(db, "gameMaps"));
        const recordMaps = [];

        mapsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.recordRacer === racerName &&
                data.recordTime &&
                data.recordTime !== "00'00'00" &&
                data.recordTime !== "--'--'--") {

                recordMaps.push({
                    id: doc.id,
                    name: data.name || "Chưa có tên",
                    recordTime: data.recordTime,
                    recordCar: data.recordCar || "Chưa có",
                    recordPet: data.recordPet || "Chưa có",
                    imageUrl: data.imageUrl || null,
                    difficulty: data.difficulty || "Medium"
                });
            }
        });

        // Cập nhật số lượng record
        countElement.textContent = recordMaps.length;

        // Hiển thị danh sách maps
        if (recordMaps.length === 0) {
            mapsList.innerHTML = `
                <div class="text-center text-slate-500 py-8">
                    <i class="fas fa-inbox text-4xl mb-4 opacity-50"></i>
                    <p>Không tìm thấy record nào</p>
                </div>
            `;
            return;
        }

        // Render danh sách maps
        mapsList.innerHTML = recordMaps.map((map, index) => {
            const difficultyColors = {
                'easy': 'bg-green-500/20 text-green-400 border-green-500/30',
                'medium': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                'hard': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
                'expert': 'bg-red-500/20 text-red-400 border-red-500/30',
                'extreme': 'bg-purple-500/20 text-purple-400 border-purple-500/30'
            };

            const difficultyClass = difficultyColors[map.difficulty.toLowerCase()] || difficultyColors['medium'];

            return `
                <div class="record-map-card relative p-4 rounded-xl bg-gradient-to-r from-slate-800/50 to-slate-900/50 border border-slate-700/50">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center space-x-3 flex-1 min-w-0">
                            ${map.imageUrl ? `
                                <div class="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 border-amber-500/30">
                                    <img src="${map.imageUrl}" alt="${map.name}" 
                                         class="w-full h-full object-cover hover:scale-110 transition-transform duration-300">
                                </div>
                            ` : `
                                <div class="w-16 h-16 rounded-lg flex-shrink-0 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center border-2 border-amber-500/30">
                                    <i class="fas fa-map text-2xl text-amber-400"></i>
                                </div>
                            `}
                            <div class="flex-1 min-w-0">
                                <h5 class="text-lg font-bold text-white mb-1 truncate">${map.name}</h5>
                                <div class="flex items-center space-x-2">
                                    <span class="record-info-badge ${difficultyClass} text-xs border">
                                        <i class="fas fa-signal mr-1"></i>
                                        ${map.difficulty}
                                    </span>
                                    <span class="text-xs text-slate-400">#${index + 1}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 gap-3 pl-19">
                        <!-- Thời gian -->
                        <div class="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-green-500/20">
                            <div class="flex items-center">
                                <i class="fas fa-stopwatch text-green-400 text-lg mr-3"></i>
                                <span class="text-sm text-slate-400">Thời gian Record:</span>
                            </div>
                            <span class="record-time-display text-green-400">${map.recordTime}</span>
                        </div>

                        <!-- Xe và Pet -->
                        <div class="grid grid-cols-2 gap-2">
                            <div class="flex items-center p-2 bg-slate-900/50 rounded-lg border border-cyan-500/20">
                                ${(() => {
                    const carInfo = ALL_CARS.find(c => c.name === map.recordCar);
                    return carInfo && carInfo.imageUrl ?
                        `<img src="${carInfo.imageUrl}" class="w-8 h-8 object-contain mr-2" alt="car">` :
                        `<i class="fas fa-car text-cyan-400 mr-2 text-lg"></i>`;
                })()}
                                <div class="flex-1 min-w-0">
                                    <div class="text-[10px] text-slate-500 uppercase font-bold">Xe:</div>
                                    <div class="text-sm text-white font-semibold truncate">${map.recordCar}</div>
                                </div>
                            </div>
                            <div class="flex items-center p-2 bg-slate-900/50 rounded-lg border border-pink-500/20">
                                ${(() => {
                    const petInfo = ALL_PETS.find(p => p.name === map.recordPet);
                    return petInfo && petInfo.imageUrl ?
                        `<img src="${petInfo.imageUrl}" class="w-8 h-8 object-contain mr-2" alt="pet">` :
                        `<i class="fas fa-paw text-pink-400 mr-2 text-lg"></i>`;
                })()}
                                <div class="flex-1 min-w-0">
                                    <div class="text-[10px] text-slate-500 uppercase font-bold">Pet:</div>
                                    <div class="text-sm text-white font-semibold truncate">${map.recordPet}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("❌ Lỗi khi load chi tiết record holder:", error);
        mapsList.innerHTML = `
            <div class="text-center text-red-400 py-8">
                <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                <p>Có lỗi xảy ra khi tải dữ liệu</p>
            </div>
        `;
    }
};

// Hàm đóng modal
window.closeRecordHolderModal = () => {
    const modal = document.getElementById('record-holder-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }
};

// Đóng modal khi nhấn ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeRecordHolderModal();
    }
});

// --- Firebase Initialization ---
const initFirebase = async () => {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Gán vào window để các module khác truy cập
        window.db = db;
        window.auth = auth;

        setPersistence(auth, browserLocalPersistence).catch(error => {
            console.warn("Không thể thiết lập persistence. Tiếp tục khởi tạo.", error);
        });

        // Dispatch event for other modules
        window.dispatchEvent(new CustomEvent('firebaseInitialized', {
            detail: { db, auth, app }
        }));

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    // Kiểm tra quyền admin từ Firestore
                    let isAdmin = false;
                    const userRef = doc(db, "users", user.uid);
                    const userDoc = await getDoc(userRef);

                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        isAdmin = userData.isAdmin || false;

                        // Hiển thị nút quản lý dữ liệu cho admin
                        if (isAdmin) {
                            document.getElementById('configdata-link').style.display = 'flex';
                            isAdminUser = true; // Cập nhật biến toàn cục
                        } else {
                            document.getElementById('configdata-link').style.display = 'none';
                        }
                    }

                    isAdminUser = isAdmin; // Lưu biến toàn cục
                    userId = user.uid;
                    isAuthReady = true;

                    // Tải danh sách racers sớm để chuẩn bị Avatar
                    loadAvailableRacers();

                    // Dispatch user loaded event for user-profile module
                    window.dispatchEvent(new CustomEvent('userLoaded', {
                        detail: {
                            ...user,
                            isAdmin,
                            userData: userDoc.exists() ? userDoc.data() : {}
                        }
                    }));

                    // Lấy dữ liệu từ Firestore
                    await fetchGameDataFromFirestore();

                    document.getElementById('loading-screen').classList.add('hidden');
                    document.getElementById('app').classList.remove('hidden');

                    const displayName = user.displayName || (isAdmin ? 'Admin' : 'User');
                    document.getElementById('user-display-name').textContent = displayName;

                    if (userDoc.data().nickname) {
                        const roleBadge = isAdminUser ?
                            '<span class="text-xs bg-gradient-to-r from-red-600 to-red-700 text-white px-2 py-1 rounded ml-2">ADMIN</span>' :
                            '<span class="text-xs bg-gradient-to-r from-blue-600 to-blue-700 text-white px-2 py-1 rounded ml-2">USER</span>';

                        document.getElementById('user-display-name').innerHTML =
                            `${displayName} <span class="text-xs bg-gradient-to-r from-cyan-600 to-blue-700 text-white px-2 py-1 rounded ml-2">@${userDoc.data().nickname}</span> ${roleBadge}`;
                    } else {
                        // Chỉ hiển thị role badge
                        const roleBadge = isAdminUser ?
                            '<span class="text-xs bg-gradient-to-r from-red-600 to-red-700 text-white px-2 py-1 rounded ml-2">ADMIN</span>' :
                            '<span class="text-xs bg-gradient-to-r from-blue-600 to-blue-700 text-white px-2 py-1 rounded ml-2">USER</span>';

                        document.getElementById('user-display-name').innerHTML = `${displayName} ${roleBadge}`;
                    }

                    // Hiển thị avatar - ưu tiên Base64 nếu có
                    const userData = userDoc.data();
                    if (userData.photoBase64) {
                        // Nếu có Base64, dùng Base64 (ảnh mới cập nhật)
                        document.getElementById('user-avatar').src = userData.photoBase64;
                    } else if (userData.photoURL) {
                        // Nếu không có Base64, dùng photoURL
                        document.getElementById('user-avatar').src = userData.photoURL;
                    } else if (user.photoURL) {
                        // Cuối cùng, dùng từ Firebase Auth
                        document.getElementById('user-avatar').src = user.photoURL;
                    }

                    if (!isAdmin) {
                        disableEditFunctions();
                        displayMessage("Bạn đang ở chế độ xem. Chỉ có quyền xem dữ liệu.", false);
                    }

                    setupFirestoreListener();

                } catch (error) {
                    console.error("Lỗi khi kiểm tra quyền:", error);
                    displayMessage("Lỗi khi kiểm tra quyền truy cập.", true);
                    // setTimeout(() => { window.location.href = "login.html"; }, 2000);
                }
            } else {
                if (!isAuthReady) {
                    window.location.href = "login.html";
                }
            }

            setupNotificationListener();
            initNotificationSystem();
        });
    } catch (error) {
        console.error("Lỗi khi khởi tạo Firebase:", error);
        document.getElementById('loading-screen').innerHTML = `<p class="text-red-400 text-xl">Lỗi hệ thống: Không thể kết nối Firebase.</p>`;
    }

    // Trì hoãn việc kiểm tra kỷ lục để không làm lag UI khi khởi động
    setTimeout(() => {
        checkAllCompletedMapsRecords();
    }, 5000);
};

// Hàm kiểm tra record cho tất cả maps đã hoàn thành
const checkAllCompletedMapsRecords = async () => {
    try {

        for (let i = 0; i < raceState.maps.length; i++) {
            const map = raceState.maps[i];
            const isCompleted = map.times && map.times.every(time => {
                return time && time.trim() && time.trim() !== "--'--'--" && timeToSeconds(time) > 0;
            });

            if (isCompleted) {
                console.log(`Kiểm tra record cho map đã hoàn thành: ${map.name}`);
                await checkAndUpdateRecordForMap(i);
            }
        }
    } catch (error) {
        console.error("Lỗi khi kiểm tra tất cả maps:", error);
    }
};

// Gọi hàm này khi khởi tạo xong
// Thêm vào trong initFirebase hoặc setupFirestoreListener sau khi raceState được load

const setupFirestoreListener = () => {
    onSnapshot(getRaceDocRef(), (doc) => {
        if (doc.exists()) {
            let serverState = doc.data();

            if (!serverState.version || serverState.version < defaultState.version) {
                console.log("Nâng cấp cấu trúc dữ liệu...");
                serverState = ensureInitialMaps(serverState);
                serverState.version = defaultState.version;
                saveRaceState(serverState);
            }

            serverState = ensureInitialMaps(serverState);
            raceState = serverState;
        } else {
            console.log("Tạo trạng thái ban đầu trên Firestore.");
            raceState = ensureInitialMaps(defaultState);
            saveRaceState(raceState);
        }

        updateUI();
    }, (error) => {
        console.error("Lỗi khi lắng nghe Firestore:", error);
        displayMessage("Lỗi kết nối CSDL theo thời gian thực. Vui lòng tải lại trang.", true);
    });
};

// Sửa hàm disableEditFunctions trong file index.html:
const disableEditFunctions = () => {


    // Vô hiệu hóa tất cả input trong phần config
    const configInputs = document.querySelectorAll('#config input, #config select, #config textarea');
    configInputs.forEach(input => {
        input.disabled = true;
        input.readOnly = true;
        input.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
    });

    // Vô hiệu hóa ô Map BTC
    const btcMapInput = document.getElementById('btc-map-name');
    if (btcMapInput) {
        btcMapInput.disabled = true;
        btcMapInput.readOnly = true;
        btcMapInput.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
        if (!btcMapInput.value.trim()) btcMapInput.placeholder = "Chỉ xem";
    }

    // Nút Vòng quay chỉ Admin mới được quay
    const spinBtn = document.getElementById('spin-wheel-btn');
    if (spinBtn) {
        spinBtn.disabled = true;
        spinBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    const exportBtn = document.getElementById('export-excel-btn');
    if (exportBtn) {
        // exportBtn.disabled = true; // Vẫn cho phép User xuất Excel
    }

    // Vô hiệu hóa các ô tên tay đua
    for (let i = 0; i < NUM_RACERS; i++) {
        const nameInput = document.getElementById(`racer-name-${i}`);
        const kingMapInput = document.getElementById(`king-map-${i}`);

        if (nameInput) {
            nameInput.disabled = true;
            nameInput.readOnly = true;
            nameInput.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
            if (!nameInput.value.trim()) nameInput.placeholder = "Chỉ xem";
        }

        if (kingMapInput) {
            kingMapInput.disabled = true;
            kingMapInput.readOnly = true;
            kingMapInput.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
            if (!kingMapInput.value.trim()) kingMapInput.placeholder = "Chỉ xem";
        }
    }

    // Vô hiệu hóa tất cả input trong Bảng Thời Gian và Điểm Số
    const timeTableInputs = document.querySelectorAll('#map-time-points-body input, #data-entry input:not([type="hidden"])');
    timeTableInputs.forEach(input => {
        input.disabled = true;
        input.readOnly = true;
        input.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
        if (!input.value.trim()) {
            if (input.placeholder.includes("'--'--") || input.placeholder.includes("MM'SS'MS")) {
                input.placeholder = "Chỉ xem";
            }
        }
    });

    // Vô hiệu hóa tất cả input trong Bảng Xe và Pet
    const carPetInputs = document.querySelectorAll('#map-car-pet-body input, #racer-sub-header-car-pet + tbody input');
    carPetInputs.forEach(input => {
        input.disabled = true;
        input.readOnly = true;
        input.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
        if (!input.value.trim()) input.placeholder = "Chỉ xem";
    });

    // Vô hiệu hóa tất cả input trong Bảng điểm chi tiết (nếu có)
    const scoreboardInputs = document.querySelectorAll('#detailed-scoreboard-body input, #detailed-scoreboard-header input');
    scoreboardInputs.forEach(input => {
        input.disabled = true;
        input.readOnly = true;
        input.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
    });

    // VÔ hiệu hóa tất cả các button TRỪ button menu mobile, button profile, button record holder, và các button được phép (vòng quay, export)
    const allowedButtonSelectors = [
        '#logout-btn',
        '#notification-bell',
        '.notification-item button',
        '.lg\\:hidden',
        '[onclick*="openUserProfileModal"]',
        '[onclick*="openRecordHolderModal"]',
        '[onclick*="userProfileManager"]',
        '#export-excel-btn',
        '#mark-all-read'
    ].join(',');

    const allButtons = document.querySelectorAll(`button:not(${allowedButtonSelectors})`);
    allButtons.forEach(button => {
        button.disabled = true;
        button.classList.add('opacity-50', 'cursor-not-allowed');
        if (button.id === 'add-map-btn' || button.id === 'refresh-data-btn' || button.id === 'export-excel-btn') {
            button.classList.add('hidden');
        }
    });

    // Đảm bảo button profile (avatar) hoạt động cho cả admin và user
    const profileButtons = document.querySelectorAll('[onclick*="openUserProfileModal"]');
    profileButtons.forEach(button => {
        button.disabled = false;
        button.classList.remove('opacity-50', 'cursor-not-allowed');
        button.style.pointerEvents = 'auto';
        button.style.cursor = 'pointer';
    });

    // Đảm bảo button "Hồ Sơ Cá Nhân" từ userProfileManager hoạt động
    const userProfileButtons = document.querySelectorAll('[onclick*="userProfileManager"]');
    userProfileButtons.forEach(button => {
        button.disabled = false;
        button.classList.remove('opacity-50', 'cursor-not-allowed');
        button.style.pointerEvents = 'auto';
        button.style.cursor = 'pointer';
    });

    // Đảm bảo button record holder hoạt động cho cả admin và user
    const recordHolderButtons = document.querySelectorAll('[onclick*="openRecordHolderModal"]');
    recordHolderButtons.forEach(button => {
        button.disabled = false;
        button.classList.remove('opacity-50', 'cursor-not-allowed');
        button.style.pointerEvents = 'auto';
        button.style.cursor = 'pointer';
    });

    // Đảm bảo button menu mobile hoạt động cho cả admin và user
    const mobileMenuButton = document.querySelector('button.lg\\:hidden');
    if (mobileMenuButton) {
        mobileMenuButton.disabled = false;
        mobileMenuButton.classList.remove('opacity-50', 'cursor-not-allowed');
        mobileMenuButton.style.pointerEvents = 'auto';
        mobileMenuButton.style.cursor = 'pointer';
    }

    // ĐẶC BIỆT: KHÔNG vô hiệu hóa các nút đóng modal thông báo và record holder
    const closeButtons = document.querySelectorAll('button[onclick*="closeNotificationModal"], button[onclick*="closeAllNotificationsModal"], button[onclick*="closeRecordHolderModal"]');
    closeButtons.forEach(button => {
        button.disabled = false;
        button.classList.remove('opacity-50', 'cursor-not-allowed');
        button.style.pointerEvents = 'auto';
        button.style.cursor = 'pointer';
    });

    // Loại bỏ sự kiện onchange từ tất cả các phần tử NGOẠI TRỪ file input trong modal profile
    document.querySelectorAll('[onchange]').forEach(element => {
        // KHÔNG xóa onchange cho file input trong modal profile
        if (!(element.type === 'file' && element.closest('#user-profile-modal'))) {
            element.removeAttribute('onchange');
            element.setAttribute('title', 'Chế độ xem - Không thể chỉnh sửa');
        }
    });

    // Loại bỏ sự kiện onclick từ các nút xóa map
    document.querySelectorAll('[onclick*="deleteMap"]').forEach(element => {
        element.removeAttribute('onclick');
        element.setAttribute('title', 'Chế độ xem - Không thể xóa');
    });

    // Sửa đổi placeholder cho tất cả các input
    document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
        if (!input.disabled && input.placeholder) {
            const currentPlaceholder = input.placeholder;
            if (!currentPlaceholder.includes("Chỉ xem")) {
                if (currentPlaceholder.includes("'--'--") || currentPlaceholder.includes("MM'SS'MS")) {
                    input.placeholder = "Chỉ xem";
                } else if (currentPlaceholder.includes("Xe") || currentPlaceholder.includes("Pet")) {
                    input.placeholder = "Chỉ xem - " + currentPlaceholder;
                } else if (currentPlaceholder.includes("Tên Map")) {
                    input.placeholder = "Chỉ xem - Tên Map";
                }
            }
        }
    });

    // Thêm thông báo chế độ xem vào các section
    const sectionsToDisable = ['#config', '#data-entry', '#scoreboard'];
    sectionsToDisable.forEach(selector => {
        const section = document.querySelector(selector);
        if (section) {
            const existingNotice = section.querySelector('.view-mode-notice');
            if (!existingNotice) {
                const notice = document.createElement('div');
                notice.className = 'view-mode-notice bg-gradient-to-r from-blue-900/50 to-blue-800/30 border-l-4 border-blue-500 p-4 mb-6 rounded-r-xl';
                notice.innerHTML = `
                        <div class="flex items-center justify-center">
                            <i class="fas fa-eye text-blue-400 mr-2"></i>
                            <span class="font-bold text-blue-300">CHẾ ĐỘ CHỈ XEM</span>
                        </div>
                        <p class="text-sm text-blue-200 mt-1 text-center">Bạn đang ở chế độ xem. Chỉ có quyền xem dữ liệu, không thể chỉnh sửa.</p>
                    `;
                section.insertBefore(notice, section.firstChild);
            }
        }
    });

    // Thêm badge vào tiêu đề
    const mainTitle = document.querySelector('header h1');
    if (mainTitle) {
        const existingBadge = mainTitle.querySelector('.view-mode-badge');
        if (!existingBadge) {
            const badge = document.createElement('span');
            badge.className = 'view-mode-badge text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white px-3 py-1 rounded ml-3 align-middle';
            badge.textContent = 'CHẾ ĐỘ XEM';
            mainTitle.appendChild(badge);
        }
    }

    // Vô hiệu hóa hover effect trên các bảng (nhưng không trên modal)
    document.querySelectorAll('.neon-card:not(#crop-image-modal *):not(#user-profile-modal *):not(#record-holder-detail-modal *), .speed-table tbody tr').forEach(element => {
        if (!element.closest('#crop-image-modal') && !element.closest('#user-profile-modal') && !element.closest('#record-holder-detail-modal')) {
            element.classList.add('pointer-events-none');
        }
    });

    // Vô hiệu hóa tất cả các input trong các section khác
    const allSectionInputs = document.querySelectorAll('main input:not([type="hidden"])');
    allSectionInputs.forEach(input => {
        // KIỂM TRA: Không vô hiệu hóa các phần tử trong hệ thống thông báo và modal
        if (!input.closest('#notification-dropdown') && !input.closest('#notification-modal') && !input.closest('#crop-image-modal') && !input.closest('#user-profile-modal')) {
            if (!input.disabled) {
                input.disabled = true;
                input.readOnly = true;
                input.classList.add('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
            }
        }
    });

    // Cho phép click vào avatar để mở modal
    const avatarButtons = document.querySelectorAll('[onclick*="openUserProfileModal"]');
    avatarButtons.forEach(btn => {
        btn.style.pointerEvents = 'auto';
        btn.style.cursor = 'pointer';
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    });

    // Cho phép các input trong modal profile hoạt động
    const profileModal = document.getElementById('user-profile-modal');
    if (profileModal) {
        const profileInputs = profileModal.querySelectorAll('input, button, textarea');
        profileInputs.forEach(input => {
            input.disabled = false;
            input.readOnly = false;
            input.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-slate-800');
            // Đảm bảo file input có thể click
            if (input.type === 'file') {
                input.disabled = false;
                input.classList.remove('opacity-50', 'cursor-not-allowed');
                input.style.pointerEvents = 'auto';
            }
        });
        // Cho phép file input
        const fileInputs = profileModal.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            input.disabled = false;
            input.classList.remove('opacity-50', 'cursor-not-allowed');
            input.style.pointerEvents = 'auto';
        });
        // Cho phép label chứa file input (upload avatar)
        const fileLabels = profileModal.querySelectorAll('label');
        fileLabels.forEach(label => {
            label.classList.remove('opacity-50', 'cursor-not-allowed');
            label.style.pointerEvents = 'auto';
            label.style.cursor = 'pointer';
        });
    }

    // Cho phép các button trong modal crop ảnh
    const cropModal = document.getElementById('crop-image-modal');
    if (cropModal) {
        const cropButtons = cropModal.querySelectorAll('button');
        cropButtons.forEach(button => {
            button.disabled = false;
            button.classList.remove('opacity-50', 'cursor-not-allowed');
        });
        // Đảm bảo tất cả element trong crop modal hoạt động
        const cropElements = cropModal.querySelectorAll('*');
        cropElements.forEach(el => {
            el.classList.remove('pointer-events-none');
            el.style.pointerEvents = 'auto';
            el.disabled = false;
        });
    }


    // Thêm CSS để làm mờ các bảng dữ liệu
    const style = document.createElement('style');
    style.textContent = `
            .view-mode .speed-input {
                background-color: rgba(30, 41, 59, 0.5) !important;
                border-color: rgba(100, 116, 139, 0.3) !important;
                color: #94a3b8 !important;
            }
            
            .view-mode .neon-card {
                border-color: rgba(100, 116, 139, 0.2) !important;
            }
            
            .view-mode table {
                opacity: 0.9;
            }
        `;
    document.head.appendChild(style);

    // Vô hiệu hóa các nút lưu mới
    const saveBtcMapBtn = document.getElementById('save-btc-map-btn');
    if (saveBtcMapBtn) {
        saveBtcMapBtn.disabled = true;
        saveBtcMapBtn.classList.add('hidden');
    }

    const saveKingMapsBtn = document.getElementById('save-king-maps-btn');
    if (saveKingMapsBtn) {
        saveKingMapsBtn.disabled = true;
        saveKingMapsBtn.classList.add('hidden');
    }

    const saveAllCarsPetsBtn = document.getElementById('save-all-cars-pets-btn');
    if (saveAllCarsPetsBtn) {
        saveAllCarsPetsBtn.disabled = true;
        saveAllCarsPetsBtn.classList.add('hidden');
    }
    document.body.classList.add('view-mode');
};

const saveRaceRecord = async (mapName, racerIndex, timeInSeconds, car, pet) => {
    try {
        if (!mapName || !timeInSeconds || !car || !pet) return;

        const racerName = raceState.racers[racerIndex]?.name || `Tay Đua ${racerIndex + 1}`;
        const recordId = `${mapName.replace(/\s+/g, '_')}_${racerName}_${Date.now()}`;
        const mapInfo = ALL_MAPS.find(m => (m.name || "").trim() === (mapName || "").trim());

        const recordData = {
            mapName: mapName,
            mapImage: mapInfo?.image || '',
            racerName: racerName,
            racerIndex: racerIndex,
            timeInSeconds: timeInSeconds,
            timeString: secondsToTimeString(timeInSeconds),
            car: car || '',
            pet: pet || '',
            timestamp: new Date().toISOString(),
            isRecord: false
        };

        await setDoc(doc(db, "raceRecords", recordId), recordData);
        await updateMapRecord(mapName, {
            timeInSeconds: timeInSeconds,
            timeString: secondsToTimeString(timeInSeconds),
            racerName: racerName,
            racerIndex: racerIndex,
            car: car || '',
            pet: pet || '',
            timestamp: new Date().toISOString()
        });

        setTimeout(() => renderHallOfFame(), 1000);

        console.log("Đã lưu thành tích:", recordData);
    } catch (error) {
        console.error("Lỗi khi lưu thành tích:", error);
    }
};

// Thêm biến global để tracking
const notificationLocks = new Map();
const SENT_NOTIFICATIONS = new Set(); // Set để tracking notifications đã gửi

// Hàm gửi thông báo với lock
const sendRecordNotificationWithLock = async (mapName, recordData) => {
    // Tạo key duy nhất cho thông báo này
    const notificationKey = `${mapName}_${recordData.timeString}_${recordData.racerName}`;

    // Kiểm tra xem đã gửi chưa
    if (SENT_NOTIFICATIONS.has(notificationKey)) {
        console.log(`🔒 Bỏ qua - Thông báo đã được gửi: ${notificationKey}`);
        return true;
    }

    // Kiểm tra lock
    if (notificationLocks.has(mapName)) {
        console.log(`🔒 Bỏ qua - Map ${mapName} đang bị lock`);
        return false;
    }

    // Set lock
    notificationLocks.set(mapName, true);

    try {
        // KIỂM TRA LẠI XE VÀ PET
        if (!recordData.car || !recordData.pet ||
            recordData.car.trim() === '' || recordData.pet.trim() === '') {
            console.error(`❌ Không thể gửi thông báo: Thiếu thông tin xe hoặc pet`);
            return false;
        }

        console.log(`📤 Gửi thông báo record mới cho ${mapName}`);

        const notificationData = {
            title: "🎉 Kỷ lục mới được thiết lập!",
            message: `${recordData.racerName} vừa lập kỷ lục mới trên map "${mapName}" với thời gian ${recordData.timeString}!`,
            type: "record",
            target: "all",
            important: true,
            extraData: {
                mapName: mapName,
                time: recordData.timeString,
                racer: recordData.racerName,
                car: recordData.car,
                pet: recordData.pet,
                timestamp: new Date().toISOString()
            }
        };

        // Gửi thông báo
        const result = await sendNotificationToAllUsers(notificationData);

        if (result) {
            // Đánh dấu đã gửi
            SENT_NOTIFICATIONS.add(notificationKey);
            console.log(`✅ Đã gửi thông báo record: ${notificationKey}`);

            // Tự động xóa sau 30 giây để có thể gửi lại nếu cần
            setTimeout(() => {
                SENT_NOTIFICATIONS.delete(notificationKey);
            }, 30000);
        }

        return result;
    } catch (error) {
        console.error("❌ Lỗi khi gửi thông báo:", error);
        return false;
    } finally {
        // Luôn unlock sau 2 giây (tránh race condition)
        setTimeout(() => {
            notificationLocks.delete(mapName);
        }, 2000);
    }
};

// Thay thế tất cả các lời gọi sendRecordNotification bằng hàm mới

const updateMapRecord = async (mapName, recordData) => {
    try {
        console.log(`🔄 Bắt đầu cập nhật record cho ${mapName}...`);

        const map = ALL_MAPS.find(m => (m.name || "").trim() === (mapName || "").trim());
        if (!map) {
            console.log(`❌ Không tìm thấy map ${mapName} trong ALL_MAPS`);
            return false;
        }

        // KIỂM TRA XE VÀ PET CÓ ĐẦY ĐỦ KHÔNG
        const hasValidCar = recordData.car && recordData.car.trim() !== '';
        const hasValidPet = recordData.pet && recordData.pet.trim() !== '';

        if (!hasValidCar || !hasValidPet) {
            console.log(`❌ Không thể cập nhật record: Thiếu thông tin xe hoặc pet`);
            return false;
        }

        const currentRecordTime = map.recordTime || "00'00'00";
        const timeStringFormatted = secondsToTimeString(recordData.timeInSeconds);

        console.log(`📊 Thông tin record:`);
        console.log(`- Map: ${mapName}`);
        console.log(`- Tay đua: ${recordData.racerName}`);
        console.log(`- Thời gian mới: ${timeStringFormatted}`);
        console.log(`- Record hiện tại: ${currentRecordTime}`);
        console.log(`- Xe: ${recordData.car}`);
        console.log(`- Pet: ${recordData.pet}`);

        // Xử lý trường hợp chưa có record
        const isNoRecord = currentRecordTime === "00'00'00" ||
            currentRecordTime === "--'--'--" ||
            !currentRecordTime;

        if (isNoRecord) {
            console.log(`📝 Chưa có record, cập nhật record mới...`);

            await setDoc(doc(db, "gameMaps", map.id), {
                recordTime: timeStringFormatted,
                recordRacer: recordData.racerName,
                recordRacerIndex: recordData.racerIndex,
                recordCar: recordData.car,
                recordPet: recordData.pet,
                lastUpdated: new Date().toISOString()
            }, { merge: true });

            console.log(`✅ Đã cập nhật record đầu tiên`);

            // Gửi thông báo với LOCK - CHỈ GỬI 1 LẦN
            await sendRecordNotificationWithLock(mapName, recordData);
            return true;
        }

        // Nếu đã có record, so sánh
        const parseTimeToMs = (timeString) => {
            if (!timeString || timeString === "--'--'--") return Infinity;
            const parts = timeString.split("'");
            if (parts.length !== 3) return Infinity;

            const minutes = parseInt(parts[0]) || 0;
            const seconds = parseInt(parts[1]) || 0;
            const milliseconds = parseInt(parts[2]) || 0;

            return (minutes * 60 * 100) + (seconds * 100) + milliseconds;
        };

        const currentTimeMs = parseTimeToMs(currentRecordTime);
        const newTimeMs = parseTimeToMs(timeStringFormatted);

        console.log(`⚖️ So sánh: ${currentTimeMs}ms (cũ) vs ${newTimeMs}ms (mới)`);

        // CHỈ cập nhật khi tốt hơn
        if (newTimeMs < currentTimeMs) {
            console.log(`🎉 Thành tích mới tốt hơn! Cập nhật...`);

            await setDoc(doc(db, "gameMaps", map.id), {
                recordTime: timeStringFormatted,
                recordRacer: recordData.racerName,
                recordRacerIndex: recordData.racerIndex,
                recordCar: recordData.car,
                recordPet: recordData.pet,
                lastUpdated: new Date().toISOString()
            }, { merge: true });

            console.log(`✅ Đã cập nhật record mới`);

            // Gửi thông báo với LOCK - CHỈ GỬI 1 LẦN
            await sendRecordNotificationWithLock(mapName, recordData);
            return true;
        } else {
            console.log(`❌ Thành tích không tốt hơn record hiện tại`);
            return false;
        }
    } catch (error) {
        console.error("❌ Lỗi khi cập nhật record:", error);
        return false;
    }
};

// Mobile sidebar toggle
document.addEventListener('DOMContentLoaded', function () {
    const menuButton = document.querySelector('button.lg\\:hidden');
    const sidebar = document.querySelector('.sidebar-modern');
    const app = document.getElementById('app');

    if (menuButton && sidebar) {
        menuButton.addEventListener('click', function () {
            if (sidebar.classList.contains('hidden')) {
                // Mở sidebar
                sidebar.classList.remove('hidden');
                sidebar.style.transform = 'translateX(0)';

                // Thêm overlay
                const overlay = document.createElement('div');
                overlay.id = 'mobile-sidebar-overlay';
                overlay.className = 'fixed inset-0 bg-black/70 z-10 lg:hidden';
                overlay.addEventListener('click', closeSidebar);
                document.body.appendChild(overlay);

                // Ngăn scroll body
                document.body.style.overflow = 'hidden';
            } else {
                closeSidebar();
            }
        });

        function closeSidebar() {
            sidebar.classList.add('hidden');
            const overlay = document.getElementById('mobile-sidebar-overlay');
            if (overlay) {
                overlay.remove();
            }
            document.body.style.overflow = '';
        }

        // Đóng sidebar khi click vào link
        document.querySelectorAll('.sidebar-link-modern').forEach(link => {
            link.addEventListener('click', function () {
                if (window.innerWidth < 1024) {
                    closeSidebar();
                }
            });
        });

        // Đóng sidebar khi click vào nút logout
        document.getElementById('logout-btn')?.addEventListener('click', function () {
            if (window.innerWidth < 1024) {
                closeSidebar();
            }
        });
    }

    if (isAdminUser) {
        document.getElementById('configdata-link').style.display = 'flex';
    }

    // Điều chỉnh sidebar cho mobile
    function adjustSidebarForMobile() {
        if (window.innerWidth < 1024 && sidebar) {
            // Thêm styles cho sidebar mobile
            sidebar.style.position = 'fixed';
            sidebar.style.top = '0';
            sidebar.style.left = '0';
            sidebar.style.height = '100vh';
            sidebar.style.width = '280px';
            sidebar.style.zIndex = '20';
            sidebar.style.transform = 'translateX(-100%)';
            sidebar.style.transition = 'transform 0.3s ease-in-out';
        } else {
            // Reset cho desktop
            if (sidebar) {
                sidebar.style.position = '';
                sidebar.style.transform = '';
                sidebar.style.transition = '';
                sidebar.style.width = '';
            }
            const overlay = document.getElementById('mobile-sidebar-overlay');
            if (overlay) {
                overlay.remove();
            }
            document.body.style.overflow = '';
        }
    }

    // Gọi lần đầu
    adjustSidebarForMobile();

    // Theo dõi thay đổi kích thước màn hình
    window.addEventListener('resize', adjustSidebarForMobile);
});

// ================ HÀM QUẢN LÝ THÔNG BÁO ================

// Biến lưu trữ thông báo
let notifications = [];
let unreadCount = 0;

// Khởi tạo hệ thống thông báo
const initNotificationSystem = () => {
    const bellButton = document.getElementById('notification-bell');
    const dropdown = document.getElementById('notification-dropdown');
    const markAllReadButton = document.getElementById('mark-all-read');

    if (!bellButton || !dropdown) return;

    // Toggle dropdown
    bellButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');

        // Tự động đánh dấu đã đọc tất cả khi mở dropdown
        if (!dropdown.classList.contains('hidden')) {
            // Không tự động đánh dấu đã đọc nữa, để người dùng tự click
        }
    });

    // Đóng dropdown khi click ra ngoài
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !bellButton.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // Xoá tất cả thông báo
    const deleteAllButton = document.getElementById('delete-all-notifications');
    if (deleteAllButton) {
        deleteAllButton.addEventListener('click', () => {
            if (confirm("Bạn có chắc chắn muốn xoá tất cả thông báo?")) {
                deleteAllNotifications();
            }
        });
    }

    // Lấy thông báo từ Firestore
    setupNotificationListener();
};

// Cập nhật hàm setupNotificationListener
const setupNotificationListener = () => {
    if (!db) {
        console.error("Firestore chưa được khởi tạo");
        return;
    }

    // Kiểm tra nếu đã có listener
    if (window.notificationListener) {
        console.log("⚠️ Notification listener đã được thiết lập, bỏ qua");
        return;
    }

    try {
        if (!userId) {
            console.log("⚠️ Chờ userId để thiết lập lắng nghe thông báo...");
            return;
        }

        const notificationsRef = collection(db, "users", userId, "notifications");

        console.log(`🎯 Bắt đầu lắng nghe thông báo cá nhân cho user ${userId}...`);

        // Thêm debounce để tránh nhiều lần update
        let updateTimeout;

        window.notificationListener = onSnapshot(notificationsRef, (snapshot) => {
            console.log(`📨 Nhận ${snapshot.docs.length} thông báo từ Firestore`);

            // Clear timeout cũ
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }

            // Debounce: chờ 300ms trước khi update
            updateTimeout = setTimeout(() => {
                const newNotifications = [];

                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    newNotifications.push({
                        id: doc.id,
                        title: data.title || "Thông báo",
                        content: data.content || data.message || "",
                        type: data.type || "info",
                        target: data.target || "all",
                        important: data.important || false,
                        sender: data.sender || "Hệ thống",
                        senderId: data.senderId || "system",
                        read: data.read || false,
                        timestamp: data.timestamp || data.createdAt || new Date().toISOString(),
                        createdAt: data.createdAt || data.timestamp || new Date().toISOString()
                    });
                });

                // Sắp xếp theo thời gian mới nhất
                newNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                // Cập nhật notifications array
                notifications = newNotifications;

                // Cập nhật UI
                updateNotificationUI();

                console.log("✅ Đã cập nhật UI với thông báo mới");
            }, 300); // Debounce 300ms
        }, (error) => {
            console.error("❌ Lỗi khi lắng nghe thông báo:", error);
        });

        console.log("✅ Đã thiết lập notification listener thành công");
    } catch (error) {
        console.error("❌ Lỗi khi thiết lập listener thông báo:", error);
    }
};

// ĐẶC BIỆT: Cho phép người xem click vào thông báo
const notificationItems = document.querySelectorAll('.notification-item');
notificationItems.forEach(item => {
    item.style.pointerEvents = 'auto';
    item.style.cursor = 'pointer';
});

// Cập nhật UI thông báo
const updateNotificationUI = () => {
    const notificationList = document.getElementById('notification-list');
    const notificationCount = document.getElementById('notification-count');
    const notificationBell = document.getElementById('notification-bell');

    if (notificationBell) {
        if (unreadCount > 0) {
            notificationBell.classList.add('has-unread');

            // Nếu có thông báo quan trọng, thêm class đặc biệt
            const hasImportant = notifications.some(n => !n.read && n.important);
            if (hasImportant) {
                notificationBell.classList.add('important-alert');
            } else {
                notificationBell.classList.remove('important-alert');
            }
        } else {
            notificationBell.classList.remove('has-unread', 'important-alert');
        }
    }

    if (!notificationList || !notificationCount) return;

    // Đếm số thông báo chưa đọc
    unreadCount = notifications.filter(n => !n.read).length;

    // Cập nhật badge
    if (unreadCount > 0) {
        notificationCount.textContent = unreadCount > 9 ? '9+' : unreadCount;
        notificationCount.classList.remove('hidden');
        notificationCount.classList.add('notification-badge-pulse');
        notificationBell.querySelector('i').classList.add('text-yellow-400');
    } else {
        notificationCount.classList.add('hidden');
        notificationCount.classList.remove('notification-badge-pulse');
        notificationBell.querySelector('i').classList.remove('text-yellow-400');
    }

    // Hiển thị danh sách thông báo
    if (notifications.length === 0) {
        notificationList.innerHTML = `
            <div class="p-4 text-center text-slate-500">
                <i class="fas fa-bell-slash text-2xl mb-2"></i>
                <p>Không có thông báo nào</p>
            </div>
        `;
        return;
    }

    let notificationsHTML = '';

    // Cập nhật phần render trong updateNotificationUI
    notifications.forEach(notification => {
        const timeAgo = getTimeAgo(notification.timestamp);
        const icon = getNotificationIcon(notification.type);
        const iconColor = getNotificationIconColor(notification.type);

        // Thêm biểu tượng quan trọng nếu có
        const importantBadge = notification.important ?
            '<span class="ml-2 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded">!</span>' : '';

        // Thêm biểu tượng target nếu không phải "all"
        const targetBadge = notification.target && notification.target !== "all" ?
            `<span class="ml-2 text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">${notification.target.substring(0, 1).toUpperCase()}</span>` : '';

        notificationsHTML += `
<div class="notification-item ${notification.read ? 'read' : 'unread'} group" 
     data-id="${notification.id}">
    <div class="flex items-start">
        <div class="mr-3 mt-1 flex-shrink-0" onclick="handleNotificationClick('${notification.id}', event)">
            <i class="${icon} ${iconColor} text-lg"></i>
        </div>
        <div class="flex-1 min-w-0" onclick="handleNotificationClick('${notification.id}', event)">
            <div class="notification-title flex items-center justify-between">
                <span class="truncate">${notification.title}</span>
                <div class="flex items-center space-x-1 flex-shrink-0">
                    ${importantBadge}
                    ${targetBadge}
                </div>
            </div>
            <div class="notification-message text-xs text-slate-400 mt-0.5 line-clamp-2">${notification.content || notification.message || ''}</div>
            <div class="notification-time flex items-center justify-between mt-1 text-[10px]">
                <span class="text-cyan-500/70">${notification.sender || 'Hệ thống'}</span>
                <span class="text-slate-500">${timeAgo}</span>
            </div>
        </div>
        <div class="flex flex-col items-center justify-between self-stretch ml-2 flex-shrink-0">
            ${!notification.read ? `
            <div class="w-2 h-2 bg-cyan-400 rounded-full mb-2"></div>
            ` : '<div class="w-2 h-2"></div>'}
            <button onclick="deleteNotification('${notification.id}', event)" 
                    class="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1"
                    title="Xóa thông báo">
                <i class="fas fa-trash-alt text-xs"></i>
            </button>
        </div>
    </div>
</div>
`;
    });

    notificationList.innerHTML = notificationsHTML;
};

// Hàm đánh dấu thông báo đã đọc
window.markNotificationAsRead = async (notificationId) => {
    try {
        if (!userId) return;
        await setDoc(doc(db, "users", userId, "notifications", notificationId), {
            read: true
        }, { merge: true });
    } catch (error) {
        console.error("Lỗi khi đánh dấu thông báo đã đọc:", error);
    }
};

// Hàm xóa thông báo (dành riêng cho mỗi user)
window.deleteNotification = async (notificationId, event) => {
    if (event) event.stopPropagation();

    if (!confirm("Bạn có chắc chắn muốn xóa thông báo này không?")) return;

    try {
        if (!userId) return;

        // Tạo hiệu ứng fade out cho item trong UI trước khi xóa khỏi DB
        const item = document.querySelector(`.notification-item[data-id="${notificationId}"]`);
        if (item) {
            item.style.opacity = '0';
            item.style.transform = 'translateX(20px)';
            item.style.transition = 'all 0.3s ease';
        }

        // Sử dụng deleteDoc hoặc setDoc tùy theo setup Firebase của bạn, ở đây dùng setDoc xóa là ko đúng, phải xóa hẳn document
        // Nhưng vì DB của bạn đang dùng setDoc nhiều, tôi sẽ dùng hàm xóa document chuẩn của Firestore
        // Cần import deleteDoc nếu chưa có, nhưng các hàm Firestore đang dùng via import ở đầu file.
        // Tôi sẽ kiểm tra xem deleteDoc đã được import chưa.
        // GIẢ ĐỊNH: deleteDoc đã có sẵn trong scope import (nếu chưa tôi sẽ bổ sung ở bước sau)

        const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        await deleteDoc(doc(db, "users", userId, "notifications", notificationId));

        showStatusMessage("Đã xóa thông báo", false);
    } catch (error) {
        console.error("Lỗi khi xóa thông báo:", error);
        showStatusMessage("Lỗi khi xóa thông báo", true);
    }
};

// Đánh dấu tất cả thông báo đã đọc
const deleteAllNotifications = async () => {
    try {
        if (!userId) return;

        if (notifications.length === 0) {
            displayMessage("Không có thông báo nào để xoá", false);
            return;
        }

        const batch = [];

        notifications.forEach(notification => {
            const ref = doc(db, "users", userId, "notifications", notification.id);
            batch.push(deleteDoc(ref));
        });

        if (batch.length > 0) {
            await Promise.all(batch);
            displayMessage("Đã xoá tất cả thông báo", false);
        }
    } catch (error) {
        console.error("Lỗi khi xoá thông báo:", error);
        displayMessage("Lỗi khi xoá thông báo", true);
    }
};

const markAllNotificationsAsRead = async () => {
    try {
        console.log("Đánh dấu TẤT CẢ thông báo đã đọc");
        // Cho phép mọi người dùng đã đăng nhập đánh dấu thông báo của riêng họ
        if (!userId) {
            return;
        }

        const unreadNotifications = notifications.filter(n => !n.read);
        if (unreadNotifications.length === 0) {
            console.log("Không có thông báo nào chưa đọc");
            return;
        }

        // 1. Cập nhật tất cả trên Firestore
        const batch = [];
        unreadNotifications.forEach(notification => {
            const ref = doc(db, "users", userId, "notifications", notification.id);
            batch.push(setDoc(ref, { read: true }, { merge: true }));
        });

        if (batch.length > 0) {
            await Promise.all(batch);
        }

        // 2. CẬP NHẬT NGAY LẬP TỨC LOCAL STATE
        notifications.forEach(notification => {
            notification.read = true;
        });

        // 3. CẬP NHẬT UI NGAY LẬP TỨC
        updateNotificationBadge();

        // 4. Cập nhật tất cả item trong UI
        document.querySelectorAll('.notification-item.unread').forEach(item => {
            item.classList.remove('unread');
            item.classList.add('read');
            item.style.opacity = '0.7';

            const unreadIndicator = item.querySelector('.w-2.h-2.bg-cyan-400');
            if (unreadIndicator) {
                unreadIndicator.remove();
            }
        });

        // 5. Hiệu ứng feedback
        showStatusMessage(`Đã đánh dấu ${unreadNotifications.length} thông báo là đã đọc`, false);

        console.log(`Đã đánh dấu ${unreadNotifications.length} thông báo đã đọc`);
    } catch (error) {
        console.error("Lỗi khi đánh dấu tất cả thông báo đã đọc:", error);
        showStatusMessage("Lỗi khi đánh dấu thông báo đã đọc", true);
    }
};

// Cập nhật hàm getTimeAgo để xử lý timestamp
const getTimeAgo = (timestamp) => {
    if (!timestamp) return 'Vừa xong';

    const now = new Date();
    const past = new Date(timestamp);

    // Kiểm tra xem timestamp có hợp lệ không
    if (isNaN(past.getTime())) {
        return 'Vừa xong';
    }

    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) return 'Vừa xong';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} phút trước`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} giờ trước`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} ngày trước`;
    return `${Math.floor(diffInSeconds / 2592000)} tháng trước`;
};

// Hàm helper: lấy icon theo loại thông báo
// Thêm debug cho hàm getNotificationIcon
const getNotificationIcon = (type) => {
    console.log(`getNotificationIcon called with type: ${type}`);

    switch (type) {
        case 'success':
            console.log("Returning: fas fa-check-circle");
            return 'fas fa-check-circle';
        case 'warning':
            console.log("Returning: fas fa-exclamation-triangle");
            return 'fas fa-exclamation-triangle';
        case 'error':
            console.log("Returning: fas fa-times-circle");
            return 'fas fa-times-circle';
        case 'info':
            console.log("Returning: fas fa-info-circle");
            return 'fas fa-info-circle';
        case 'record':
            console.log("Returning: fas fa-trophy");
            return 'fas fa-trophy';
        case 'update':
            console.log("Returning: fas fa-sync-alt");
            return 'fas fa-sync-alt';
        default:
            console.log("Returning default: fas fa-bell");
            return 'fas fa-bell';
    }
};

// Hàm helper: lấy màu icon
const getNotificationIconColor = (type) => {
    switch (type) {
        case 'success': return 'text-green-400';
        case 'warning': return 'text-yellow-400';
        case 'error': return 'text-red-400';
        case 'record': return 'text-amber-400';
        case 'update': return 'text-cyan-400';
        default: return 'text-blue-400';
    }
};

// Thêm hiệu ứng cho icon chuông khi có thông báo mới
const animateNotificationBell = () => {
    const bell = document.getElementById('notification-bell');
    if (!bell) return;

    bell.classList.add('animate__animated', 'animate__shakeX');
    setTimeout(() => {
        bell.classList.remove('animate__animated', 'animate__shakeX');
    }, 1000);
};

// ================ HÀM XỬ LÝ MODAL THÔNG BÁO ================

// Biến lưu thông báo đang được xem
let currentNotification = null;

// Mở modal thông báo
const openNotificationModal = (notification) => {
    currentNotification = notification;

    const modal = document.getElementById('notification-modal');
    const modalIcon = document.getElementById('modal-notification-icon');
    const modalIconClass = document.getElementById('modal-icon');
    const modalTitle = document.getElementById('modal-notification-title');
    const modalMessage = document.getElementById('modal-notification-message');
    const modalTime = document.getElementById('modal-notification-time');
    const modalSender = document.getElementById('modal-sender');
    const modalExtra = document.getElementById('modal-notification-extra');
    const modalExtraContent = document.getElementById('modal-extra-content');
    const markReadBtn = document.getElementById('modal-mark-read-btn');

    if (!modal) return;

    // Xóa tất cả class modal type cũ
    modal.classList.remove('modal-success', 'modal-warning', 'modal-error', 'modal-record', 'modal-info');
    modalIcon.classList.remove('modal-icon-success', 'modal-icon-warning', 'modal-icon-error', 'modal-icon-record', 'modal-icon-info');

    // Đặt icon và màu sắc theo loại thông báo
    const icon = getNotificationIcon(notification.type);
    const iconClass = getNotificationIconColor(notification.type);

    modalIconClass.className = icon;

    // Thêm class màu sắc cho modal và icon
    switch (notification.type) {
        case 'success':
            modal.classList.add('modal-success');
            modalIcon.classList.add('modal-icon-success');
            break;
        case 'warning':
            modal.classList.add('modal-warning');
            modalIcon.classList.add('modal-icon-warning');
            break;
        case 'error':
            modal.classList.add('modal-error');
            modalIcon.classList.add('modal-icon-error');
            break;
        case 'record':
            modal.classList.add('modal-record');
            modalIcon.classList.add('modal-icon-record');
            break;
        default:
            modal.classList.add('modal-info');
            modalIcon.classList.add('modal-icon-info');
    }

    // Cập nhật nội dung
    modalTitle.textContent = notification.title;
    modalMessage.innerHTML = formatNotificationMessage(notification.message);
    modalTime.textContent = getTimeAgo(notification.createdAt);
    modalSender.textContent = notification.sentBy === 'system' ? 'Hệ thống' : notification.sentBy || 'Hệ thống';

    // Hiển thị nút "Đánh dấu đã đọc" nếu thông báo chưa đọc
    if (markReadBtn) {
        if (!notification.read) {
            markReadBtn.classList.remove('hidden');
            markReadBtn.disabled = false;
        } else {
            markReadBtn.classList.add('hidden');
            markReadBtn.disabled = true;
        }
    }

    // Xử lý thông tin bổ sung (nếu có)
    if (notification.extraData) {
        modalExtra.classList.remove('hidden');

        let extraHtml = '';
        if (notification.extraData.mapName) {
            extraHtml += `<div><i class="fas fa-map mr-2"></i> Map: ${notification.extraData.mapName}</div>`;
        }
        if (notification.extraData.time) {
            extraHtml += `<div><i class="fas fa-stopwatch mr-2"></i> Thời gian: ${notification.extraData.time}</div>`;
        }
        if (notification.extraData.racer) {
            extraHtml += `<div><i class="fas fa-user mr-2"></i> Tay đua: ${notification.extraData.racer}</div>`;
        }
        if (notification.extraData.car) {
            extraHtml += `<div><i class="fas fa-car mr-2"></i> Xe: ${notification.extraData.car}</div>`;
        }
        if (notification.extraData.pet) {
            extraHtml += `<div><i class="fas fa-paw mr-2"></i> Pet: ${notification.extraData.pet}</div>`;
        }

        modalExtraContent.innerHTML = extraHtml;
    } else {
        modalExtra.classList.add('hidden');
    }

    // Hiển thị modal
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Ngăn scroll body

    // Thêm hiệu ứng animation
    modal.classList.add('animate__animated', 'animate__fadeIn');

    // Tự động đánh dấu đã đọc sau 3 giây nếu chưa đọc
    if (!notification.read) {
        setTimeout(() => {
            markCurrentNotificationAsRead();
        }, 3000);
    }
};

// Đóng modal thông báo
window.closeNotificationModal = () => {
    const modal = document.getElementById('notification-modal');
    if (modal) {
        // Thêm hiệu ứng fade out
        modal.classList.add('animate__fadeOut');

        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('animate__fadeIn', 'animate__fadeOut');
            document.body.style.overflow = '';

            // QUAN TRỌNG: KHÔNG đánh dấu đã đọc khi người xem đóng modal
            // KHÔNG gọi markNotificationAsRead ở đây
            currentNotification = null;
        }, 300); // Thời gian cho hiệu ứng fade out
    }
};

// Sự kiện click overlay để đóng modal
document.addEventListener('click', function (e) {
    const modal = document.getElementById('notification-modal');
    if (modal && !modal.classList.contains('hidden')) {
        // Kiểm tra nếu click vào overlay (background mờ)
        if (e.target.classList.contains('bg-black/70')) {
            closeNotificationModal();
        }
    }
});

// Sự kiện phím ESC để đóng modal
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('notification-modal');
        if (modal && !modal.classList.contains('hidden')) {
            closeNotificationModal();
        }
    }
});

// Đánh dấu thông báo hiện tại đã đọc
window.markCurrentNotificationAsRead = async () => {
    // KIỂM TRA: Chỉ admin mới có quyền
    if (!isAdminUser) {
        showStatusMessage("Chỉ Admin mới có quyền đánh dấu thông báo đã đọc", true);
        return;
    }

    if (!currentNotification || currentNotification.read) return;

    try {
        await markNotificationAsRead(currentNotification.id);

        // Cập nhật UI
        const markReadBtn = document.getElementById('modal-mark-read-btn');
        if (markReadBtn) {
            markReadBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Đã đọc';
            markReadBtn.disabled = true;
            markReadBtn.classList.add('bg-gradient-to-r', 'from-slate-600', 'to-slate-700');
        }

        // Cập nhật trong danh sách
        currentNotification.read = true;
        updateNotificationUI();

        // Hiệu ứng xác nhận
        showStatusMessage("Đã đánh dấu thông báo là đã đọc", false);
    } catch (error) {
        console.error("Lỗi khi đánh dấu thông báo đã đọc:", error);
    }
};

// Format nội dung thông báo (hỗ trợ xuống dòng và HTML đơn giản)
const formatNotificationMessage = (message) => {
    if (!message) return '';

    // Thay thế xuống dòng thành <br>
    let formatted = message.replace(/\n/g, '<br>');

    // Highlight các từ khóa quan trọng
    const highlightWords = ['kỷ lục', 'record', 'mới', 'tốt nhất', 'chiến thắng', 'quan trọng', 'cảnh báo'];

    highlightWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        formatted = formatted.replace(regex, `<span class="text-cyan-300 font-bold">$&</span>`);
    });

    // Highlight thời gian (định dạng mm'ss'ms)
    const timeRegex = /(\d{2}'\d{2}'\d{2})/g;
    formatted = formatted.replace(timeRegex, `<span class="text-green-400 font-mono font-bold">$1</span>`);

    // Highlight tên map
    if (ALL_MAPS) {
        ALL_MAPS.forEach(map => {
            if (map.name && formatted.includes(map.name)) {
                formatted = formatted.replace(
                    new RegExp(map.name, 'g'),
                    `<span class="text-amber-300 font-semibold">${map.name}</span>`
                );
            }
        });
    }

    return formatted;
};


// Hàm xử lý khi click vào thông báo trong danh sách
window.handleNotificationClick = async (notificationId, event) => {
    try {
        console.log("=== Xử lý click thông báo ===");

        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        // Tìm thông báo
        const notification = notifications.find(n => n.id === notificationId);
        if (!notification) {
            console.error("Không tìm thấy notification với ID:", notificationId);
            return;
        }

        // Đánh dấu đã đọc khi click (áp dụng cho tất cả user đã đăng nhập)
        if (!notification.read) {
            console.log("📝 Đánh dấu thông báo đã đọc...");
            await window.markNotificationAsRead(notificationId);
        }

        // Đóng dropdown thông báo
        const dropdown = document.getElementById('notification-dropdown');
        if (dropdown) {
            dropdown.classList.add('hidden');
            console.log("✅ Đã đóng dropdown");
        }

        // Hiển thị modal chi tiết - NGƯỜI XEM VẪN CÓ THỂ XEM
        showNotificationDetailModal(notification);

    } catch (error) {
        console.error("❌ Lỗi trong handleNotificationClick:", error);
    }
};


// Hàm hiển thị modal chi tiết thông báo
const showNotificationDetailModal = (notification) => {
    console.log("=== Hiển thị modal chi tiết thông báo ===");
    console.log("Notification object:", notification);

    const modal = document.getElementById('notification-modal');
    console.log("Modal element exists:", !!modal);

    if (!modal) {
        console.error("❌ ERROR: Không tìm thấy modal!");
        return;
    }

    // Đảm bảo modal được hiển thị
    modal.classList.remove('hidden');

    // Lấy các phần tử
    const titleElement = document.getElementById('modal-notification-title');
    const messageElement = document.getElementById('modal-notification-message');
    const timeElement = document.getElementById('modal-notification-time');
    const senderElement = document.getElementById('modal-sender');
    const iconElement = document.getElementById('modal-icon');
    const extraContentElement = document.getElementById('modal-extra-content');
    const modalExtra = document.getElementById('modal-notification-extra');
    const modalFooter = modal.querySelector('.border-t.border-slate-800');

    // Cập nhật nội dung chính
    if (titleElement) {
        titleElement.textContent = notification.title || "Thông báo không có tiêu đề";
    }

    if (messageElement) {
        // Sử dụng content hoặc message
        let messageHtml = notification.content || notification.message || "Không có nội dung";
        // Thay thế xuống dòng bằng <br>
        messageHtml = messageHtml.replace(/\n/g, '<br>');
        messageElement.innerHTML = messageHtml;
    }

    if (timeElement) {
        timeElement.textContent = getTimeAgo(notification.timestamp) || "Vừa xong";
    }

    if (senderElement) {
        senderElement.textContent = notification.sender || "Hệ thống";
    }

    if (iconElement) {
        const iconClass = getNotificationIcon(notification.type);
        iconElement.className = iconClass;
    }

    // Cập nhật icon container màu sắc
    const iconContainer = document.getElementById('modal-notification-icon');
    if (iconContainer) {
        // Reset classes
        iconContainer.className = 'w-10 h-10 rounded-full flex items-center justify-center mr-4';

        // Thêm màu theo loại thông báo
        switch (notification.type) {
            case 'success':
                iconContainer.classList.add('bg-gradient-to-br', 'from-green-500', 'to-emerald-600');
                break;
            case 'warning':
                iconContainer.classList.add('bg-gradient-to-br', 'from-yellow-500', 'to-amber-600');
                break;
            case 'error':
                iconContainer.classList.add('bg-gradient-to-br', 'from-red-500', 'to-rose-600');
                break;
            case 'record':
                iconContainer.classList.add('bg-gradient-to-br', 'from-amber-500', 'to-orange-600');
                break;
            default:
                iconContainer.classList.add('bg-gradient-to-br', 'from-cyan-500', 'to-blue-600');
        }
    }

    // HIỂN THỊ THÔNG TIN CHI TIẾT (EXTRA DATA)
    if (extraContentElement && modalExtra) {
        let extraHtml = '';

        // Thêm các trường thông tin chi tiết
        if (notification.target && notification.target !== "all") {
            extraHtml += `
                <div class="flex items-start mb-2">
                    <i class="fas fa-bullseye text-cyan-400 mr-2 mt-0.5 w-4"></i>
                    <div>
                        <span class="text-slate-300 font-medium">Đối tượng:</span>
                        <span class="text-slate-400 ml-2">${notification.target}</span>
                    </div>
                </div>
            `;
        }

        if (notification.type) {
            extraHtml += `
                <div class="flex items-start mb-2">
                    <i class="fas ${getNotificationIcon(notification.type)} ${getNotificationIconColor(notification.type)} mr-2 mt-0.5 w-4"></i>
                    <div>
                        <span class="text-slate-300 font-medium">Loại thông báo:</span>
                        <span class="text-slate-400 ml-2">${getNotificationTypeText(notification.type)}</span>
                    </div>
                </div>
            `;
        }

        if (notification.important) {
            extraHtml += `
                <div class="flex items-start mb-2">
                    <i class="fas fa-exclamation-circle text-red-400 mr-2 mt-0.5 w-4"></i>
                    <div>
                        <span class="text-red-300 font-medium">Quan trọng:</span>
                        <span class="text-red-400 ml-2">Có</span>
                    </div>
                </div>
            `;
        }

        // Thêm trạng thái đã đọc/chưa đọc
        extraHtml += `
            <div class="flex items-start mb-2">
                <i class="fas ${notification.read ? 'fa-eye' : 'fa-eye-slash'} ${notification.read ? 'text-green-400' : 'text-yellow-400'} mr-2 mt-0.5 w-4"></i>
                <div>
                    <span class="text-slate-300 font-medium">Trạng thái:</span>
                    <span class="${notification.read ? 'text-green-400' : 'text-yellow-400'} ml-2 font-medium">
                        ${notification.read ? 'Đã đọc' : 'Chưa đọc'}
                    </span>
                </div>
            </div>
        `;

        // Thêm thời gian chi tiết
        if (notification.timestamp) {
            const date = new Date(notification.timestamp);
            const formattedDate = date.toLocaleDateString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            extraHtml += `
                <div class="flex items-start">
                    <i class="fas fa-clock text-slate-400 mr-2 mt-0.5 w-4"></i>
                    <div>
                        <span class="text-slate-300 font-medium">Thời gian gửi:</span>
                        <span class="text-slate-400 ml-2 text-xs">${formattedDate}</span>
                    </div>
                </div>
            `;
        }

        if (extraHtml) {
            extraContentElement.innerHTML = extraHtml;
            modalExtra.classList.remove('hidden');
        } else {
            modalExtra.classList.add('hidden');
        }
    }

    // Bỏ qua việc thêm viewer-note cho người xem vì User giờ có quyền đánh dấu đã đọc thông báo của chính mình


    // HIỂN THỊ NÚT "ĐÁNH DẤU ĐÃ ĐỌC" (áp dụng cho tất cả user nếu thông báo chưa đọc)
    const markReadBtn = modal.querySelector('button[onclick*="markCurrentNotificationAsRead"]');
    if (markReadBtn) {
        if (!isAdminUser && false) { // Đã gỡ bỏ điều kiện này
            // Ẩn nút cho người xem
            markReadBtn.style.display = 'none';
        } else {
            // Hiển thị nút cho admin
            markReadBtn.style.display = 'flex';

            // Cập nhật trạng thái nút
            if (notification.read) {
                markReadBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Đã đọc';
                markReadBtn.disabled = true;
                markReadBtn.classList.add('bg-gradient-to-r', 'from-slate-600', 'to-slate-700');
            } else {
                markReadBtn.innerHTML = '<i class="fas fa-check-double mr-2"></i> Đánh dấu đã đọc';
                markReadBtn.disabled = false;
                markReadBtn.classList.remove('bg-gradient-to-r', 'from-slate-600', 'to-slate-700');
            }
        }
    }

    // Thêm animation
    modal.classList.add('animate__animated', 'animate__fadeIn');

    // Ngăn scroll body
    document.body.style.overflow = 'hidden';

    console.log("✅ Modal đã được hiển thị thành công!");
};

// Hàm helper: chuyển đổi type thông báo sang text
const getNotificationTypeText = (type) => {
    switch (type) {
        case 'success':
            return "Thành công";
        case 'warning':
            return "Cảnh báo";
        case 'error':
            return "Lỗi";
        case 'record':
            return "Kỷ lục";
        case 'info':
            return "Thông tin";
        case 'update':
            return "Cập nhật";
        default:
            return "Thông báo";
    }
};

window.markNotificationAsRead = async (notificationId) => {
    try {
        console.log("🔄 Đánh dấu thông báo đã đọc:", notificationId);

        // 1. Cập nhật trên Firestore
        await setDoc(doc(db, "notifications", notificationId), {
            read: true,
            readAt: new Date().toISOString()  // Thêm timestamp đọc
        }, { merge: true });

        // 2. TÌM VÀ CẬP NHẬT TRONG LOCAL STATE
        let found = false;
        notifications = notifications.map(n => {
            if (n.id === notificationId) {
                found = true;
                return { ...n, read: true };
            }
            return n;
        });

        if (!found) {
            console.warn("⚠️ Không tìm thấy notification trong local state:", notificationId);
        } else {
            console.log("✅ Đã cập nhật local state");
        }

        // 3. CẬP NHẬT BADGE NGAY LẬP TỨC
        updateNotificationBadge();

        // 4. CẬP NHẬT UI CỦA ITEM ĐÓ
        updateNotificationItemUI(notificationId);

        // 5. Debug
        console.log("📊 Trạng thái sau khi đánh dấu đã đọc:");
        console.log("- Tổng thông báo:", notifications.length);
        console.log("- Chưa đọc:", notifications.filter(n => !n.read).length);

        return true;
    } catch (error) {
        console.error("❌ Lỗi khi đánh dấu thông báo đã đọc:", error);
        return false;
    }
};

// Hàm cập nhật badge - ĐẢM BẢO ĐÃ CÓ
const updateNotificationBadge = () => {
    const notificationCount = document.getElementById('notification-count');
    const notificationBell = document.getElementById('notification-bell');

    if (!notificationCount || !notificationBell) {
        console.warn("⚠️ Không tìm thấy notification badge elements");
        return;
    }

    // Tính số thông báo chưa đọc
    const unreadCount = notifications.filter(n => !n.read).length;

    console.log(`🔄 Cập nhật badge: ${unreadCount} thông báo chưa đọc`);

    // CHỈ HIỂN THỊ BADGE CHO ADMIN
    if (isAdminUser && unreadCount > 0) {
        notificationCount.textContent = unreadCount > 9 ? '9+' : unreadCount;
        notificationCount.classList.remove('hidden');
        notificationBell.classList.add('has-unread');

        // Kiểm tra có thông báo quan trọng không
        const hasImportantUnread = notifications.some(n => !n.read && n.important);
        if (hasImportantUnread) {
            notificationBell.classList.add('important-alert');
        } else {
            notificationBell.classList.remove('important-alert');
        }
    } else {
        // NGƯỜI XEM: không hiển thị badge số lượng
        notificationCount.classList.add('hidden');
        notificationBell.classList.remove('has-unread', 'important-alert');

        // Nhưng vẫn có thể thấy chuông có thông báo mới (không đếm số)
        const hasUnread = notifications.some(n => !n.read);
        if (hasUnread) {
            notificationBell.classList.add('has-unread');
        } else {
            notificationBell.classList.remove('has-unread');
        }
    }
};

// Hàm cập nhật UI của item
const updateNotificationItemUI = (notificationId) => {
    const notificationItem = document.querySelector(`.notification-item[data-id="${notificationId}"]`);
    if (notificationItem) {
        // Xóa class unread, thêm class read
        notificationItem.classList.remove('unread');
        notificationItem.classList.add('read');

        // Xóa indicator chưa đọc
        const unreadIndicator = notificationItem.querySelector('.w-2.h-2.bg-cyan-400');
        if (unreadIndicator) {
            unreadIndicator.remove();
        }

        // Thêm hiệu ứng visual
        notificationItem.style.opacity = '0.7';
        notificationItem.style.transition = 'opacity 0.3s';

        console.log(`✅ Đã cập nhật UI cho notification: ${notificationId}`);
    } else {
        console.warn(`⚠️ Không tìm thấy notification item với ID: ${notificationId}`);
    }
};

// Cập nhật hàm gửi thông báo với Extra Data
const sendNotificationWithExtraData = async (notificationData) => {
    try {
        const notificationId = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const notificationToSave = {
            title: notificationData.title || "Thông báo",
            content: notificationData.message || notificationData.content || "",
            type: notificationData.type || "info",
            target: notificationData.target || "all",
            important: notificationData.important || false,
            sender: userId ? "Admin" : "Hệ thống",
            senderId: userId || "system",
            read: false,
            timestamp: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        // Thêm dữ liệu bổ sung nếu có
        if (notificationData.extraData) {
            // Lưu extraData vào content hoặc một trường riêng
            notificationToSave.content += `\n\n--- THÔNG TIN CHI TIẾT ---\n`;
            Object.keys(notificationData.extraData).forEach(key => {
                notificationToSave.content += `${key}: ${notificationData.extraData[key]}\n`;
            });
        }

        await setDoc(doc(db, "notifications", notificationId), notificationToSave);

        console.log("Đã gửi thông báo:", notificationToSave);
        return true;
    } catch (error) {
        console.error("Lỗi khi gửi thông báo:", error);
        return false;
    }
};

// Cập nhật hàm gửi thông báo khi có record mới
const sendRecordNotification = async (mapName, recordData) => {
    // KIỂM TRA LẠI XE VÀ PET TRƯỚC KHI GỬI THÔNG BÁO
    if (!recordData.car || !recordData.pet || recordData.car.trim() === '' || recordData.pet.trim() === '') {
        console.error(`❌ Không thể gửi thông báo: Thiếu thông tin xe hoặc pet`);
        return false;
    }

    const notificationData = {
        title: "🎉 Kỷ lục mới được thiết lập!",
        message: `${recordData.racerName} vừa lập kỷ lục mới trên map "${mapName}" với thời gian ${recordData.timeString}!`,
        type: "record",
        extraData: {
            mapName: mapName,
            time: recordData.timeString,
            racer: recordData.racerName,
            car: recordData.car,
            pet: recordData.pet
        }
    };

    return await sendNotificationWithExtraData(notificationData);
};

// ================ COMBO SUGGESTION HELPERS ================
window.toggleComboMenu = (event, mapIndex, racerIndex, mapName) => {
    event.stopPropagation();
    const menuId = `combo-menu-${mapIndex}-${racerIndex}`;
    const menu = document.getElementById(menuId);

    // Đóng tất cả menu khác
    document.querySelectorAll('[id^="combo-menu-"]').forEach(m => {
        if (m.id !== menuId) m.classList.add('hidden');
    });

    if (menu) {
        if (menu.classList.contains('hidden')) {
            // Populate combos
            const combos = (window.MAP_COMBOS || {})[mapName.trim()] || [];
            if (combos.length === 0) {
                menu.innerHTML = `<div class="text-[10px] text-slate-500 p-2 italic text-center">Chưa có combo phổ biến cho map này</div>`;
            } else {
                let combosHtml = `<div class="text-[9px] uppercase font-bold text-slate-500 mb-2 px-2 border-b border-slate-800 pb-1">Gợi ý Combo (${mapName})</div>`;
                combos.forEach(combo => {
                    combosHtml += `
                        <button onclick="applyCombo(${mapIndex}, ${racerIndex}, '${combo.car.replace(/'/g, "\\'")}', '${combo.pet.replace(/'/g, "\\'")}')" 
                                class="w-full text-left p-2 hover:bg-slate-800 rounded mb-1 transition-colors flex flex-col group/item">
                            <div class="text-[11px] font-bold text-cyan-400 group-hover/item:text-cyan-300">${combo.car}</div>
                            <div class="text-[10px] text-pink-400 group-hover/item:text-pink-300 flex items-center gap-1">
                                <i class="fas fa-paw text-[8px]"></i> ${combo.pet}
                            </div>
                        </button>
                    `;
                });
                menu.innerHTML = combosHtml;
            }
            menu.classList.remove('hidden');
        } else {
            menu.classList.add('hidden');
        }
    }
};

window.applyCombo = (mapIndex, racerIndex, car, pet) => {
    const carInput = document.getElementById(`car-${mapIndex}-${racerIndex}`);
    const petInput = document.getElementById(`pet-${mapIndex}-${racerIndex}`);
    if (carInput) {
        carInput.value = car;
        carInput.dispatchEvent(new Event('change'));
    }
    if (petInput) {
        petInput.value = pet;
        petInput.dispatchEvent(new Event('change'));
    }

    // Đóng menu
    const menu = document.getElementById(`combo-menu-${mapIndex}-${racerIndex}`);
    if (menu) menu.classList.add('hidden');

    displayMessage(`Đã áp dụng combo cho Tay đua ${racerIndex + 1}`, false);
};

// Đóng menu khi click ra ngoài
document.addEventListener('click', (e) => {
    if (!e.target.closest('[id^="combo-menu-"]') && !e.target.closest('button[onclick^="toggleComboMenu"]')) {
        document.querySelectorAll('[id^="combo-menu-"]').forEach(m => m.classList.add('hidden'));
    }
});

initFirebase();