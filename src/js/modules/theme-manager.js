/**
 * Theme Manager - Quản lý chế độ Dark/Light Mode
 * Hỗ trợ tất cả các trang trong ứng dụng
 */

class ThemeManager {
    constructor() {
        this.THEME_KEY = 'westar-theme-preference';
        this.LIGHT = 'light';
        this.DARK = 'dark';
        this.AUTO = 'auto';
        
        this.lightColors = {
            '--neon-cyan': '#0088cc',
            '--neon-blue': '#0044ff',
            '--neon-purple': '#7700ff',
            '--neon-pink': '#cc0066',
            '--neon-green': '#00cc88',
            '--neon-red': '#ff0044',
            '--neon-yellow': '#ccaa00',
            '--dark-bg': '#f5f7fa',
            '--card-bg': 'rgba(255, 255, 255, 0.95)',
            '--card-bg-hover': 'rgba(240, 245, 250, 0.95)',
            '--glass-bg': 'rgba(20, 20, 40, 0.05)',
            '--glass-border': 'rgba(0, 100, 200, 0.2)',
            '--border-color': 'rgba(100, 150, 200, 0.2)',
            '--text-primary': '#1a1a2e',
            '--text-secondary': '#4a5568',
            '--shadow-light': 'rgba(0, 0, 0, 0.1)',
            '--shadow-medium': 'rgba(0, 0, 0, 0.15)',
        };

        this.darkColors = {
            '--neon-cyan': '#00f3ff',
            '--neon-blue': '#0066ff',
            '--neon-purple': '#9d00ff',
            '--neon-pink': '#ff00cc',
            '--neon-green': '#00ff9d',
            '--neon-red': '#ff0033',
            '--neon-yellow': '#ffcc00',
            '--dark-bg': '#0a0a0f',
            '--card-bg': 'rgba(18, 18, 26, 0.85)',
            '--card-bg-hover': 'rgba(26, 26, 46, 0.9)',
            '--glass-bg': 'rgba(30, 30, 46, 0.4)',
            '--glass-border': 'rgba(0, 243, 255, 0.15)',
            '--border-color': 'rgba(0, 243, 255, 0.15)',
            '--text-primary': '#e2e8f0',
            '--text-secondary': '#cbd5e0',
            '--shadow-light': 'rgba(0, 243, 255, 0.05)',
            '--shadow-medium': 'rgba(0, 243, 255, 0.1)',
        };

        this.init();
    }

    /**
     * Khởi tạo Theme Manager
     */
    init() {
        const savedTheme = localStorage.getItem(this.THEME_KEY) || this.AUTO;
        this.setTheme(savedTheme);
        this.setupToggleListener();
        this.observeSystemThemeChange();
    }

    /**
     * Lấy chế độ hiện tại
     */
    getCurrentTheme() {
        const saved = localStorage.getItem(this.THEME_KEY) || this.AUTO;
        if (saved === this.AUTO) {
            return this.getSystemTheme();
        }
        return saved;
    }

    /**
     * Lấy chế độ từ hệ thống
     */
    getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? this.DARK : this.LIGHT;
    }

    /**
     * Đặt chế độ hiển thị
     */
    setTheme(theme) {
        let actualTheme = theme;
        
        if (theme === this.AUTO) {
            actualTheme = this.getSystemTheme();
        }

        const colors = actualTheme === this.DARK ? this.darkColors : this.lightColors;
        const root = document.documentElement;

        // Cập nhật CSS variables
        Object.entries(colors).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });

        // Cập nhật HTML attribute
        document.documentElement.setAttribute('data-theme', actualTheme);
        document.body.setAttribute('data-theme', actualTheme);

        // Lưu preference
        localStorage.setItem(this.THEME_KEY, theme);

        // Trigger event
        window.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme: actualTheme, preference: theme }
        }));

        console.log(`🎨 Theme changed to: ${actualTheme} (preference: ${theme})`);
    }

    /**
     * Toggle giữa dark/light
     */
    toggleTheme() {
        const current = localStorage.getItem(this.THEME_KEY) || this.AUTO;
        let next;

        if (current === this.AUTO) {
            next = this.getSystemTheme() === this.DARK ? this.LIGHT : this.DARK;
        } else if (current === this.DARK) {
            next = this.LIGHT;
        } else {
            next = this.DARK;
        }

        this.setTheme(next);
        return next;
    }

    /**
     * Đặt thành chế độ auto
     */
    setAutoTheme() {
        this.setTheme(this.AUTO);
    }

    /**
     * Lắng nghe sự thay đổi chế độ hệ thống
     */
    observeSystemThemeChange() {
        const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        darkModeQuery.addEventListener('change', (e) => {
            const saved = localStorage.getItem(this.THEME_KEY);
            if (saved === this.AUTO) {
                this.setTheme(this.AUTO);
            }
        });
    }

    /**
     * Setup toggle button listener
     */
    setupToggleListener() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-theme-toggle]')) {
                this.toggleTheme();
            }
        });
    }

    /**
     * Lấy icon phù hợp cho theme toggle
     */
    getToggleIcon() {
        const current = localStorage.getItem(this.THEME_KEY) || this.AUTO;
        const pref = this.getCurrentTheme();
        
        if (current === this.AUTO) {
            return pref === this.DARK ? 'fa-moon' : 'fa-sun';
        }
        
        return current === this.DARK ? 'fa-moon' : 'fa-sun';
    }

    /**
     * Lấy status text
     */
    getThemeStatus() {
        const pref = localStorage.getItem(this.THEME_KEY) || this.AUTO;
        const actual = this.getCurrentTheme();
        
        if (pref === this.AUTO) {
            return `Auto (${actual === this.DARK ? 'Dark' : 'Light'})`;
        }
        
        return pref === this.DARK ? 'Dark' : 'Light';
    }
}

// Khởi tạo singleton
const themeManager = new ThemeManager();

// Export cho các module khác
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { themeManager };
}
