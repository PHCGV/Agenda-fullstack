export function parsePagination(query, defaults = {}) {
  const fallbackPage = defaults.page ?? 1;
  const fallbackPageSize = defaults.pageSize ?? 20;
  const maxPageSize = defaults.maxPageSize ?? 100;

  const page = Number.parseInt(query.page ?? `${fallbackPage}`, 10);
  const pageSize = Number.parseInt(query.pageSize ?? `${fallbackPageSize}`, 10);

  const safePage = Number.isFinite(page) && page > 0 ? page : fallbackPage;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(pageSize, maxPageSize)
      : fallbackPageSize;

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
    take: safePageSize
  };
}

export function buildPaginatedResponse(items, page, pageSize, total) {
  return {
    items,
    page,
    pageSize,
    total
  };
}
