/**
 * Production-Ready Logger
 * Uses Winston for structured logging
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
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

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
      maxFiles: "14d",
      zippedArchive: true,
    }),

    // Combined logs - all levels
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "7d",
      zippedArchive: true,
    }),
  ],

  exitOnError: false,
});

// FIX: Sebelumnya ada dua blok if yang bisa sama-sama true di production,
// menyebabkan dua console transport aktif sekaligus (log ganda).
//
// Logika yang benar:
//   - development           → console dengan format colorized (readable)
//   - production            → console dengan format JSON (untuk cloud logging)
//   - LOG_TO_CONSOLE=false  → tidak ada console transport sama sekali
//
// Ketiganya mutually exclusive — hanya satu console transport yang aktif.

const isProduction = process.env.NODE_ENV === "production";
const consoleDisabled = process.env.LOG_TO_CONSOLE === "false";

if (!consoleDisabled) {
  if (isProduction) {
    // Production: JSON format untuk cloud logging (Datadog, CloudWatch, dll)
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    );
  } else {
    // Development: human-readable colorized format
    logger.add(
      new winston.transports.Console({
        format: consoleFormat,
      }),
    );
  }
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

logger.info("Logger initialized", {
  level: process.env.LOG_LEVEL || "info",
  logDir: LOG_DIR,
  environment: process.env.NODE_ENV || "development",
});

module.exports = logger;
