// WreckLib custom single-choice popup. Keeps the existing native <select> as the
// canonical value so persisted themes and campaign navigation continue to work.
// Rendered buttons use textContent (not innerHTML from campaign names).
const ACCENTS={gold:'#d6a85f',blue:'#4f9de8',scarlet:'#ef5b56',purple:'#a879e8'};
const keys=['ArrowDown','ArrowUp','Home','End'];
const activeControls=new Set();
let documentListenersInstalled=false;

function installGlobalHandlers(){
 if(documentListenersInstalled)return;
 documentListenersInstalled=true;
 document.addEventListener('pointerdown',event=>{
  for(const control of activeControls){
   if(!control.wrapper.contains(event.target))control.close(false);
  }
 });
 window.addEventListener('resize',()=>{
  for(const control of activeControls)control.position();
 });
 // Closing on scroll also prevents menus drifting away from their source on mobile.
 document.addEventListener('scroll',()=>{
  for(const control of activeControls)control.close(false);
 },true);
}

export function enhanceSelect(select,{type='plain'}={}){
 if(!(select instanceof HTMLSelectElement))throw new Error('Select element required');
 installGlobalHandlers();
 const label=select.getAttribute('aria-label')||
  document.querySelector('label[for="'+select.id+'"]')?.textContent?.trim()||'Выбрать';
 const wrapper=document.createElement('div');
 wrapper.className='wreck-select';
 wrapper.dataset.selectType=type;
 select.before(wrapper);
 wrapper.append(select);
 select.classList.add('wreck-select-native');
 select.setAttribute('aria-hidden','true');
 select.tabIndex=-1;
 const trigger=document.createElement('button');
 trigger.type='button';
 trigger.className='wreck-select-trigger';
 trigger.setAttribute('aria-label',label);
 trigger.setAttribute('aria-haspopup','listbox');
 trigger.setAttribute('aria-expanded','false');
 const selected=document.createElement('span');
 selected.className='wreck-select-current';
 const caret=document.createElement('span');
 caret.className='wreck-select-caret';
 caret.setAttribute('aria-hidden','true');
 caret.textContent='⌄';
 trigger.append(selected,caret);
 const menu=document.createElement('div');
 menu.className='wreck-select-menu';
 menu.id=select.id+'-listbox';
 menu.setAttribute('role','listbox');
 menu.setAttribute('aria-label',label);
 menu.hidden=true;
 trigger.setAttribute('aria-controls',menu.id);
 wrapper.append(trigger,menu);
 let items=[],cursor=-1;
 const control={
  wrapper,
  position(){
   if(menu.hidden)return;
   const box=trigger.getBoundingClientRect();
   const viewHeight=window.innerHeight;
   const roomBelow=viewHeight-box.bottom-12;
   const roomAbove=box.top-12;
   const available=Math.max(96,Math.min(320,Math.max(roomBelow,roomAbove)));
   const above=roomBelow<160&&roomAbove>roomBelow;
   menu.style.left=Math.max(8,Math.min(box.left,window.innerWidth-box.width-8))+'px';
   menu.style.width=Math.min(box.width,window.innerWidth-16)+'px';
   menu.style.maxHeight=available+'px';
   if(above){
    menu.style.top='auto';
    menu.style.bottom=(viewHeight-box.top+5)+'px';
   }else{
    menu.style.bottom='auto';
    menu.style.top=(box.bottom+5)+'px';
   }
  },
  close(restoreFocus=true){
   if(menu.hidden)return;
   menu.hidden=true;
   trigger.setAttribute('aria-expanded','false');
   activeControls.delete(control);
   if(restoreFocus)trigger.focus({preventScroll:true});
  },
  refresh(){
   control.close(false);
   menu.replaceChildren();
   items=[];
   for(const option of select.options){
    if(option.disabled||option.hidden)continue;
    const button=document.createElement('button');
    button.type='button';
    button.className='wreck-select-option';
    button.dataset.value=option.value;
    button.setAttribute('role','option');
    button.setAttribute('aria-selected',String(option.value===select.value));
    const mark=document.createElement('span');
    mark.className='wreck-select-mark';
    mark.setAttribute('aria-hidden','true');
    mark.textContent=option.value===select.value?'✓':'';
    const symbol=document.createElement('span');
    symbol.className='wreck-select-symbol';
    symbol.setAttribute('aria-hidden','true');
    if(type==='accent'){
     symbol.classList.add('wreck-select-swatch');
     symbol.style.backgroundColor=ACCENTS[option.value]||'#999';
    }else{
     symbol.textContent=type==='campaign'?'▦':'Aa';
    }
    const title=document.createElement('span');
    title.className='wreck-select-option-title';
    title.textContent=option.textContent;
    button.append(mark,symbol,title);
    button.addEventListener('click',()=>{
     if(select.value!==option.value){
      select.value=option.value;
      control.close(false);
      control.refresh();
      select.dispatchEvent(new Event('change',{bubbles:true}));
     }else control.close();
     trigger.focus({preventScroll:true});
    });
    menu.append(button);
    items.push(button);
   }
   control.sync();
  },
  sync(){
   const opt=select.selectedOptions[0];
   selected.textContent=opt?.textContent||'Выберите…';
   cursor=items.findIndex(item=>item.dataset.value===select.value);
   items.forEach((item,index)=>{
    const active=index===cursor;
    item.classList.toggle('is-selected',active);
    item.setAttribute('aria-selected',String(active));
    item.querySelector('.wreck-select-mark').textContent=active?'✓':'';
   });
  },
  open(){
   if(!menu.hidden)return;
   for(const other of [...activeControls])other.close(false);
   control.sync();
   menu.hidden=false;
   trigger.setAttribute('aria-expanded','true');
   activeControls.add(control);
   control.position();
  }
 };
 trigger.addEventListener('click',()=>menu.hidden?control.open():control.close());
 trigger.addEventListener('keydown',event=>{
  if(event.key==='Escape'){control.close();return}
  if(event.key==='Enter'||event.key===' '){
   event.preventDefault();
   menu.hidden?control.open():items[Math.max(0,cursor)]?.click();
   return;
  }
  if(keys.includes(event.key)){
   event.preventDefault();
   if(menu.hidden)control.open();
   if(!items.length)return;
   if(event.key==='Home')cursor=0;
   else if(event.key==='End')cursor=items.length-1;
   else cursor=(cursor+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;
   items[cursor].focus({preventScroll:true});
   items[cursor].scrollIntoView({block:'nearest'});
  }
 });
 menu.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();control.close();return}
  if(event.key==='Tab'){control.close(false);return}
  if(event.key==='Enter'||event.key===' '){event.preventDefault();document.activeElement?.click();return}
  if(keys.includes(event.key)){
   event.preventDefault();
   if(event.key==='Home')cursor=0;
   else if(event.key==='End')cursor=items.length-1;
   else cursor=(cursor+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;
   items[cursor]?.focus({preventScroll:true});
   items[cursor]?.scrollIntoView({block:'nearest'});
  }
 });
 select.addEventListener('change',()=>control.sync());
 control.refresh();
 return control;
}
