const ResponseHelper = require("../utils/responseHelper");
const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  logger.error("Error occurred", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  if (err.name === "ValidationError") {
    return ResponseHelper.validationError(res, err.errors);
  }

  if (err.name === "UnauthorizedError") {
    return ResponseHelper.unauthorized(res, err.message);
  }

  if (err.code === "23505") {
    return ResponseHelper.error(res, 409, "Resource already exists");
  }

  if (err.code === "23503") {
    return ResponseHelper.error(res, 400, "Referenced resource does not exist");
  }

  if (err.code === "23502") {
    return ResponseHelper.error(res, 400, "Required field is missing");
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  return ResponseHelper.error(res, statusCode, message, process.env.NODE_ENV === "development" ? err.stack : null);
};

const notFoundHandler = (req, res) => {
  ResponseHelper.notFound(res, `Route ${req.originalUrl} not found`);
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
