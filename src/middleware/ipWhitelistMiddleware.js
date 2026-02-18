const ResponseHelper = require("../utils/responseHelper");
const ipRangeCheck = require("ip-range-check");

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
    const forwardedFor = req.headers["x-forwarded-for"];
    const realIP = req.headers["x-real-ip"];
    const cfConnectingIP = req.headers["cf-connecting-ip"];

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

    let ip = req.socket.remoteAddress || "";
    if (ip.startsWith("::ffff:")) {
      ip = ip.substring(7);
    }
    if (ip === "::1") {
      ip = "127.0.0.1";
    }

    return ip;
  }

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

    if (CIDR_RANGES.length > 0) {
      try {
        if (ipRangeCheck(normalizedIP, CIDR_RANGES)) {
          return true;
        }
      } catch (err) {
        console.warn(
          `[IP Whitelist] Error checking CIDR for IP "${normalizedIP}":`,
          err.message,
        );
      }
    }

    return false;
  }

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
