import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Use the same public Supabase project for the browser and the admin RPC.
const context={window:{}};
runInNewContext(readFileSync('public/config.js','utf8'),context);
const defaults=context.window.STUDIO_CONFIG||{};
const url=process.env.SUPABASE_URL?.trim()||process.env.Project_URL?.trim()||defaults.url;
const key=process.env.SUPABASE_PUBLISHABLE_KEY?.trim()||process.env.Publishable_key?.trim()||defaults.key;
if(!url||new URL(url).protocol!=='https:'||!key?.startsWith('sb_publishable_')){
  throw new Error('Set an HTTPS SUPABASE_URL and an sb_publishable_ key for this project.');
}
const config=JSON.stringify({url,key});
cpSync('public','dist',{recursive:true});
writeFileSync('dist/config.js','window.STUDIO_CONFIG='+config+';\n');
mkdirSync('server-config',{recursive:true});
writeFileSync('server-config/supabase-public.mjs','export default '+config+';\n');
// Pinned upstream npm archive (@rod2ik/tikzjax); Pages serves the compiler locally.
mkdirSync('dist/vendor/tikzjax',{recursive:true});
execFileSync('tar',['-xzf','scripts/tikzjax-1.6.0.tgz','-C','dist/vendor/tikzjax','--strip-components=2','package/dist']);
execFileSync('tar',['-xzf','scripts/tikzjax-1.6.0.tgz','-C','dist/vendor/tikzjax','--strip-components=1','package/LICENSE','package/README.md']);
