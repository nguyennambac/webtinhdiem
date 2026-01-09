/**
 * User Profile & Achievement System
 * Quản lý profil người dùng, achievements, thành tích
 */

class UserProfileManager {
    constructor() {
        this.currentUser = null;
        this.userStats = {};
        this.achievements = [];
        this.db = null;
        this.auth = null;
        this.init();
    }

    /**
     * Khởi tạo hệ thống
     */
    init() {
        this.setupProfileListener();
        // Lắng nghe Firebase được khởi tạo
        document.addEventListener('firebaseInitialized', (e) => {
            this.db = e.detail.db;
            this.auth = e.detail.auth;
        });
    }

    /**
     * Setup profile listener
     */
    setupProfileListener() {
        document.addEventListener('userLoaded', (e) => {
            this.currentUser = e.detail;
            this.loadUserStats();
        });
    }

    /**
     * Tạo trang profile
     */
    async createProfilePage() {
        // Load fresh data before showing profile
        await this.loadUserStats();
        
        const container = document.createElement('div');
        container.id = 'user-profile-page';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(10, 10, 15, 0.95);
            backdrop-filter: blur(10px);
            z-index: 5000;
            overflow-y: auto;
            padding: 20px;
            animation: fadeIn 0.3s ease-in-out;
        `;

        const profile = await this.buildProfileHTML();
        container.innerHTML = profile;

        document.body.appendChild(container);
        this.setupProfileInteractions(container);

        return container;
    }

    /**
     * Tạo trang edit profile
     */
    async createEditProfilePage() {
        const container = document.createElement('div');
        container.id = 'edit-profile-page';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(10, 10, 15, 0.95);
            backdrop-filter: blur(10px);
            z-index: 5001;
            overflow-y: auto;
            padding: 20px;
            animation: fadeIn 0.3s ease-in-out;
        `;

        const editForm = await this.buildEditProfileHTML();
        container.innerHTML = editForm;

        document.body.appendChild(container);
        this.setupEditProfileInteractions(container);

        return container;
    }

    /**
     * Build profile HTML
     */
    async buildProfileHTML() {
        const stats = this.userStats;
        const user = this.currentUser || window.auth?.currentUser;
        
        // Get avatar from Firestore users collection
        let avatarUrl = '';
        try {
            const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            const db = getFirestore();
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                avatarUrl = userData.photoBase64 || userData.photoURL || user.photoURL || '';
            }
        } catch (error) {
            console.log('Không thể lấy avatar:', error);
            avatarUrl = user.photoURL || '';
        }

