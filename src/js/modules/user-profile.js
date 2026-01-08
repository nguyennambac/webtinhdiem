/**
 * User Profile & Achievement System
 * Quản lý profil người dùng, achievements, thành tích
 */

class UserProfileManager {
    constructor() {
        this.currentUser = null;
        this.userStats = {};
        this.achievements = [];
        this.init();
    }

    /**
     * Khởi tạo hệ thống
     */
    init() {
        this.setupProfileListener();
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
            padding: 40px 20px;
        `;

        const profile = await this.buildProfileHTML();
        container.innerHTML = profile;

        document.body.appendChild(container);
        this.setupProfileInteractions(container);

        return container;
    }

    /**
     * Build profile HTML
     */
    async buildProfileHTML() {
        const stats = this.userStats;

        return `
            <div style="max-width: 1000px; margin: 0 auto;">
                <!-- Close button -->
                <button onclick="document.getElementById('user-profile-page').remove()" style="
                    position: fixed;
                    top: 20px;
                    right: 30px;
                    background: none;
                    border: none;
                    color: var(--neon-cyan);
                    font-size: 2rem;
                    cursor: pointer;
                    z-index: 5001;
                ">
                    <i class="fas fa-times"></i>
                </button>

                <!-- Profile Header -->
                <div style="
                    background: linear-gradient(135deg, rgba(0, 243, 255, 0.1), rgba(0, 102, 255, 0.05));
                    border: 1px solid rgba(0, 243, 255, 0.2);
                    border-radius: 20px;
                    padding: 40px;
                    margin-bottom: 30px;
                    display: flex;
                    align-items: center;
                    gap: 30px;
                ">
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
                        flex-shrink: 0;
                    ">
                        ${this.currentUser?.photoURL ? 
                            `<img src="${this.currentUser.photoURL}" style="width: 100%; height: 100%; object-fit: cover;">` :
                            `<i class="fas fa-user"></i>`
                        }
                    </div>

                    <div style="flex: 1;">
                        <h2 style="margin: 0 0 10px 0; font-size: 1.8rem; color: var(--neon-cyan);">
                            ${this.currentUser?.displayName || 'User'}
                        </h2>
                        <p style="margin: 5px 0; color: #cbd5e0;">
                            📧 ${this.currentUser?.email || 'N/A'}
                        </p>
                        <p style="margin: 5px 0; color: #cbd5e0;">
                            🎮 ID: ${this.currentUser?.uid?.substring(0, 12)}...
                        </p>
                        <p style="margin: 5px 0; color: var(--neon-green);">
                            ✓ Tham gia từ ${new Date(this.currentUser?.createdAt).toLocaleDateString('vi-VN')}
                        </p>
                    </div>

                    <div style="text-align: center; padding: 20px; background: rgba(0, 243, 255, 0.05); border-radius: 12px;">
                        <div style="font-size: 2rem; color: var(--neon-cyan); font-weight: bold;">
                            ${stats.totalRaces || 0}
                        </div>
                        <div style="color: #cbd5e0; font-size: 0.9rem;">Tổng trận đấu</div>
                    </div>
                </div>

                <!-- Stats Grid -->
                <div style="
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-bottom: 30px;
                ">
                    ${this.buildStatCard('🏆', 'Top Position', stats.topPosition || '—')}
                    ${this.buildStatCard('⏱️', 'Best Time', stats.bestTime || '—')}
                    ${this.buildStatCard('🎯', 'Accuracy', stats.accuracy || '—%')}
                    ${this.buildStatCard('📊', 'Win Rate', stats.winRate || '—%')}
                    ${this.buildStatCard('🌟', 'Total Points', stats.totalPoints || 0)}
                    ${this.buildStatCard('🔥', 'Current Streak', stats.streak || 0)}
                </div>

                <!-- Achievements Section -->
                <div style="margin-bottom: 30px;">
                    <h3 style="
                        margin: 0 0 20px 0;
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

                <!-- Recent Races -->
                <div style="margin-bottom: 30px;">
                    <h3 style="
                        margin: 0 0 20px 0;
                        color: var(--neon-cyan);
                        font-size: 1.3rem;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    ">
                        <i class="fas fa-history"></i> Các trận đấu gần đây
                    </h3>
                    <div id="recent-races" style="
                        background: rgba(18, 18, 26, 0.7);
                        border: 1px solid rgba(0, 243, 255, 0.1);
                        border-radius: 12px;
                        overflow: hidden;
                    ">
                        <!-- Sẽ được populate bởi JavaScript -->
                        <div style="padding: 20px; text-align: center; color: #cbd5e0;">
                            Đang tải...
                        </div>
                    </div>
                </div>

                <!-- Favorite Cars & Pets -->
                <div style="
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin-bottom: 30px;
                ">
                    <div>
                        <h4 style="color: var(--neon-cyan); margin: 0 0 15px 0; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-car"></i> Xe yêu thích
                        </h4>
                        <div id="favorite-cars" style="
                            display: flex;
                            flex-direction: column;
                            gap: 10px;
                        ">
                            ${stats.favoriteCars?.map(car => `
                                <div style="
                                    background: rgba(0, 243, 255, 0.05);
                                    border-left: 3px solid var(--neon-cyan);
                                    padding: 12px;
                                    border-radius: 6px;
                                ">
                                    ${car.name} <span style="color: #718096;">(${car.uses} lần)</span>
                                </div>
                            `).join('') || '<div style="color: #718096;">Chưa có dữ liệu</div>'}
                        </div>
                    </div>

                    <div>
                        <h4 style="color: var(--neon-cyan); margin: 0 0 15px 0; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-paw"></i> Thú cưng yêu thích
                        </h4>
                        <div id="favorite-pets" style="
                            display: flex;
                            flex-direction: column;
                            gap: 10px;
                        ">
                            ${stats.favoritePets?.map(pet => `
                                <div style="
                                    background: rgba(0, 243, 255, 0.05);
                                    border-left: 3px solid var(--neon-cyan);
                                    padding: 12px;
                                    border-radius: 6px;
                                ">
                                    ${pet.name} <span style="color: #718096;">(${pet.uses} lần)</span>
                                </div>
                            `).join('') || '<div style="color: #718096;">Chưa có dữ liệu</div>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Build stat card
     */
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
     * Load user stats
     */
    async loadUserStats() {
        // Placeholder - sẽ được load từ Firestore
        this.userStats = {
            totalRaces: 42,
            topPosition: '3rd',
            bestTime: "01'23'45",
            accuracy: '92.5',
            winRate: '68.3',
            totalPoints: 850,
            streak: 7,
            favoriteCars: [
                { name: 'Super Speed', uses: 15 },
                { name: 'Thunder', uses: 12 }
            ],
            favoritePets: [
                { name: 'Lightning', uses: 18 },
                { name: 'Wizard', uses: 10 }
            ]
        };
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

// Export cho các module khác
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { userProfileManager };
}
