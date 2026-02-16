const JwtHelper = require("../utils/jwtHelper");
const ResponseHelper = require("../utils/responseHelper");

/**
 * Authentication Middleware
 *
 * FIX: Tambah branch_id ke req.user dari JWT payload.
 * authService.login() sekarang menyertakan branchId di token,
 * sehingga semua handler bisa akses req.user.branch_id tanpa query DB tambahan.
 *
 * Naming convention:
 *   JWT payload  → branchId  (camelCase, standard JWT)
 *   req.user     → branch_id (snake_case, konsisten dengan DB & service layer)
 */
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return ResponseHelper.unauthorized(res, "No token provided");
    }

    const token = authHeader.substring(7);
    const decoded = JwtHelper.verifyAccessToken(token);

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      branch_id: decoded.branchId ?? null, // ← FIX: expose dari token
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return ResponseHelper.unauthorized(res, "Token has expired");
    }

    if (error.name === "JsonWebTokenError") {
      return ResponseHelper.unauthorized(res, "Invalid token");
    }

    return ResponseHelper.error(
      res,
      401,
      "Authentication failed",
      process.env.NODE_ENV === "development" ? error.message : null,
    );
  }
};

module.exports = authMiddleware;
