/**
 * Response Helper
 * Standardized API response formatting
 */

class ResponseHelper {
  /**
   * Success response
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Success message
   * @param {Object} data - Response data
   */
  static success(res, statusCode = 200, message = "Success", data = null) {
    const response = {
      success: true,
      message,
    };

    if (data !== null) {
      response.data = data;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Error response
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   * @param {Object} error - Error details (only in development)
   */
  static error(
    res,
    statusCode = 500,
    message = "Internal Server Error",
    error = null,
  ) {
    const response = {
      success: false,
      message,
    };

    // Only include error details in development mode
    if (process.env.NODE_ENV === "development" && error) {
      response.error = error;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Validation error response
   * @param {Object} res - Express response object
   * @param {Array} errors - Array of validation errors
   */
  static validationError(res, errors) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  /**
   * Unauthorized response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  static unauthorized(res, message = "Unauthorized access") {
    return res.status(401).json({
      success: false,
      message,
    });
  }

  /**
   * Forbidden response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  static forbidden(res, message = "Access forbidden") {
    return res.status(403).json({
      success: false,
      message,
    });
  }

  /**
   * Not found response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  static notFound(res, message = "Resource not found") {
    return res.status(404).json({
      success: false,
      message,
    });
  }
}

module.exports = ResponseHelper;
