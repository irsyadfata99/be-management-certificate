/**
 * Pagination Helper
 * Ensures consistent pagination calculation across all endpoints
 *
 * Default: 20 items per page
 * Maximum: 50 items per page
 */

class PaginationHelper {
  /**
   * Calculate offset and validate pagination params
   * @param {number} page - Page number (1-indexed)
   * @param {number} limit - Items per page
   * @returns {Object} { page, limit, offset }
   */
  static calculateOffset(page = 1, limit = 20) {
    // Validate and sanitize inputs
    const validPage = Math.max(1, parseInt(page, 10) || 1);
    const validLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20)); // Default 20, Max 50 items per page

    const offset = (validPage - 1) * validLimit;

    return {
      page: validPage,
      limit: validLimit,
      offset,
    };
  }

  /**
   * Build pagination response object
   * @param {number} page - Current page
   * @param {number} limit - Items per page
   * @param {number} total - Total items count
   * @returns {Object} Pagination metadata
   */
  static buildResponse(page, limit, total) {
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  /**
   * Extract and validate pagination params from query
   * @param {Object} query - Express req.query object
   * @returns {Object} { page, limit, offset }
   */
  static fromQuery(query) {
    const { page, limit } = query;
    return this.calculateOffset(page, limit);
  }

  /**
   * Build complete paginated response
   * @param {Array} data - Data array
   * @param {number} page - Current page
   * @param {number} limit - Items per page
   * @param {number} total - Total items
   * @returns {Object} { data, pagination }
   */
  static paginate(data, page, limit, total) {
    return {
      data,
      pagination: this.buildResponse(page, limit, total),
    };
  }
}

module.exports = PaginationHelper;
