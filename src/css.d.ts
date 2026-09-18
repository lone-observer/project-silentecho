/**
 * Vite turns a side-effect `import './x.css'` into a stylesheet link. TypeScript
 * needs telling that such a module exists.
 *
 * Declared here rather than by widening `tsconfig.json`'s `types` to include
 * `vite/client`: that array is `["node"]` on purpose, because `scripts/` and
 * `tests/` are the Node half of this repo, and pulling the DOM-flavoured Vite
 * ambient types in globally would let a Node script reference `import.meta.env`
 * and compile.
 */
declare module '*.css' {
  const url: string
  export default url
}
