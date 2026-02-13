const rateLimit = require("express-rate-limit");

/**
 * General API Rate Limiter
 * Production-ready limits for normal API usage
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour (changed from 15 minutes)
  max: 500, // Limit each IP to 500 requests per hour
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Authentication Routes Rate Limiter
 * More restrictive for login/auth attempts
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count successful requests
});

/**
 * Strict Rate Limiter for sensitive operations
 * Very restrictive for password changes, etc.
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 requests per windowMs
  message: {
    success: false,
    message: "Too many attempts for this operation, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  authLimiter,
  strictLimiter,
};
