const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.argv[2]);
for(const [n,w,h] of [['hero',1800,1100],['cup',1200,1500],['shirts',1200,1500],['books',1800,1100],['wall',1800,900]]){
 const d=await p.evaluate(([n,w,h])=>render(n,w,h),[n,w,h]);fs.writeFileSync(process.argv[3]+'/'+n+'.jpg',Buffer.from(d.split(',')[1],'base64'));}
console.log(errs);await b.close();})();
