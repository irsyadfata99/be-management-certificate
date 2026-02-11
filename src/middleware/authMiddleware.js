const JwtHelper = require("../utils/jwtHelper");
const ResponseHelper = require("../utils/responseHelper");

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user data to request
 */
const authMiddleware = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return ResponseHelper.unauthorized(res, "No token provided");
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = JwtHelper.verifyAccessToken(token);

    // Attach user data to request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    };

    next();
  } catch (error) {
    // Handle specific JWT errors
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
