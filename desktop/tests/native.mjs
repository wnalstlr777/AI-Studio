// Runs the real Windows executable and Win32 mouse input. No Tauri IPC mocks.
// HINA_NATIVE_QA records external-link targets instead of opening the user's browser.
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
if(process.platform!=='win32')throw Error('Windows native QA requires Windows; this is not a passing browser fallback');
const report={scope:'Real Windows Tauri executable + Win32 mouse; external browser launch recorded in QA mode',results:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const app=spawn(resolve('src-tauri/target/release/hina-desktop.exe'),[],{env:{...process.env,HINA_NATIVE_QA:'1',WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9222',WEBVIEW2_USER_DATA_FOLDER:resolve(tmpdir(),`hina-native-qa-${process.pid}`)},stdio:'inherit'});
let browser,page,exitCode;
app.on('exit',code=>{exitCode=code;});
function mouse(x,y,drag=false){
  const script=`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class HinaMouse { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e); }';
    [HinaMouse]::SetCursorPos(${Math.round(x)},${Math.round(y)})|Out-Null; Start-Sleep -Milliseconds 250;
    ${drag===null?'':`[HinaMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 120;
    ${drag?`[HinaMouse]::SetCursorPos(${Math.round(x+12)},${Math.round(y-8)})|Out-Null; Start-Sleep -Milliseconds 300; [HinaMouse]::SetCursorPos(${Math.round(x+70)},${Math.round(y-45)})|Out-Null; Start-Sleep -Milliseconds 300;`:''}
    [HinaMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero);`}`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:15000});
}
try{
  for(let i=0;i<60;i++){
    if(exitCode!==undefined)throw Error(`App exited before native QA: ${exitCode}`);
    try{const r=await fetch('http://127.0.0.1:9222/json/version');if(r.ok)break;}catch{}
    if(i===59)throw Error('WebView2 CDP unavailable; native input was not tested');await sleep(500);
  }
  browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context=browser.contexts()[0];
  page=context.pages().find(p=>p.url().includes('localhost'))||context.pages()[0];
  assert.ok(page,'Tauri WebView page missing');page.setDefaultTimeout(10000);
  await page.waitForURL(/^(https?:\/\/tauri\.localhost|tauri:\/\/localhost)/,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__TAURI__?.core && document.querySelector('#pet'));
  let runs=[];await context.route('https://api.github.com/**',route=>route.fulfill({json:{workflow_runs:runs}}));
  await page.evaluate(()=>{localStorage.clear();localStorage.setItem('hina.settings',JSON.stringify({roam:false,notifications:false,top:true,size:200}));});
  await page.clock.install();await page.reload();
  const probe=()=>page.evaluate(()=>window.__TAURI__.core.invoke('qa_probe'));
  const point=async(selector='#asset-status')=>{
    const p=await probe(),r=await page.locator(selector).boundingBox(),size=await page.evaluate(()=>({w:innerWidth,h:innerHeight}));
    return {x:p.x+(r.x+r.width/2)*p.width/size.w,y:p.y+(r.y+r.height/2)*p.height/size.h};
  };
  async function clickOffice(label){
    const before=await probe(),p=await point();mouse(p.x,p.y);await page.waitForFunction(n=>window.__TAURI__.core.invoke('qa_probe').then(p=>p.clicks===n),before.clicks+1);
    const after=await probe();assert.equal(after.last_url,'https://wnalstlr777.github.io/AI-Studio/');
    report.results.push({case:label,status:'passed'});console.log(`PASS native: ${label}`);
  }
  await page.waitForFunction(()=>document.body.dataset.state==='IDLE');
  await clickOffice('native click opens office target');
  const beforeDrag=await probe(),p=await point();mouse(p.x,p.y,true);await sleep(350);
  const afterDrag=await probe();assert.ok(Math.abs(afterDrag.x-beforeDrag.x)+Math.abs(afterDrag.y-beforeDrag.y)>10,'Native drag did not move the window');
  assert.equal(afterDrag.clicks,beforeDrag.clicks,'Drag opened office');report.results.push({case:'native drag changes OS window position',status:'passed'});
  await clickOffice('click remains active immediately after native drag');
  const outside=await probe();mouse(outside.x+2,outside.y+2,null);await sleep(200);assert.equal((await probe()).ignored,true,'Transparent corner did not pass input through');
  await clickOffice('re-entry from transparent region recovers click');
  await page.evaluate(()=>{Math.random=()=>.5;const el=document.querySelector('#roam');el.checked=true;el.dispatchEvent(new Event('change'));});
  await page.clock.fastForward(31000);await page.waitForFunction(()=>document.body.dataset.state==='WALK');await clickOffice('native input after WALK transition');
  await page.evaluate(()=>Math.random=()=>.9);await page.clock.fastForward(31000);await page.waitForFunction(()=>document.body.dataset.state==='REST');await clickOffice('native input after REST transition');
  await page.evaluate(()=>{const el=document.querySelector('#roam');el.checked=false;el.dispatchEvent(new Event('change'));});
  const run={id:525252,run_attempt:1,status:'in_progress',conclusion:null,created_at:new Date(Date.now()+86400000).toISOString(),html_url:'https://github.com/wnalstlr777/AI-Studio/actions/runs/525252'};
  runs=[run];await page.clock.fastForward(120001);await page.waitForFunction(()=>document.body.dataset.state==='WORK');await clickOffice('native input after WORK transition');
  runs=[{...run,status:'completed',conclusion:'failure'}];await page.clock.fastForward(120001);await page.waitForFunction(()=>document.body.dataset.state==='ALERT');await clickOffice('native input after ALERT transition');
  const bubble=await point('#bubble');mouse(bubble.x,bubble.y);await page.waitForFunction(url=>window.__TAURI__.core.invoke('qa_probe').then(p=>p.last_url===url),run.html_url);
  report.results.push({case:'native QA error bubble opens exact run target',status:'passed'});
  await clickOffice('office target before notification');
  await page.evaluate(url=>window.__TAURI__.core.invoke('notify',{url,failure:true}),run.html_url);
  let notice;for(let i=0;i<30;i++){notice=context.pages().find(p=>p.url().includes('notice.html'));if(notice)break;await sleep(100);}
  assert.ok(notice,'Native notification window missing');await notice.waitForLoadState('domcontentloaded');
  // Notification click is dispatched in the real WebView. Main character uses Win32 mouse above.
  await notice.locator('#open').click();await page.waitForFunction(url=>window.__TAURI__.core.invoke('qa_probe').then(p=>p.last_url===url),run.html_url);
  report.results.push({case:'native notification click targets exact Actions run',status:'passed'});
  await page.screenshot({path:await mkdir('qa-results',{recursive:true}).then(()=> 'qa-results/windows-native.png')});
  await page.evaluate(()=>window.__TAURI__.core.invoke('quit')).catch(()=>{});
  for(let i=0;i<50&&exitCode===undefined;i++)await sleep(100);
  assert.equal(exitCode,0,'App failed to terminate cleanly');report.results.push({case:'native app exit',status:'passed'});
  report.status='passed';console.log('PASS Windows native input, drag recovery, alpha pass-through, state transitions, QA links, exit');
 }catch(error){
  report.status='failed';report.error=error.stack;
  try { report.diagnostics=execFileSync('powershell.exe',['-NoProfile','-Command',"Get-Process hina-desktop,msedgewebview2 -ErrorAction SilentlyContinue | Select-Object Id,SessionId,ProcessName,MainWindowTitle,Path | ConvertTo-Json; Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,State | ConvertTo-Json"],{encoding:'utf8',timeout:15000});console.error(report.diagnostics); }catch{}
  throw error;
}
finally{
  await mkdir('qa-results',{recursive:true});await writeFile('qa-results/windows-native.json',JSON.stringify(report,null,2));
  await browser?.close().catch(()=>{});
  if(exitCode===undefined)try{execFileSync('taskkill.exe',['/PID',String(app.pid),'/T','/F']);}catch{}
}
