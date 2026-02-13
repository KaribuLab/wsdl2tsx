export type TagFactory = {
  [tag: string]: (props?: any) => string;
};

export const xml: TagFactory = new Proxy({} as TagFactory, {
  get(_, tag: string) {
    return () => tag;
  }
});
