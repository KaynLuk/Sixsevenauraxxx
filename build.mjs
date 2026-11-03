// Empacota a função em um único arquivo (sem precisar de node_modules no Netlify).
import { build } from 'esbuild';
await build({
  entryPoints: ['netlify/src/api.mjs'], outfile: 'netlify/functions/api.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node20',
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});
console.log('função empacotada em netlify/functions/api.mjs');
