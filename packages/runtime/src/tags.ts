export type TagFactory = {
  [tag: string]: () => string;
};

export const xml: TagFactory = new Proxy({} as TagFactory, {
  get(_, tag: string) {
    return () => tag;
  }
});
