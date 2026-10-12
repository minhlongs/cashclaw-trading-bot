export function makeTraversers(
  parentOf: Map<string, string | null>,
  children: Map<string, string[]>,
) {
  return {
    ancestorsOf: (start: string): readonly string[] => {
      const chain: string[] = [];
      let cursor = parentOf.get(start) ?? null;
      while (cursor !== null) { chain.push(cursor); cursor = parentOf.get(cursor) ?? null; }
      return chain;
    },
    descendantsOf: (start: string): readonly string[] => {
      const out: string[] = [];
      const queue: string[] = [...(children.get(start) ?? [])];
      const seen = new Set<string>();
      while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined || seen.has(next)) continue;
        seen.add(next);
        out.push(next);
        queue.push(...(children.get(next) ?? []));
      }
      return out;
    },
  };
}
