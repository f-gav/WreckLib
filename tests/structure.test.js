import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x, import.meta.url),'utf8');
test('Separate Cloudflare resources',()=>{const c=read('wrangler.jsonc');assert.match(c,/wrecklib-db/);assert.match(c,/wrecklib-images/)});
test('Permissions enforced on server',()=>{const s=read('worker/index.js');assert.match(s,/membership/);assert.match(s,/secret_body/);assert.match(s,/visibility/)});
test('App has accessible landing',()=>{assert.match(read('public/index.html'),/WreckLib/)});
