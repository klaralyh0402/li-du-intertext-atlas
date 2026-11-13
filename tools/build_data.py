from pathlib import Path
import csv
import json
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "source"


def load_csv(name):
    with open(SOURCE / name, encoding="utf-8-sig", newline="") as handle:
        return list(csv.reader(handle))


def build_poems(rows):
    grouped = {}
    for title, line, poem_id, line_no in rows:
        poem = grouped.setdefault(poem_id, {"id": poem_id, "title": title, "lines": {}})
        poem["lines"][int(line_no)] = line
        if poem["title"] != title:
            raise ValueError(f"篇名不一致：{poem_id}")
    poems = []
    lookup = {}
    for index, poem_id in enumerate(grouped):
        raw = grouped[poem_id]
        lines = [raw["lines"].get(i, "") for i in range(max(raw["lines"]) + 1)]
        if any(not line for line in lines):
            raise ValueError(f"诗句编号存在空缺：{poem_id}")
        lookup[poem_id] = index
        poems.append({"id": poem_id, "title": raw["title"], "lines": lines})
    return poems, lookup


li_rows = load_csv("李白.csv")
du_rows = load_csv("杜甫.csv")
relation_rows = load_csv("李白-杜甫.csv")
li_poems, li_lookup = build_poems(li_rows)
du_poems, du_lookup = build_poems(du_rows)

relations = []
histogram_counter = Counter()
for row in relation_rows:
    li_poem_id, li_line_id = row[7], int(row[8])
    du_poem_id, du_line_id = row[9], int(row[10])
    li_index, du_index = li_lookup[li_poem_id], du_lookup[du_poem_id]
    if li_poems[li_index]["lines"][li_line_id] != row[2]:
        raise ValueError("李白诗句与原表不一致")
    if du_poems[du_index]["lines"][du_line_id] != row[5]:
        raise ValueError("杜甫诗句与原表不一致")
    score = int(row[6])
    relations.append([score, li_index, li_line_id, du_index, du_line_id])
    histogram_counter[min(100, score // 100)] += 1

histogram = [[score, histogram_counter[score]] for score in range(70, 101)]
source_degree = Counter((row[1], row[2]) for row in relations)
target_degree = Counter((row[3], row[4]) for row in relations)
top_relations = sorted(range(len(relations)), key=lambda i: (-relations[i][0], i))[:12]

data = {
    "meta": {
        "liPoems": len(li_poems),
        "liLines": len(li_rows),
        "duPoems": len(du_poems),
        "duLines": len(du_rows),
        "relations": len(relations),
        "uniqueLiSourceLines": len(source_degree),
        "uniqueDuTargetLines": len(target_degree),
        "scoreMin": min(row[0] for row in relations),
        "scoreMax": max(row[0] for row in relations),
        "maxSourceDegree": max(source_degree.values()),
        "maxTargetDegree": max(target_degree.values()),
        "score90plus": sum(row[0] >= 9000 for row in relations),
        "score80plus": sum(row[0] >= 8000 for row in relations),
    },
    "liPoems": [[poem["id"], poem["title"], poem["lines"]] for poem in li_poems],
    "duPoems": [[poem["id"], poem["title"], poem["lines"]] for poem in du_poems],
    "relations": relations,
    "histogram": histogram,
    "topRelations": top_relations,
}

output = ROOT / "data.js"
output.write_text(
    "window.LI_DU_DATA=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
print(f"生成 {output}，共 {len(relations):,} 组关系")
