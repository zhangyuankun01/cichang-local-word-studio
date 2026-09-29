const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/importer.ts'), 'utf8');
const output = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2019,module:ts.ModuleKind.CommonJS}}).outputText;
fs.writeFileSync(path.join(root, 'miniprogram/shared/importer.js'), '// Generated from src/importer.ts by scripts/build-mini-shared.cjs.\n'+output);
