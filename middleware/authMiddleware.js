const requireAdminSession = (req, res, next) => {
    // Debug Logs
    console.log(`[AuthDebug] Checking Session ID: ${req.sessionID}`);
    // console.log(`[AuthDebug] Session Data:`, req.session); // Too verbose
    console.log(`[AuthDebug] Cookies (Raw):`, req.headers.cookie);
    console.log(`[AuthDebug] Cookies (Parsed):`, req.cookies);

    // Validate Session
    if (req.session && req.session.admin && req.session.admin.role === 'admin') {
        return next();
    }

    console.log('[AuthDebug] Unauthorized access attempt (No valid admin session found)');
    return res.status(401).json({ message: 'Unauthorized: Admin access required' });
};

module.exports = { requireAdminSession };
