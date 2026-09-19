import { chromium } from 'playwright';
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const logs=[];
p.on('console', m=>{ if(m.type()==='error') logs.push(m.text()); });
await p.goto('http://localhost:8377/city-builder/',{waitUntil:'load'});
await p.waitForTimeout(2500);
await p.evaluate(()=>{const el=[...document.querySelectorAll('button')].find(b=>/empty sample/i.test(b.textContent||''));if(el)el.click();});
await p.waitForSelector('canvas',{timeout:30000}).catch(()=>{});
await p.waitForTimeout(12000);
// open the 🧰 panel
await p.evaluate(()=>{ const btn=[...document.querySelectorAll('button,div[role=button]')].find(e=>/🧰/.test(e.textContent||'')); if(btn) btn.click(); });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => {
  const panel = document.querySelector('.prop-lib-panel, [class*=prop-lib]');
  const cards = document.querySelectorAll('.prop-lib-card').length;
  const tabEls = [...document.querySelectorAll('.prop-lib-tab, [class*=tab]')].map(e=>(e.textContent||'').trim()).filter(Boolean).slice(0,10);
  // click the first card in the active tab
  const firstCard = document.querySelector('.prop-lib-card');
  if (firstCard) firstCard.click();
  return { panelOpen: !!panel, cards, tabEls };
});
await p.waitForTimeout(2500);
const placing = await p.evaluate(() => {
  const t = document.body.innerText || '';
  return { hint: /tap the ground|點一下地面|place/i.test(t), toolbar: !!document.querySelector('.prop-lib-tb-name, [class*=prop-lib-tb]') };
});
console.log('picker:', JSON.stringify(info));
console.log('after click -> placing:', JSON.stringify(placing));
console.log('errors:', logs.length ? logs.slice(0,5) : 'none');
await b.close();
