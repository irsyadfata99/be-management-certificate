const ResponseHelper = require("../utils/responseHelper");
const ipRangeCheck = require("ip-range-check");
const logger = require("../utils/logger");

const IP_WHITELIST = (process.env.ADMIN_IP_WHITELIST || "")
  .split(",")
  .map((ip) => ip.trim())
  .filter((ip) => ip.length > 0);

const IP_WHITELIST_ENABLED = process.env.IP_WHITELIST_ENABLED === "true" || IP_WHITELIST.length > 0;

const EXACT_IPS = IP_WHITELIST.filter((ip) => !ip.includes("/"));
const CIDR_RANGES = IP_WHITELIST.filter((ip) => ip.includes("/"));

class IPWhitelistMiddleware {
  static getClientIP(req) {
    if (req.ip) {
      return req.ip.startsWith("::ffff:") ? req.ip.substring(7) : req.ip;
    }

    const cfConnectingIP = req.headers["cf-connecting-ip"];
    if (cfConnectingIP) return cfConnectingIP.trim();

    let ip = req.socket?.remoteAddress || "";
    if (ip.startsWith("::ffff:")) ip = ip.substring(7);
    if (ip === "::1") ip = "127.0.0.1";
    return ip;
  }

  static isWhitelisted(ip) {
    if (!IP_WHITELIST_ENABLED) return true;

    if (IP_WHITELIST.length === 0) {
      logger.warn("[IP Whitelist] Whitelist is enabled but empty — blocking all admin actions");
      return false;
    }

    const normalizedIP = ip.trim();

    const localhostIPs = ["127.0.0.1", "::1", "localhost"];
    if (localhostIPs.includes(normalizedIP) && EXACT_IPS.some((w) => localhostIPs.includes(w))) {
      return true;
    }

    if (EXACT_IPS.includes(normalizedIP)) return true;

    if (CIDR_RANGES.length > 0) {
      try {
        if (ipRangeCheck(normalizedIP, CIDR_RANGES)) return true;
      } catch (err) {
        logger.warn("[IP Whitelist] Error checking CIDR range", {
          ip: normalizedIP,
          error: err.message,
        });
      }
    }

    return false;
  }

  static requireWhitelistedIP = (req, res, next) => {
    if (!req.user || (req.user.role !== "admin" && req.user.role !== "superAdmin")) {
      return next();
    }

    if (!IP_WHITELIST_ENABLED) return next();

    const clientIP = IPWhitelistMiddleware.getClientIP(req);

    if (IPWhitelistMiddleware.isWhitelisted(clientIP)) {
      if (process.env.NODE_ENV === "development") {
        logger.debug("[IP Whitelist] Admin access granted", {
          username: req.user.username,
          ip: clientIP,
        });
      }
      return next();
    }

    logger.warn("[SECURITY] Admin access blocked — IP not whitelisted", {
      username: req.user.username,
      ip: clientIP,
    });

    return ResponseHelper.error(res, 403, "Access denied. Your IP address is not authorized for admin actions.", process.env.NODE_ENV === "development" ? { clientIP } : null);
  };
}

module.exports = IPWhitelistMiddleware;
