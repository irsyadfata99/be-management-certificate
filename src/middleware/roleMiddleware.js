const ResponseHelper = require("../utils/responseHelper");

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return ResponseHelper.unauthorized(res, "Authentication required");
      }

      const userRole = (req.user.role || "").toLowerCase();
      const normalizedAllowedRoles = allowedRoles.map((role) =>
        role.toLowerCase(),
      );

      if (!normalizedAllowedRoles.includes(userRole)) {
        return ResponseHelper.forbidden(
          res,
          `Access denied. Required role: ${allowedRoles.join(" or ")}`,
        );
      }

      next();
    } catch (error) {
      return ResponseHelper.error(
        res,
        403,
        "Access control check failed",
        process.env.NODE_ENV === "development" ? error.message : null,
      );
    }
  };
};

const requireSuperAdmin = requireRole(["superAdmin"]);
const requireAdmin = requireRole(["superAdmin", "admin"]);
const requireUser = requireRole(["superAdmin", "admin", "user"]);

module.exports = {
  requireRole,
  requireSuperAdmin,
  requireAdmin,
  requireUser,
};
