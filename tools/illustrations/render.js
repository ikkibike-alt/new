// usage: node render.js /abs/path/draw.html outDir
const {chromium}=require('playwright');const fs=require('fs');
const LIST=[['hero',1800,1100],['cup',1200,1500],['shirts',1200,1500],['books',1800,1100],['wall',1800,900],
 ['t_room',640,480],['t_clothes',640,480],['t_tidy',640,480],['t_money',640,480],['t_family',640,480],['t_work',640,480]];
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.argv[2]);
for(const [n,w,h] of LIST){const d=await p.evaluate(([n,w,h])=>render(n,w,h),[n,w,h]);
 fs.writeFileSync(process.argv[3]+'/'+n.replace('_','-')+'.jpg',Buffer.from(d.split(',')[1],'base64'));}
if(errs.length)console.log(errs);await b.close();})();
