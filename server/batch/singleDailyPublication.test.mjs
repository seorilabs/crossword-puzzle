import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {getGeneratorArgs} from './run-puzzle-pack-job.mjs';
const read=(args,key)=>args.find(arg=>arg.startsWith('--'+key+'='))?.split('=').slice(1).join('=');
test('실제 Job 인자는 다음 날짜 hard 한 판과 자정 공개, 고정 전환 날짜를 전달한다',()=>{
 const before={...process.env};try{
  for(const key of Object.keys(process.env))if(key.startsWith('PUZZLE_'))delete process.env[key];
  process.env.PUZZLE_SINGLE_DAILY_FROM_DATE='2026-10-24';
  const args=getGeneratorArgs({generatorArgs:[]},new Date('2026-10-23T14:00:00Z'));
  assert.equal(read(args,'start'),'2026-10-24');assert.equal(read(args,'difficulty'),'hard');assert.equal(read(args,'singleDaily'),'true');assert.equal(read(args,'singleDailyFrom'),'2026-10-24');assert.equal(read(args,'publishedAt'),'2026-10-23T15:00:00.000Z');
  const old=getGeneratorArgs({generatorArgs:[]},new Date('2026-10-22T14:00:00Z'));
  assert.equal(read(old,'singleDaily'),undefined);
 }finally{for(const key of Object.keys(process.env))if(key.startsWith('PUZZLE_'))delete process.env[key];for(const [key,value]of Object.entries(before))if(key.startsWith('PUZZLE_'))process.env[key]=value;}
});
test('공개 후 점검할 대상 URL이 없으면 실제 발행 전 중단한다',()=>{
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PUZZLE_'))delete env[key];env.PUZZLE_SINGLE_DAILY_FROM_DATE='2000-01-01';
 assert.throws(()=>execFileSync(process.execPath,['server/batch/run-puzzle-pack-job.mjs','--skipGenerate','--skipValidate'],{env,stdio:'pipe'}),error=>{assert.match(error.stderr.toString(),/PUZZLE_HOSTING_BASE_URL is required before publishing/);return true;});
});
