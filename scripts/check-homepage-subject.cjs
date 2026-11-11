const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const output = path.resolve(__dirname, '../output/homepage-redesign');
fs.mkdirSync(output, { recursive:true });
const samples = [[.5,.8],[3.5,.42],[4.5,.48],[5.5,.71],[6.5,.78],[7.5,.54],[8.5,.60],[9.5,.46],[10.5,.35],[12.5,.39],[14.5,.56]];
(async () => {
 const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
 const errors = [], results = [];
 page.on('pageerror', error => errors.push(error.message));
 try {
  for (const lang of ['zh','en']) {
   await page.setViewportSize({width:390,height:844});
   await page.context().addCookies([{ name:'lang', value:lang, url:'http://localhost:3000' }]);
   await page.goto('http://localhost:3000', { waitUntil:'networkidle', timeout:60000 });
   if (await page.locator('video').getAttribute('src')) throw Error('Video loaded without an explicit action');
   await page.locator('.sf-hero').screenshot({ path:path.join(output, `mobile-immersive-${lang}-poster.png`) });
   await page.getByRole('button', { name:lang==='zh'?'播放雪山视频':'Play mountain video' }).click();
   await page.waitForFunction(() => getComputedStyle(document.querySelector('.sf-hero-copy')).visibility === 'hidden', null, { timeout:5000 });
   await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
   for (const [width,height] of [[390,844],[320,568],[430,932]]) {
    await page.setViewportSize({width,height});
    for (const [time,subjectX] of samples) {
     await page.locator('video').evaluate((video,time) => {video.pause();video.currentTime=time;},time);
     await page.waitForFunction(({ time,subjectX }) => {
      const video=document.querySelector('video');
      if(video.seeking || Math.abs(video.currentTime-time)>.03) return false;
      const visible=Math.min(1,video.clientWidth/video.clientHeight/(16/9));
      const left=parseFloat(getComputedStyle(video).objectPosition)/100*(1-visible);
      return subjectX>left+visible*.2 && subjectX<left+visible*.8;
     }, {time,subjectX}, {timeout:5000});
     const position=await page.locator('video').evaluate(video=>getComputedStyle(video).objectPosition);
     results.push({lang,width,height,time,subjectX,position});
     if(lang==='zh' && width===390 && [.5,3.5,8.5,14.5].includes(time)) {
      await page.locator('video').evaluate(video=>video.play());
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.sf-hero-copy')).visibility==='hidden');
      await page.locator('.sf-hero').screenshot({path:path.join(output,`mobile-immersive-frame-${time}.png`)});
     }
    }
   }
   await page.locator('video').evaluate(video=>video.pause());
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.sf-hero-copy')).visibility==='visible');
  }
  if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync(path.join(output,'subject-framing-verification.json'),JSON.stringify({passed:true,checks:results.length,results,errors},null,2));
  console.log(JSON.stringify({passed:true,checks:results.length,errors}));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
