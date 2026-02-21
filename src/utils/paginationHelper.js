class PaginationHelper {
  static calculateOffset(page = 1, limit = 20) {
    const validPage = Math.max(1, parseInt(page, 10) || 1);
    const validLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    const offset = (validPage - 1) * validLimit;

    return {
      page: validPage,
      limit: validLimit,
      offset,
    };
  }

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

  static fromQuery(query) {
    const { page, limit } = query;
    return this.calculateOffset(page, limit);
  }

  // FIX: Hapus paginate() — dead code, tidak dipanggil dari manapun.
  // Semua caller menggunakan buildResponse() langsung.
}

module.exports = PaginationHelper;
