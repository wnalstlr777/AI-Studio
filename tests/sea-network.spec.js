import {test,expect} from '@playwright/test';

test('Sea network activity diagnostic',async({page},testInfo)=>{
  const requests=[];
  const failed=[];
  const sockets=[];
  let started=Date.now();
  page.on('request',request=>{
    requests.push({url:request.url(),method:request.method(),time:Date.now()});
  });
  page.on('requestfailed',request=>failed.push({url:request.url(),failure:request.failure()?.errorText||'unknown'}));
  page.on('websocket',socket=>{
    const entry={url:socket.url(),sent:0,received:0,closed:false};
    sockets.push(entry);
    socket.on('framesent',()=>entry.sent++);
    socket.on('framereceived',()=>entry.received++);
    socket.on('close',()=>entry.closed=true);
  });
  const response=await page.goto('./',{waitUntil:'domcontentloaded'});
  expect(response?.ok(),`Sea URL: ${page.url()}, HTTP: ${response?.status()}`).toBeTruthy();
  await page.waitForTimeout(15000);
  const counts=new Map();
  for(const request of requests)counts.set(request.url,(counts.get(request.url)||0)+1);
  const repeated=[...counts.entries()].filter(([,count])=>count>=5).sort((a,b)=>b[1]-a[1]).slice(0,15);
  const report={durationSeconds:Math.round((Date.now()-started)/1000),totalRequests:requests.length,failedRequests:failed.length,websockets:sockets,repeatedUrls:repeated,failures:failed.slice(0,20),note:'진단용 기록입니다. 이 테스트만으로 유튜브 버퍼링이나 GPU 병목을 판정하지 않습니다.'};
  await testInfo.attach('sea-network-diagnostic.json',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  console.log('SEA NETWORK DIAGNOSTIC',JSON.stringify(report));
  expect(requests.length,'No network requests recorded').toBeGreaterThan(0);
});

test('Sea performance preset regression',async({page})=>{
  const response=await page.goto('./',{waitUntil:'domcontentloaded'});
  expect(response?.ok()).toBeTruthy();
  await page.waitForFunction(()=>Boolean(window.oceanCruise?.renderer&&window.oceanCruise?.params),{timeout:20000});
  const result=await page.evaluate(()=>{
    const {renderer,params}=window.oceanCruise;
    return {pixelRatio:renderer.getPixelRatio(),reflectionResolution:params.reflectionResolution,quality:document.querySelector('#graphics-quality')?.value};
  });
  console.log('SEA PERFORMANCE PRESET',JSON.stringify(result));
  expect(result.quality).toBe('medium');
  expect(result.reflectionResolution).toBeLessThanOrEqual(256);
  expect(result.pixelRatio).toBeLessThanOrEqual(1.25);
});
