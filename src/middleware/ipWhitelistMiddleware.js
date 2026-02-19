const ResponseHelper = require("../utils/responseHelper");
const ipRangeCheck = require("ip-range-check");
const logger = require("../utils/logger");

const IP_WHITELIST = (process.env.ADMIN_IP_WHITELIST || "")
  .split(",")
  .map((ip) => ip.trim())
  .filter((ip) => ip.length > 0);

const IP_WHITELIST_ENABLED =
  process.env.IP_WHITELIST_ENABLED === "true" || IP_WHITELIST.length > 0;

const EXACT_IPS = IP_WHITELIST.filter((ip) => !ip.includes("/"));
const CIDR_RANGES = IP_WHITELIST.filter((ip) => ip.includes("/"));

class IPWhitelistMiddleware {
  static getClientIP(req) {
    // req.ip is set correctly by Express when trust proxy is configured
    if (req.ip) {
      // Normalise IPv4-mapped IPv6 addresses (::ffff:x.x.x.x → x.x.x.x)
      return req.ip.startsWith("::ffff:") ? req.ip.substring(7) : req.ip;
    }

    // Fallback: Cloudflare header (only if sitting directly behind CF)
    const cfConnectingIP = req.headers["cf-connecting-ip"];
    if (cfConnectingIP) return cfConnectingIP.trim();

    // Last resort: raw socket (no proxy)
    let ip = req.socket?.remoteAddress || "";
    if (ip.startsWith("::ffff:")) ip = ip.substring(7);
    if (ip === "::1") ip = "127.0.0.1";
    return ip;
  }

  static isWhitelisted(ip) {
    if (!IP_WHITELIST_ENABLED) return true;

    if (IP_WHITELIST.length === 0) {
      logger.warn(
        "[IP Whitelist] Whitelist is enabled but empty — blocking all admin actions",
      );
      return false;
    }

    const normalizedIP = ip.trim();

    // Localhost shortcuts
    const localhostIPs = ["127.0.0.1", "::1", "localhost"];
    if (
      localhostIPs.includes(normalizedIP) &&
      EXACT_IPS.some((w) => localhostIPs.includes(w))
    ) {
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
    if (
      !req.user ||
      (req.user.role !== "admin" && req.user.role !== "superAdmin")
    ) {
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

    return ResponseHelper.error(
      res,
      403,
      "Access denied. Your IP address is not authorized for admin actions.",
      process.env.NODE_ENV === "development" ? { clientIP } : null,
    );
  };

  static getConfig() {
    return {
      enabled: IP_WHITELIST_ENABLED,
      whitelistedIPs: IP_WHITELIST_ENABLED ? IP_WHITELIST : [],
      exactIPs: EXACT_IPS,
      cidrRanges: CIDR_RANGES,
      count: IP_WHITELIST.length,
    };
  }

  static addIP(ip) {
    const trimmedIP = ip.trim();
    if (!trimmedIP) return false;

    if (!IP_WHITELIST.includes(trimmedIP)) {
      IP_WHITELIST.push(trimmedIP);
      if (trimmedIP.includes("/")) {
        CIDR_RANGES.push(trimmedIP);
      } else {
        EXACT_IPS.push(trimmedIP);
      }
      logger.info("[IP Whitelist] Added IP", { ip: trimmedIP });
      return true;
    }
    return false;
  }

  static removeIP(ip) {
    const trimmedIP = ip.trim();
    const index = IP_WHITELIST.indexOf(trimmedIP);

    if (index > -1) {
      IP_WHITELIST.splice(index, 1);
      const exactIdx = EXACT_IPS.indexOf(trimmedIP);
      if (exactIdx > -1) EXACT_IPS.splice(exactIdx, 1);
      const cidrIdx = CIDR_RANGES.indexOf(trimmedIP);
      if (cidrIdx > -1) CIDR_RANGES.splice(cidrIdx, 1);

      logger.info("[IP Whitelist] Removed IP", { ip: trimmedIP });
      return true;
    }
    return false;
  }
}

module.exports = IPWhitelistMiddleware;
