const winston = require("winston");
require("winston-daily-rotate-file");
const path = require("path");
const fs = require("fs");

const LOG_DIR = path.join(__dirname, "../../logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

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

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: fileFormat,
  defaultMeta: {
    service: "saas-certificate-api",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(LOG_DIR, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxSize: "20m",
      maxFiles: "14d",
      zippedArchive: true,
    }),

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

const isProduction = process.env.NODE_ENV === "production";
const consoleDisabled = process.env.LOG_TO_CONSOLE === "false";

if (!consoleDisabled) {
  if (isProduction) {
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    );
  } else {
    logger.add(
      new winston.transports.Console({
        format: consoleFormat,
      }),
    );
  }
}

// FIX: Hapus logRequest(), logError(), logSecurity() — ketiganya dead code,
// tidak dipanggil di manapun. Logging dilakukan langsung via logger.info/error/warn()
// di masing-masing file (errorHandler, authService, dll).

logger.info("Logger initialized", {
  level: process.env.LOG_LEVEL || "info",
  logDir: LOG_DIR,
  environment: process.env.NODE_ENV || "development",
});

module.exports = logger;
