/**
 * IP Whitelist Middleware
 * Restricts admin actions to whitelisted IP addresses
 */

const ResponseHelper = require("../utils/responseHelper");

// IP Whitelist Configuration
// In production, move this to environment variables or database
const IP_WHITELIST = (process.env.ADMIN_IP_WHITELIST || "")
  .split(",")
  .map((ip) => ip.trim())
  .filter((ip) => ip.length > 0);

// Enable/disable IP whitelisting via environment variable
const IP_WHITELIST_ENABLED = process.env.IP_WHITELIST_ENABLED === "true" || IP_WHITELIST.length > 0;

class IPWhitelistMiddleware {
  /**
   * Get client IP address from request
   * Handles proxies and load balancers
   *
   * @param {Object} req - Express request object
   * @returns {string} Client IP address
   */
  static getClientIP(req) {
    // Check for IP in various headers (in order of priority)
    const forwardedFor = req.headers["x-forwarded-for"];
    const realIP = req.headers["x-real-ip"];
    const cfConnectingIP = req.headers["cf-connecting-ip"]; // Cloudflare
    const socketIP = req.socket.remoteAddress;

    // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2...)
    // Take the first one (original client)
    if (forwardedFor) {
      const ips = forwardedFor.split(",").map((ip) => ip.trim());
      return ips[0];
    }

    if (cfConnectingIP) {
      return cfConnectingIP;
    }

    if (realIP) {
      return realIP;
    }

    // Fallback to socket IP
    // Handle IPv6 localhost (::1) and IPv4-mapped IPv6 (::ffff:127.0.0.1)
    let ip = socketIP || "";
    if (ip.startsWith("::ffff:")) {
      ip = ip.substring(7);
    }
    if (ip === "::1") {
      ip = "127.0.0.1";
    }

    return ip;
  }

  /**
   * Check if IP is in whitelist
   *
   * @param {string} ip - IP address to check
   * @returns {boolean} True if IP is whitelisted or whitelist is disabled
   */
  static isWhitelisted(ip) {
    // If whitelisting is disabled, allow all IPs
    if (!IP_WHITELIST_ENABLED) {
      return true;
    }

    // If whitelist is empty, block all (fail-safe)
    if (IP_WHITELIST.length === 0) {
      console.warn("[IP Whitelist] Whitelist is enabled but empty - blocking all admin actions");
      return false;
    }

    // Normalize IP
    const normalizedIP = ip.trim();

    // Check exact match
    if (IP_WHITELIST.includes(normalizedIP)) {
      return true;
    }

    // Check localhost variations
    const localhostIPs = ["127.0.0.1", "::1", "localhost"];
    if (localhostIPs.includes(normalizedIP) && IP_WHITELIST.some((whitelistedIP) => localhostIPs.includes(whitelistedIP))) {
      return true;
    }

    // Check CIDR ranges (if implemented - basic version here)
    // For production, use a library like 'ipaddr.js' or 'ip-range-check'
    for (const whitelistedIP of IP_WHITELIST) {
      if (whitelistedIP.includes("/")) {
        // CIDR notation detected - skip for now (would need library)
        console.warn(`[IP Whitelist] CIDR notation "${whitelistedIP}" detected but not implemented. Use exact IPs.`);
        continue;
      }
    }

    return false;
  }

  /**
   * Middleware: Require whitelisted IP for admin actions
   * Only applies to users with 'admin' or 'superAdmin' role
   */
  static requireWhitelistedIP(req, res, next) {
    // Skip if user is not admin
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "superAdmin")) {
      return next();
    }

    // Skip if IP whitelisting is disabled
    if (!IP_WHITELIST_ENABLED) {
      return next();
    }

    const clientIP = this.getClientIP(req);

    if (this.isWhitelisted(clientIP)) {
      // Log successful admin access
      if (process.env.NODE_ENV === "development") {
        console.log(`[IP Whitelist] Admin access granted: ${req.user.username} from ${clientIP}`);
      }
      return next();
    }

    // Block non-whitelisted IP
    console.warn(`[SECURITY] Admin access blocked: ${req.user.username} from ${clientIP} - IP not whitelisted`);

    return ResponseHelper.error(res, 403, "Access denied. Your IP address is not authorized for admin actions.", process.env.NODE_ENV === "development" ? { clientIP } : null);
  }

  /**
   * Get current whitelist configuration (for admin panel)
   * @returns {Object} Whitelist info
   */
  static getConfig() {
    return {
      enabled: IP_WHITELIST_ENABLED,
      whitelistedIPs: IP_WHITELIST_ENABLED ? IP_WHITELIST : [],
      count: IP_WHITELIST.length,
    };
  }

  /**
   * Add IP to whitelist dynamically (for runtime management)
   * Note: This is in-memory. For persistence, update env vars or database
   *
   * @param {string} ip - IP address to add
   * @returns {boolean} Success
   */
  static addIP(ip) {
    const trimmedIP = ip.trim();
    if (!trimmedIP) return false;

    if (!IP_WHITELIST.includes(trimmedIP)) {
      IP_WHITELIST.push(trimmedIP);
      console.log(`[IP Whitelist] Added IP: ${trimmedIP}`);
      return true;
    }

    return false;
  }

  /**
   * Remove IP from whitelist dynamically
   *
   * @param {string} ip - IP address to remove
   * @returns {boolean} Success
   */
  static removeIP(ip) {
    const trimmedIP = ip.trim();
    const index = IP_WHITELIST.indexOf(trimmedIP);

    if (index > -1) {
      IP_WHITELIST.splice(index, 1);
      console.log(`[IP Whitelist] Removed IP: ${trimmedIP}`);
      return true;
    }

    return false;
  }
}

module.exports = IPWhitelistMiddleware;
