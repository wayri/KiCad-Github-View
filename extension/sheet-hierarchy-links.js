/* Saved sheet-instance ancestry for the all-sheets overview. No net inference. */
((root) => {
  'use strict';

  const MAX_PLACEMENTS = 4096;
  const MAX_LINKS = 512;

  function build(pages) {
    const result = {links: [], omitted: 0, unresolved: 0};
    if (!Array.isArray(pages)) return result;
    const instances = new Map(), duplicates = new Set();
    for (const page of pages) for (const placement of page?.placements || []) {
      if (typeof placement?.id !== 'string' || typeof placement.path !== 'string' || placement.path !== page.path) {
        result.unresolved++; continue;
      }
      if (instances.has(placement.id)) duplicates.add(placement.id);
      else instances.set(placement.id, {placement, page});
    }
    if (instances.size > MAX_PLACEMENTS) {result.omitted = instances.size; return result;}
    const validity = new Map();
    function valid(id, visiting = new Set()) {
      if (validity.has(id)) return validity.get(id);
      if (duplicates.has(id) || visiting.has(id) || !instances.has(id)) return false;
      const placement = instances.get(id).placement;
      if (placement.unresolved) {validity.set(id, false); return false;}
      visiting.add(id);
      const ok = placement.parentId == null || valid(placement.parentId, visiting);
      visiting.delete(id);
      validity.set(id, ok);
      return ok;
    }
    const grouped = new Map();
    for (const [id, child] of instances) {
      const p = child.placement;
      if (!valid(id)) {result.unresolved++; continue;}
      if (p.parentId == null) continue;
      const parent = instances.get(p.parentId);
      if (!parent || parent.page === child.page || !valid(p.parentId)) {result.unresolved++; continue;}
      const key = JSON.stringify([parent.page.path, child.page.path]);
      if (!grouped.has(key)) grouped.set(key, {parent: parent.page, child: child.page, placements: [], parentPath: parent.page.path, childPath: child.page.path});
      grouped.get(key).placements.push(p);
    }
    const groups = [...grouped.values()];
    result.omitted = Math.max(0, groups.length - MAX_LINKS);
    const pairCount = new Map();
    for (const group of groups.slice(0, MAX_LINKS)) {
      const parent = group.parent, child = group.child;
      if (![parent.x, parent.y, parent.w, parent.h, child.x, child.y, child.w, child.h].every(Number.isFinite)) {result.unresolved++; continue;}
      const dx = child.x + child.w / 2 - parent.x - parent.w / 2;
      const dy = child.y + child.h / 2 - parent.y - parent.h / 2;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const pair = JSON.stringify([parent.path, child.path]);
      const ordinal = pairCount.get(pair) || 0;
      pairCount.set(pair, ordinal + 1);
      const shift = Math.min(ordinal, 5) * 3;
      const from = horizontal
        ? {x: parent.x + (dx >= 0 ? parent.w : 0), y: parent.y + parent.h / 2 + shift}
        : {x: parent.x + parent.w / 2 + shift, y: parent.y + (dy >= 0 ? parent.h : 0)};
      const to = horizontal
        ? {x: child.x + (dx >= 0 ? 0 : child.w), y: child.y + child.h / 2 + shift}
        : {x: child.x + child.w / 2 + shift, y: child.y + (dy >= 0 ? 0 : child.h)};
      const names = [...new Set(group.placements.map(p => String(p.label || p.sheetId || p.path).split(' / ').at(-1)))];
      const label = names.length <= 2 ? names.join(', ') : `${group.placements.length} placements`;
      result.links.push({from, to, label, count: group.placements.length, parentPath: group.parentPath, childPath: group.childPath,
        parentIds: [...new Set(group.placements.map(p => p.parentId))], childIds: group.placements.map(p => p.id)});
    }
    if(root.KiCadOverviewRouting){const routed=root.KiCadOverviewRouting.route(pages,result.links);result.links=routed.links;result.omitted+=routed.omitted;result.routing=routed;}return result;
  }

  function draw(view, graph, dark = false, style = {}) {
    const ctx = view?.ctx, camera = view?.viewport?.camera;
    if (!ctx || !camera || !graph?.links?.length) return;
    ctx.save();
    for (const link of graph.links) {
      const path=(link.points||[link.from,link.to]).map(p=>camera.world_to_screen(p)),a=path[0],b=path.at(-1),tail=path.at(-2)||a;
      const length = Math.hypot(b.x - tail.x, b.y - tail.y);
      if (length < 12) continue;
      const ux = (b.x - tail.x) / length, uy = (b.y - tail.y) / length;
      const tip = {x: b.x - ux * 4, y: b.y - uy * 4};
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      for(let i=1;i<path.length-1;i++){const prev=path[i-1],p=path[i],next=path[i+1],before=Math.hypot(p.x-prev.x,p.y-prev.y),after=Math.hypot(next.x-p.x,next.y-p.y),radius=Math.min(12,before/3,after/3);if(!before||!after)continue;ctx.lineTo(p.x-(p.x-prev.x)/before*radius,p.y-(p.y-prev.y)/before*radius);if(ctx.quadraticCurveTo)ctx.quadraticCurveTo(p.x,p.y,p.x+(next.x-p.x)/after*radius,p.y+(next.y-p.y)/after*radius);else ctx.lineTo(p.x,p.y);}
      ctx.lineTo(tip.x, tip.y);
      ctx.setLineDash(style.dashed?[4,4]:[]); ctx.strokeStyle = style.color||(dark ? '#69c4ba99' : '#398d8499'); ctx.lineWidth = 1.25; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - ux * 7 - uy * 3, tip.y - uy * 7 + ux * 3);
      ctx.lineTo(tip.x - ux * 7 + uy * 3, tip.y - uy * 7 - ux * 3);
      ctx.closePath(); ctx.fillStyle = style.color||(dark ? '#69c4ba99' : '#398d8499'); ctx.fill();
      const segment=path.slice(1).map((p,i)=>({a:path[i],b:p,length:Math.hypot(p.x-path[i].x,p.y-path[i].y)})).sort((a,b)=>b.length-a.length)[0];const text=String(link.label||'').slice(0,96),x=(segment.a.x+segment.b.x)/2,y=(segment.a.y+segment.b.y)/2-12;
      ctx.font = '500 10px sans-serif';
      const width = Math.min(250, ctx.measureText(text).width + 12);
      ctx.fillStyle = dark ? '#10212b' : '#ffffff'; ctx.fillRect(x - width / 2, y - 10, width, 20);
      ctx.fillStyle = dark ? '#d9fff7' : '#07584f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y, width - 8);
    }
    ctx.restore();
  }

  root.KiCadSheetHierarchyLinks = {build, draw};
  if (typeof module === 'object' && module.exports) module.exports = root.KiCadSheetHierarchyLinks;
})(typeof globalThis !== 'undefined' ? globalThis : this);
