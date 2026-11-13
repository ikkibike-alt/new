// usage: node render-art.js /abs/path/art.html outDir
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.argv[2]);
const d=await p.evaluate(()=>render('art',2400,1500));fs.writeFileSync(process.argv[3]+'/art.jpg',Buffer.from(d.split(',')[1],'base64'));
if(errs.length)console.log(errs);await b.close();})();
