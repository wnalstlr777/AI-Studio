import {test,expect} from '@playwright/test';

test('Sea loads without fatal page errors and exposes the aquaculture UI',async({page},testInfo)=>{
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('/',{waitUntil:'domcontentloaded'});
 expect(response?.ok(),'Sea must respond successfully').toBeTruthy();
 await expect(page.locator('canvas').first()).toBeVisible({timeout:30000});
 await expect(page.locator('#whale-summon')).toHaveCount(1);
 await expect(page.locator('.aqua-school-label')).toHaveCount(2);
 await page.screenshot({path:testInfo.outputPath('sea-initial.png'),fullPage:true});
 expect(errors,'Uncaught JavaScript exceptions').toEqual([]);
});

test('overview hides aquaculture world objects and labels',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('canvas').first()).toBeVisible({timeout:30000});
 // This test requires a deterministic test hook in Sea. Never report it as passed before integration.
 test.skip(true,'Pending Sea test hook: setOverview and inspect aquaculture world root visibility');
});
