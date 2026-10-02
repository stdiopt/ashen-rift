import portuguese from './pt-br.js?v=61';
let language='en';
try{language=localStorage.getItem('ashen-rift-language')||(/^pt\b/i.test(navigator.language)?'pt-BR':'en');}catch{language=/^pt\b/i.test(navigator.language)?'pt-BR':'en';}
if(language!=='pt-BR')language='en';
const originals=new WeakMap(),listeners=new Set(),cache=new Map();
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const keys=Object.keys(portuguese).sort((a,b)=>b.length-a.length);
const pattern=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+keys.map(escape).join('|')+')(?![\\p{L}\\p{N}_])','gu');
export function t(key,values={}){
  const source=String(key??'');let result=source;
  if(language==='pt-BR'){
    if(cache.has(source))result=cache.get(source);
    else{result=portuguese[source]??source.replace(pattern,match=>portuguese[match]);if(cache.size>=512)cache.clear();cache.set(source,result);}
  }
  return result.replace(/\{(\w+)\}/g,(match,name)=>values[name]??match);
}
function record(node,key,source){let entries=originals.get(node);if(!entries){entries={};originals.set(node,entries);}entries[key]=String(source??'');}
export function setText(node,source,values={}){record(node,'textContent',source);originals.get(node).textValues=values;node.textContent=t(source,values);}
export function setTitle(node,source){record(node,'title',source);node.title=t(source);}
export function localize(root){
  if(!root||root.closest?.('[data-i18n-skip]'))return;
  if(root.nodeType===3){const entries=originals.get(root);if(!entries)record(root,'nodeValue',root.nodeValue);root.nodeValue=t(originals.get(root).nodeValue);return;}
  if(root.nodeType!==1||['SCRIPT','STYLE'].includes(root.tagName))return;
  const entries=originals.get(root);
  if(entries?.textContent!==undefined){root.textContent=t(entries.textContent,entries.textValues);}
  for(const attribute of ['title','aria-label','placeholder','alt'])if(root.hasAttribute(attribute)){
    if(originals.get(root)?.[attribute]===undefined)record(root,attribute,root.getAttribute(attribute));
    root.setAttribute(attribute,t(originals.get(root)[attribute]));
  }
  if(entries?.title!==undefined)root.title=t(entries.title);
  if(entries?.textContent===undefined)for(const child of [...root.childNodes])localize(child);
}
export function setHTML(node,html){const entries=originals.get(node);if(entries){delete entries.textContent;delete entries.textValues;}node.innerHTML=html;localize(node);}
export function onLanguageChange(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export function setLanguage(next){
  language=next==='pt-BR'?'pt-BR':'en';cache.clear();try{localStorage.setItem('ashen-rift-language',language);}catch{}
  document.documentElement.lang=language;localize(document.body);
  const selector=document.getElementById('language-select');if(selector)selector.value=language;
  for(const listener of listeners)listener(language);
}
export function getLanguage(){return language;}
localize(document.body);document.documentElement.lang=language;
const selector=document.getElementById('language-select');if(selector){selector.value=language;selector.addEventListener('change',()=>setLanguage(selector.value));}
