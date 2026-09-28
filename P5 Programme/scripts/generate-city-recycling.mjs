// Rebuild exact scanner pictures and real MobileNet features with the vendored extractor.
// Start npm run preview:city first. No external requests, mock vectors, or label inputs.
import { chromium } from '@playwright/test';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = new URL('../buddy-kit/client/', import.meta.url);
const dir = new URL('workshop/assets/city-recycling/',base);
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage();
 await page.goto('http://127.0.0.1:8379/tools/generate-city-recycling.html');
 await page.waitForFunction(()=>window.generate);
 const rows = await page.evaluate(()=>window.generate());
 const hashes={};
 for(const r of rows){const png=Buffer.from(r.png.split(',')[1],'base64');await writeFile(new URL(`${r.id}.png`,dir),png);hashes[r.id]=createHash('sha256').update(png).digest('hex');delete r.png;}
 const data={id:'city-recycling-v1',labels:['metal','plastic','cardboard'],source:'assets/city-recycling/README.md',photos:rows};
 await writeFile(new URL('catalogue.js',dir),`(function(){const data=${JSON.stringify(data)};if(typeof module!=='undefined')module.exports=data;if(typeof window!=='undefined'){window.WorkshopLibraryData ||= {};window.WorkshopLibraryData.cityRecycling=data;}})();\n`);
 const model=await readFile(new URL('workshop/ml/models/image_embedder/mobilenet_v3_small.tflite',base));
 await writeFile(new URL('manifest.json',dir),JSON.stringify({preprocessing:'mobilenet-v3-small-224-squash-f32-unit-v1',modelSHA256:createHash('sha256').update(model).digest('hex'),geometrySHA256:createHash('sha256').update(await readFile(new URL('city-common/city-waste.js',base))).digest('hex'),scannerSHA256:createHash('sha256').update(await readFile(new URL('tools/generate-city-recycling.html',base))).digest('hex'),images:hashes},null,2));
 console.log(`Generated ${rows.length} images and 1024-dimensional feature vectors.`);
} finally {await browser.close();}
