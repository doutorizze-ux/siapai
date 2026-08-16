import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('extensao');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const sidePanel = fs.readFileSync(path.join(root, 'sidepanel.js'), 'utf8');

assert.equal(manifest.version, '5.6.0');
assert.equal(manifest.action.default_popup, undefined, 'A ação não pode usar popup antigo');
assert.equal(manifest.side_panel.default_path, 'sidepanel.html');
assert.ok(manifest.permissions.includes('sidePanel'));
assert.ok(fs.existsSync(path.join(root, 'sidepanel.html')));
assert.ok(fs.existsSync(path.join(root, 'sidepanel.js')));
assert.match(background, /openPanelOnActionClick/);
assert.match(content, /SIAP_READ_CONTEXT/);
assert.match(sidePanel, /SIAP_REQUEST/);
assert.doesNotMatch(content, /await bootProtectedPage\(auth\)/, 'Não pode inicializar módulos dentro da página do SIAP');
assert.doesNotMatch(content, /await renderHeaderAuthButtons\(\)/, 'Não pode criar cabeçalho SiapAI no SIAP');

console.log('OK: v5.6.0 usa painel lateral nativo e não injeta módulos no DOM do SIAP.');
