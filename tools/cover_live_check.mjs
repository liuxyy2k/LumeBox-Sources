// 用真站响应跑一遍每个源脚本的 list()：看条目数、封面数、分类数。
// 用法：node tools/cover_live_check.mjs （需要能访问这些站点的网络）
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['novel/爱丽丝书屋.js', 'novel/中文成人小说网.js', 'novel/禁书阁.js',
     'novel/小黄书小说.js', 'novel/夜读小说.js', 'novel/X小说.js',
     'novel/少数派文库.js', 'novel/色文网.js', 'novel/H图书馆.js',
     'novel/HHH书屋.js', 'comic/三四漫画.js'];

for (const relative of targets) {
  const source = (() => {
    const context = { console };
    vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { timeout: 8000 });
    return context.LumeSource;
  })();
  const urls = [];
  source.http = {
    get: async (url, options) => {
      urls.push(url);
      const response = await fetch(url, {
        headers: { 'User-Agent': UA, ...(options?.headers || {}) },
      });
      return { status: response.status, body: await response.text() };
    },
    post: async (url, body, options) => {
      urls.push(url);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, ...(options?.headers || {}) },
        body,
      });
      return { status: response.status, body: await response.text() };
    },
  };
  try {
    const categories = await source.categories();
    const page = await source.list({ page: 1 });
    const items = page.items || [];
    const withCover = items.filter((item) => item.cover && item.cover.length > 4);
    const title = (items[0] && items[0].title || '').slice(0, 18);
    console.log(
      `${relative.padEnd(28)} 分类=${categories.length} 条目=${items.length} 有封面=${withCover.length}` +
      ` 首个=${JSON.stringify(title)} 封面=${withCover[0] ? withCover[0].cover.slice(0, 60) : '-'}`,
    );
  } catch (error) {
    console.log(`${relative.padEnd(28)} 失败：${String(error).slice(0, 90)}`);
  }
  void urls;
}
