import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {webAssets,workerSource} from './web-assets.mjs';
rmSync('public',{recursive:true,force:true});mkdirSync('public',{recursive:true});
await webAssets({portable:true,output:'public'});
writeFileSync('portable/generated-worker.mjs',workerSource({}));
execFileSync(process.execPath,['--check','portable/generated-worker.mjs'],{stdio:'pipe'});
console.log('Vercel static assets and Node API prepared.');
