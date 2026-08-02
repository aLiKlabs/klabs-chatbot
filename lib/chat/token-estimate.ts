export function estimateTokens(value: string) {
  if (!value) return 0;
  // Fast UI/debug estimate. OpenAI usage replaces this with exact counts in paid mode.
  return Math.max(1, Math.ceil(value.length / 4));
}
