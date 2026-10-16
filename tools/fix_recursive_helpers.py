# -*- coding: utf-8 -*-
"""把 `H.all` / `H.text` 从递归改成显式栈。

背景：这两个 helper 是模板生成出来的，递归深度 = DOM 深度。App 的 QuickJS 沙箱里
可用的 JS 调用栈很浅（本机实测 20 层出头），遇到深一点的页面就直接
`Maximum call stack size exceeded`，整个源在真机上不可用（小黄书小说的快照用例就是
这么红的）。改成显式栈后语义完全不变：

- all：先序（与递归 forEach 的左→右一致），script/style 的子节点照样不展开；
- text：后序求值，每个节点仍是 `clean(children 渲染结果按 sep 连接)`，
  sep 仍是「当前节点 tag 命中块级标签时为换行」。

只做逐字替换：这两个函数在 22 个源里完全一致，文本对不上就不动那个文件。
"""
import io
import os
import sys

OLD_ALL = ("all: function(node,pred) {var out=[];function visit(n){if(pred(n))out.push(n);"
           "if(n.tag==='script'||n.tag==='style')return;n.children.forEach(visit);}"
           "visit(node);return out;}")

NEW_ALL = ("all: function(node,pred) {var out=[],stack=[node];while(stack.length){var n=stack.pop();"
           "if(pred(n))out.push(n);if(n.tag==='script'||n.tag==='style')continue;"
           "for(var i=n.children.length-1;i>=0;i--)stack.push(n.children[i]);}return out;}")

OLD_TEXT = ("text: function(node) {if(!node)return '';if(node.tag==='#text')return this.entity(node.raw);"
            "if(node.tag==='script'||node.tag==='style')return '';"
            "return this.clean(node.children.map(function(n){return H.text(n);})"
            ".join(/^(?:p|div|section|article|li|br)$/.test(node.tag)?'\\n':''));}")

NEW_TEXT = ("text: function(root) {if(!root)return '';if(root.tag==='#text')return this.entity(root.raw);"
            "if(root.tag==='script'||root.tag==='style')return '';"
            "var frames=[{node:root,i:0,parts:[]}];while(true){var top=frames[frames.length-1],node=top.node;"
            "if(top.i<node.children.length){var child=node.children[top.i++];"
            "if(child.tag==='#text'){top.parts.push(this.entity(child.raw));continue;}"
            "if(child.tag==='script'||child.tag==='style'){top.parts.push('');continue;}"
            "frames.push({node:child,i:0,parts:[]});continue;}"
            "var rendered=this.clean(top.parts.join(/^(?:p|div|section|article|li|br)$/.test(node.tag)?'\\n':''));"
            "frames.pop();if(!frames.length)return rendered;frames[frames.length-1].parts.push(rendered);}}")


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    hit, skip = [], []
    for base, dirs, names in os.walk(root):
        if '.git' in base:
            continue
        for name in names:
            if not name.endswith('.js') or name == 'sources.js':
                continue
            path = os.path.join(base, name)
            text = io.open(path, encoding='utf-8').read()
            if OLD_ALL not in text and OLD_TEXT not in text:
                continue
            new = text.replace(OLD_ALL, NEW_ALL).replace(OLD_TEXT, NEW_TEXT)
            if new == text:
                skip.append(os.path.relpath(path, root))
                continue
            io.open(path, 'w', encoding='utf-8', newline='\n').write(new)
            hit.append((os.path.relpath(path, root),
                        OLD_ALL in text, OLD_TEXT in text))
    for rel, a, t in hit:
        print('修好 %-30s all=%s text=%s' % (rel, a, t))
    if skip:
        print('文本不一致、未改动:', skip)
    print('共修', len(hit), '个文件')
    return 0


if __name__ == '__main__':
    sys.exit(main())
