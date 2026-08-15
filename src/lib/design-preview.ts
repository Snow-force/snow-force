export function isDesignPreviewEnabled(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "development";
}
