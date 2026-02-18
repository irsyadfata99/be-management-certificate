class ResponseHelper {
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

    if (process.env.NODE_ENV === "development" && error) {
      response.error = error;
    }

    return res.status(statusCode).json(response);
  }

  static validationError(res, errors) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }
  static unauthorized(res, message = "Unauthorized access") {
    return res.status(401).json({
      success: false,
      message,
    });
  }

  static forbidden(res, message = "Access forbidden") {
    return res.status(403).json({
      success: false,
      message,
    });
  }

  static notFound(res, message = "Resource not found") {
    return res.status(404).json({
      success: false,
      message,
    });
  }
}

module.exports = ResponseHelper;
