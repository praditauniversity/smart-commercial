export const FINDINGS_PAGE_SIZE = 12;

/**
 * Pages over two lists rendered one after the other (e.g. SAM3 media cards followed by VLM detection cards)
 * without merging them, so each list keeps its own card markup.
 */
export function paginateTwo<A, B>(first: A[], second: B[], page: number, pageSize: number) {
  const total = first.length + second.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  const end = start + pageSize;
  return {
    first: first.slice(start, end),
    second: second.slice(Math.max(0, start - first.length), Math.max(0, end - first.length)),
    total,
    totalPages,
    page: current,
  };
}
