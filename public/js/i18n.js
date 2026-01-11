/**
 * i18n - Internationalization Module
 * Supports: English (en), Thai (th), Myanmar (mm)
 */

const i18n = {
    currentLang: 'en',
    translations: {},
    supportedLangs: ['en', 'th', 'mm'],
    langNames: {
        en: '🇺🇸 English',
        th: '🇹🇭 ไทย',
        mm: '🇲🇲 မြန်မာ'
    },

    // Initialize i18n
    init: async function () {
        // Load saved language or detect from browser
        const savedLang = localStorage.getItem('language');
        if (savedLang && this.supportedLangs.includes(savedLang)) {
            this.currentLang = savedLang;
        } else {
            // Auto-detect from browser
            const browserLang = navigator.language.split('-')[0];
            if (this.supportedLangs.includes(browserLang)) {
                this.currentLang = browserLang;
            }
        }

        // Load language file
        await this.loadLanguage(this.currentLang);

        // Apply translations
        this.applyTranslations();

        // Create language switcher if container exists
        this.createSwitcher();

        console.log(`[i18n] Initialized with language: ${this.currentLang}`);
    },

    // Load language file
    loadLanguage: async function (lang) {
        try {
            const res = await fetch(`lang/${lang}.json`);
            if (!res.ok) throw new Error(`Failed to load ${lang}.json`);
            this.translations = await res.json();
            this.currentLang = lang;
        } catch (error) {
            console.error('[i18n] Load error:', error);
            // Fallback to English
            if (lang !== 'en') {
                await this.loadLanguage('en');
            }
        }
    },

    // Get translation by key path (e.g., "nav.logout")
    t: function (keyPath, fallback = '') {
        const keys = keyPath.split('.');
        let value = this.translations;

        for (const key of keys) {
            if (value && value[key] !== undefined) {
                value = value[key];
            } else {
                return fallback || keyPath;
            }
        }

        return value;
    },

    // Apply translations to all elements with data-i18n attribute
    applyTranslations: function () {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translated = this.t(key);

            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = translated;
            } else {
                el.textContent = translated;
            }
        });

        // Also apply to data-i18n-title for title attributes
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.setAttribute('title', this.t(key));
        });
    },

    // Switch language
    setLanguage: async function (lang) {
        if (!this.supportedLangs.includes(lang)) return;

        await this.loadLanguage(lang);
        localStorage.setItem('language', lang);
        this.applyTranslations();
        this.updateSwitcher();

        // Dispatch event for custom handlers
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    },

    // Create language switcher dropdown
    createSwitcher: function () {
        const container = document.getElementById('langSwitcher');
        if (!container) return;

        container.innerHTML = `
            <div class="lang-dropdown">
                <button class="lang-btn" id="langBtn">
                    ${this.langNames[this.currentLang]}
                    <i class="fa-solid fa-chevron-down" style="font-size:10px; margin-left:4px;"></i>
                </button>
                <div class="lang-menu" id="langMenu">
                    ${this.supportedLangs.map(lang => `
                        <button class="lang-option ${lang === this.currentLang ? 'active' : ''}" 
                                data-lang="${lang}">
                            ${this.langNames[lang]}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        // Toggle dropdown
        const btn = document.getElementById('langBtn');
        const menu = document.getElementById('langMenu');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('open');
        });

        // Close on outside click
        document.addEventListener('click', () => {
            menu.classList.remove('open');
        });

        // Handle language selection
        container.querySelectorAll('.lang-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const lang = option.getAttribute('data-lang');
                this.setLanguage(lang);
                menu.classList.remove('open');
            });
        });
    },

    // Update switcher button text
    updateSwitcher: function () {
        const btn = document.getElementById('langBtn');
        if (btn) {
            btn.innerHTML = `
                ${this.langNames[this.currentLang]}
                <i class="fa-solid fa-chevron-down" style="font-size:10px; margin-left:4px;"></i>
            `;
        }

        // Update active state
        document.querySelectorAll('.lang-option').forEach(option => {
            option.classList.toggle('active', option.getAttribute('data-lang') === this.currentLang);
        });
    }
};

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    i18n.init();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = i18n;
}
