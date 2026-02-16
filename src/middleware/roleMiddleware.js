const ResponseHelper = require("../utils/responseHelper");

/**
 * Role-based Access Control Middleware
 * Checks if user has required role(s)
 * ✅ FIXED: Case-insensitive role comparison for production robustness
 *
 * @param {Array<string>} allowedRoles - Array of allowed roles
 * @returns {Function} Middleware function
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      // Check if user is authenticated (should be set by authMiddleware)
      if (!req.user) {
        return ResponseHelper.unauthorized(res, "Authentication required");
      }

      // ✅ FIX: Case-insensitive role comparison
      const userRole = (req.user.role || "").toLowerCase();
      const normalizedAllowedRoles = allowedRoles.map((role) => role.toLowerCase());

      // Check if user's role is in allowed roles
      if (!normalizedAllowedRoles.includes(userRole)) {
        return ResponseHelper.forbidden(res, `Access denied. Required role: ${allowedRoles.join(" or ")}`);
      }

      next();
    } catch (error) {
      return ResponseHelper.error(res, 403, "Access control check failed", process.env.NODE_ENV === "development" ? error.message : null);
    }
  };
};

/**
 * Specific role middleware shortcuts
 */
const requireSuperAdmin = requireRole(["superAdmin"]);
const requireAdmin = requireRole(["superAdmin", "admin"]);
const requireUser = requireRole(["superAdmin", "admin", "user"]);

module.exports = {
  requireRole,
  requireSuperAdmin,
  requireAdmin,
  requireUser,
};
