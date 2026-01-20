export function ns<TPrefix extends string, TTags extends string>(
  prefix: TPrefix,
  tags: readonly TTags[]
) {
  return new Proxy({} as Record<TTags, () => `${TPrefix}:${TTags}`>, {
    get(_, tag: TTags) {
      return () => `${prefix}:${tag}`;
    }
  });
}
