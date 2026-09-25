// Loads the n8n Code-node sources into one VM scope, the same way the build inlines them.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function load(files) {
  const ctx = vm.createContext({ console, Buffer, URL, Date, JSON, Math, encodeURIComponent, decodeURIComponent, setTimeout });
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  }
  return (expr) => vm.runInContext(expr, ctx);
}

module.exports = { load };
