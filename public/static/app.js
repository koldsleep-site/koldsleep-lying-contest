'use strict';
const tabs=[...document.querySelectorAll('[data-tab]')];
const classes=['kw-galmuri','kw-song','kw-gowun','kw-nanum','kw-vt323','kw-oldstandard'];
function mixedCase(word){let chars=[...word].map(c=>Math.random()<.5?c.toUpperCase():c.toLowerCase());if(chars.every(c=>c===c.toUpperCase()))chars[chars.length-1]=chars.at(-1).toLowerCase();if(chars.every(c=>c===c.toLowerCase()))chars[0]=chars[0].toUpperCase();return chars.join('');}
function decorate(root){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('script,style,textarea,input,[class^="kw-"]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
 const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){const text=node.nodeValue;if(!/koldsleep|콜드슬립/i.test(text))continue;const frag=document.createDocumentFragment();let last=0;for(const m of text.matchAll(/koldsleep|콜드슬립/gi)){frag.append(text.slice(last,m.index));const span=document.createElement('span');const en=/koldsleep/i.test(m[0]);const pool=en?[classes[0],classes[4],classes[5]]:classes.slice(0,4);if(en){span.className=pool[Math.floor(Math.random()*pool.length)];span.textContent=mixedCase(m[0]);}else{span.className='keyword-ko';for(const ch of m[0]){const glyph=document.createElement('span');glyph.className=pool[Math.floor(Math.random()*pool.length)];glyph.textContent=ch;span.append(glyph);}}frag.append(span);last=m.index+m[0].length;}frag.append(text.slice(last));node.replaceWith(frag);}
}
let loadSequence=0;
async function loadLie(){const seq=++loadSequence;const box=document.querySelector('#lie'),status=document.querySelector('#lie-status');box.textContent='';status.hidden=false;status.textContent='거짓말을 불러오고 있습니다.';try{const r=await fetch('/api/random',{cache:'no-store'});const d=await r.json();if(seq!==loadSequence)return;if(!r.ok||!d.ok)throw Error();if(d.lie_text){box.textContent=d.lie_text;decorate(box);status.hidden=true;}else status.textContent='아직 공개된 거짓말이 없습니다.';}catch{if(seq===loadSequence)status.textContent='거짓말을 불러오지 못했습니다. 잠시 후 lies를 다시 눌러 주세요.';}}
function openTab(id){tabs.forEach(t=>{const selected=t.dataset.tab===id;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;document.getElementById(t.dataset.tab).hidden=!selected;});if(id==='lies')loadLie();window.scrollTo(0,0);}
tabs.forEach((t,i)=>{t.addEventListener('click',()=>openTab(t.dataset.tab));t.addEventListener('keydown',e=>{let n;if(e.key==='ArrowRight')n=(i+1)%3;if(e.key==='ArrowLeft')n=(i+2)%3;if(e.key==='Home')n=0;if(e.key==='End')n=2;if(n!==undefined){e.preventDefault();tabs[n].focus();openTab(tabs[n].dataset.tab);}});});
document.querySelectorAll('[data-open]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();openTab(a.dataset.open);document.querySelector('#lie-text').focus();}));
const form=document.querySelector('#lie-form'),error=document.querySelector('#form-error'),button=form.querySelector('[type=submit]');
let submissionId=null,submittedSnapshot=null;
form.addEventListener('input',()=>{submissionId=null;submittedSnapshot=null;});
form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const fd=new FormData(form);const data={lie_text:fd.get('lie_text').trim(),liar_name:fd.get('liar_name').trim(),contact:fd.get('contact').trim(),consent:fd.get('consent')==='on'};if(!data.lie_text||!data.liar_name){error.textContent='거짓말 내용과 거짓말한 자를 입력해 주세요.';return;}const snapshot=JSON.stringify(data);if(snapshot!==submittedSnapshot){submissionId=crypto.randomUUID();submittedSnapshot=snapshot;}data.id=submissionId;button.disabled=true;button.textContent='제출 중…';error.textContent='';try{const r=await fetch('/api/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'제출을 확인하지 못했습니다. 같은 내용으로 다시 누르면 중복 저장 없이 확인합니다.');form.hidden=true;const completion=document.querySelector('#completion');completion.hidden=false;completion.focus();}catch(e){error.textContent=(e instanceof TypeError)?'제출을 확인하지 못했습니다. 입력은 유지됩니다. 잠시 후 다시 시도해 주세요.':(e.message||'제출을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');}finally{button.disabled=false;button.textContent='최종 제출 ↗';}});
document.querySelector('#again').addEventListener('click',()=>{form.reset();submissionId=null;submittedSnapshot=null;error.textContent='';form.hidden=false;document.querySelector('#completion').hidden=true;document.querySelector('#lie-text').focus();window.scrollTo(0,0);});
decorate(document.querySelector('#info'));decorate(document.querySelector('.consent'));openTab('info');

// Optional recommendation link is supplied by the Worker, never by an inline secret.
async function loadRecommendationForm(){
  const holder=document.getElementById('recommendation-form');
  if(!holder)return;
  try{
    const response=await fetch('/api/config',{cache:'no-store'});
    if(!response.ok)return;
    const data=await response.json();
    if(!data.recommendation_url)return;
    const url=new URL(data.recommendation_url);
    if(url.protocol!=='https:')return;
    const a=document.createElement('a');
    a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';
    a.textContent=holder.textContent;
    holder.replaceWith(a);
  }catch(_){/* Keep the original placeholder until a link is configured. */}
}
loadRecommendationForm();
