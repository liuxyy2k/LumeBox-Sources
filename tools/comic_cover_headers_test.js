const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
async function main(){
 const fixtures=[['nnhanman_comic.js','nnhanman_list.html','nnhanman_home.html','nnhanman_detail.html'],['jcomic_comic.js','jcomic_cat.html','jcomic_home.html','jcomic_eps.html'],['seyoumanhua_comic.js','seyoumanhua_list.html',null,'seyoumanhua_comic.html']].filter(([file])=>fs.existsSync(path.join(root,'comic',file)));
 for(const [file,list,home,detail] of fixtures){
  const context=vm.createContext({console,setTimeout});vm.runInContext(fs.readFileSync(path.join(root,'comic',file),'utf8'),context);const source=context.LumeSource;
  function body(snapshot){source.http={get:async()=>({status:200,body:fs.readFileSync(path.join(root,'snapshots',snapshot),'utf8')})};}
  function check(items,stage){assert(items.length>0,file+' '+stage);for(const item of items){assert.match(item.cover,/^https?:\/\//,file+' '+stage);assert.match(item.coverHeaders?.Referer||'',/^https:\/\//);}}
  body(list);const result=await source.list({page:1});check(result.items,'list');
  if(home){source.http={get:async(url)=>({status:200,body:fs.readFileSync(path.join(root,'snapshots',file==='jcomic_comic.js'&&url.includes('/cat/')?list:home),'utf8')})};const boards=await source.home();check(boards.flatMap(b=>b.items||[]),'home');}
  body(detail);const info=await source.detail({id:result.items[0].id});check([info],'detail');
  console.log(source.id+' 首页/列表/详情封面解析及请求头通过（站点快照）');
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
