const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
async function main(){
 const context=vm.createContext({setTimeout});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../video/瓜子影视.js'),'utf8'),context);
 const source=vm.runInContext('LumeSource',context);
 const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../snapshots/gztv5_filters.json'),'utf8'));
 let sent;
 source.http={post:async(url,body)=>{sent=JSON.parse(body);return{status:200,body:JSON.stringify(url.endsWith('GetCondition')?fixture:{data:{list:[],total:0}})};}};
 const all=await source.filters({categoryId:'all'});
 assert.deepEqual(Array.from(all,g=>g.id),['tid','area','year','sort']);
 const movie=await source.filters({categoryId:'1'});
 assert.deepEqual(Array.from(movie,g=>g.id),['tid','class','area','year','sort']);
 assert.equal(movie.find(g=>g.id==='class').options.length,fixture.data.column.find(c=>c.value===1).class.length);
 const drama=await source.filters({categoryId:'1',filters:{tid:'2'}});
 assert.equal(drama.find(g=>g.id==='class').options.length,fixture.data.column.find(c=>c.value===2).class.length);
 await source.list({categoryId:'1',page:2,filters:{tid:'2',class:'15',area:'日本',year:'2025',sort:'d_score'}});
 assert.equal(sent.tid,2);assert.equal(sent.class,'15');assert.equal(sent.area,'日本');assert.equal(sent.year,'2025');assert.equal(sent.sort,'d_score');assert.equal(sent.page,2);
 console.log('瓜子影视实时筛选通过：全部4行、电影5行、题材随类型更新，组合条件正确下发');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
