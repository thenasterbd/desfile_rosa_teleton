import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '_site');
const publicRoots = ['index.html', 'css', 'js', 'supabase', 'assets'];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unsupported public asset: ${relative(root, path)}`);
  }
  return files;
}

const sources = [join(root, 'index.html')];
for (const directory of publicRoots.slice(1)) sources.push(...await filesIn(join(root, directory)));
const digest = createHash('sha256');
for (const path of sources) {
  digest.update(relative(root, path)).update('\0').update(await readFile(path)).update('\0');
}
// A content-derived ID changes whenever any published source changes.
const version = digest.digest('hex').slice(0, 16);
const versioned = path => `${path.split('?')[0]}?v=${version}`;

// _site is the generated publication directory; repository sources stay untouched.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of publicRoots) await cp(join(root, entry), join(output, entry), { recursive: true });

// Version the complete module graph, including the operator's import of app.js.
// Versioning only the entry would instantiate app.js twice through that cycle.
for (const path of await filesIn(join(output, 'js'))) {
  if (!path.endsWith('.js')) continue;
  const source = await readFile(path, 'utf8');
  const transformed = source.replace(
    /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])([^'"\r\n]+)\2/g,
    (match, prefix, quote, specifier) => /^\.\.?\/.*\.js(?:\?.*)?$/.test(specifier)
      ? `${prefix}${quote}${versioned(specifier)}${quote}`
      : match
  );
  await writeFile(path, transformed);
}
let html = await readFile(join(output, 'index.html'), 'utf8');
html = html.replace(/\b(src|href)=(['"])((?:js\/[^'"]+\.js|css\/[^'"]+\.css)(?:\?[^'"]*)?)\2/g,
  (_match, attr, quote, path) => `${attr}=${quote}${versioned(path)}${quote}`);
await writeFile(join(output, 'index.html'), html);
await writeFile(join(output, 'release.json'), JSON.stringify({ version }) + '\n');
console.log(`Built ${relative(root, output)} · version ${version}`);
