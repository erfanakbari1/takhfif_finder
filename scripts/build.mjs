// Builds the Engine Code-node bundles and the n8n Workflow SDK files from the tested sources in src/.
//
//   npm run build                     -> dist/*.code.js (readable), dist/*.min.js (deployed), dist/*.workflow.js
//                                        (instance-neutral: config.example.json values, secret placeholders)
//   TELEGRAM_BOT_TOKEN=... WEBHOOK_SECRET=... node scripts/build.mjs --deploy
//                                     -> build/*.workflow.js for your instance: config.json + secrets (git-ignored)
//
// Placeholders inside workflows/*.template.js:
//   '@@code:<bundle>@@'  -> JSON string with the readable bundle
//   '@@min:<bundle>@@'   -> JSON string with the minified bundle (what gets pasted into n8n)
//   '@@cfg:NAME@@'       -> value from the config file (or env for secrets)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';
import { tokenizer } from 'acorn';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deploy = process.argv.includes('--deploy');
const outDir = path.join(root, deploy ? 'build' : 'dist');
// config.json holds your instance's ids and URLs (git-ignored); the committed dist/ only uses the example values.
const configFile = deploy ? 'config.json' : 'config.example.json';
if (!fs.existsSync(path.join(root, configFile))) throw new Error(`${configFile} not found (copy config.example.json and fill it in)`);
const config = JSON.parse(fs.readFileSync(path.join(root, configFile), 'utf8'));

const SECRETS = { TELEGRAM_BOT_TOKEN: '__TELEGRAM_BOT_TOKEN__', WEBHOOK_SECRET: '__WEBHOOK_SECRET__' };

// Each bundle becomes the body of one Code node in the Engine sub-workflow.
export const BUNDLES = {
  'crawler-engine': ['lib/text.js', 'crawler/sources.js', 'crawler/pipeline.js', 'main/crawler-engine.js'],
  'merge-engine': ['lib/text.js', 'lib/catalog.js', 'crawler/merge.js', 'crawler/pipeline.js', 'main/merge-engine.js'],
  'bot-engine': ['lib/text.js', 'lib/catalog.js', 'bot/logos.js', 'bot/bot.js', 'main/bot-engine.js'],
};

function source(rel) {
  const text = fs.readFileSync(path.join(root, 'src', rel), 'utf8');
  return text.replace(/\n?\/\/ @export-start[\s\S]*?\/\/ @export-end\n?/g, '\n').trim();
}

function cfg(name) {
  if (name in SECRETS) {
    if (!deploy) return SECRETS[name];
    const v = process.env[name];
    if (!v) throw new Error(`missing env ${name} for --deploy build`);
    return v;
  }
  if (!(name in config)) throw new Error(`${configFile} has no "${name}"`);
  return config[name];
}

// Data-table column mapping ("Map each column below") for upsert nodes: every column <- the item field of the same name.
const TABLES = JSON.parse(fs.readFileSync(path.join(root, 'workflows', 'tables.json'), 'utf8'));
function columnsMapping(table) {
  const cols = TABLES[table];
  if (!cols) throw new Error(`workflows/tables.json has no table "${table}"`);
  const typeOf = { string: 'string', number: 'number', boolean: 'boolean', date: 'dateTime' };
  return {
    mappingMode: 'defineBelow',
    value: Object.fromEntries(cols.map(([name]) => [name, `={{ $json.${name} }}`])),
    matchingColumns: [],
    schema: cols.map(([name, type]) => ({ id: name, displayName: name, required: false, defaultMatch: false, display: true, type: typeOf[type], canBeUsedToMatch: true })),
    attemptToConvertTypes: false,
    convertFieldsToString: false,
  };
}

// Switch-node rules (SDK code may not contain functions): one named output per value of `field`.
function switchRules(field, keys) {
  return keys.map((key) => ({
    renameOutput: true,
    outputKey: key,
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{ leftValue: `={{ $json.${field} }}`, operator: { type: 'string', operation: 'equals' }, rightValue: key }],
      combinator: 'and',
    },
  }));
}

// terser keeps long array literals on one line; break after commas (always safe) so no line gets too long to review.
function wrapLongLines(code, max) {
  const cuts = [];
  let lineStart = 0;
  for (const tok of tokenizer(code, { ecmaVersion: 2022, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true })) {
    const nl = code.lastIndexOf('\n', tok.start);
    if (nl >= lineStart) lineStart = nl + 1;
    if (tok.type.label === ',' && tok.end - lineStart > max && code[tok.end] !== '\n') { cuts.push(tok.end); lineStart = tok.end; }
  }
  let out = '', prev = 0;
  for (const c of cuts) { out += code.slice(prev, c) + '\n'; prev = c; }
  return out + code.slice(prev);
}

// A Code node body is a function body (top-level `return`), so minify it wrapped in a function.
async function minifyBody(name, code) {
  const wrapped = 'async function __body(){\n' + code + '\n}';
  const out = await minify(wrapped, { ecma: 2020, compress: { passes: 2, keep_fargs: true }, mangle: true, format: { comments: false, max_line_len: 1000, quote_style: 1 } });
  // terser prints \u200c-style escapes as raw characters; escape invisible/format characters again so the
  // code survives copy-paste and JSON transport (they only occur inside string and regex literals).
  const body = out.code.slice(out.code.indexOf('{') + 1, out.code.lastIndexOf('}'))
    .replace(/(?!\n)[\p{Cc}\p{Cf}\u00a0\u2028\u2029\ufe0f]/gu, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const banner = `// Takhfif Finder ${name} (minified build of src/ — edit the sources in the repo and run \`npm run build\`)\n`;
  return banner + wrapLongLines(body, 900) + '\n';
}

// dist/ and build/ are fully generated: start clean so renamed bundles don't leave stale files behind.
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const built = {};
for (const [name, files] of Object.entries(BUNDLES)) {
  const code = files.map(source).join('\n\n') + '\n';
  const min = await minifyBody(name, code);
  built[name] = { code, min };
  fs.writeFileSync(path.join(outDir, `${name}.code.js`), code);
  fs.writeFileSync(path.join(outDir, `${name}.min.js`), min);
  console.log('built', `${name}: ${code.length} chars, minified ${min.length}`);
}

for (const file of fs.readdirSync(path.join(root, 'workflows'))) {
  if (!file.endsWith('.template.js')) continue;
  let text = fs.readFileSync(path.join(root, 'workflows', file), 'utf8');
  text = text.replace(/'@@(code|min):([a-z-]+)@@'/g, (_, kind, name) => {
    if (!built[name]) throw new Error(`${file}: unknown bundle ${name}`);
    return JSON.stringify(built[name][kind]);
  });
  text = text.replace(/'@@columns:([a-z]+)@@'/g, (_, table) => JSON.stringify(columnsMapping(table)));
  text = text.replace(/'@@switch:([a-z_]+):([a-z,]+)@@'/gi, (_, field, keys) => JSON.stringify(switchRules(field, keys.split(','))));
  text = text.replace(/@@cfg:([A-Z_]+)@@/g, (_, name) => cfg(name));
  const left = text.match(/@@[a-z]+:[^@]+@@/);
  if (left) throw new Error(`${file}: unresolved placeholder ${left[0]}`);
  const out = path.join(outDir, file.replace('.template.js', '.workflow.js'));
  fs.writeFileSync(out, text);
  console.log('built', path.relative(root, out), `(${text.length} chars)`);
}