        return `
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @media (max-width: 768px) {
                    #user-profile-page { padding: 10px !important; }
                    .profile-grid { grid-template-columns: 1fr !important; }
                    .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
                }
            </style>
            <div style="max-width: 1200px; margin: 0 auto;">
                <!-- Close button -->
                <button onclick="document.getElementById('user-profile-page').remove()" style="
                    position: fixed;
                    top: 20px;
                    right: 30px;
                    background: rgba(0, 243, 255, 0.1);
                    border: 1px solid rgba(0, 243, 255, 0.3);
                    color: var(--neon-cyan);
                    font-size: 1.5rem;
                    cursor: pointer;
                    z-index: 5001;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                " onmouseover="this.style.background='rgba(0, 243, 255, 0.2)'" onmouseout="this.style.background='rgba(0, 243, 255, 0.1)'">
                    <i class="fas fa-times"></i>
                </button>

                <!-- Profile Header -->
                <div style="
                    background: linear-gradient(135deg, rgba(0, 243, 255, 0.1), rgba(0, 102, 255, 0.05));
                    border: 1px solid rgba(0, 243, 255, 0.2);
                    border-radius: 20px;
                    padding: 30px;
                    margin-bottom: 20px;
                    display: grid;
                    grid-template-columns: auto 1fr auto;
                    gap: 20px;
                    align-items: center;
                " class="profile-grid">
                    <div style="
                        width: 100px;
                        height: 100px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, var(--neon-cyan), var(--neon-blue));
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 2.5rem;
                        overflow: hidden;
                        flex-shrink: 0;
                        position: relative;
                    ">
                        ${avatarUrl && !avatarUrl.startsWith('custom_avatar_') ? 
                            `<img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <i class="fas fa-user" style="display: none;"></i>` :
                            `<i class="fas fa-user"></i>`
                        }
                    </div>

                    <div style="min-width: 0;">
                        <h2 style="margin: 0 0 10px 0; font-size: 1.8rem; color: var(--neon-cyan); word-break: break-word;">
                            ${user?.displayName || 'Người dùng'}
                        </h2>
                        <p style="margin: 5px 0; color: #cbd5e0; font-size: 0.9rem;">
                            📧 ${user?.email || 'N/A'}
                        </p>
                        <p style="margin: 5px 0; color: #cbd5e0; font-size: 0.85rem;">
                            🎮 ID: ${user?.uid?.substring(0, 12)}...
                        </p>
                        <p style="margin: 5px 0; color: var(--neon-green); font-size: 0.85rem;">
                            ✓ Tham gia từ ${user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('vi-VN') : 'N/A'}
                        </p>
                    </div>

                    <button onclick="userProfileManager.createEditProfilePage()" style="
                        background: linear-gradient(135deg, var(--neon-cyan), var(--neon-blue));
                        border: none;
                        color: white;
                        padding: 12px 24px;
                        border-radius: 10px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        white-space: nowrap;
                    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 5px 20px rgba(0, 243, 255, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        <i class="fas fa-edit mr-2"></i>Chỉnh sửa
                    </button>
                </div>

                <!-- Stats Grid -->
                <div style="
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                " class="stats-grid">
                    ${this.buildStatCard('🏆', 'Vị trí cao nhất', stats.topPosition || '—')}
                    ${this.buildStatCard('🎯', 'Độ chính xác', stats.accuracy || '—%')}
                    ${this.buildStatCard('📊', 'Tỷ lệ thắng', stats.winRate || '—%')}
                    ${this.buildStatCard('🌟', 'Tổng điểm', stats.totalPoints || 0)}
                    ${this.buildStatCard('🔥', 'Chuỗi hiện tại', stats.streak || 0)}
                </div>

                <!-- Achievements Section -->
                <div style="margin-bottom: 20px;">
                    <h3 style="
                        margin: 0 0 15px 0;
                        color: var(--neon-cyan);
                        font-size: 1.3rem;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    ">
                        <i class="fas fa-trophy"></i> Thành tích
                    </h3>
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                        gap: 15px;
                    ">
                        ${this.buildAchievements()}
                    </div>
                </div>

                <!-- Favorite Cars & Pets -->
                <div style="
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 20px;
                " class="profile-grid">
                    <div>
                        <h4 style="color: var(--neon-cyan); margin: 0 0 15px 0; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-car"></i> Xe yêu thích
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${stats.favoriteCars?.slice(0, 3).map(car => `
                                <div style="
                                    background: rgba(0, 243, 255, 0.05);
                                    border-left: 3px solid var(--neon-cyan);
                                    padding: 12px;
                                    border-radius: 6px;
                                ">
                                    ${car.name} <span style="color: #718096;">(${car.uses} lần)</span>
                                </div>
                            `).join('') || '<div style="color: #718096; padding: 12px;">Chưa có dữ liệu</div>'}
                        </div>
                    </div>

                    <div>
                        <h4 style="color: var(--neon-cyan); margin: 0 0 15px 0; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-paw"></i> Thú cưng yêu thích
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${stats.favoritePets?.slice(0, 3).map(pet => `
                                <div style="
                                    background: rgba(0, 243, 255, 0.05);
                                    border-left: 3px solid var(--neon-cyan);
                                    padding: 12px;
                                    border-radius: 6px;
                                ">
                                    ${pet.name} <span style="color: #718096;">(${pet.uses} lần)</span>
                                </div>
                            `).join('') || '<div style="color: #718096; padding: 12px;">Chưa có dữ liệu</div>'}
                        </div>
                    </div>
                </div>

                <!-- Record Maps Section -->
                ${stats.recordMaps && stats.recordMaps.length > 0 ? `
                <div style="margin-bottom: 20px;">
                    <h3 style="
                        margin: 0 0 15px 0;
                        color: var(--neon-cyan);
                        font-size: 1.3rem;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    ">
                        <i class="fas fa-crown"></i> Kỷ lục bản đồ đang nắm giữ
                    </h3>
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                        gap: 15px;
                    ">
                        ${stats.recordMaps.map(map => `
                            <div style="
                                background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.05));
                                border: 2px solid rgba(255, 215, 0, 0.3);
                                border-radius: 12px;
                                padding: 16px;
                                transition: all 0.3s ease;
                            " onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(255, 215, 0, 0.2)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                                <div style="
                                    display: flex;
                                    align-items: center;
                                    gap: 10px;
                                    margin-bottom: 12px;
                                ">
                                    <div style="
                                        font-size: 1.5rem;
                                        background: linear-gradient(135deg, #FFD700, #FFA500);
                                        -webkit-background-clip: text;
                                        -webkit-text-fill-color: transparent;
                                        background-clip: text;
                                    ">🏆</div>
                                    <div style="
                                        font-size: 1.1rem;
                                        font-weight: bold;
                                        color: #FFD700;
                                    ">${map.name}</div>
                                </div>
                                <div style="
                                    display: flex;
                                    flex-direction: column;
                                    gap: 8px;
                                    font-size: 0.9rem;
                                ">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <i class="fas fa-stopwatch" style="color: #FFD700; width: 20px;"></i>
                                        <span style="color: #cbd5e0;">Thời gian: <strong style="color: #FFD700;">${map.recordTime}</strong></span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <i class="fas fa-car" style="color: #FFD700; width: 20px;"></i>
                                        <span style="color: #cbd5e0;">Xe: <strong style="color: #FFD700;">${map.recordCar}</strong></span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <i class="fas fa-paw" style="color: #FFD700; width: 20px;"></i>
                                        <span style="color: #cbd5e0;">Thú cưng: <strong style="color: #FFD700;">${map.recordPet}</strong></span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Build edit profile HTML
     */
    async buildEditProfileHTML() {
        const user = this.currentUser || window.auth?.currentUser;
        
        // Get avatar from Firestore users collection
        let avatarUrl = '';
        try {
            const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            const db = getFirestore();
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                avatarUrl = userData.photoBase64 || userData.photoURL || user.photoURL || '';
            }
        } catch (error) {
            console.log('Không thể lấy avatar:', error);
            avatarUrl = user.photoURL || '';
        }
        
        return `
            <style>
                .edit-profile-input {
                    width: 100%;
                    padding: 12px 16px;
                    background: rgba(18, 18, 26, 0.7);
                    border: 1px solid rgba(0, 243, 255, 0.2);
                    border-radius: 10px;
                    color: #e2e8f0;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                }
                .edit-profile-input:focus {
                    outline: none;
                    border-color: var(--neon-cyan);
                    box-shadow: 0 0 0 3px rgba(0, 243, 255, 0.1);
                }
                .edit-profile-label {
                    display: block;
                    color: var(--neon-cyan);
                    font-weight: 600;
                    margin-bottom: 8px;
                    font-size: 0.95rem;
                }
                @media (max-width: 768px) {
                    #edit-profile-page { padding: 10px !important; }
                }
            </style>
            <div style="max-width: 800px; margin: 0 auto;">
                <!-- Header -->
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 30px;
                ">
                    <h2 style="
                        margin: 0;
                        font-size: 2rem;
                        color: var(--neon-cyan);
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    ">
                        <i class="fas fa-user-edit"></i> Chỉnh sửa hồ sơ
                    </h2>
                    <button onclick="document.getElementById('edit-profile-page').remove()" style="
                        background: rgba(255, 0, 0, 0.1);
                        border: 1px solid rgba(255, 0, 0, 0.3);
                        color: #ff4444;
                        font-size: 1.5rem;
                        cursor: pointer;
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.3s ease;
                    " onmouseover="this.style.background='rgba(255, 0, 0, 0.2)'" onmouseout="this.style.background='rgba(255, 0, 0, 0.1)'">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Edit Form -->
                <form id="edit-profile-form" style="
                    background: linear-gradient(135deg, rgba(0, 243, 255, 0.05), rgba(0, 102, 255, 0.02));
                    border: 1px solid rgba(0, 243, 255, 0.2);
                    border-radius: 20px;
                    padding: 30px;
                ">
                    <!-- Avatar Section -->
                    <div style="text-align: center; margin-bottom: 30px;">
                        <div style="
                            width: 120px;
                            height: 120px;
                            border-radius: 50%;
                            background: linear-gradient(135deg, var(--neon-cyan), var(--neon-blue));
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 3rem;
                            overflow: hidden;
                            margin: 0 auto 15px;
                            position: relative;
                            cursor: pointer;
                            transition: all 0.3s ease;
                        " id="avatar-preview" onclick="document.getElementById('avatar-input').click()" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                            ${avatarUrl && !avatarUrl.startsWith('custom_avatar_') ? 
                                `<img src="${avatarUrl}" style="width: 100%; height: 100%; object-fit: cover;" id="avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                <i class="fas fa-user" style="display: none;" id="avatar-icon"></i>` :
                                `<i class="fas fa-user" id="avatar-icon"></i>`
                            }
                            <div style="
                                position: absolute;
                                bottom: 0;
                                right: 0;
                                background: var(--neon-cyan);
                                width: 35px;
                                height: 35px;
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                border: 3px solid #0a0a0f;
                            ">
                                <i class="fas fa-camera" style="color: #0a0a0f;"></i>
                            </div>
                        </div>
                        <input type="file" id="avatar-input" accept="image/*" style="display: none;">
                        <p style="color: #cbd5e0; font-size: 0.9rem;">Nhấp vào ảnh đại diện để thay đổi</p>
                    </div>

                    <!-- Display Name -->
                    <div style="margin-bottom: 20px;">
                        <label class="edit-profile-label">
                            <i class="fas fa-signature mr-2"></i>Tên hiển thị
                        </label>
                        <input type="text" id="edit-display-name" class="edit-profile-input" 
                            value="${user?.displayName || ''}" placeholder="Nhập tên hiển thị">
                    </div>

                    <!-- Email (readonly) -->
                    <div style="margin-bottom: 20px;">
                        <label class="edit-profile-label">
                            <i class="fas fa-envelope mr-2"></i>Email
                        </label>
                        <input type="email" class="edit-profile-input" 
                            value="${user?.email || ''}" readonly style="opacity: 0.6; cursor: not-allowed;">
                        <p style="color: #718096; font-size: 0.85rem; margin-top: 5px;">
                            <i class="fas fa-info-circle mr-1"></i>Email không thể thay đổi
                        </p>
                    </div>

                    <!-- Bio -->
                    <div style="margin-bottom: 20px;">
                        <label class="edit-profile-label">
                            <i class="fas fa-pen mr-2"></i>Giới thiệu bản thân
                        </label>
                        <textarea id="edit-bio" class="edit-profile-input" rows="4" 
                            placeholder="Viết vài dòng về bạn...">${this.userStats.bio || ''}</textarea>
                    </div>

                    <!-- Social Links -->
                    <div style="margin-bottom: 20px;">
                        <label class="edit-profile-label">
                            <i class="fab fa-facebook mr-2"></i>Facebook
                        </label>
                        <input type="url" id="edit-facebook" class="edit-profile-input" 
                            value="${this.userStats.socialLinks?.facebook || ''}" 
                            placeholder="https://facebook.com/yourprofile">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label class="edit-profile-label">
                            <i class="fab fa-youtube mr-2"></i>YouTube
                        </label>
                        <input type="url" id="edit-youtube" class="edit-profile-input" 
                            value="${this.userStats.socialLinks?.youtube || ''}" 
                            placeholder="https://youtube.com/@yourchannel">
                    </div>

                    <!-- Buttons -->
                    <div style="
                        display: flex;
                        gap: 15px;
                        margin-top: 30px;
                        justify-content: flex-end;
                    ">
                        <button type="button" onclick="document.getElementById('edit-profile-page').remove()" style="
                            background: rgba(100, 100, 120, 0.2);
                            border: 1px solid rgba(100, 100, 120, 0.3);
                            color: #cbd5e0;
                            padding: 12px 30px;
                            border-radius: 10px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s ease;
                        " onmouseover="this.style.background='rgba(100, 100, 120, 0.3)'" onmouseout="this.style.background='rgba(100, 100, 120, 0.2)'">
                            <i class="fas fa-times mr-2"></i>Hủy
                        </button>
                        <button type="submit" style="
                            background: linear-gradient(135deg, var(--neon-cyan), var(--neon-blue));
                            border: none;
                            color: white;
                            padding: 12px 30px;
                            border-radius: 10px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s ease;
                        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 5px 20px rgba(0, 243, 255, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            <i class="fas fa-save mr-2"></i>Lưu thay đổi
                        </button>
                    </div>
                </form>
            </div>
        `;
    }

    /**
     * Setup edit profile interactions
     */
    setupEditProfileInteractions(container) {
        const form = container.querySelector('#edit-profile-form');
        const avatarInput = container.querySelector('#avatar-input');
        const avatarPreview = container.querySelector('#avatar-preview');
        
        // Handle avatar upload with cropping
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 2 * 1024 * 1024) {
                alert('Kích thước file không được vượt quá 2MB');
                return;
            }

            if (!file.type.startsWith('image/')) {
                alert('Vui lòng chọn file ảnh');
                return;
            }

            try {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.showCropModal(e.target.result, avatarPreview);
                };
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('Lỗi khi xử lý ảnh:', error);
                alert('Lỗi khi xử lý ảnh. Vui lòng thử lại.');
            }
        });

        // Handle form submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveProfileChanges(container);
        });
    }

    /**
     * Show crop modal
     */
    showCropModal(imageData, previewElement) {
        // Create crop modal
        const modal = document.createElement('div');
        modal.id = 'profile-crop-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;

        modal.innerHTML = `
            <div style="
                background: var(--card-bg);
                border: 1px solid rgba(0, 243, 255, 0.3);
                border-radius: 20px;
                padding: 30px;
                max-width: 800px;
                width: 100%;
                max-height: 90vh;
                overflow-y: auto;
            ">
                <h3 style="color: var(--neon-cyan); font-size: 1.5rem; margin-bottom: 20px; text-align: center;">
                    <i class="fas fa-crop-alt mr-2"></i>Cắt ảnh đại diện
                </h3>
                
                <div style="margin-bottom: 20px; max-height: 400px; overflow: hidden;">
                    <img id="profile-crop-image" src="${imageData}" style="max-width: 100%; display: block;">
                </div>

                <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; justify-content: center;">
                    <button onclick="userProfileManager.rotateCropImage()" style="
                        background: rgba(0, 243, 255, 0.1);
                        border: 1px solid var(--neon-cyan);
                        color: var(--neon-cyan);
                        padding: 8px 16px;
                        border-radius: 8px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-redo mr-2"></i>Quay
                    </button>
                    <button onclick="userProfileManager.flipCropImageH()" style="
                        background: rgba(0, 243, 255, 0.1);
                        border: 1px solid var(--neon-cyan);
                        color: var(--neon-cyan);
                        padding: 8px 16px;
                        border-radius: 8px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-arrows-alt-h mr-2"></i>Lật ngang
                    </button>
                    <button onclick="userProfileManager.flipCropImageV()" style="
                        background: rgba(0, 243, 255, 0.1);
                        border: 1px solid var(--neon-cyan);
                        color: var(--neon-cyan);
                        padding: 8px 16px;
                        border-radius: 8px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-arrows-alt-v mr-2"></i>Lật dọc
                    </button>
                </div>

                <div style="display: flex; gap: 15px; justify-content: center;">
                    <button onclick="userProfileManager.closeCropModal()" style="
                        background: rgba(100, 100, 120, 0.2);
                        border: 1px solid rgba(100, 100, 120, 0.3);
                        color: #cbd5e0;
                        padding: 12px 30px;
                        border-radius: 10px;
                        cursor: pointer;
                        font-weight: 600;
                    ">
                        <i class="fas fa-times mr-2"></i>Hủy
                    </button>
                    <button onclick="userProfileManager.applyCrop()" style="
                        background: linear-gradient(135deg, var(--neon-cyan), var(--neon-blue));
                        border: none;
                        color: white;
                        padding: 12px 30px;
                        border-radius: 10px;
                        cursor: pointer;
                        font-weight: 600;
                    ">
                        <i class="fas fa-check mr-2"></i>Áp dụng
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // Initialize Cropper
        const cropImage = document.getElementById('profile-crop-image');
        cropImage.onload = () => {
            if (this.cropperInstance) {
                this.cropperInstance.destroy();
            }
            this.cropperInstance = new Cropper(cropImage, {
                aspectRatio: 1,
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

        // Store preview element reference
        this.avatarPreviewElement = previewElement;
    }

    /**
     * Close crop modal
     */
    closeCropModal() {
        const modal = document.getElementById('profile-crop-modal');
        if (modal) {
            modal.remove();
        }
        document.body.style.overflow = '';
        
        if (this.cropperInstance) {
            this.cropperInstance.destroy();
            this.cropperInstance = null;
        }
    }

    /**
     * Rotate crop image
     */
    rotateCropImage() {
        if (this.cropperInstance) {
            this.cropperInstance.rotate(45);
        }
    }

    /**
     * Flip crop image horizontally
     */
    flipCropImageH() {
        if (this.cropperInstance) {
            const data = this.cropperInstance.getData();
            this.cropperInstance.setData({
                ...data,
                scaleX: (data.scaleX || 1) * -1
            });
        }
    }

    /**
     * Flip crop image vertically
     */
    flipCropImageV() {
        if (this.cropperInstance) {
            const data = this.cropperInstance.getData();
            this.cropperInstance.setData({
                ...data,
                scaleY: (data.scaleY || 1) * -1
            });
        }
    }

    /**
     * Apply crop
     */
    async applyCrop() {
        if (!this.cropperInstance) return;

        try {
            const canvas = this.cropperInstance.getCroppedCanvas({
                maxWidth: 300,
                maxHeight: 300,
                fillColor: '#0a0a0f',
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            // Convert to Base64 with optimal quality
            let quality = 0.8;
            let base64 = canvas.toDataURL('image/jpeg', quality);

            // Reduce quality if still too large
            while (base64.length > 1000000 && quality > 0.1) {
                quality -= 0.1;
                base64 = canvas.toDataURL('image/jpeg', quality);
            }

            console.log('✅ Đã crop ảnh thành công, kích thước:', base64.length, 'bytes');

            // Update preview
            if (this.avatarPreviewElement) {
                const img = this.avatarPreviewElement.querySelector('#avatar-img');
                const icon = this.avatarPreviewElement.querySelector('#avatar-icon');
                
                if (img) {
                    img.src = base64;
                    img.style.display = 'block';
                    if (icon) icon.style.display = 'none';
                } else {
                    this.avatarPreviewElement.innerHTML = `
                        <img src="${base64}" style="width: 100%; height: 100%; object-fit: cover;" id="avatar-img">
                        <div style="
                            position: absolute;
                            bottom: 0;
                            right: 0;
                            background: var(--neon-cyan);
                            width: 35px;
                            height: 35px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border: 3px solid #0a0a0f;
                        ">
                            <i class="fas fa-camera" style="color: #0a0a0f;"></i>
                        </div>
                    `;
                }
            }

            // Store Base64 for saving
            this.selectedAvatarBase64 = base64;

            // Close modal
            this.closeCropModal();

            if (window.notificationSystem) {
                window.notificationSystem.addNotification({
                    type: 'success',
                    title: 'Thành công',
                    message: 'Cắt ảnh thành công! Nhấn "Lưu thay đổi" để cập nhật.'
                });
            }

        } catch (error) {
            console.error('Lỗi khi crop ảnh:', error);
            alert('Lỗi khi cắt ảnh. Vui lòng thử lại.');
        }
    }

    /**
     * Save profile changes
     */
    async saveProfileChanges(container) {
        try {
            const displayName = container.querySelector('#edit-display-name').value.trim();
            const bio = container.querySelector('#edit-bio').value.trim();
            const facebook = container.querySelector('#edit-facebook').value.trim();
            const youtube = container.querySelector('#edit-youtube').value.trim();

            if (!displayName) {
                alert('Vui lòng nhập tên hiển thị!');
                return;
            }

            // Show loading
            const submitBtn = container.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Đang lưu...';
            submitBtn.disabled = true;

            // Import Firebase modules
            const { getFirestore, doc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            const { getAuth, updateProfile } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
            
            const auth = getAuth();
            const db = getFirestore();
            const user = auth.currentUser;

            if (!user) {
                alert('Không tìm thấy người dùng!');
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
                return;
            }

            let photoBase64 = null;
            let photoURLForAuth = user.photoURL || 'logoWS.png';

            // Handle avatar upload if changed
            if (this.selectedAvatarBase64) {
                try {
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Đang xử lý ảnh...';

                    photoBase64 = this.selectedAvatarBase64;
                    
                    console.log('✅ Sử dụng ảnh đã nén, kích thước:', photoBase64.length, 'bytes');

                    // Check Base64 size (Firestore limit ~1MB per field)
                    if (photoBase64.length > 1000000) {
                        alert('Ảnh vẫn quá lớn sau nén. Vui lòng chọn ảnh khác.');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnText;
                        return;
                    }

                    // Set simple URL for Auth (just a marker)
                    photoURLForAuth = `custom_avatar_${user.uid}`;

                    // Clear temp variable
                    delete this.selectedAvatarBase64;
                } catch (uploadError) {
                    console.error('Lỗi khi xử lý ảnh:', uploadError);
                    alert('Lỗi khi xử lý ảnh. Vui lòng thử lại.');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                    return;
                }
            }

            // Update Firebase Auth profile
            await updateProfile(user, {
                displayName: displayName,
                photoURL: photoURLForAuth
            });

            // Prepare data for Firestore
            const userDataToSave = {
                displayName: displayName,
                photoURL: photoURLForAuth,
                bio: bio,
                socialLinks: {
                    facebook: facebook,
                    youtube: youtube
                },
                updatedAt: new Date().toISOString()
            };

            // If have new Base64 image, save separately
            if (photoBase64) {
                userDataToSave.photoBase64 = photoBase64;
            }

            // Update Firestore
            await setDoc(doc(db, "users", user.uid), userDataToSave, { merge: true });

            // Update local state
            this.currentUser = {
                ...this.currentUser,
                displayName: displayName,
                photoURL: photoURLForAuth
            };
            this.userStats.bio = bio;
            this.userStats.socialLinks = { facebook, youtube };

            // Show success message
            if (window.notificationSystem) {
                window.notificationSystem.addNotification({
                    type: 'success',
                    title: 'Thành công',
                    message: 'Cập nhật hồ sơ thành công!'
                });
            } else {
                alert('Cập nhật hồ sơ thành công!');
            }

            // Close edit page and refresh profile
            container.remove();
            
            // Refresh profile page if it's open
            const profilePage = document.getElementById('user-profile-page');
            if (profilePage) {
                profilePage.remove();
                await this.createProfilePage();
            }

            // Update header avatar and display name
            const avatarSrc = photoBase64 || photoURLForAuth;
            const avatarElements = document.querySelectorAll('#user-avatar');
            avatarElements.forEach(el => {
                if (avatarSrc && !avatarSrc.startsWith('custom_avatar_')) {
                    el.src = avatarSrc;
                }
            });

            // Update display name in header
            const displayNameEl = document.getElementById('user-display-name');
            if (displayNameEl) {
                displayNameEl.textContent = displayName;
            }

        } catch (error) {
            console.error('Lỗi khi lưu hồ sơ:', error);
            alert('Có lỗi xảy ra: ' + error.message);
            
            // Restore button
            const submitBtn = container.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Lưu thay đổi';
                submitBtn.disabled = false;
            }
        }
    }
    buildStatCard(icon, label, value) {
        return `
            <div style="
                background: rgba(18, 18, 26, 0.7);
                border: 1px solid rgba(0, 243, 255, 0.1);
                border-radius: 12px;
                padding: 20px;
                text-align: center;
                transition: all 0.3s ease;
            " onmouseover="this.style.borderColor='rgba(0, 243, 255, 0.3)'; this.style.transform='translateY(-4px)'" onmouseout="this.style.borderColor='rgba(0, 243, 255, 0.1)'; this.style.transform='translateY(0)'">
                <div style="font-size: 1.8rem; margin-bottom: 8px;">${icon}</div>
                <div style="color: #cbd5e0; font-size: 0.9rem; margin-bottom: 8px;">${label}</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: var(--neon-cyan);">${value}</div>
            </div>
        `;
    }

    /**
     * Build achievements
     */
    buildAchievements() {
        const allAchievements = [
            { id: 'first-race', name: 'Lần đầu tiên', icon: '🚀', unlocked: true },
            { id: 'top-10', name: 'Top 10', icon: '🏆', unlocked: this.userStats.topPosition?.includes('10') },
            { id: 'win-streak-5', name: 'Streak 5', icon: '🔥', unlocked: (this.userStats.streak || 0) >= 5 },
            { id: 'perfect-race', name: 'Chạy tuyệt vời', icon: '⭐', unlocked: false },
            { id: 'collector', name: 'Người sưu tập', icon: '🎁', unlocked: (this.userStats.totalRaces || 0) >= 50 },
            { id: 'legend', name: 'Huyền thoại', icon: '👑', unlocked: (this.userStats.totalPoints || 0) >= 1000 }
        ];

        return allAchievements.map(ach => `
            <div style="
                text-align: center;
                padding: 15px;
                background: ${ach.unlocked ? 'rgba(0, 243, 255, 0.1)' : 'rgba(100, 100, 120, 0.2)'};
                border: 1px solid ${ach.unlocked ? 'rgba(0, 243, 255, 0.3)' : 'rgba(100, 100, 120, 0.3)'};
                border-radius: 12px;
                transition: all 0.3s ease;
                opacity: ${ach.unlocked ? 1 : 0.5};
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                <div style="font-size: 2rem; margin-bottom: 8px;">${ach.icon}</div>
                <div style="
                    color: ${ach.unlocked ? 'var(--neon-cyan)' : '#718096'};
                    font-size: 0.85rem;
                    font-weight: 600;
                ">
                    ${ach.name}
                </div>
                ${ach.unlocked ? `
                    <div style="color: var(--neon-green); font-size: 0.75rem; margin-top: 4px;">✓ Mở khoá</div>
                ` : `
                    <div style="color: #718096; font-size: 0.75rem; margin-top: 4px;">Khoá</div>
                `}
            </div>
        `).join('');
    }

    /**
     * Setup profile interactions
     */
    setupProfileInteractions(container) {
        // Add event listeners here
    }

    /**
     * Load record maps for user
     */
    async loadRecordMaps(userNickname) {
        try {
            const { getFirestore, collection, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            const db = getFirestore();
            
            console.log('🏆 Đang tìm bản đồ kỷ lục cho:', userNickname);
            
            const mapsSnapshot = await getDocs(collection(db, "gameMaps"));
            
            if (mapsSnapshot.empty) {
                console.log('⚠️ Không có gameMaps trong Firestore');
                return [];
            }
            
            const recordMaps = [];
            mapsSnapshot.forEach(doc => {
                const mapData = doc.data();
                
                // Kiểm tra xem người dùng có nắm giữ kỷ lục không
                if (mapData.recordRacer === userNickname) {
                    recordMaps.push({
                        id: doc.id,
                        name: mapData.name || doc.id,
                        recordTime: mapData.recordTime || '—',
                        recordCar: mapData.recordCar || '—',
                        recordPet: mapData.recordPet || '—',
                        recordRacer: mapData.recordRacer
                    });
                }
            });
            
            console.log(`🎯 Tìm thấy ${recordMaps.length} bản đồ có kỷ lục`);
            return recordMaps;
        } catch (error) {
            console.error('❌ Lỗi khi tải record maps:', error);
            return [];
        }
    }

    /**
     * Load user stats
     */
    async loadUserStats() {
        try {
            // Get current user from Firebase Auth or window.auth
            let user = this.currentUser;
            
            if (!user && window.auth && window.auth.currentUser) {
                user = window.auth.currentUser;
                this.currentUser = user;
            }
            
            if (!user) {
                console.warn('⚠️ Không tìm thấy user đang đăng nhập');
                this.userStats = this.getPlaceholderStats();
                if (window.notificationSystem) {
                    window.notificationSystem.addNotification({
                        type: 'warning',
                        title: 'Thông báo',
                        message: 'Vui lòng đăng nhập để xem hồ sơ cá nhân'
                    });
                }
                return;
            }

            console.log('👤 User hiện tại:', user.displayName || user.email);
            console.log('✅ Người dùng có quyền truy cập hồ sơ cá nhân');

            // Import Firestore functions
            const { getFirestore, doc, getDoc, collection, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            const db = getFirestore();
            const userId = user.uid;

            // Load user profile data from Firestore and get nickname
            let userNickname = '';
            try {
                const userDoc = await getDoc(doc(db, "users", userId));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    this.userStats.bio = userData.bio || '';
                    this.userStats.socialLinks = userData.socialLinks || {};
                    userNickname = userData.nickname || user.displayName || '';
                    console.log('✅ Đã tải user profile từ Firestore');
                    console.log('🏷️ Nickname:', userNickname);
                    console.log('✅ Người dùng bình thường có đầy đủ quyền truy cập và chỉnh sửa hồ sơ');
                }
            } catch (error) {
                console.log('⚠️ Không thể tải profile data:', error);
                // Vẫn tiếp tục với displayName nếu có lỗi
                userNickname = user.displayName || '';
                console.log('ℹ️ Sử dụng displayName thay thế:', userNickname);
            }

            if (!userNickname) {
                console.warn('⚠️ Không tìm thấy nickname, dùng displayName');
                userNickname = user.displayName || '';
            }
            
            // Load record maps
            const recordMaps = await this.loadRecordMaps(userNickname);
            this.userStats.recordMaps = recordMaps;

            // Get all race records and filter by nickname
            const recordsSnapshot = await getDocs(collection(db, "raceRecords"));
            
            if (recordsSnapshot.empty) {
                console.log('⚠️ Không có race records trong Firestore');
                
                // Fallback: Try to get data from localStorage
                const localRaces = this.loadFromLocalStorage(userNickname);
                if (localRaces.length > 0) {
                    console.log('📦 Sử dụng dữ liệu từ localStorage');
                    this.calculateStatsFromRaces(localRaces);
                    return;
                }
                
                console.log('❌ Không có dữ liệu, hiển thị placeholder');
                this.userStats = this.getPlaceholderStats();
                return;
            }

            // Filter records by racerName matching user's nickname
            const allRecords = recordsSnapshot.docs.map(doc => doc.data());
            
            console.log(`📊 Tổng số records trong Firestore: ${allRecords.length}`);
            console.log(`🔎 Đang tìm records cho nickname: "${userNickname}"`);
            
            // List unique racerNames for debugging
            const uniqueRacers = [...new Set(allRecords.map(r => r.racerName))];
            console.log('👥 Danh sách tay đua có trong DB:', uniqueRacers);
            
            const userRecords = allRecords.filter(r => {
                const match = r.racerName === userNickname;
                if (match) console.log('✓ Found match:', r.racerName);
                return match;
            });

            console.log(`📊 Tìm thấy ${userRecords.length} records cho ${userNickname}`);

            if (userRecords.length === 0) {
                console.log('⚠️ Không tìm thấy records trong Firestore, thử localStorage');
                // Try localStorage as fallback
                const localRaces = this.loadFromLocalStorage(userNickname);
                if (localRaces.length > 0) {
                    console.log('📦 Sử dụng dữ liệu từ localStorage');
                    this.calculateStatsFromRaces(localRaces);
                    return;
                }
                
                console.log('❌ Không có dữ liệu, hiển thị placeholder');
                this.userStats = this.getPlaceholderStats();
                return;
            }

            // Calculate stats from records
            this.calculateStatsFromRaces(userRecords);

        } catch (error) {
            console.error('❌ Lỗi khi tải thống kê:', error);
            this.userStats = this.getPlaceholderStats();
        }
    }

    /**
     * Load data from localStorage
     */
    loadFromLocalStorage(userNickname) {
        try {
            const allRaces = JSON.parse(localStorage.getItem('allRaces') || '[]');
            
            if (!userNickname) {
                console.log('⚠️ Không có nickname để tìm trong localStorage');
                return [];
            }
            
            // Filter races by user's nickname
            const userRaces = [];
            allRaces.forEach(race => {
                if (race.maps) {
                    race.maps.forEach(map => {
                        if (map.racers) {
                            map.racers.forEach((racer, index) => {
                                if (racer.name === userNickname && racer.time) {
                                    userRaces.push({
                                        racerName: racer.name,
                                        timeString: racer.time,
                                        car: racer.car || '',
                                        pet: racer.pet || '',
                                        position: index + 1,
                                        points: racer.points || 0
                                    });
                                }
                            });
                        }
                    });
                }
            });
            
            console.log(`📦 Tìm thấy ${userRaces.length} races từ localStorage cho nickname: ${userNickname}`);
            return userRaces;
        } catch (error) {
            console.error('Lỗi khi đọc localStorage:', error);
            return [];
        }
    }

    /**
     * Calculate stats from race records
     */
    calculateStatsFromRaces(records) {
        const totalRaces = records.length;
        
        // Find best position
        const positions = records.map(r => parseInt(r.position || r.racerIndex + 1)).filter(p => !isNaN(p));
        const topPosition = positions.length > 0 ? Math.min(...positions) : null;

        // Find best time
        const times = records.map(r => {
            const timeStr = r.timeString || r.time;
            return this.timeToSeconds(timeStr);
        }).filter(t => t > 0);
        const bestTimeSeconds = times.length > 0 ? Math.min(...times) : null;
        const bestTime = bestTimeSeconds ? this.secondsToTimeString(bestTimeSeconds) : null;

        // Calculate win rate (assuming position 1-3 is a win)
        const wins = records.filter(r => {
            const pos = parseInt(r.position || r.racerIndex + 1);
            return pos <= 3;
        }).length;
        const winRate = totalRaces > 0 ? ((wins / totalRaces) * 100).toFixed(1) : 0;

        // Calculate total points
        const totalPoints = records.reduce((sum, r) => sum + (parseInt(r.points) || 0), 0);

        // Favorite cars
        const carCounts = {};
        records.forEach(r => {
            if (r.car) {
                carCounts[r.car] = (carCounts[r.car] || 0) + 1;
            }
        });
        const favoriteCars = Object.entries(carCounts)
            .map(([name, uses]) => ({ name, uses }))
            .sort((a, b) => b.uses - a.uses)
            .slice(0, 5);

        // Favorite pets
        const petCounts = {};
        records.forEach(r => {
            if (r.pet) {
                petCounts[r.pet] = (petCounts[r.pet] || 0) + 1;
            }
        });
        const favoritePets = Object.entries(petCounts)
            .map(([name, uses]) => ({ name, uses }))
            .sort((a, b) => b.uses - a.uses)
            .slice(0, 5);

        this.userStats = {
            ...this.userStats,
            totalRaces,
            topPosition: topPosition ? `${topPosition}${this.getOrdinalSuffix(topPosition)}` : '—',
            bestTime: bestTime || '—',
            accuracy: '—',
            winRate: winRate,
            totalPoints,
            streak: 0,
            favoriteCars,
            favoritePets
        };

        console.log('✅ Stats calculated:', this.userStats);
    }

    /**
     * Get placeholder stats
     */
    getPlaceholderStats() {
        return {
            totalRaces: 0,
            topPosition: '—',
            bestTime: '—',
            accuracy: '—',
            winRate: 0,
            totalPoints: 0,
            streak: 0,
            favoriteCars: [],
            favoritePets: [],
            recordMaps: [],
            bio: 'Chào mừng bạn đến với hồ sơ cá nhân! Hãy tham gia đua xe để xem thống kê của bạn.',
            socialLinks: {}
        };
    }

    /**
     * Convert time string to seconds
     */
    timeToSeconds(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return 0;
        
        // Format: mm'ss'ms
        const match = timeStr.match(/(\d+)'(\d+)'(\d+)/);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const milliseconds = parseInt(match[3]);
            return minutes * 60 + seconds + milliseconds / 100;
        }
        return 0;
    }

    /**
     * Convert seconds to time string
     */
    secondsToTimeString(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${String(minutes).padStart(2, '0')}'${String(secs).padStart(2, '0')}'${String(ms).padStart(2, '0')}`;
    }

    /**
     * Get ordinal suffix for numbers (1st, 2nd, 3rd, etc.)
     */
    getOrdinalSuffix(num) {
        const j = num % 10;
        const k = num % 100;
        if (j === 1 && k !== 11) return 'st';
        if (j === 2 && k !== 12) return 'nd';
        if (j === 3 && k !== 13) return 'rd';
        return 'th';
    }

    /**
     * Lấy user profile URL
     */
    getProfileURL(userId) {
        return `profile.html?user=${userId}`;
    }

    /**
     * Update profile picture
     */
    async updateProfilePicture(file) {
        // Implement file upload
        return { success: true };
    }

    /**
     * Get profile summary widget
     */
    getProfileWidget() {
        return `
            <div style="
                background: rgba(18, 18, 26, 0.7);
                border: 1px solid rgba(0, 243, 255, 0.1);
                border-radius: 12px;
                padding: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
            " onclick="userProfileManager.createProfilePage()">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="
                        width: 50px;
                        height: 50px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, var(--neon-cyan), var(--neon-blue));
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">
                        <i class="fas fa-user"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: var(--neon-cyan);">${this.currentUser?.displayName || 'User'}</div>
                        <div style="font-size: 0.85rem; color: #cbd5e0;">📊 Level ${Math.floor((this.userStats.totalPoints || 0) / 100)}</div>
                    </div>
                </div>
            </div>
        `;
    }
}

// Khởi tạo singleton
const userProfileManager = new UserProfileManager();

// Gán vào window để có thể truy cập toàn cục
window.userProfileManager = userProfileManager;

// Export cho các module khác
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { userProfileManager };
}
