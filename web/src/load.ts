/** Something fetched: still loading, there, or failed with a message. */
export type Load<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "error"; message: string };

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
