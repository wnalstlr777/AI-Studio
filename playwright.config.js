import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',
 timeout:45000,
 expect:{timeout:10000},
 retries:0,
 workers:1,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:process.env.SEA_URL||'https://wnalstlr777.github.io/Sea/',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[
  {name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
  {name:'mobile',use:{...devices['Pixel 7']}}
 ]
});
