/**
 * IP Whitelist Middleware
 * Restricts admin actions to whitelisted IP addresses
 */

const ResponseHelper = require("../utils/responseHelper");
// FIX: Library ip-range-check sudah diinstall tapi tidak pernah dipanggil.
// Sebelumnya CIDR detection hanya console.warn lalu di-skip.
// Sekarang CIDR ranges diproses dengan benar menggunakan library ini.
const ipRangeCheck = require("ip-range-check");

// IP Whitelist Configuration
const IP_WHITELIST = (process.env.ADMIN_IP_WHITELIST || "")
  .split(",")
  .map((ip) => ip.trim())
  .filter((ip) => ip.length > 0);

const IP_WHITELIST_ENABLED =
  process.env.IP_WHITELIST_ENABLED === "true" || IP_WHITELIST.length > 0;

// Pre-split whitelist untuk efisiensi — pisahkan exact IP vs CIDR ranges
// sehingga tidak perlu re-parse setiap request
const EXACT_IPS = IP_WHITELIST.filter((ip) => !ip.includes("/"));
const CIDR_RANGES = IP_WHITELIST.filter((ip) => ip.includes("/"));

class IPWhitelistMiddleware {
  /**
   * Get client IP address from request
   * Handles proxies and load balancers
   *
   * @param {Object} req - Express request object
   * @returns {string} Client IP address
   */
  static getClientIP(req) {
    const forwardedFor = req.headers["x-forwarded-for"];
    const realIP = req.headers["x-real-ip"];
    const cfConnectingIP = req.headers["cf-connecting-ip"]; // Cloudflare

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
    let ip = req.socket.remoteAddress || "";
    if (ip.startsWith("::ffff:")) {
      ip = ip.substring(7);
    }
    if (ip === "::1") {
      ip = "127.0.0.1";
    }

    return ip;
  }

  /**
   * Check if IP is in whitelist (supports exact IPs and CIDR ranges)
   *
   * @param {string} ip - IP address to check
   * @returns {boolean} True if IP is whitelisted or whitelist is disabled
   */
  static isWhitelisted(ip) {
    if (!IP_WHITELIST_ENABLED) {
      return true;
    }

    if (IP_WHITELIST.length === 0) {
      console.warn(
        "[IP Whitelist] Whitelist is enabled but empty - blocking all admin actions",
      );
      return false;
    }

    const normalizedIP = ip.trim();

    // Check exact match (termasuk localhost variations)
    const localhostIPs = ["127.0.0.1", "::1", "localhost"];
    const isLocalhost = localhostIPs.includes(normalizedIP);
    const whitelistHasLocalhost = EXACT_IPS.some((w) =>
      localhostIPs.includes(w),
    );

    if (isLocalhost && whitelistHasLocalhost) {
      return true;
    }

    if (EXACT_IPS.includes(normalizedIP)) {
      return true;
    }

    // FIX: Cek CIDR ranges menggunakan ip-range-check
    // Sebelumnya hanya console.warn dan di-skip tanpa pengecekan.
    if (CIDR_RANGES.length > 0) {
      try {
        if (ipRangeCheck(normalizedIP, CIDR_RANGES)) {
          return true;
        }
      } catch (err) {
        // IP tidak valid atau format CIDR salah — log dan anggap tidak match
        console.warn(
          `[IP Whitelist] Error checking CIDR for IP "${normalizedIP}":`,
          err.message,
        );
      }
    }

    return false;
  }

  /**
   * Middleware: Require whitelisted IP for admin actions
   * Only applies to users with 'admin' or 'superAdmin' role
   */
  static requireWhitelistedIP(req, res, next) {
    if (
      !req.user ||
      (req.user.role !== "admin" && req.user.role !== "superAdmin")
    ) {
      return next();
    }

    if (!IP_WHITELIST_ENABLED) {
      return next();
    }

    const clientIP = this.getClientIP(req);

    if (this.isWhitelisted(clientIP)) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[IP Whitelist] Admin access granted: ${req.user.username} from ${clientIP}`,
        );
      }
      return next();
    }

    console.warn(
      `[SECURITY] Admin access blocked: ${req.user.username} from ${clientIP} - IP not whitelisted`,
    );

    return ResponseHelper.error(
      res,
      403,
      "Access denied. Your IP address is not authorized for admin actions.",
      process.env.NODE_ENV === "development" ? { clientIP } : null,
    );
  }

  /**
   * Get current whitelist configuration (for admin panel)
   * @returns {Object} Whitelist info
   */
  static getConfig() {
    return {
      enabled: IP_WHITELIST_ENABLED,
      whitelistedIPs: IP_WHITELIST_ENABLED ? IP_WHITELIST : [],
      exactIPs: EXACT_IPS,
      cidrRanges: CIDR_RANGES,
      count: IP_WHITELIST.length,
    };
  }

  /**
   * Add IP to whitelist dynamically (in-memory only)
   * For persistence, update env vars atau database
   *
   * @param {string} ip - IP address to add
   * @returns {boolean} Success
   */
  static addIP(ip) {
    const trimmedIP = ip.trim();
    if (!trimmedIP) return false;

    if (!IP_WHITELIST.includes(trimmedIP)) {
      IP_WHITELIST.push(trimmedIP);
      // Sync ke pre-split arrays
      if (trimmedIP.includes("/")) {
        CIDR_RANGES.push(trimmedIP);
      } else {
        EXACT_IPS.push(trimmedIP);
      }
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
      // Sync ke pre-split arrays
      const exactIdx = EXACT_IPS.indexOf(trimmedIP);
      if (exactIdx > -1) EXACT_IPS.splice(exactIdx, 1);
      const cidrIdx = CIDR_RANGES.indexOf(trimmedIP);
      if (cidrIdx > -1) CIDR_RANGES.splice(cidrIdx, 1);

      console.log(`[IP Whitelist] Removed IP: ${trimmedIP}`);
      return true;
    }

    return false;
  }
}

module.exports = IPWhitelistMiddleware;
