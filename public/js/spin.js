// ================= APP CONFIG ================= //
// ✅ FIXED: Use same origin for API calls (served from Express on port 3000)
const API_BASE_URL = window.location.origin;

const Config = {
    adminCode: "LUCKY999",
    // ✅ Prizes will be loaded from API
    prizes: [],
    defaultPrizes: [
        { id: 1, text: "100 THB", color: "#E11D48" },
        { id: 2, text: "No Luck", color: "#607D8B" },
        { id: 3, text: "500 THB", color: "#D4AF37" },
        { id: 4, text: "Spin Again", color: "#10B981" },
        { id: 5, text: "1000 THB", color: "#E11D48" },
        { id: 6, text: "Jackpot", color: "#D4AF37" }
    ],
    spinDuration: 4000
};

const State = {
    history: [],
    isSpinning: false,
    currentRotation: 0,
    currentUser: null,
    filterDate: null,
    socket: null
};

const App = {
    init: async function () {
        this.checkAuth();

        this.canvas = document.getElementById('wheelCanvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');

        // ✅ Load prizes from API first
        await this.loadPrizes();

        this.drawWheel();
        this.renderHistory();
        console.log("App Loaded Successfully");
    },

    // ✅ NEW: Load prizes from API
    loadPrizes: async function () {
        try {
            const res = await fetch(`${API_BASE_URL}/api/prizes`);
            const data = await res.json();

            if (data.ok && data.prizes && data.prizes.length > 0) {
                Config.prizes = data.prizes.map((p, idx) => ({
                    id: p._id || idx + 1,
                    text: p.name,
                    color: p.color
                }));
                console.log('Loaded prizes from API:', Config.prizes.length);
            } else {
                // Fallback to default prizes
                Config.prizes = Config.defaultPrizes;
                console.log('Using default prizes');
            }
        } catch (error) {
            console.warn('Failed to load prizes from API, using defaults:', error);
            Config.prizes = Config.defaultPrizes;
        }
    },

    checkAuth: function () {
        const user = localStorage.getItem("username");
        if (!user) {
            window.location.href = "auth.html";
            return;
        }

        State.currentUser = user;
        const displayEl = document.getElementById('userDisplay');
        if (displayEl) displayEl.textContent = user;

        // ✅ Load History for this user
        this.loadHistory();

        // ✅ Connect socket for presence tracking AFTER auth
        this.connectSocket();
    },

    // ✅ NEW: Connect socket for user presence tracking
    connectSocket: function () {
        // Connect to main namespace (not /admin) for user presence
        State.socket = io(API_BASE_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        State.socket.on('connect', () => {
            console.log('[Socket] User connected for presence:', State.socket.id);
        });

        State.socket.on('disconnect', (reason) => {
            console.log('[Socket] User disconnected:', reason);
        });

        State.socket.on('connect_error', (err) => {
            console.warn('[Socket] Connection error (user presence):', err.message);
            // Don't show error to user - presence tracking is optional
        });
    },

    logout: function () {
        Swal.fire({
            title: 'ต้องการออกจากระบบ?',
            text: "คุณต้องเข้าสู่ระบบใหม่เพื่อเล่นเกม",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'ออกจากระบบ',
            cancelButtonText: 'ยกเลิก',
            background: '#090A0F',
            color: '#fff'
        }).then(async (result) => {
            if (result.isConfirmed) {
                // ✅ Disconnect socket before logout
                if (State.socket) {
                    State.socket.disconnect();
                }

                // Call logout API to destroy session
                try {
                    await fetch(`${API_BASE_URL}/api/auth/logout`, {
                        method: 'POST',
                        credentials: 'include'
                    });
                } catch (e) {
                    console.warn('Logout API error:', e);
                }

                localStorage.removeItem("username");
                window.location.href = "auth.html";
            }
        });
    },

    drawWheel: function () {
        if (!this.ctx) return;
        if (Config.prizes.length === 0) return;

        const { width, height } = this.canvas;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = width / 2;
        const arcSize = (2 * Math.PI) / Config.prizes.length;
        const fontFamily = "'Kanit', 'Padauk', 'Myanmar Text', 'Noto Sans Myanmar', sans-serif";

        // ✅ Available space for text (from center to edge with padding)
        const maxTextWidth = radius - 25;

        Config.prizes.forEach((prize, i) => {
            const angle = i * arcSize;

            // Draw sector
            this.ctx.beginPath();
            this.ctx.fillStyle = prize.color;
            this.ctx.moveTo(centerX, centerY);
            this.ctx.arc(centerX, centerY, radius, angle, angle + arcSize);
            this.ctx.lineTo(centerX, centerY);
            this.ctx.fill();

            // Draw text - auto-fit font size to show full text
            this.ctx.save();
            this.ctx.translate(centerX, centerY);
            this.ctx.rotate(angle + arcSize / 2);
            this.ctx.textAlign = "right";
            this.ctx.fillStyle = "#fff";
            this.ctx.shadowColor = "rgba(0,0,0,0.7)";
            this.ctx.shadowBlur = 3;

            // ✅ Auto-fit font size: start big and reduce until text fits
            let fontSize = Math.min(24, radius / 8);
            const minFontSize = 10;
            const text = prize.text;

            this.ctx.font = `bold ${fontSize}px ${fontFamily}`;
            while (this.ctx.measureText(text).width > maxTextWidth && fontSize > minFontSize) {
                fontSize -= 1;
                this.ctx.font = `bold ${fontSize}px ${fontFamily}`;
            }

            this.ctx.fillText(text, radius - 12, fontSize / 3);
            this.ctx.restore();
        });
    },

    handleSpin: async function () {
        const codeInput = document.getElementById('spinCode');
        const spinBtn = document.getElementById('spinBtn');
        const code = codeInput.value.trim().toUpperCase();

        if (State.isSpinning) return;

        // 1. Check for Demo/Admin Code (Client-Side bypass) - REMOVED


        // 2. Call Backend API
        try {
            spinBtn.disabled = true;
            State.isSpinning = true;

            const res = await fetch(`${API_BASE_URL}/api/game/spin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    code: code,
                    username: State.currentUser
                })
            });

            const data = await res.json();

            if (data.ok) {
                this.animateWheel(data.winningIndex);
            } else {
                State.isSpinning = false;
                spinBtn.disabled = false;
                Swal.fire({
                    icon: 'error',
                    title: 'Oops...',
                    text: data.message || 'รหัสไม่ถูกต้อง',
                    background: '#090A0F',
                    color: '#fff'
                });
            }

        } catch (error) {
            console.error('Spin Error:', error);
            State.isSpinning = false;
            spinBtn.disabled = false;
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
                background: '#090A0F',
                color: '#fff'
            });
        }
    },

    animateWheel: function (winningIndex) {
        const prizeCount = Config.prizes.length;
        const sliceAngle = 360 / prizeCount;
        const centerOffset = sliceAngle / 2;
        const winningSectorAngle = (winningIndex * sliceAngle) + centerOffset;

        let targetRotation = 270 - winningSectorAngle;

        const currentRotation = State.currentRotation;
        const currentMod = currentRotation % 360;
        let dist = targetRotation - currentMod;

        if (dist < 0) dist += 360;

        const rounds = 5;
        const totalRotate = dist + (360 * rounds);
        const randomVar = Math.floor(Math.random() * 40) - 20;

        State.currentRotation += totalRotate + randomVar;
        this.canvas.style.transform = `rotate(${State.currentRotation}deg)`;

        setTimeout(() => {
            State.isSpinning = false;
            document.getElementById('spinBtn').disabled = false;

            this.showResult(winningIndex);
            this.addToHistory(Config.prizes[winningIndex].text);
        }, Config.spinDuration);
    },

    addToHistory: function (prizeName) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('th-TH') + ' ' + now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const isoDate = `${year}-${month}-${day}`;

        const newEntry = {
            date: dateStr,
            isoDate: isoDate,
            username: State.currentUser,
            prize: prizeName
        };

        State.history.unshift(newEntry);

        if (State.history.length > 20) State.history.pop();
        this.saveHistory();
        this.renderHistory();
    },

    saveHistory: function () {
        const key = `spinHistory_${State.currentUser}`;
        localStorage.setItem(key, JSON.stringify(State.history));
    },

    loadHistory: async function () {
        // ✅ Guard: Make sure currentUser is set
        if (!State.currentUser) {
            console.warn('loadHistory: No current user');
            State.history = [];
            this.renderHistory();
            return;
        }

        // ✅ Try to load from API (database) first - this persists forever
        try {
            const username = encodeURIComponent(State.currentUser);
            const res = await fetch(`${API_BASE_URL}/api/game/history/${username}`, {
                credentials: 'include'
            });
            const data = await res.json();

            if (data.ok && data.history && data.history.length > 0) {
                State.history = data.history.map(h => ({
                    prize: h.prize,
                    date: h.timestamp || h.createdAt,
                    code: h.code
                }));
                console.log('Loaded history from API:', State.history.length, 'records');
                this.renderHistory();
                return;
            }
        } catch (error) {
            console.warn('API history load failed, using localStorage:', error);
        }

        // Fallback to localStorage
        const key = `spinHistory_${State.currentUser}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            try {
                State.history = JSON.parse(saved);
            } catch (e) {
                console.error("History parse error", e);
                State.history = [];
            }
        } else {
            State.history = [];
        }
        this.renderHistory();
    },

    clearHistory: function () {
        if (!confirm("ลบประวัติการหมุนทั้งหมดของคุณ?")) return;

        State.history = [];
        const key = `spinHistory_${State.currentUser}`;
        localStorage.removeItem(key);
        this.renderHistory();
    },

    handleDateFilter: function (date) {
        State.filterDate = date;
        this.renderHistory();
    },

    handleSearch: function (keyword) {
        this.renderHistory();
    },

    renderHistory: function () {
        const tbody = document.getElementById('historyTableBody');
        const cardList = document.getElementById('historyCardList');
        const noResult = document.getElementById('noResult');

        if (!tbody || !cardList) return;

        tbody.innerHTML = '';
        cardList.innerHTML = '';

        const filtered = State.history.filter(item => {
            const searchInput = document.getElementById('searchInput');
            const filterText = searchInput ? searchInput.value : '';

            const matchesText = item.username.toLowerCase().includes(filterText.toLowerCase()) ||
                item.prize.toLowerCase().includes(filterText.toLowerCase()) ||
                item.date.includes(filterText);
            const matchesDate = State.filterDate ? item.isoDate === State.filterDate : true;

            return matchesText && matchesDate;
        });

        if (filtered.length === 0) {
            if (noResult) noResult.classList.remove('hidden');
        } else {
            if (noResult) noResult.classList.add('hidden');

            filtered.forEach(item => {
                let prizeClass = "text-white";
                let badgeClass = "border-white/20 text-gray-300";

                if (item.prize.includes("1000") || item.prize.includes("Jackpot") || item.prize.includes("500")) {
                    prizeClass = "text-gold font-bold";
                    badgeClass = "border-gold/50 text-gold bg-gold/10";
                }
                if (item.prize.includes("No Luck") || item.prize.includes("ไม่ได้รับ")) {
                    prizeClass = "text-red-400";
                    badgeClass = "border-red-500/30 text-red-400";
                }

                const tr = document.createElement('tr');
                tr.className = "border-b border-white/5 hover:bg-white/5 transition";
                tr.innerHTML = `
                    <td class="p-3 text-muted text-xs">${item.date}</td>
                    <td class="p-3 text-blue-200 font-medium">${item.username}</td>
                    <td class="p-3 text-right ${prizeClass}">${item.prize}</td>
                `;
                tbody.appendChild(tr);

                const card = document.createElement('div');
                card.className = "history-card";
                card.innerHTML = `
                    <div class="flex flex-col">
                        <span class="text-xs text-muted mb-1">${item.date}</span>
                        <span class="text-sm text-white font-medium">${item.username}</span>
                    </div>
                    <div class="px-3 py-1 rounded-full border text-xs font-bold ${badgeClass}">
                        ${item.prize}
                    </div>
                `;
                cardList.appendChild(card);
            });
        }
    },

    showResult: function (index) {
        const modal = document.getElementById('resultModal');
        const prizeEl = document.getElementById('modalPrize');
        if (prizeEl) prizeEl.innerText = Config.prizes[index].text;
        if (modal) modal.classList.remove('hidden');
    },

    closeModal: function () {
        const modal = document.getElementById('resultModal');
        if (modal) modal.classList.add('hidden');
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});