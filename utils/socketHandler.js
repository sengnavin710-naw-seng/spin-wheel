const socketIo = require('socket.io');
const User = require('../models/User');
const SpinCode = require('../models/SpinCode');
const SpinLog = require('../models/SpinLog');

// In-memory tracking: Map<UserId, Set<SocketId>>
const activeUsers = new Map();

let io;

const getActiveUserCount = () => activeUsers.size;

const computeKpis = async () => {
    try {
        // ✅ FIXED: Count ALL users where role is NOT 'admin' (includes null/undefined/user)
        const totalUsers = await User.countDocuments({
            $or: [
                { role: { $ne: 'admin' } },
                { role: { $exists: false } },
                { role: null }
            ]
        });
        const activeCount = getActiveUserCount();

        // ✅ FIXED: Use SpinLog for total spins (matching Spin History)
        const totalSpins = await SpinLog.countDocuments({});

        const availableCodes = await SpinCode.countDocuments({ status: 'active' });
        const usedCodes = await SpinCode.countDocuments({ status: 'used' });

        return {
            totalUsers,
            activeUsers: activeCount,
            totalSpins,
            availableCodes,
            usedCodes
        };
    } catch (error) {
        console.error("[Socket] Error computing KPIs:", error);
        return null;
    }
};

const broadcastKpis = async () => {
    if (!io) return;
    const stats = await computeKpis();
    if (stats) {
        io.of('/admin').emit('kpi:update', stats);
        console.log('[Socket] Broadcasted KPI update:', stats);
    }
};

const initSocket = (server, sessionMiddleware) => {
    io = socketIo(server, {
        cors: {
            origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://127.0.0.1:3000', 'http://localhost:3000'],
            credentials: true,
            methods: ["GET", "POST"]
        }
    });

    // ✅ FIXED: Wrap session middleware for Socket.IO properly
    const wrapSessionMiddleware = (middleware) => (socket, next) => {
        middleware(socket.request, {}, next);
    };

    // Apply session middleware to ALL sockets (main namespace)
    io.use(wrapSessionMiddleware(sessionMiddleware));

    // --- Admin Namespace ---
    const adminNs = io.of('/admin');

    // ✅ Apply session middleware to /admin namespace as well
    adminNs.use(wrapSessionMiddleware(sessionMiddleware));

    // Admin Middleware: Check for Admin Role in Session
    adminNs.use((socket, next) => {
        const session = socket.request.session;

        console.log('[Socket] Admin namespace auth check:', {
            hasSession: !!session,
            hasAdmin: !!(session && session.admin),
            adminRole: session?.admin?.role
        });

        if (session && session.admin && session.admin.role === 'admin') {
            return next();
        }
        console.log('[Socket] Admin auth failed - no valid admin session');
        return next(new Error("Unauthorized: Admin session required"));
    });

    adminNs.on('connection', async (socket) => {
        const username = socket.request.session?.admin?.username || 'Unknown';
        console.log(`[Socket] ✅ Admin connected: ${socket.id} (${username})`);

        // Send immediate KPI update to this admin
        const stats = await computeKpis();
        if (stats) {
            socket.emit('kpi:update', stats);
            console.log('[Socket] Sent initial KPIs to admin:', username);
        }

        socket.on('disconnect', () => {
            console.log(`[Socket] Admin disconnected: ${socket.id}`);
        });
    });

    // --- Public Namespace (Active User Tracking) ---
    io.on('connection', (socket) => {
        const session = socket.request.session;

        console.log('[Socket] User connection:', {
            socketId: socket.id,
            hasSession: !!session,
            hasUser: !!(session && session.user)
        });

        if (session && session.user && session.user.id) {
            const userId = session.user.id.toString();
            const username = session.user.username || 'Unknown';

            if (!activeUsers.has(userId)) {
                activeUsers.set(userId, new Set());
            }
            activeUsers.get(userId).add(socket.id);

            console.log(`[Socket] ✅ User presence registered: ${username} (${userId})`);

            // If this is the first socket for this user, they just came online
            if (activeUsers.get(userId).size === 1) {
                broadcastKpis(); // Active Users count changed
            }

            socket.on('disconnect', () => {
                const userSockets = activeUsers.get(userId);
                if (userSockets) {
                    userSockets.delete(socket.id);
                    if (userSockets.size === 0) {
                        activeUsers.delete(userId);
                        console.log(`[Socket] User went offline: ${username}`);
                        broadcastKpis(); // Active Users count changed
                    }
                }
            });
        }
    });

    console.log('[Socket] ✅ Socket.IO initialized successfully');
    return io;
};

const getIo = () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
};

module.exports = { initSocket, getIo, broadcastKpis };
