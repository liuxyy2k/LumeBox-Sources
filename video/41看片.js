/// 41看片 改造版｜放开purpose=10分组 + 自动加载全部分类
var BANNED_GROUP_PURPOSE = 10;
var BANNED_WORDS = /(空)/;

function groupAllowed(group) {
    return true;
}

var LumeSource = {
    id: 'xfdxv_video',
    name: '41看片 全开版',
    version: '1.0.1',
    category: 'video',
    mirrors: ['https://xfdxv.41459.lifestyle:8283'],
};

async function categories() {
    try {
        const res = await req("https://xfdxv.41459.lifestyle:8283/api/vod/tag_group");
        const arr = [];
        arr.push({ id: 'latest', title: '最新更新' });
        arr.push({ id: 'hot', title: '最多观看' });
        arr.push({ id: 'likes', title: '最多点赞' });
        arr.push({ id: 'score', title: '高分' });
        if (res && Array.isArray(res.list)) {
            for (const g of res.list) {
                arr.push({
                    id: "tag:" + g.id,
                    title: g.name
                })
            }
        }
        return arr;
    } catch (e) {
        return [
            { id: 'latest', title: '最新更新' },
            { id: 'hot', title: '最多观看' },
            { id: 'likes', title: '最多点赞' },
            { id: 'score', title: '高分' },
            { id: 'tag:291', title: '原创' },
            { id: 'tag:4562', title: '热门分类' },
        ];
    }
}

async function filters() {
    try {
        var cached = null;
        const resp = await req("https://xfdxv.41459.lifestyle:8283/api/vod/tag_group");
        if (!resp || !resp.list) return [];
        const out = [];
        for (const group of resp.list) {
            if (!groupAllowed(group)) continue;
            out.push({
                key: "tag:" + group.id,
                name: group.name,
            })
        }
        return out;
    } catch (err) {
        return [];
    }
}

async function list(extra) {
    // 原有列表逻辑，这里保留原版接口规则
    let url = "https://xfdxv.41459.lifestyle:8283/api/vod";
    const qs = new URLSearchParams();
    qs.set("page", extra.page || 1);
    qs.set("limit", 20);

    if (extra.id) {
        if (extra.id.startsWith("tag:")) {
            qs.set("tag_id", extra.id.replace("tag:", ""));
        } else if (['latest','hot','likes','score'].includes(extra.id)) {
            qs.set("order", extra.id);
        }
    }
    const res = await req(url + "?" + qs.toString());
    if (!res || !res.list) return { list: [], total: 0 };
    const items = res.list.map(row => {
        const bits = [];
        if (row.year) bits.push(row.year);
        if (row.area) bits.push(row.area);
        if (row.type_name) bits.push(row.type_name);
        return {
            id: String(row.id),
            title: String(row.name || row.id),
            cover: absoluteImg(row.pic, "https://xfdxv.41459.lifestyle:8283"),
            subtitle: bits.join(' · ')
        };
    })
    return {
        list: items,
        total: res.total || items.length
    }
}

async function detail(id) {
    const r = await req(`https://xfdxv.41459.lifestyle:8283/api/vod/detail?id=${id}`);
    if (!r || !r.info) throw "获取详情失败";
    const info = r.info;
    const playList = [];
    if (r.play && Array.isArray(r.play)) {
        for (const pl of r.play) {
            playList.push({
                name: pl.name,
                url: pl.url
            })
        }
    }
    return {
        id: String(info.id),
        title: info.name,
        cover: absoluteImg(info.pic, "https://xfdxv.41459.lifestyle:8283"),
        desc: info.content || "暂无简介",
        play: playList
    }
}

async function search(kw, page) {
    const qs = new URLSearchParams();
    qs.set("wd", kw);
    qs.set("page", page || 1);
    qs.set("limit", 20);
    const res = await req("https://xfdxv.41459.lifestyle:8283/api/vod/search?" + qs.toString());
    if (!res || !res.list) return { list: [], total: 0 };
    const items = res.list.map(row => {
        const bits = [];
        if (row.year) bits.push(row.year);
        if (row.area) bits.push(row.area);
        if (row.type_name) bits.push(row.type_name);
        return {
            id: String(row.id),
            title: String(row.name || row.id),
            cover: absoluteImg(row.pic, "https://xfdxv.41459.lifestyle:8283"),
            subtitle: bits.join(' · ')
        };
    })
    return {
        list: items,
        total: res.total || items.length
    }
}

function absoluteImg(src, host) {
    if (!src) return "";
    if (src.startsWith("http")) return src;
    return host + src;
}
