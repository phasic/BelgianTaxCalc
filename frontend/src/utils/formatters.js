export const MONTH_NAMES = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

/** Format a cell value for display, e.g. pretty-print ISO dates. */
export function formatCellDisplay(header, value) {
  const h = header.toLowerCase();
  if (!value) return "—";
  if (h.includes("date") && value.includes("T")) {
    try {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch {
      /* fall through */
    }
  }
  return value;
}
