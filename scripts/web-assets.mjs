import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {publicConfig} from '../portable/config.mjs';
import {transform,build} from 'esbuild';
export async function webAssets({portable=false,output=null}={}){
 const assets={};const digest=body=>createHash('sha256').update(body).digest('hex').slice(0,12);
 const add=(path,body,type,immutable=false)=>{const binary=Buffer.isBuffer(body),hash=digest(body);assets[path]={body:binary?body.toString('base64'):body,base64:binary,type,etag:'"'+hash+'"',immutable};if(!binary&&body.length>1000)assets[path].gzip=gzipSync(body,{level:9}).toString('base64');if(output){mkdirSync(output+path.slice(0,path.lastIndexOf('/')),{recursive:true});writeFileSync(output+path,body)}return path};
 const hashed=(name,body,type)=>add('/assets/'+name.replace(/\.(\w+)$/,'.'+digest(body)+'.$1'),body,type,true);
 const htmlSource=readFileSync('dist/index.html','utf8');
 const cssFiles=[...htmlSource.matchAll(/<link rel="stylesheet" href="\/([^"?]+)"[^>]*>/g)].map(m=>m[1]);
 const jsFiles=['free.js','gas-ui.js','claim-flow.js','directory.js'];
 const pumpFiles=['nozzle-motion.js','hold-pump.js'];
 const image=readFileSync('dist/linkdid-glass-station.webp');const imagePath=hashed('glass-station.webp',image,'image/webp');
 const imageReplace=s=>s.replaceAll('/linkdid-glass-station.webp',imagePath);
 let pump=imageReplace(pumpFiles.map(f=>readFileSync('dist/'+f,'utf8')).join('\n'));
 pump=(await transform(pump,{minify:true,target:'es2022'})).code;
 const pumpPath=hashed('pump.js',pump,'application/javascript; charset=utf-8');
 let core=jsFiles.map(f=>readFileSync('dist/'+f,'utf8')).join('\n');
 core+=`\nlet pumpModule;window.ensurePump=()=>pumpModule||(pumpModule=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=${JSON.stringify(pumpPath)};s.onload=resolve;s.onerror=()=>{pumpModule=null;s.remove();reject(Error('The filling station could not load. Please try again.'))};document.head.appendChild(s)}));`;
 const css=cssFiles.map(f=>readFileSync('dist/'+f,'utf8').replace(/@import url\([^;]+;/g,'')).join('\n')+'\nbody{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}';
 const cssPath=hashed('site.css',(await transform(css,{loader:'css',minify:true})).code,'text/css; charset=utf-8');
 let auth='';
 if(portable){
  const result=await build({entryPoints:['portable/auth-client.js'],bundle:true,write:false,minify:true,format:'iife',target:'es2022'});
  auth='<script>window.LINKDID_PUBLIC_CONFIG='+JSON.stringify(publicConfig(process.env)).replaceAll('<','\\u003c')+'</script><script defer src="'+hashed('auth.js',result.outputFiles[0].text,'application/javascript; charset=utf-8')+'"></script>';
 }
 const corePath=hashed('app.js',(await transform(core,{minify:true,target:'es2022'})).code,'application/javascript; charset=utf-8');
 let html=htmlSource.replace(/<link rel="stylesheet"[^>]*>/g,'').replace(/<script src="[^>]+><\/script>/g,'').replace('</head>','<link rel="stylesheet" href="'+cssPath+'">'+auth+'<script defer src="'+corePath+'"></script></head>');
 add('/index.html',html,'text/html; charset=utf-8');
 // Compatibility URLs for existing open tabs; new pages use immutable bundles.
 for(const file of [...cssFiles,...jsFiles,...pumpFiles])add('/'+file,readFileSync('dist/'+file,'utf8'),file.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8');
 add('/linkdid-glass-station.webp',image,'image/webp');
 add('/pump-machine.webp',readFileSync('dist/pump-machine.webp'),'image/webp');
 return assets;
}
export function workerSource(assets){return 'const assets='+JSON.stringify(assets)+';\n'+readFileSync('server/payments.js','utf8')+'\n'+readFileSync('server/gas.js','utf8')+'\n'+readFileSync('server/worker.js','utf8').replace("import {assets} from './assets.js';",'')}
