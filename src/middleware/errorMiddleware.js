const ResponseHelper = require("../utils/responseHelper");

/**
 * Global Error Handler Middleware
 * Catches all errors and sends appropriate responses
 */
const errorHandler = (err, req, res, next) => {
  // Log error for debugging
  console.error("Error occurred:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Handle specific error types
  if (err.name === "ValidationError") {
    return ResponseHelper.validationError(res, err.errors);
  }

  if (err.name === "UnauthorizedError") {
    return ResponseHelper.unauthorized(res, err.message);
  }

  if (err.code === "23505") {
    // PostgreSQL unique violation
    return ResponseHelper.error(res, 409, "Resource already exists");
  }

  if (err.code === "23503") {
    // PostgreSQL foreign key violation
    return ResponseHelper.error(res, 400, "Referenced resource does not exist");
  }

  if (err.code === "23502") {
    // PostgreSQL not null violation
    return ResponseHelper.error(res, 400, "Required field is missing");
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  return ResponseHelper.error(
    res,
    statusCode,
    message,
    process.env.NODE_ENV === "development" ? err.stack : null,
  );
};

/**
 * 404 Not Found Handler
 * Handles requests to non-existent routes
 */
const notFoundHandler = (req, res, next) => {
  ResponseHelper.notFound(res, `Route ${req.originalUrl} not found`);
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
