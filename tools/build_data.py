"""从 HowToCook 生成内置菜谱 data/dishes.json,并复制封面到 covers/。

一次性脚本,不属于应用运行时。用法:

    python -I tools/build_data.py <HowToCook 仓库目录> <封面目录> <项目根目录>

封面目录里的文件名约定为 "<来源分类目录>__<菜名>.webp"(例如 meat_dish__可乐鸡翅.webp)。
"""
import json
import re
import shutil
import sys
from pathlib import Path

MAX_DIFFICULTY = 3
CATEGORIES = [  # (HowToCook 目录, 应用内分类名)
    ("meat_dish", "荤菜"),
    ("vegetable_dish", "素菜"),
    ("soup", "汤"),
    ("staple", "主食"),
    ("aquatic", "水产"),
    ("breakfast", "早餐"),
]


def section(text, title):
    """取 "## title" 到下一个二级标题之间的内容(三级标题属于它)。"""
    m = re.search(r"^##[ \t]*" + re.escape(title) + r"[ \t]*$(.*?)(?=^##[ \t]|\Z)", text, re.S | re.M)
    return m.group(1) if m else ""


def plain(s):
    """去掉常见 Markdown 标记,保留文字。"""
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", s)
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = s.replace("**", "").replace("`", "")
    s = re.sub(r"\s*\*\s*份数", "", s)  # 原文的份数公式,如 "1g * 份数"
    return re.sub(r"[ \t]+", " ", s).strip()


def parse_ingredient(line):
    """返回 {"n": 食材名, "q": 用量原文};用量里的"* 份数"去掉。"""
    line = plain(line)
    line = re.sub(r"\s*\*\s*份数", "", line).strip(" ，,;；")
    m = re.match(r"^(.+?)\s*=\s*(.+)$", line) or re.match(r"^(\S+)\s+(.+)$", line)
    name, qty = (m.group(1).strip(), m.group(2).strip()) if m else (line, "")
    name = name.rstrip("= ")
    if len(name) > 12 or re.search(r"[（(：:]", name):  # 原文有少数把说明写进食材名的行,按标点截出食材名,其余归入用量
        head = re.split(r"[（(：:，,、]", name, maxsplit=1)[0].strip() or name[:12]
        rest = name[len(head):].strip("（()）：:，, ")
        name, qty = head, " ".join(x for x in (rest, qty) if x)
    return {"n": name, "q": qty}


def bullets(sec):
    return [re.sub(r"^[-*+]\s+", "", l.strip()) for l in sec.splitlines() if re.match(r"\s*[-*+]\s+\S", l)]


def parse_steps(sec):
    """步骤列表;三级标题变成 "## 标题" 分组行;缩进的说明并入上一步。"""
    steps = []
    for raw in sec.splitlines():
        if not raw.strip():
            continue
        h = re.match(r"^###\s*(.+)$", raw)
        if h:
            steps.append("## " + plain(h.group(1)))
            continue
        n = re.match(r"^\s{0,3}\d+[.、]\s*(.*)$", raw)
        if n:
            if n.group(1).strip():
                steps.append(plain(n.group(1)))
            continue
        note = re.match(r"^\s{2,}[-*+]\s*(.+)$", raw)
        if note and steps and not steps[-1].startswith("## "):
            steps[-1] += "\n" + plain(note.group(1))
    return [s for s in steps if s.strip()]


def parse_dish(path):
    text = path.read_text(encoding="utf-8")
    diff = re.search(r"预估烹饪难度：(★+)", text)
    if not diff:
        return None
    ings = bullets(section(text, "计算")) or bullets(section(text, "必备原料和工具"))
    intro = ""
    for block in re.split(r"\n\s*\n", text.split("\n", 1)[1] if "\n" in text else ""):
        b = block.strip()
        if b and not b.startswith(("#", "预估", "!", "<")):
            intro = plain(b)
            break
    return {
        "difficulty": len(diff.group(1)),
        "intro": intro,
        "ingredients": [parse_ingredient(i) for i in ings],
        "steps": parse_steps(section(text, "操作")),
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    src, covers, root = (Path(a) for a in sys.argv[1:4])
    out_covers = root / "covers"
    out_covers.mkdir(parents=True, exist_ok=True)
    dishes, seen, problems = [], set(), []
    for cat_dir, cat_name in CATEGORIES:
        items = []
        for md in (src / "dishes" / cat_dir).rglob("*.md"):
            d = parse_dish(md)
            if not d or d["difficulty"] > MAX_DIFFICULTY:
                continue
            items.append((d["difficulty"], md.stem, d))
        for _, name, d in sorted(items, key=lambda x: (x[0], x[1])):
            if name in seen:
                problems.append(f"重名跳过: {cat_name}/{name}")
                continue
            seen.add(name)
            if not d["ingredients"]:
                problems.append(f"无配料: {cat_name}/{name}")
            if not [s for s in d["steps"] if not s.startswith("## ")]:
                problems.append(f"无步骤: {cat_name}/{name}")
            dish_id = f"d{len(dishes) + 1:03d}"
            cover = covers / f"{cat_dir}__{name}.webp"
            has_cover = cover.exists()
            if has_cover:
                shutil.copyfile(cover, out_covers / f"{dish_id}.webp")
            dishes.append({"id": dish_id, "name": name, "cat": cat_name, "diff": d["difficulty"],
                           "intro": d["intro"], "cover": has_cover,
                           "ingredients": d["ingredients"], "steps": d["steps"]})
    data = {"version": 1, "categories": [c for _, c in CATEGORIES], "dishes": dishes}
    (root / "data").mkdir(exist_ok=True)
    (root / "data" / "dishes.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(dishes)} 道菜, 封面 {sum(d['cover'] for d in dishes)} 张")
    for p in problems:
        print(p)


if __name__ == "__main__":
    main()
