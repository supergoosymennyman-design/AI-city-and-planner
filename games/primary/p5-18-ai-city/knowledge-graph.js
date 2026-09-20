/**
 * knowledge-graph.js — Free-form causal knowledge graph for AI City Architect
 * Students place nodes, connect with directed arrows, find feedback loops.
 */
const KnowledgeGraph = (() => {
  'use strict';

  const RELS = [
    { id:'needs', label:'needs', color:'#38bdf8' },
    { id:'provides', label:'provides', color:'#22c55e' },
    { id:'consumes', label:'consumes', color:'#ef4444' },
    { id:'produces', label:'produces', color:'#eab308' },
    { id:'reduces', label:'reduces', color:'#f87171' },
    { id:'increases', label:'increases', color:'#a78bfa' },
  ];

  let selectedSource = null;
  let selectedTarget = null;

  function getNodes() {
    return Game.state.buildings.map(b => ({
      id: 'b'+b.id,
      label: (Game.BUILDINGS[b.type]?.emoji||'🏗️') + ' ' + (Game.BUILDINGS[b.type]?.label||b.type),
      sys: Game.BUILDINGS[b.type]?.sys||'unknown',
      buildingId: b.id
    }));
  }

  function render(container) {
    container.innerHTML = '';
    const nodes = getNodes();
    nodes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'graph-node';
      el.dataset.nid = n.id;
      el.textContent = n.label;
      el.addEventListener('click', () => handleClick(n.id));
      container.appendChild(el);
    });

    // Edge display
    const edges = Game.state.graph.edges;
    if (edges.length > 0) {
      const list = document.createElement('div');
      list.style.cssText = 'width:100%;margin-top:8px;font-size:var(--fs-xs);color:var(--text2)';
      list.innerHTML = '<div style="margin-bottom:4px;font-weight:600">Edges ('+edges.length+'):</div>' +
        edges.map(e => {
          const f = nodes.find(n => n.id === e.from);
          const t = nodes.find(n => n.id === e.to);
          return `<div style="padding:2px 0">${f?.label||e.from} →${e.rel}→ ${t?.label||e.to}</div>`;
        }).join('');
      container.appendChild(list);
    }

    // Feedback loop detection
    const loops = Game.findFeedbackLoops();
    if (loops.length > 0 && !document.getElementById('loop-notice')) {
      const notice = document.createElement('div');
      notice.id = 'loop-notice';
      notice.style.cssText = 'width:100%;margin-top:8px;padding:6px;background:rgba(34,197,94,.1);border-radius:var(--r-sm);font-size:var(--fs-xs);color:var(--success)';
      notice.textContent = '🔄 ' + loops.length + ' feedback loop(s) found!';
      container.appendChild(notice);
    }
  }

  function handleClick(nid) {
    if (!selectedSource) {
      selectedSource = nid;
      document.querySelectorAll('.graph-node').forEach(el => {
        el.classList.toggle('source', el.dataset.nid === nid);
        el.classList.toggle('selected', el.dataset.nid === nid);
      });
      document.getElementById('graph-relation-bar').style.display = 'flex';
      Audio.click();
    } else if (!selectedTarget && nid !== selectedSource) {
      selectedTarget = nid;
      document.querySelectorAll('.graph-node').forEach(el => {
        el.classList.toggle('target', el.dataset.nid === nid);
      });
      Audio.click();
    } else {
      // Deselect
      selectedSource = null;
      selectedTarget = null;
      document.querySelectorAll('.graph-node').forEach(el => el.classList.remove('source','target','selected'));
      document.getElementById('graph-relation-bar').style.display = 'none';
      Audio.click();
    }
  }

  function addRelation(rel) {
    if (!selectedSource || !selectedTarget) return false;
    const ok = Game.addGraphEdge(selectedSource, selectedTarget, rel);
    if (ok) {
      selectedSource = null;
      selectedTarget = null;
      document.querySelectorAll('.graph-node').forEach(el => el.classList.remove('source','target','selected'));
      document.getElementById('graph-relation-bar').style.display = 'none';
      Audio.connect();
      // Re-render
      const editor = document.getElementById('graph-editor');
      if (editor) render(editor);
      // Enable analyze at 10+
      const analyze = document.getElementById('graph-analyze-btn');
      if (analyze) analyze.disabled = Game.state.graph.edges.length < 10;
      const status = document.getElementById('graph-status');
      if (status) status.textContent = Game.state.graph.edges.length + '/10 edges';
      return true;
    }
    return false;
  }

  return { render, RELS, addRelation, handleClick };
})();
