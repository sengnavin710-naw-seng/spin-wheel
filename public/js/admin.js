// ✅ FIXED: Use same origin as the page (served from Express static on port 3000)
const API_BASE_URL = window.location.origin;

const AdminApp = {
    socket: null,
    currentSection: 'overview',
    currentPage: 1,
    isAuthenticated: false,

    init: async function () {
        const authOk = await this.checkAuth();
        if (!authOk) return; // Redirect happened

        // Only connect socket AFTER successful auth
        this.connectSocket();

        // Initial Loads
        this.switchSection('overview');

        // ✅ Load Recent Activity from API on refresh
        this.loadRecentActivity();

        // Search Listener for Codes
        const searchInput = document.getElementById('codeSearchInput');
        if (searchInput) {
            searchInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') this.loadCodes(1);
            });
        }

        // Modal Close Listeners (Outside Click)
        document.querySelectorAll('.modal-overlay').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target === el) el.classList.remove('open');
            });
        });
    },

    checkAuth: async function () {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/auth/me`, { credentials: 'include' });
            if (res.status === 401 || res.status === 403) {
                window.location.href = 'admin-login.html';
                return false;
            }
            const data = await res.json();
            if (data.ok) {
                this.isAuthenticated = true;
                document.getElementById('adminUsername').textContent = data.username;
                document.getElementById('avatarInitials').textContent = data.username.charAt(0).toUpperCase();
                return true;
            } else {
                window.location.href = 'admin-login.html';
                return false;
            }
        } catch (error) {
            console.error('Auth check error:', error);
            this.showToast('Connection Error: Cannot reach server', 'error');
            window.location.href = 'admin-login.html';
            return false;
        }
    },

    connectSocket: function () {
        // ✅ Connect to /admin namespace with same origin
        this.socket = io(`${API_BASE_URL}/admin`, {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('[Socket] Admin connected:', this.socket.id);
            this.updateSocketStatus('Connected', 'active');
        });

        this.socket.on('disconnect', (reason) => {
            console.warn('[Socket] Disconnected:', reason);
            this.updateSocketStatus('Disconnected', 'used');
        });

        this.socket.on('connect_error', (err) => {
            console.error('[Socket] Connection Error:', err.message);
            this.updateSocketStatus('Error', 'used');
            this.showToast(`Socket Error: ${err.message}`, 'error');
        });

        // ✅ Realtime Event Listeners
        this.socket.on('kpi:update', (stats) => {
            console.log('[Socket] KPI Update:', stats);
            this.updateKpis(stats);
        });

        this.socket.on('spin:new', (log) => {
            console.log('[Socket] New Spin:', log);
            this.prependActivity(log);
            if (this.currentSection === 'logs') this.loadSpinLogs();
        });

        this.socket.on('user:login', (data) => {
            console.log('[Socket] User Login:', data);
            this.showToast(`User "${data?.username || 'Unknown'}" logged in`, 'info');
            if (this.currentSection === 'users') this.loadUsers();
        });

        this.socket.on('user:logout', (data) => {
            console.log('[Socket] User Logout:', data);
        });

        this.socket.on('code:new', (data) => {
            console.log('[Socket] New Codes:', data);
            if (this.currentSection === 'codes') this.loadCodes(this.currentPage);
        });
    },

    updateSocketStatus: function (text, badgeClass) {
        const el = document.getElementById('socketStatus');
        if (el) {
            el.textContent = text;
            el.className = `badge ${badgeClass}`;
        }
    },

    showToast: function (message, type = 'info') {
        // Create simple toast notification
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 9999;
            padding: 12px 20px; border-radius: 8px; font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
            color: white; animation: fadeIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 4000);
    },

    switchSection: function (sectionId) {
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-${sectionId}`);
        if (activeNav) activeNav.classList.add('active');

        document.querySelectorAll('.section-view').forEach(el => el.classList.add('hidden'));
        const section = document.getElementById(`section-${sectionId}`);
        if (section) section.classList.remove('hidden');

        this.currentSection = sectionId;

        const titles = {
            overview: 'Dashboard Overview',
            users: 'User Management',
            logs: 'Spin History Logs',
            codes: 'Spin Code Management',
            prizes: 'Prize Management',
            probability: 'Probability Settings'
        };
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.innerText = titles[sectionId] || 'Dashboard';

        if (sectionId === 'users') this.loadUsers();
        if (sectionId === 'logs') this.loadSpinLogs();
        if (sectionId === 'codes') this.loadCodes(1);
        if (sectionId === 'prizes') this.loadPrizes();
        if (sectionId === 'probability') this.loadProbabilities();
    },

    updateKpis: function (stats) {
        if (!stats) return;
        const setKpi = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val ?? '-';
        };
        setKpi('kpiTotalUsers', stats.totalUsers);
        setKpi('kpiActiveUsers', stats.activeUsers);
        setKpi('kpiTotalSpins', stats.totalSpins);
        setKpi('kpiAvailableCodes', stats.availableCodes);
        setKpi('kpiUsedCodes', stats.usedCodes);
        setKpi('statusUsedCodes', stats.usedCodes);
    },

    prependActivity: function (log) {
        const list = document.getElementById('recentActivityList');
        if (!list) return;

        const emptyMsg = list.querySelector('.text-muted');
        if (emptyMsg && emptyMsg.innerText.includes('Waiting')) emptyMsg.remove();

        const html = `
            <div class="activity-item animate-pop">
                <div>
                    <div class="activity-user">${log.usedByUsername || 'Unknown'}</div>
                    <div class="activity-desc">won <span class="activity-prize">${log.prize}</span> with code ${log.code}</div>
                </div>
                <div class="activity-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;
        list.insertAdjacentHTML('afterbegin', html);

        if (list.children.length > 8) list.lastElementChild.remove();
    },

    // ✅ Load Recent Activity from API (persists after refresh)
    loadRecentActivity: async function () {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/spin-codes/logs?limit=8`, { credentials: 'include' });
            const data = await res.json();

            // ✅ FIXED: API returns 'items' not 'logs'
            const logs = data.items || data.logs || [];

            if (data.ok && logs.length > 0) {
                const list = document.getElementById('recentActivityList');
                if (!list) return;

                list.innerHTML = logs.map(log => `
                    <div class="activity-item">
                        <div>
                            <div class="activity-user">${log.usedByUsername || 'Unknown'}</div>
                            <div class="activity-desc">won <span class="activity-prize">${log.prize}</span> with code ${log.code}</div>
                        </div>
                        <div class="activity-time">${new Date(log.timestamp || log.createdAt).toLocaleString()}</div>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Load Recent Activity Error:', error);
        }
    },

    loadUsers: async function () {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/users`, { credentials: 'include' });
            const data = await res.json();
            const tbody = document.getElementById('usersTableBody');
            if (!tbody) return;

            if (data.ok && data.users) {
                tbody.innerHTML = data.users.map(u => `
                    <tr>
                        <td style="font-weight:500">${u.username}</td>
                        <td><span class="badge ${u.role === 'admin' ? 'active' : 'disabled'}">${u.role}</span></td>
                        <td style="color:var(--text-muted)">${new Date(u.createdAt).toLocaleDateString()}</td>
                        <td style="text-align:right">
                            <button onclick="AdminApp.openEditUser('${u._id}', '${u.username}')" class="btn-primary btn-sm" style="background:var(--bg-body); color:var(--primary); border:1px solid var(--border-color)">Edit</button>
                        </td>
                    </tr>
                `).join('');
            }
        } catch (error) {
            console.error('Load Users Error:', error);
        }
    },

    openEditUser: function (id, username) {
        const modal = document.getElementById('editUserModal');
        const form = document.getElementById('editUserForm');
        if (form) {
            form.userId.value = id;
            form.username.value = username;
            form.password.value = '';
        }
        if (modal) modal.classList.add('open');
    },

    handleEditUser: async function (e) {
        e.preventDefault();
        const form = e.target;
        const id = form.userId.value;
        const payload = { username: form.username.value, password: form.password.value };

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.ok) {
                this.showToast('User updated successfully', 'success');
                document.getElementById('editUserModal').classList.remove('open');
                this.loadUsers();
            } else {
                this.showToast(data.message || 'Update failed', 'error');
            }
        } catch (error) {
            console.error(error);
        }
    },

    loadSpinLogs: async function () {
        const rangeEl = document.getElementById('logsFilterRange');
        const range = rangeEl ? rangeEl.value : 'today';
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/spin-codes/logs?range=${range}&limit=50`, { credentials: 'include' });
            const data = await res.json();
            const tbody = document.getElementById('logsTableBody');
            if (!tbody) return;

            if (data.ok) {
                if (!data.items || data.items.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted)">No logs found</td></tr>';
                    return;
                }
                tbody.innerHTML = data.items.map(log => `
                    <tr>
                        <td style="color:var(--text-muted); font-size:12px;">${new Date(log.timestamp).toLocaleString()}</td>
                        <td style="font-weight:600">${log.usedByUsername}</td>
                        <td style="font-family:monospace; color:var(--secondary)">${log.code}</td>
                        <td style="color:var(--primary); font-weight:700">${log.prize}</td>
                    </tr>
                `).join('');
            }
        } catch (error) {
            console.error('Load Logs Error:', error);
        }
    },

    loadCodes: async function (page = 1) {
        this.currentPage = page;
        const searchEl = document.getElementById('codeSearchInput');
        const search = searchEl ? searchEl.value : '';

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/spin-codes?page=${page}&limit=10&search=${search}`, { credentials: 'include' });
            const data = await res.json();

            if (data.ok) {
                this.renderCodesTable(data.items);
                const pageInfo = document.getElementById('pageInfo');
                if (pageInfo) pageInfo.innerText = `Page ${page}`;
            }
        } catch (error) {
            console.error('Load Codes Error:', error);
        }
    },

    renderCodesTable: function (codes) {
        const tbody = document.getElementById('codesTableBody');
        if (!tbody) return;

        if (!codes || codes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted)">No codes found</td></tr>';
            return;
        }

        tbody.innerHTML = codes.map(code => {
            const badgeClass = code.status === 'active' ? 'active' : code.status === 'used' ? 'used' : 'disabled';
            const usage = code.usedByUsername
                ? `<div>${code.usedByUsername}</div><div style="font-size:11px; color:var(--text-muted)">${code.prize || ''}</div>`
                : '<span style="color:var(--text-muted)">-</span>';
            const actionBtn = code.status === 'active'
                ? `<button onclick="AdminApp.toggleCode('${code._id}', 'disable')" class="btn-sm btn-outline-danger">Disable</button>`
                : code.status === 'disabled'
                    ? `<button onclick="AdminApp.toggleCode('${code._id}', 'enable')" class="btn-sm" style="color:var(--success); background:white; border:1px solid var(--success)">Enable</button>`
                    : '<span style="font-size:11px; color:var(--text-muted)">Used</span>';

            return `
                <tr>
                    <td style="font-family:monospace; font-weight:500">${code.code}</td>
                    <td><span class="badge ${badgeClass}">${code.status}</span></td>
                    <td style="font-size:12px; color:var(--text-muted)">${new Date(code.createdAt).toLocaleDateString()}</td>
                    <td>${usage}</td>
                    <td style="text-align:center">${actionBtn}</td>
                </tr>
            `;
        }).join('');
    },

    openGenerateModal: function () {
        const modal = document.getElementById('generateModal');
        if (modal) modal.classList.add('open');
    },

    handleGenerate: async function (e) {
        e.preventDefault();
        const form = e.target;
        const payload = {
            count: form.count.value,
            prefix: form.prefix.value,
            note: form.note.value
        };
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/spin-codes/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.ok) {
                this.showToast(`Generated ${data.count} codes!`, 'success');
                document.getElementById('generateModal').classList.remove('open');
                form.reset();
                this.loadCodes(1);
            }
        } catch (error) {
            console.error(error);
        }
    },

    changePage: function (delta) {
        const newPage = this.currentPage + delta;
        if (newPage > 0) this.loadCodes(newPage);
    },

    logout: async function () {
        try {
            await fetch(`${API_BASE_URL}/api/admin/auth/logout`, { method: 'POST', credentials: 'include' });
            window.location.href = 'admin-login.html';
        } catch (error) {
            console.error('Logout failed:', error);
        }
    },

    toggleCode: async function (id, action) {
        if (!confirm(`Are you sure you want to ${action} this code?`)) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/spin-codes/${id}/${action}`, { method: 'PUT', credentials: 'include' });
            const data = await res.json();
            if (data.ok) this.loadCodes(this.currentPage);
        } catch (error) {
            console.error(error);
        }
    },

    // ==================== PRIZE MANAGEMENT ====================
    prizes: [],

    loadPrizes: async function () {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/prizes`, { credentials: 'include' });
            const data = await res.json();
            if (data.ok) {
                this.prizes = data.prizes;
                this.renderPrizesTable(data.prizes);
            }
        } catch (error) {
            console.error('Load Prizes Error:', error);
        }
    },

    renderPrizesTable: function (prizes) {
        const tbody = document.getElementById('prizesTableBody');
        if (!tbody) return;

        if (!prizes || prizes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted)">No prizes found. Click "Seed Default Prizes" to add default prizes.</td></tr>';
            return;
        }

        tbody.innerHTML = prizes.map((p, idx) => `
            <tr>
                <td style="text-align:center; color:var(--text-muted)">${idx + 1}</td>
                <td style="font-weight:600">${p.name}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="width:24px; height:24px; border-radius:50%; background:${p.color}; display:inline-block;"></span>
                        <span style="font-family:monospace; font-size:12px;">${p.color}</span>
                    </div>
                </td>
                <td><span class="badge" style="background:var(--primary); color:white">${p.probability}%</span></td>
                <td><span class="badge ${p.isActive ? 'active' : 'disabled'}">${p.isActive ? 'Active' : 'Inactive'}</span></td>
                <td style="text-align:center">
                    <button onclick="AdminApp.openEditPrize('${p._id}')" class="btn-sm" style="margin-right:4px; background:var(--bg-body); border:1px solid var(--border-color)">Edit</button>
                    <button onclick="AdminApp.deletePrize('${p._id}')" class="btn-sm btn-outline-danger">Delete</button>
                </td>
            </tr>
        `).join('');
    },

    openAddPrizeModal: function () {
        const form = document.getElementById('prizeForm');
        form.reset();
        form.prizeId.value = '';
        form.color.value = '#E11D48';
        document.getElementById('prizeModalTitle').textContent = 'Add Prize';
        document.getElementById('prizeModal').classList.add('open');
    },

    openEditPrize: function (id) {
        const prize = this.prizes.find(p => p._id === id);
        if (!prize) return;

        const form = document.getElementById('prizeForm');
        form.prizeId.value = id;
        form.name.value = prize.name;
        form.color.value = prize.color;
        form.probability.value = prize.probability;
        form.isActive.checked = prize.isActive;
        document.getElementById('prizeModalTitle').textContent = 'Edit Prize';
        document.getElementById('prizeModal').classList.add('open');
    },

    handlePrizeSubmit: async function (e) {
        e.preventDefault();
        const form = e.target;
        const id = form.prizeId.value;
        const payload = {
            name: form.name.value,
            color: form.color.value,
            probability: parseFloat(form.probability.value) || 10,
            isActive: form.isActive.checked
        };

        try {
            const url = id ? `${API_BASE_URL}/api/admin/prizes/${id}` : `${API_BASE_URL}/api/admin/prizes`;
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.ok) {
                this.showToast(id ? 'Prize updated!' : 'Prize added!', 'success');
                document.getElementById('prizeModal').classList.remove('open');
                this.loadPrizes();
            } else {
                this.showToast(data.message || 'Error', 'error');
            }
        } catch (error) {
            console.error(error);
            this.showToast('Error saving prize', 'error');
        }
    },

    deletePrize: async function (id) {
        if (!confirm('Are you sure you want to delete this prize?')) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/prizes/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await res.json();

            if (data.ok) {
                this.showToast('Prize deleted', 'success');
                this.loadPrizes();
            } else {
                this.showToast(data.message || 'Error', 'error');
            }
        } catch (error) {
            console.error(error);
        }
    },

    seedDefaultPrizes: async function () {
        if (!confirm('This will add 6 default prizes. Continue?')) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/prizes/seed`, {
                method: 'POST',
                credentials: 'include'
            });
            const data = await res.json();

            if (data.ok) {
                this.showToast(`Seeded ${data.count} default prizes!`, 'success');
                this.loadPrizes();
            } else {
                this.showToast(data.message || 'Error', 'error');
            }
        } catch (error) {
            console.error(error);
        }
    },

    // ==================== PROBABILITY SETTINGS ====================
    loadProbabilities: async function () {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/prizes`, { credentials: 'include' });
            const data = await res.json();
            if (data.ok) {
                this.prizes = data.prizes;
                this.renderProbabilitySliders(data.prizes);
            }
        } catch (error) {
            console.error('Load Probabilities Error:', error);
        }
    },

    renderProbabilitySliders: function (prizes) {
        const container = document.getElementById('probabilityList');
        if (!container) return;

        if (!prizes || prizes.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted)">No prizes found. Add prizes first.</div>';
            return;
        }

        container.innerHTML = prizes.map(p => `
            <div class="probability-item" style="display:flex; align-items:center; gap:16px; padding:12px; background:var(--bg-body); border-radius:8px;">
                <div style="width:120px; font-weight:500;">${p.name}</div>
                <div style="width:24px; height:24px; border-radius:50%; background:${p.color};"></div>
                <input type="range" min="0" max="100" value="${p.probability}" data-id="${p._id}"
                    oninput="AdminApp.updateProbabilityDisplay(this)"
                    style="flex:1; height:8px;">
                <input type="number" min="0" max="100" value="${p.probability}" data-id="${p._id}"
                    oninput="AdminApp.syncProbabilityFromInput(this)"
                    style="width:60px; text-align:center; padding:8px; border:1px solid var(--border-color); border-radius:6px;">
                <span>%</span>
            </div>
        `).join('');

        this.calculateTotalProbability();
    },

    updateProbabilityDisplay: function (slider) {
        const id = slider.dataset.id;
        const value = slider.value;
        const input = document.querySelector(`input[type="number"][data-id="${id}"]`);
        if (input) input.value = value;
        this.calculateTotalProbability();
    },

    syncProbabilityFromInput: function (input) {
        const id = input.dataset.id;
        const value = input.value;
        const slider = document.querySelector(`input[type="range"][data-id="${id}"]`);
        if (slider) slider.value = value;
        this.calculateTotalProbability();
    },

    calculateTotalProbability: function () {
        const inputs = document.querySelectorAll('#probabilityList input[type="number"]');
        let total = 0;
        inputs.forEach(inp => total += parseFloat(inp.value) || 0);

        const el = document.getElementById('totalProbability');
        if (el) {
            el.textContent = `Total: ${total.toFixed(1)}%`;
            el.style.color = Math.abs(total - 100) < 0.1 ? 'var(--success)' : 'var(--accent-red)';
        }
    },

    saveProbabilities: async function () {
        const inputs = document.querySelectorAll('#probabilityList input[type="number"]');
        const probabilities = [];
        inputs.forEach(inp => {
            probabilities.push({
                id: inp.dataset.id,
                probability: parseFloat(inp.value) || 0
            });
        });

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/prizes/probabilities/batch`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ probabilities })
            });
            const data = await res.json();

            if (data.ok) {
                this.showToast('Probabilities saved!', 'success');
            } else {
                this.showToast(data.message || 'Error', 'error');
            }
        } catch (error) {
            console.error(error);
            this.showToast('Error saving probabilities', 'error');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AdminApp.init();
});
