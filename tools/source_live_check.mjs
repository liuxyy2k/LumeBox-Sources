// 单个源的端到端真站检查：分类 → 列表 → 详情 → 章节 → 正文。
// 用法：node tools/source_live_check.mjs comic/mh18_comic.js [categoryId] [itemId]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [relative, categoryArg, itemArg] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

const context = { console };
vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { timeout: 8000 });
const source = context.LumeSource;
source.http = {
  get: async (url, options) => {
    const response = await fetch(url, { headers: { 'User-Agent': UA, ...(options?.headers || {}) } });
    return { status: response.status, body: await response.text() };
  },
  post: async (url, body, options) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': UA, ...(options?.headers || {}) },
      body,
    });
    return { status: response.status, body: await response.text() };
  },
};

const categories = await source.categories();
console.log('分类', categories.length, categories.map((c) => c.title).join(' / '));
const page = await source.list({ categoryId: categoryArg || undefined, page: 1 });
console.log('列表', page.items.length, 'hasMore', page.hasMore, JSON.stringify(page.items[0]));
const item = itemArg || (page.items[0] && page.items[0].id);
const detail = await source.detail({ id: item });
console.log('详情', JSON.stringify({
  title: detail && detail.title,
  cover: detail && (detail.cover || '').slice(0, 70),
  desc: detail && (detail.description || '').slice(0, 30),
}));
const chapters = await source.chapters({ id: item });
console.log('章节', chapters.length, JSON.stringify(chapters.slice(0, 3)));
if (chapters.length) {
  const content = await source.content({ itemId: item, chapterId: chapters[0].id });
  console.log('正文', content.kind, content.images?.length, (content.images || [])[0]);
  console.log('图片头示例', JSON.stringify(Object.values(content.imageHeaders || {})[0] || {}));
}
