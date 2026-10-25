// Restricted Markdown for WreckLib. Never render author-provided raw HTML.
// All cross references resolve against entries already filtered by server RLS.
export function escapeHtml(value){
 return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
export function normal(value){return String(value??'').normalize('NFKC').toLocaleLowerCase('ru').trim()}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function resolveReference(value,visible=[]){
 const raw=String(value??'').trim(),pipe=raw.indexOf('|');
 const key=(pipe>=0?raw.slice(0,pipe):raw).trim();
 const label=(pipe>=0?raw.slice(pipe+1):'').trim();
 if(!key)return null;
 if(uuid.test(key)){
  const entry=visible.find(e=>e.id===key);
  return entry?{entry,label:label||entry.title}:null;
 }
 const candidates=visible.filter(e=>normal(e.title)===normal(key));
 return candidates.length===1?{entry:candidates[0],label:label||candidates[0].title}:null;
}
function formatPlain(source){
 return escapeHtml(source).replace(/\*\*([^\n*]+)\*\*/g,'<strong>$1</strong>')
  .replace(/~~([^\n~]+)~~/g,'<del>$1</del>')
  .replace(/(?<!\*)\*([^\n*]+)\*(?!\*)/g,'<em>$1</em>');
}
export function renderInline(source,visible=[]){
 const input=String(source??'');
 const matcher=/\x60([^\x60\n]+)\x60|\[\[([^\]\n]{1,180})\]\]|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi;
 let previous=0,output='';
 for(const match of input.matchAll(matcher)){
  output+=formatPlain(input.slice(previous,match.index));
  if(match[1]!==undefined){
   output+='<code>'+escapeHtml(match[1])+'</code>';
  }else if(match[2]!==undefined){
   const resolved=resolveReference(match[2],visible);
   output+=resolved
    ?'<a href="#entry/'+encodeURIComponent(resolved.entry.id)+'" class="wiki-link" data-wiki-target="'+escapeHtml(resolved.entry.id)+'">'+escapeHtml(resolved.label)+'</a>'
    :'<span class="wiki-unresolved">'+escapeHtml('[['+match[2]+']]')+'</span>';
  }else{
   try{
    const url=new URL(match[4]);
    if(!['https:','http:'].includes(url.protocol))throw new Error('Invalid protocol');
    output+='<a href="'+escapeHtml(url.href)+'" rel="noopener noreferrer" target="_blank">'+escapeHtml(match[3])+'</a>';
   }catch{output+=escapeHtml(match[0]);}
  }
  previous=match.index+match[0].length;
 }
 return output+formatPlain(input.slice(previous));
}
// GFM-style pipe tables. Raw HTML remains escaped via renderInline.
function parseTableCells(line){
 const trimmed=String(line).trim();
 if(!trimmed.includes('|'))return null;
 const withoutEdges=trimmed.replace(/^\|/,'').replace(/(?<!\\)\|$/,'');
 return withoutEdges.split(/(?<!\\)\|/).map(cell=>cell.replace(/\\\|/g,'|').trim());
}
function readTable(lines,index,visible){
 if(index+1>=lines.length)return null;
 const heading=parseTableCells(lines[index]),divider=parseTableCells(lines[index+1]);
 if(!heading||!divider||heading.length!==divider.length||heading.length<2)return null;
 if(!divider.every(s=>/^:?-{3,}:?$/.test(s)))return null;
 const aligns=divider.map(s=>s.startsWith(':')&&s.endsWith(':')?'center':s.endsWith(':')?'right':s.startsWith(':')?'left':'');
 const alignment=i=>aligns[i]?' style="text-align:'+aligns[i]+'"':'';
 const head='<thead><tr>'+heading.map((cell,i)=>'<th'+alignment(i)+'>'+renderInline(cell,visible)+'</th>').join('')+'</tr></thead>';
 let i=index+2;const rows=[];
 while(i<lines.length&&lines[i].trim()){
  const cells=parseTableCells(lines[i]);if(!cells)break;
  rows.push('<tr>'+heading.map((_,j)=>'<td'+alignment(j)+'>'+renderInline(cells[j]||'',visible)+'</td>').join('')+'</tr>');
  i++;
 }
 return {html:'<div class="md-table-scroll"><table>'+head+'<tbody>'+rows.join('')+'</tbody></table></div>',next:i};
}
// Nested lists accept up to eight indentation levels and mixed UL/OL nesting.
function listMarker(line){
 const m=/^([ ]{0,28})([-+*]|\d+[.)])\s+(.+)$/.exec(line);
 if(!m)return null;
 return {indent:m[1].length,ordered:/^\d/.test(m[2]),body:m[3]};
}
function readList(lines,index,visible,depth=0){
 const first=listMarker(lines[index]);
 if(!first||depth>7)return null;
 const base=first.indent,ordered=first.ordered;
 const items=[];let i=index;
 while(i<lines.length){
  const marker=listMarker(lines[i]);
  if(!marker||marker.indent!==base||marker.ordered!==ordered)break;
  i++;
  let item=renderInline(marker.body,visible);
  while(i<lines.length){
   if(!lines[i].trim())break;
   const next=listMarker(lines[i]);
   if(next&&next.indent>base&&depth<7){
    const child=readList(lines,i,visible,depth+1);
    if(child&&child.next>i){item+=child.html;i=child.next;continue}
   }
   if(next)break;
   const line=lines[i];
   const spaces=(/^( *)/.exec(line)||['',''])[1].length;
   if(spaces<=base)break;
   item+='<br>'+renderInline(line.trim(),visible);i++;
  }
  items.push('<li>'+item+'</li>');
 }
 if(!items.length)return null;
 const tag=ordered?'ol':'ul';
 return {html:'<'+tag+'>'+items.join('')+'</'+tag+'>',next:i};
}
export function renderMarkdown(source,visible=[]){
 const lines=String(source??'').replace(/\r\n?/g,'\n').split('\n');
 let i=0;const out=[];
 while(i<lines.length){
  const line=lines[i];
  if(!line.trim()){i++;continue}
  if(/^\s{0,3}\x60{3,}/.test(line)){
   const body=[];i++;
   while(i<lines.length&&!/^\s{0,3}\x60{3,}\s*$/.test(lines[i]))body.push(lines[i++]);
   if(i<lines.length)i++;
   out.push('<pre class="md-code"><code>'+escapeHtml(body.join('\n'))+'</code></pre>');continue;
  }
  const table=readTable(lines,i,visible);
  if(table){out.push(table.html);i=table.next;continue}
  const heading=/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if(heading){
   const n=heading[1].length;out.push('<h'+n+'>'+renderInline(heading[2],visible)+'</h'+n+'>');i++;continue;
  }
  if(/^\s{0,3}(?:---+|\*\*\*+)\s*$/.test(line)){out.push('<hr>');i++;continue}
  if(/^\s{0,3}>\s?/.test(line)){
   const quote=[];
   while(i<lines.length&&/^\s{0,3}>\s?/.test(lines[i]))quote.push(renderInline(lines[i++].replace(/^\s{0,3}>\s?/,''),visible));
   out.push('<blockquote>'+quote.join('<br>')+'</blockquote>');continue;
  }
  const list=readList(lines,i,visible);
  if(list){out.push(list.html);i=list.next;continue}
  const paragraph=[];
  while(i<lines.length&&lines[i].trim()){
   if(paragraph.length&&(/^\s{0,3}(?:#{1,6}\s+|>\s?|\x60{3,})/.test(lines[i])||listMarker(lines[i])||readTable(lines,i,visible)))break;
   paragraph.push(renderInline(lines[i++],visible));
  }
  out.push('<p>'+paragraph.join('<br>')+'</p>');
 }
 return out.join('\n');
}

export function findBacklinks(targetId,visible=[]){
 const found=[];
 for(const entry of visible){
  if(entry.id===targetId)continue;
  for(const match of String(entry.body??'').matchAll(/\[\[([^\]\n]{1,180})\]\]/g)){
   if(resolveReference(match[1],visible)?.entry.id===targetId){found.push(entry);break}
  }
 }
 return found;
}
export function searchEntries(visible=[],query='',limit=30){
 const q=normal(query).slice(0,120);
 if(!q)return [];
 const tokens=q.split(/\s+/).filter(Boolean);
 return visible.map(entry=>{
  const title=normal(entry.title),description=normal(entry.description),body=normal(entry.body);
  if(!tokens.every(t=>(title+' '+description+' '+body).includes(t)))return null;
  const score=tokens.reduce((n,t)=>n+(title.includes(t)?20:0)+(description.includes(t)?7:0)+(body.includes(t)?1:0),0);
  const raw=String(entry.description||entry.body||'').replace(/\[\[([^\]]+)\]\]/g,'$1')
   .replace(/[#*~\x60>]/g,' ').replace(/\s+/g,' ').trim();
  const where=normal(raw).indexOf(tokens[0]),start=where<0?0:Math.max(0,where-34);
  const excerpt=(start?'…':'')+raw.slice(start,start+128)+(raw.length>start+128?'…':'');
  return {entry,score,excerpt};
 }).filter(Boolean).sort((a,b)=>b.score-a.score||a.entry.title.localeCompare(b.entry.title,'ru')).slice(0,limit);
}
