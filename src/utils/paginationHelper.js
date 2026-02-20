const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_PAGE = 1;

class PaginationHelper {
  /**
   * Parse & sanitize page/limit dari query params.
   *
   * @param {object} params
   * @param {number|string} [params.page]
   * @param {number|string} [params.limit]
   * @param {number} [params.maxLimit] - Override MAX_LIMIT untuk endpoint tertentu
   * @returns {{ page: number, limit: number, offset: number }}
   */
  static fromQuery({ page, limit, maxLimit = MAX_LIMIT } = {}) {
    const parsedPage = Math.max(1, parseInt(page, 10) || DEFAULT_PAGE);
    const rawLimit = parseInt(limit, 10) || DEFAULT_LIMIT;
    const parsedLimit = Math.min(Math.max(1, rawLimit), maxLimit);
    const offset = (parsedPage - 1) * parsedLimit;

    return { page: parsedPage, limit: parsedLimit, offset };
  }

  /**
   * Bangun object pagination untuk response.
   *
   * @param {number} page
   * @param {number} limit
   * @param {number} total
   * @returns {{ page: number, limit: number, total: number, totalPages: number }}
   */
  static buildResponse(page, limit, total) {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }
}

module.exports = PaginationHelper;
