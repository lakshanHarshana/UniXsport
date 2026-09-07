const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db');

/**
 * Verify JWT Token Middleware
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // Also check query parameter or cookie if token not in header
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
  }

  // Check if token has been revoked / logged out
  const isRevoked = (db.sessions || []).some(s => s.token === token && s.revoked);
  if (isRevoked) {
    return res.status(401).json({ success: false, error: 'Session has been invalidated. Please log in again.' });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Invalid or expired token.' });
  }
}

/**
 * Role Authorization Middleware (Case-insensitive)
 */
function authorizeRoles(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());
  return (req, res, next) => {
    const userRole = (req.user && req.user.role) ? req.user.role.toLowerCase() : 'guest';
    if (!req.user || (!normalizedAllowed.includes(userRole) && userRole !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: `Unauthorized access. Role '${req.user ? req.user.role : 'guest'}' is not allowed.`
      });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles
};
