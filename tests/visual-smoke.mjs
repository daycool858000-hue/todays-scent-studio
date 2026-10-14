import { chromium, webkit } from 'playwright';
import { PNG } from 'pngjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:8765/previews/v2.5-visual/';
const out = 'test-artifacts';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage({ viewport: {width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'zh-TW'});
const errors = [];
page.on('pageerror', e => errors.push(String(e.message)));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
function diff(bufA,bufB){
 const a=PNG.sync.read(bufA),b=PNG.sync.read(bufB);
 if(a.width!==b.width||a.height!==b.height)throw Error('Frames size mismatch');
 let total=0,changes=0,white=0;
 for(let i=0;i<a.data.length;i+=4){
  const n=Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]);
  total+=n;if(n>54)changes++;
  if(b.data[i]>245&&b.data[i+1]>245&&b.data[i+2]>245)white++;
 }
 return {changedRatio:+(changes/(a.width*a.height)).toFixed(4),meanPixelChannelDifference:+(total/(a.width*a.height*3)).toFixed(2),whiteRatio:+(white/(a.width*a.height)).toFixed(4)};
}
async function image(name,locator){const p=out+'/'+name+'.png';return await locator.screenshot({path:p,animations:'allow'});}
async function requireTrue(v,msg){if(!v)throw new Error(msg)}
const report={timestamp:new Date().toISOString(),target:BASE,checks:{},frames:{}};
try{
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('#homeArt canvas.vfx-bottle-canvas',{timeout:20000});
 await page.waitForFunction(()=>document.querySelector('#homeArt')?.classList.contains('vfx-canvas-ready'),null,{timeout:20000});
 report.checks.scene = await page.locator('#app').getAttribute('data-scene');
 report.checks.originalMaterials = await page.evaluate(()=>MATERIALS.length);
 await requireTrue(report.checks.originalMaterials===252,'Material count no longer equals 252');
 await sleep(250);
 const i1=await image('intro-early',page.locator('#homeArt'));
 await sleep(1600);
 const i2=await image('intro-middle',page.locator('#homeArt'));
 report.frames.intro=diff(i1,i2);
 await requireTrue(report.frames.intro.changedRatio>.015,'Intro frames insufficiently different');
 const visual=await page.evaluate(()=>({
  canvas:document.querySelector('#homeArt .vfx-bottle-canvas')?.width,
  rect:Math.round(document.querySelector('#homeArt').getBoundingClientRect().width),
  bg:getComputedStyle(document.querySelector('#app'),'::before').backgroundImage.slice(0,120),
  color:getComputedStyle(document.querySelector('#app'),'::after').backgroundImage.slice(0,120)
 }));
 report.checks.visual=visual;
 await page.locator('#begin').click();
 await page.locator('#search').fill('佛手柑');
 await page.locator('#ingredientGrid .ingredient').first().click();
 report.checks.selected = await page.locator('#chosenCount').textContent();
 await requireTrue((await page.locator('#ingredientGrid .ingredient.selected').count())===1,'Material selection failed');
 await page.locator('#vesselButton').click();
 await page.locator('[data-vessel-choice="specimen"]').click();
 report.checks.vessel = await page.locator('#mixArt').getAttribute('data-vessel');
 await requireTrue(report.checks.vessel==='specimen','Vessel switch failed');
 await page.locator('#compose').click();
 await page.waitForFunction(()=>!document.querySelector('#blendingScreen').hidden);
 await sleep(550);
 const g1=await image('ritual-early',page.locator('#blendingScreen'));
 report.checks.ritualStart=await page.locator('#blendingScreen h2').textContent();
 await sleep(2350);
 const g2=await image('ritual-middle',page.locator('#blendingScreen'));
 report.checks.ritualMiddle=await page.locator('#blendingScreen h2').textContent();
 report.frames.ritual=diff(g1,g2);
 await requireTrue(report.frames.ritual.changedRatio>.01,'Ritual frames insufficiently different');
 await requireTrue(report.checks.ritualStart!==report.checks.ritualMiddle,'Ritual phases did not progress');
 await page.waitForFunction(()=>!document.querySelector('#resultScreen').hidden,null,{timeout:9000});
 report.checks.result=await page.locator('#resultName').textContent();
 report.checks.narrative=await page.locator('#descriptionResults .long-card').count();
 await requireTrue(report.checks.narrative>=4,'Result details missing');
 await page.locator('#nameInput').fill('測試：今天的味道');
 await page.locator('#save').click();
 report.checks.saved = await page.locator('#savedNum').textContent();
 await requireTrue(!errors.length,'JavaScript console errors: '+errors.join(' | '));
 report.checks.errors=errors;
 // Check each background from its actual local asset, not a simulated palette.
 const keys=['night','ice','tide','rose','greenhouse','archive','floating','clock','amber','prism'];
 report.checks.scenes={};
 const backgroundPage=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 for(const key of keys){
   await backgroundPage.goto(BASE+'?scene='+key,{waitUntil:'domcontentloaded',timeout:60000});
   await backgroundPage.waitForFunction(k=>document.getElementById('app')?.dataset.scene===k,key,{timeout:10000});
   const scene=await backgroundPage.evaluate(async k=>{
     const bg=getComputedStyle(document.querySelector('#app'),'::before').backgroundImage;
     const src='./assets/'+k+'.webp';
     const im=new Image();
     im.src=src;
     await im.decode();
     return {width:im.naturalWidth,height:im.naturalHeight,
       matchedAsset:bg.includes(k+'.webp'),
       assetUrl:im.src,loaded:im.complete};
   },key);
   await requireTrue(scene.matchedAsset&&scene.loaded&&scene.width>=800&&scene.height>=1100,'Scene asset missing/invalid: '+key);
   report.checks.scenes[key]={width:scene.width,height:scene.height,assetOK:true};
   await backgroundPage.screenshot({path:out+'/scene-'+key+'.png',animations:'disabled'});
 }
 await backgroundPage.close();
 // Playwright WebKit is a Safari-engine proxy, not a real iPhone Safari device.
 report.checks.webkit={};
 const wk=await webkit.launch({headless:true});
 const wp=await wk.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'zh-TW'});
 const wkErrors=[];
 wp.on('pageerror',e=>wkErrors.push(e.message));
 await wp.goto(BASE+'?scene=greenhouse',{waitUntil:'domcontentloaded',timeout:60000});
 await wp.waitForFunction(()=>document.getElementById('homeArt')?.classList.contains('vfx-canvas-ready'),null,{timeout:20000});
 report.checks.webkit.scene=await wp.locator('#app').getAttribute('data-scene');
 report.checks.webkit.introCanvas=await wp.locator('#homeArt canvas').count();
 await wp.screenshot({path:out+'/webkit-intro.png'});
 await wp.locator('#begin').click();
 await wp.locator('#search').fill('玫瑰');
 await wp.locator('#ingredientGrid .ingredient').first().click();
 report.checks.webkit.selected=await wp.locator('#chosenCount').textContent();
 await requireTrue(report.checks.webkit.selected==='1','WebKit material selection failed');
 await wp.locator('#compose').click();
 await wp.waitForFunction(()=>!document.getElementById('resultScreen').hidden,null,{timeout:12000});
 report.checks.webkit.result=await wp.locator('#resultName').textContent();
 await requireTrue(!wkErrors.length,'WebKit JavaScript errors: '+wkErrors.join(' | '));
 report.checks.webkit.errors=wkErrors;
 await wk.close();
 report.success=true;
}catch(e){
 report.success=false;report.error=String(e.stack||e);
 report.checks.errors=errors;
 try{await page.screenshot({path:out+'/failure.png',fullPage:true})}catch{}
}finally{
 await writeFile(out+'/smoke-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 await browser.close();
 if(!report.success)process.exitCode=1;
}
