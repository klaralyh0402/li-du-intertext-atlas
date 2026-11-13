(() => {
  "use strict";

  const DATA = window.LI_DU_DATA;
  if (!DATA) {
    document.body.innerHTML = "<p style='padding:40px;font-family:serif'>数据加载失败：请确认 data.js 与 index.html 位于同一目录。</p>";
    return;
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const liPoems = DATA.liPoems;
  const duPoems = DATA.duPoems;
  const relations = DATA.relations;
  const topRelations = DATA.topRelations;
  const numberFmt = new Intl.NumberFormat("zh-CN");
  const state = {
    query: "",
    poet: "all",
    threshold: 7000,
    sort: "score",
    limit: 9,
    filtered: [],
    currentRelation: null,
    atlasThreshold: 9000,
    atlasItems: []
  };

  const escapeHTML = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const escapeAttr = escapeHTML;

  const normalize = (value) => String(value)
    .toLowerCase()
    .replace(/[\s，。！？、；：“”‘’《》〈〉·,.!?;:'"()（）\-—…]/g, "");

  const scoreText = (raw) => (raw / 100).toFixed(2) + "%";
  const compactNumber = (value) => {
    if (value >= 10000) return (value / 10000).toFixed(value >= 100000 ? 0 : 1).replace(/\.0$/, "") + "万";
    return numberFmt.format(value);
  };
  const truncate = (text, max = 11) => {
    const chars = [...String(text)];
    return chars.length > max ? chars.slice(0, max).join("") + "…" : chars.join("");
  };

  const getLine = (side, poemIndex, lineIndex) => {
    const poem = side === "li" ? liPoems[poemIndex] : duPoems[poemIndex];
    return { poem, text: poem[2][lineIndex], poemId: poem[0], poemIndex, lineIndex };
  };

  const highlight = (text, query) => {
    if (!query) return escapeHTML(text);
    const chars = [...String(text)];
    let direct = String(text).indexOf(query);
    let start = -1;
    let end = -1;
    if (direct >= 0) {
      start = direct;
      end = direct + query.length;
    } else {
      const nq = normalize(query);
      if (nq) {
        let normalized = "";
        const positions = [];
        let offset = 0;
        chars.forEach((char, charIndex) => {
          const nc = normalize(char);
          if (!nc) { offset += char.length; return; }
          for (const part of nc) {
            normalized += part;
            positions.push({ charIndex, offset });
          }
          offset += char.length;
        });
        const found = normalized.indexOf(nq);
        if (found >= 0) {
          const first = positions[found];
          const last = positions[found + nq.length - 1];
          start = first.offset;
          end = last.offset + chars[last.charIndex].length;
        }
      }
    }
    if (start < 0) return escapeHTML(text);
    // Recompute through string indices so surrogate pairs remain intact.
    const beforeText = String(text).slice(0, start);
    const hitText = String(text).slice(start, end);
    const afterText = String(text).slice(end);
    return escapeHTML(beforeText) + '<span class="highlight">' + escapeHTML(hitText) + "</span>" + escapeHTML(afterText);
  };

  const searchIndex = relations.map((r, rid) => {
    const li = getLine("li", r[1], r[2]);
    const du = getLine("du", r[3], r[4]);
    return {
      rid,
      liKey: normalize(li.poem[1] + li.text + li.poemId + li.lineIndex),
      duKey: normalize(du.poem[1] + du.text + du.poemId + du.lineIndex),
      allKey: normalize(li.poem[1] + li.text + li.poemId + li.lineIndex + du.poem[1] + du.text + du.poemId + du.lineIndex)
    };
  });

  const setText = (selector, value) => {
    const node = $(selector);
    if (node) node.textContent = value;
  };

  function initOverview() {
    const meta = DATA.meta;
    setText("#heroLiLines", numberFmt.format(meta.liLines));
    setText("#heroRelations", numberFmt.format(meta.relations));
    setText("#heroDuLines", numberFmt.format(meta.duLines));
    setText("#heroMax", scoreText(meta.scoreMax));
    setText("#metricLines", numberFmt.format(meta.liLines + meta.duLines));
    setText("#metricRelations", numberFmt.format(meta.relations));
    setText("#metricHigh", numberFmt.format(meta.score90plus));
    setText("#sourceLiCount", numberFmt.format(meta.liLines));
    setText("#sourceDuCount", numberFmt.format(meta.duLines));
    setText("#sourceRelCount", numberFmt.format(meta.relations));
    setText("#rawRange", numberFmt.format(meta.scoreMin) + "–" + numberFmt.format(meta.scoreMax));

    const mean = relations.reduce((sum, r) => sum + r[0], 0) / relations.length;
    setText("#metricMean", scoreText(mean));

    const topIndex = topRelations[0];
    const r = relations[topIndex];
    const li = getLine("li", r[1], r[2]);
    const du = getLine("du", r[3], r[4]);
    setText("#heroScore", scoreText(r[0]));
    $("#heroFeatureBody").innerHTML =
      '<p><small>李白 · 《' + escapeHTML(li.poem[1]) + '》</small>' + escapeHTML(li.text) + "</p>" +
      "<i></i>" +
      '<p><small>杜甫 · 《' + escapeHTML(du.poem[1]) + '》</small>' + escapeHTML(du.text) + "</p>";
    $("#heroFeature").addEventListener("click", () => openDrawer(topIndex));
    $("#heroFeature").setAttribute("role", "button");
    $("#heroFeature").setAttribute("tabindex", "0");
    $("#heroFeature").addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openDrawer(topIndex);
    });
  }

  function applyFilters() {
    const threshold = state.threshold;
    const q = normalize(state.query);
    const result = [];
    for (let rid = 0; rid < relations.length; rid++) {
      const relation = relations[rid];
      if (relation[0] < threshold) continue;
      if (q) {
        const index = searchIndex[rid];
        const key = state.poet === "li" ? index.liKey : state.poet === "du" ? index.duKey : index.allKey;
        if (!key.includes(q)) continue;
      }
      result.push(rid);
    }
    if (state.sort === "score") {
      result.sort((a, b) => relations[b][0] - relations[a][0] || a - b);
    }
    state.filtered = result;
    state.limit = state.query ? 12 : 9;
    renderResults();
  }

  function cardMarkup(rid, index) {
    const r = relations[rid];
    const li = getLine("li", r[1], r[2]);
    const du = getLine("du", r[3], r[4]);
    return '<article class="relation-card" data-rid="' + rid + '" role="button" tabindex="0" aria-label="打开互文详情" style="animation-delay:' + Math.min(index * 35, 350) + 'ms">' +
      '<div class="relation-card__top">' +
        '<div class="score-badge"><strong>' + scoreText(r[0]) + '</strong><span>相似度</span></div>' +
        '<span class="relation-id">原表第 ' + (rid + 1) + ' 行</span>' +
      "</div>" +
      '<div class="pair-grid">' +
        '<div class="poem-side poem-side--li">' +
          '<span class="poem-source"><b>李白</b> · 《' + highlight(li.poem[1], state.query) + '》</span>' +
          '<p class="poem-text">' + highlight(li.text, state.query) + "</p>" +
        "</div>" +
        '<div class="pair-bridge" aria-hidden="true"><i></i></div>' +
        '<div class="poem-side poem-side--du">' +
          '<span class="poem-source"><b>杜甫</b> · 《' + highlight(du.poem[1], state.query) + '》</span>' +
          '<p class="poem-text">' + highlight(du.text, state.query) + "</p>" +
        "</div>" +
      "</div>" +
      '<div class="relation-card__foot">' +
        '<div class="id-chips"><span class="id-chip">诗 ' + escapeHTML(li.poemId) + ' / 句 ' + li.lineIndex + '</span><span class="id-chip">诗 ' + escapeHTML(du.poemId) + ' / 句 ' + du.lineIndex + "</span></div>" +
        '<span class="open-detail">展开原作 →</span>' +
      "</div>" +
    "</article>";
  }

  function renderResults() {
    const total = state.filtered.length;
    const visible = state.filtered.slice(0, state.limit);
    const grid = $("#resultsGrid");
    setText("#resultCount", numberFmt.format(total));
    setText("#resultPage", visible.length ? "已显示 " + numberFmt.format(visible.length) + " / " + numberFmt.format(total) : "");
    grid.innerHTML = visible.map((rid, index) => cardMarkup(rid, index)).join("");
    $("#emptyState").hidden = total !== 0;
    grid.hidden = total === 0;
    $("#loadMore").hidden = total === 0 || visible.length >= total;
    if (visible.length < total) {
      $("#loadMore").innerHTML = "展开更多互文 <span>＋</span>";
    }
    const clear = $("#clearSearch");
    clear.classList.toggle("is-visible", Boolean(state.query));
  }

  function openDrawer(rid) {
    const r = relations[rid];
    if (!r) return;
    state.currentRelation = rid;
    const li = getLine("li", r[1], r[2]);
    const du = getLine("du", r[3], r[4]);
    const context = (poem, matchIndex) => {
      const start = Math.max(0, matchIndex - 4);
      const end = Math.min(poem[2].length, matchIndex + 5);
      let html = "";
      if (start > 0) html += '<p class="context-gap">⋯</p>';
      for (let i = start; i < end; i++) {
        html += '<p class="' + (i === matchIndex ? "is-match" : "") + '">' + escapeHTML(poem[2][i]) + "</p>";
      }
      if (end < poem[2].length) html += '<p class="context-gap">⋯</p>';
      return html;
    };

    $("#drawerContent").innerHTML =
      '<div class="drawer-score-block"><span>原表相似度 · 第 ' + (rid + 1) + ' 行</span><strong>' + scoreText(r[0]) + "</strong></div>" +
      '<div class="drawer-pair">' +
        "<div><small>李白 · 《" + escapeHTML(li.poem[1]) + "》</small><p>" + escapeHTML(li.text) + "</p></div>" +
        '<div class="pair-bridge" aria-hidden="true"><i></i></div>' +
        "<div><small>杜甫 · 《" + escapeHTML(du.poem[1]) + "》</small><p>" + escapeHTML(du.text) + "</p></div>" +
      "</div>" +
      '<section class="context-block"><div class="context-head"><h4>李白原作</h4><span>诗歌 ID ' + escapeHTML(li.poemId) + " · 诗句 ID " + li.lineIndex + '</span></div><div class="poem-context">' + context(li.poem, li.lineIndex) + "</div></section>" +
      '<section class="context-block"><div class="context-head"><h4>杜甫原作</h4><span>诗歌 ID ' + escapeHTML(du.poemId) + " · 诗句 ID " + du.lineIndex + '</span></div><div class="poem-context">' + context(du.poem, du.lineIndex) + "</div></section>" +
      '<div class="meta-grid">' +
        '<div class="meta-box"><span>李白诗句定位</span><strong>诗 ' + escapeHTML(li.poemId) + " / 句 " + li.lineIndex + "</strong></div>" +
        '<div class="meta-box"><span>杜甫诗句定位</span><strong>诗 ' + escapeHTML(du.poemId) + " / 句 " + du.lineIndex + "</strong></div>" +
        '<div class="meta-box"><span>原始相似度</span><strong>' + r[0] + " / 10000</strong></div>" +
        '<div class="meta-box"><span>关系表位置</span><strong>第 ' + (rid + 1) + " 行</strong></div>" +
      "</div>" +
      '<div class="drawer-actions">' +
        '<button type="button" class="primary" data-action="focus-li">查看李白此句全部互文</button>' +
        '<button type="button" data-action="focus-du">查看杜甫此句全部互文</button>' +
        '<button type="button" data-action="copy">复制诗句对照</button>' +
      "</div>";

    $$("[data-action]", $("#drawerContent")).forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "focus-li") focusLine("li", li);
        if (action === "focus-du") focusLine("du", du);
        if (action === "copy") copyText("李白《" + li.poem[1] + "》" + li.text + "\n杜甫《" + du.poem[1] + "》" + du.text);
      });
    });

    const backdrop = $("#drawerBackdrop");
    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add("is-open"));
    $("#detailDrawer").classList.add("is-open");
    $("#detailDrawer").setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
  }

  function closeDrawer() {
    const backdrop = $("#drawerBackdrop");
    backdrop.classList.remove("is-open");
    $("#detailDrawer").classList.remove("is-open");
    $("#detailDrawer").setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
    window.setTimeout(() => { backdrop.hidden = true; }, 320);
  }

  function focusLine(side, line) {
    closeDrawer();
    state.query = line.text;
    state.poet = side;
    state.threshold = 7000;
    state.sort = "score";
    state.limit = 30;
    $("#searchInput").value = line.text;
    $("#scoreRange").value = "7000";
    $("#scoreOutput").textContent = "70.00%";
    $("#sortSelect").value = "score";
    $$("#poetFilter button").forEach((button) => button.classList.toggle("is-active", button.dataset.poet === side));
    applyFilters();
    $("#explore").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => showToast("诗句对照已复制")).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      showToast("诗句对照已复制");
    } catch (error) {
      showToast("复制失败，请手动选择诗句");
    }
    area.remove();
  }

  let toastTimer;
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  function renderHistogram() {
    const groups = [
      { label: "70–75", min: 70, max: 74, text: "70%–74.99%" },
      { label: "75–80", min: 75, max: 79, text: "75%–79.99%" },
      { label: "80–85", min: 80, max: 84, text: "80%–84.99%" },
      { label: "85–90", min: 85, max: 89, text: "85%–89.99%" },
      { label: "90–95", min: 90, max: 94, text: "90%–94.99%" },
      { label: "95–100", min: 95, max: 99, text: "95%–99.99%" },
      { label: "100", min: 100, max: 100, text: "100.00%" }
    ];
    const counts = groups.map((group) => DATA.histogram.reduce((sum, item) => sum + (item[0] >= group.min && item[0] <= group.max ? item[1] : 0), 0));
    const max = Math.max(...counts);
    $("#histogram").innerHTML = groups.map((group, index) => {
      const count = counts[index];
      const height = Math.max(5, Math.round(Math.log10(count + 1) / Math.log10(max + 1) * 195));
      return '<div class="bar-wrap" style="--h:' + height + 'px" aria-label="' + group.text + "：" + numberFmt.format(count) + '组">' +
        '<span class="bar-value">' + compactNumber(count) + "</span>" +
        '<span class="bar-tip">' + group.text + " · " + numberFmt.format(count) + "组</span>" +
        '<div class="bar" style="height:' + height + 'px"></div>' +
        '<span class="bar-range">' + group.label + "</span>" +
      "</div>";
    }).join("");
  }

  function renderTopRelations() {
    $("#topRelations").innerHTML = topRelations.slice(0, 7).map((rid, index) => {
      const r = relations[rid];
      const li = getLine("li", r[1], r[2]);
      const du = getLine("du", r[3], r[4]);
      return '<li class="rank-item" data-rid="' + rid + '" tabindex="0" role="button">' +
        '<span class="rank-item__num">' + String(index + 1).padStart(2, "0") + "</span>" +
        '<div class="rank-item__text"><p>' + escapeHTML(li.text) + " / " + escapeHTML(du.text) + '</p><small>李白《' + escapeHTML(li.poem[1]) + "》 · 杜甫《" + escapeHTML(du.poem[1]) + "》</small></div>" +
        '<span class="rank-item__score">' + scoreText(r[0]) + "</span>" +
      "</li>";
    }).join("");
  }

  function atlasCandidates(threshold, limit) {
    const candidates = [];
    const seen = new Set();
    for (let rid = 0; rid < relations.length; rid++) {
      const r = relations[rid];
      if (r[0] < threshold) continue;
      const li = getLine("li", r[1], r[2]);
      const du = getLine("du", r[3], r[4]);
      const key = li.text + "|" + du.text;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ rid, score: r[0], li, du });
    }
    candidates.sort((a, b) => b.score - a.score || a.rid - b.rid);
    return { all: candidates, shown: candidates.slice(0, limit) };
  }

  function renderAtlas() {
    const isCompact = window.matchMedia("(max-width: 640px)").matches;
    const limit = isCompact ? 12 : 22;
    const candidateData = atlasCandidates(state.atlasThreshold, limit);
    const items = candidateData.shown;
    state.atlasItems = items;
    const eligible = candidateData.all.length;
    setText("#atlasOutput", scoreText(state.atlasThreshold));
    $("#atlasCount").innerHTML = "<strong>" + items.length + "</strong><span>" + (eligible > items.length ? "组入图 · 阈值内共 " + numberFmt.format(eligible) + " 组" : "组关系入图") + "</span>";
    if (!items.length) {
      $("#atlasSvg").innerHTML = '<text x="600" y="360" text-anchor="middle" fill="rgba(242,235,221,.4)" font-size="14">当前阈值下没有关系</text>';
      return;
    }

    const liNodes = [];
    const duNodes = [];
    const liMap = new Map();
    const duMap = new Map();
    items.forEach((item) => {
      const lk = item.li.poemIndex + ":" + item.li.lineIndex;
      const dk = item.du.poemIndex + ":" + item.du.lineIndex;
      if (!liMap.has(lk)) {
        const node = { key: lk, item, y: 0 };
        liMap.set(lk, node);
        liNodes.push(node);
      }
      if (!duMap.has(dk)) {
        const node = { key: dk, item, y: 0 };
        duMap.set(dk, node);
        duNodes.push(node);
      }
    });

    const top = 104;
    const bottom = 650;
    const span = bottom - top;
    const space = (nodes) => {
      if (nodes.length === 1) return nodes[0].y = (top + bottom) / 2;
      nodes.forEach((node, index) => { node.y = top + (span * index) / (nodes.length - 1); });
    };
    space(liNodes);
    space(duNodes);

    const edgeGroups = items.map((item, index) => {
      const liNode = liMap.get(item.li.poemIndex + ":" + item.li.lineIndex);
      const duNode = duMap.get(item.du.poemIndex + ":" + item.du.lineIndex);
      const x1 = 355;
      const x2 = 845;
      const bend = Math.min(170, 78 + Math.abs(index % 4) * 20);
      const path = "M " + x1 + " " + liNode.y + " C " + (x1 + bend) + " " + liNode.y + ", " + (x2 - bend) + " " + duNode.y + ", " + x2 + " " + duNode.y;
      const strength = (item.score - 7000) / 3000;
      const color = item.score >= 9800 ? "#e0bc7e" : item.score >= 9000 ? "#c46c5c" : "rgba(205, 193, 168, 0.58)";
      const width = 0.7 + strength * 1.7;
      return '<g class="atlas-edge-group" data-rid="' + item.rid + '">' +
        '<path class="atlas-edge" d="' + path + '" stroke="' + color + '" stroke-width="' + width.toFixed(2) + '" opacity="' + (0.48 + strength * 0.45).toFixed(2) + '"></path>' +
        '<path class="atlas-edge-hit" d="' + path + '" data-rid="' + item.rid + '"></path>' +
      "</g>";
    }).join("");

    const liNodeMarkup = liNodes.map((node) => {
      const item = node.item;
      return '<g class="atlas-node-group" data-side="li">' +
        '<circle class="atlas-node" cx="355" cy="' + node.y + '" r="4"></circle>' +
        '<text class="atlas-label" x="337" y="' + (node.y + 5) + '" text-anchor="end" data-rid="' + item.rid + '">' + escapeHTML(truncate(item.li.text, isCompact ? 7 : 12)) + "</text>" +
      "</g>";
    }).join("");
    const duNodeMarkup = duNodes.map((node) => {
      const item = node.item;
      return '<g class="atlas-node-group" data-side="du">' +
        '<circle class="atlas-node atlas-node--du" cx="845" cy="' + node.y + '" r="4"></circle>' +
        '<text class="atlas-label atlas-label--du" x="863" y="' + (node.y + 5) + '" data-rid="' + item.rid + '">' + escapeHTML(truncate(item.du.text, isCompact ? 7 : 12)) + "</text>" +
      "</g>";
    }).join("");

    $("#atlasSvg").innerHTML = edgeGroups + liNodeMarkup + duNodeMarkup;

    $$(".atlas-edge-hit", $("#atlasSvg")).forEach((hit) => {
      hit.addEventListener("mouseenter", (event) => showAtlasTooltip(event, Number(hit.dataset.rid)));
      hit.addEventListener("mousemove", (event) => moveAtlasTooltip(event));
      hit.addEventListener("mouseleave", hideAtlasTooltip);
      hit.addEventListener("click", () => openDrawer(Number(hit.dataset.rid)));
    });
    $$(".atlas-label", $("#atlasSvg")).forEach((label) => {
      label.addEventListener("mouseenter", (event) => showAtlasTooltip(event, Number(label.dataset.rid)));
      label.addEventListener("mousemove", (event) => moveAtlasTooltip(event));
      label.addEventListener("mouseleave", hideAtlasTooltip);
      label.addEventListener("click", () => openDrawer(Number(label.dataset.rid)));
    });
  }

  function showAtlasTooltip(event, rid) {
    const r = relations[rid];
    const li = getLine("li", r[1], r[2]);
    const du = getLine("du", r[3], r[4]);
    const tooltip = $("#atlasTooltip");
    tooltip.innerHTML = "<strong>" + scoreText(r[0]) + "</strong><p>" + escapeHTML(li.text) + " / " + escapeHTML(du.text) + "</p><small>李白《" + escapeHTML(li.poem[1]) + "》 · 杜甫《" + escapeHTML(du.poem[1]) + "》</small>";
    tooltip.hidden = false;
    moveAtlasTooltip(event);
  }

  function moveAtlasTooltip(event) {
    const tooltip = $("#atlasTooltip");
    const board = $("#atlasBoard");
    const rect = board.getBoundingClientRect();
    const x = Math.max(10, Math.min(rect.width - tooltip.offsetWidth - 12, event.clientX - rect.left + 12));
    const y = Math.max(10, Math.min(rect.height - tooltip.offsetHeight - 12, event.clientY - rect.top + 12));
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }

  function hideAtlasTooltip() {
    $("#atlasTooltip").hidden = true;
  }

  function bindEvents() {
    let searchTimer;
    $("#searchInput").addEventListener("input", (event) => {
      state.query = event.target.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilters, 100);
    });

    $("#clearSearch").addEventListener("click", () => {
      state.query = "";
      $("#searchInput").value = "";
      applyFilters();
      $("#searchInput").focus();
    });

    $("#poetFilter").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-poet]");
      if (!button) return;
      state.poet = button.dataset.poet;
      $$("#poetFilter button").forEach((item) => item.classList.toggle("is-active", item === button));
      applyFilters();
    });

    $("#sortSelect").addEventListener("change", (event) => {
      state.sort = event.target.value;
      applyFilters();
    });

    $("#scoreRange").addEventListener("input", (event) => {
      state.threshold = Number(event.target.value);
      $("#scoreOutput").textContent = scoreText(state.threshold);
      applyFilters();
    });

    $("#loadMore").addEventListener("click", () => {
      state.limit += 9;
      renderResults();
    });


    $("#resetFilters").addEventListener("click", () => {
      state.query = "";
      state.poet = "all";
      state.threshold = 7000;
      state.sort = "score";
      $("#searchInput").value = "";
      $("#scoreRange").value = "7000";
      $("#scoreOutput").textContent = "70.00%";
      $("#sortSelect").value = "score";
      $$("#poetFilter button").forEach((button) => button.classList.toggle("is-active", button.dataset.poet === "all"));
      applyFilters();
    });

    $("#resultsGrid").addEventListener("click", (event) => {
      const card = event.target.closest(".relation-card");
      if (card) openDrawer(Number(card.dataset.rid));
    });
    $("#resultsGrid").addEventListener("keydown", (event) => {
      const card = event.target.closest(".relation-card");
      if (card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openDrawer(Number(card.dataset.rid));
      }
    });

    $("#drawerClose").addEventListener("click", closeDrawer);
    $("#drawerBackdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("#detailDrawer").classList.contains("is-open")) closeDrawer();
    });

    $("#atlasRange").addEventListener("input", (event) => {
      state.atlasThreshold = Number(event.target.value);
      renderAtlas();
    });

    $("#topRelations").addEventListener("click", (event) => {
      const item = event.target.closest(".rank-item");
      if (item) openDrawer(Number(item.dataset.rid));
    });
    $("#topRelations").addEventListener("keydown", (event) => {
      const item = event.target.closest(".rank-item");
      if (item && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openDrawer(Number(item.dataset.rid));
      }
    });

    $("#viewHighScores").addEventListener("click", () => {
      state.query = "";
      state.poet = "all";
      state.threshold = 9000;
      state.sort = "score";
      state.limit = 30;
      $("#searchInput").value = "";
      $("#scoreRange").value = "9000";
      $("#scoreOutput").textContent = "90.00%";
      $("#sortSelect").value = "score";
      $$("#poetFilter button").forEach((button) => button.classList.toggle("is-active", button.dataset.poet === "all"));
      applyFilters();
      $("#explore").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const menuToggle = $("#menuToggle");
    const mainNav = $("#mainNav");
    menuToggle.addEventListener("click", () => {
      const open = mainNav.classList.toggle("is-open");
      menuToggle.classList.toggle("is-open", open);
      menuToggle.setAttribute("aria-expanded", String(open));
    });
    $$("#mainNav a").forEach((link) => {
      link.addEventListener("click", () => {
        mainNav.classList.remove("is-open");
        menuToggle.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });

    window.addEventListener("scroll", updateScrollUI, { passive: true });
    window.addEventListener("resize", () => {
      clearTimeout(window.__atlasResizeTimer);
      window.__atlasResizeTimer = setTimeout(renderAtlas, 140);
    }, { passive: true });
  }

  function updateScrollUI() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    $("#readingProgress").style.width = Math.max(0, Math.min(100, scrollTop / height * 100)) + "%";
    $("#siteHeader").classList.toggle("is-scrolled", scrollTop > 24);
    const sections = ["explore", "atlas", "spectrum"];
    let active = "";
    for (const id of sections) {
      const section = document.getElementById(id);
      if (section && section.getBoundingClientRect().top <= window.innerHeight * 0.35) active = id;
    }
    $$("#mainNav a").forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === "#" + active));
  }

  initOverview();
  renderHistogram();
  renderTopRelations();
  renderAtlas();
  bindEvents();
  applyFilters();
  updateScrollUI();
})();
