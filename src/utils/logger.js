/**
 * Production-Ready Logger
 * Uses Winston for structured logging
 *
 * Install: npm install winston winston-daily-rotate-file
 *
 * Usage:
 *   logger.info('Server started', { port: 5000 });
 *   logger.error('Database error', { error: err.message });
 *   logger.warn('Low stock alert', { branch: 'BSD', stock: 3 });
 */

const winston = require("winston");
require("winston-daily-rotate-file");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const LOG_DIR = path.join(__dirname, "../../logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Custom format for console output (development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = "";
    if (Object.keys(meta).length > 0) {
      metaStr = "\n" + JSON.stringify(meta, null, 2);
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  }),
);

// Custom format for file output (production)
const fileFormat = winston.format.combine(winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), winston.format.errors({ stack: true }), winston.format.json());

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: fileFormat,
  defaultMeta: {
    service: "saas-certificate-api",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    // Error logs - separate file
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxSize: "20m",
      maxFiles: "14d", // Keep 14 days
      zippedArchive: true,
    }),

    // Combined logs - all levels
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "7d", // Keep 7 days
      zippedArchive: true,
    }),
  ],

  // Don't crash on logging errors
  exitOnError: false,
});

// Add console transport in development or if explicitly enabled
if (process.env.NODE_ENV !== "production" || process.env.LOG_TO_CONSOLE === "true") {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    }),
  );
}

// Production: log to console with JSON format (for cloud logging)
if (process.env.NODE_ENV === "production" && process.env.LOG_TO_CONSOLE !== "false") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  );
}

// Helper methods for common logging patterns
logger.logRequest = (req, duration) => {
  logger.info("HTTP Request", {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    duration: `${duration}ms`,
    userId: req.user?.userId,
  });
};

logger.logError = (error, context = {}) => {
  logger.error(error.message, {
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    ...context,
  });
};

logger.logSecurity = (event, details = {}) => {
  logger.warn(`Security Event: ${event}`, {
    security: true,
    event,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

// Log startup info
logger.info("Logger initialized", {
  level: process.env.LOG_LEVEL || "info",
  logDir: LOG_DIR,
  environment: process.env.NODE_ENV || "development",
});

module.exports = logger;
