// Pure selection keeps argument validation ahead of disposable Docker startup.
export function selectDatabaseSuites(suites, args) {
  if (args.length === 0) return suites;
  const selected = [];
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] !== "--suite") throw new Error(`Unknown argument: ${args[index]}`);
    const name = args[index + 1];
    const suite = suites.find(([candidate]) => candidate === name);
    if (!suite) throw new Error(`Missing or unknown suite: ${name ?? ""}`);
    if (seen.has(name)) throw new Error(`Duplicate suite: ${name}`);
    seen.add(name);
    selected.push(suite);
  }
  return selected;
}
