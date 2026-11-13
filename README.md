# 李杜互文志

基于提供的李白、杜甫诗句数据制作的静态交互网站。

## 打开方式

直接双击 `index.html`，或运行 `打开网站.cmd`。推荐使用最新版 Edge / Chrome。

网站完全离线运行，不调用外部字体、接口或在线资源。

## 数据来源

- `source/李白.csv`：14,469 句，1,084 首。
- `source/杜甫.csv`：19,347 句，1,462 首。
- `source/李白-杜甫.csv`：23,448 组互文关系。

关系表字段顺序为：

`诗人 · 篇名 · 诗句 · 诗人 · 篇名 · 诗句 · 相似度 · 李白诗歌ID · 李白诗句ID · 杜甫诗歌ID · 杜甫诗句ID`

相似度原始值为 7000–10000 的整数，网站按原值 ÷ 100 显示为 70.00%–100.00%。网站没有补写诗句、修改篇名或重新生成语义相似度。

## 目录

- `index.html`：页面结构。
- `styles.css`：视觉样式与响应式布局。
- `app.js`：检索、筛选、星图、详情等交互。
- `data.js`：由原始 CSV 生成的前端数据。
- `assets/`：页面背景与保留原画色彩的人物图像。
- `source/`：三份原始 CSV。
- `tools/build_data.py`：从原始 CSV 重建 `data.js` 的脚本。

## 重建数据

在本目录运行：

```powershell
C:\Users\12417\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe tools\build_data.py
```

脚本会读取 `source/` 中的 CSV，校验诗句文本、诗歌 ID 与诗句 ID 的对应关系，再生成 `data.js`。

