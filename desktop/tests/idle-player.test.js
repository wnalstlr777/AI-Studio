import test from 'node:test';
import assert from 'node:assert/strict';
import {IdlePlayer} from '../../shared/hina/idle-player.js';
import {MOTIONS} from '../../shared/hina/remote-assets-policy.js';
function setup({draft=false}={}){let time=100000;const getMotion=(id,{review=false}={})=>MOTIONS.includes(id)&&(!draft||review)?{id,durationMs:2000,complete:!draft}:null;const player=new IdlePlayer({getMotion,now:()=>time,random:()=>0});return {player,advance(ms){time+=ms;player.tick();}};}
test('initial gap, random no-repeat, once returns to normal, then waits 6 seconds',()=>{
 const h=setup(),p=h.player;p.tick();assert.equal(p.id,'IDLE_NORMAL');h.advance(5999);assert.equal(p.id,'IDLE_NORMAL');h.advance(1);assert.equal(p.id,'IDLE_HAPPY');
 h.advance(2000);assert.equal(p.id,'IDLE_NORMAL');h.advance(6000);assert.equal(p.id,'IDLE_THINK');
});
test('manual one-shot/loop and paused deadline use actual clip duration',()=>{
 const h=setup(),p=h.player;assert.equal(p.select('IDLE_NOTE'),true);h.advance(1000);p.togglePause();h.advance(5000);assert.equal(p.id,'IDLE_NOTE');p.togglePause();h.advance(999);assert.equal(p.id,'IDLE_NOTE');h.advance(1);assert.equal(p.id,'IDLE_NORMAL');
 p.select('IDLE_GREETING',{loop:true});h.advance(100000);assert.equal(p.id,'IDLE_GREETING');p.reset();assert.equal(p.id,'IDLE_NORMAL');
});
test('QA and movement preempt manual motion, pause, and draft random review',()=>{
 const h=setup({draft:true}),p=h.player;p.reset({reviewRandom:true});h.advance(6000);assert.equal(p.id,'IDLE_HAPPY');
 for(const state of ['WORK','ALERT','SUCCESS','CONNECTION_ERROR','WALK','REST']){p.setState(state);assert.equal(p.asset(),null);assert.equal(p.select('IDLE_CHEER'),false);assert.equal(p.togglePause(),false);p.setState('IDLE');assert.equal(p.reviewRandom,false);assert.equal(p.asset(),null);}
});
test('drafts require explicit review; unknown motions cannot be selected',()=>{
 const h=setup({draft:true}),p=h.player;h.advance(100000);assert.equal(p.asset(),null);assert.equal(p.id,'IDLE_NORMAL');assert.equal(p.select('bad'),false);assert.equal(p.select('IDLE_CHEER'),true);assert.equal(p.asset().id,'IDLE_CHEER');h.advance(2000);assert.equal(p.asset(),null);
});
test('loading time does not consume the one-shot animation duration',()=>{
 const h=setup(),p=h.player;p.select('IDLE_NOTE');p.loading();h.advance(9000);assert.equal(p.id,'IDLE_NOTE');p.loaded();h.advance(1999);assert.equal(p.id,'IDLE_NOTE');h.advance(1);assert.equal(p.id,'IDLE_NORMAL');
});
