// ✅ FIXED: Use same origin (served from Express on port 3000)
const API_BASE_URL = window.location.origin;

const AdminLogin = {
    init: async function () {
        // Check if already logged in
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/auth/me`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (data.ok) {
                    window.location.href = 'admin.html';
                    return;
                }
            }
        } catch (error) {
            console.log('Not logged in or server unreachable');
        }
    },

    handleLogin: async function (e) {
        e.preventDefault();

        const usernameEl = document.getElementById('username');
        const passwordEl = document.getElementById('password');
        const btnText = document.getElementById('btnText');
        const btnLoading = document.getElementById('btnLoading');
        const loginBtn = document.getElementById('loginBtn');
        const errorMsg = document.getElementById('errorMsg');

        // Reset UI
        errorMsg.classList.add('hidden');
        loginBtn.disabled = true;
        loginBtn.classList.add('opacity-75', 'cursor-not-allowed');
        btnText.textContent = 'AUTHENTICATING...';
        btnLoading.classList.remove('hidden');

        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    username: usernameEl.value.trim(),
                    password: passwordEl.value.trim()
                })
            });

            const data = await response.json();

            if (response.ok && data.ok) {
                window.location.href = 'admin.html';
            } else {
                throw new Error(data.message || 'Login failed');
            }

        } catch (error) {
            const errorSpan = errorMsg.querySelector('span');
            if (errorSpan) errorSpan.textContent = error.message;
            errorMsg.classList.remove('hidden');

            loginBtn.disabled = false;
            loginBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            btnText.textContent = 'LOGIN SYSTEM';
            btnLoading.classList.add('hidden');
        }
    }
};

document.addEventListener('DOMContentLoaded', AdminLogin.init);
