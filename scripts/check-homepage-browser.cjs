const {chromium}=require('playwright');
const fs=require('fs');
const path=require('path');
const output=path.resolve(__dirname,'../output/homepage-redesign');
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'lang',value:'zh',url:'http://localhost:3000'}]);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3000',{waitUntil:'networkidle'});
 const requests=[];page.on('request',r=>{if(['fetch','xhr'].includes(r.resourceType()))requests.push(r.url())});
 const before=await page.locator('.sf-hero-video').evaluate(e=>getComputedStyle(e).transform);
 await page.evaluate(()=>scrollTo(0,400));await page.waitForTimeout(300);
 const after=await page.locator('.sf-hero-video').evaluate(e=>getComputedStyle(e).transform);
 for(let y=800;y<4000;y+=500){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(150)}
 await page.waitForTimeout(500);
 const motion={before,after,nativeScrollAnimation:before!==after,scrollFetchRequests:requests,errors,viewports:[]};
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>scrollTo(0,0));
 motion.reducedMotionAnimation=await page.locator('.sf-hero-video').evaluate(e=>getComputedStyle(e).animationName);
 await page.screenshot({path:path.join(output,'after-desktop-zh.png'),fullPage:true});
 for(const [width,height] of [[1440,800],[1024,768],[768,1024],[430,932],[390,844],[320,568]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
  const cta=await page.locator('.sf-hero-copy .sf-action').boundingBox();const text=await page.locator('.sf-hero-wordmark').boundingBox();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(width<768){
   const frame=await page.locator('.sf-hero-video').boundingBox();
   const fit=await page.locator('.sf-hero-video').evaluate(e=>getComputedStyle(e).objectFit);
   if(width===390)await page.locator('.sf-hero').screenshot({path:path.join(output,'mobile-hero-zh.png')});
   motion.viewports.push({width,height,videoWidth:frame.width,videoHeight:frame.height,objectFit:fit});
   const hero=await page.locator('.sf-hero').boundingBox();
   if(fit!=='cover'||Math.abs(frame.height-hero.height)>1||frame.height<height-64)throw Error('Mobile hero lost immersive full-bleed layout at '+width+'px: '+frame.width+'x'+frame.height+', '+fit);
   const position=await page.locator('video').evaluate(e=>getComputedStyle(e).objectPosition);
   if(parseFloat(position)<85)throw Error('Opening snowpeak is outside the mobile focal framing');
  }
  console.log({width,height,overflow,wordmarkAfterCTA:cta.y+cta.height<=text.y});
  if(overflow||cta.y+cta.height>text.y)throw Error('Responsive overlap at '+width+'x'+height);
 }
 fs.writeFileSync(path.join(output,'motion-verification.json'),JSON.stringify(motion,null,2));
 console.log(JSON.stringify(motion,null,2));
 if(!motion.nativeScrollAnimation || motion.reducedMotionAnimation!=='none' || motion.scrollFetchRequests.length || motion.errors.length) throw Error('Motion/network checks failed');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
