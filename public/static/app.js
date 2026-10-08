'use strict';
const tabs=[...document.querySelectorAll('[data-tab]')];
// Dream-print typography: independently randomize every glyph in each
// occurrence of koldsleep / 콜드슬립. Do not modify the underlying form data.
const dreamPrintEnglishFonts = [
  'UnifrakturCook', 'Rubik Glitch', 'Monoton', 'Creepster',
  'Metal Mania', 'Press Start 2P', 'Major Mono Display',
  'Fascinate Inline', 'Bungee Shade', 'Codystar', 'Zen Tokyo Zoo',
  'Pirata One', 'New Rocker', 'Black Ops One', 'Oi', 'Nosifer',
  'Rakkas', 'Stardos Stencil', 'Rubik Moonrocks', 'Vast Shadow'
];
const dreamPrintKoreanFonts = [
  'Galmuri11', 'SongMyung', 'GowunBatang', 'NanumMyeongjo'
];
const rand = (min,max) => min + Math.random() * (max-min);

function uniqueFonts(pool, count, requiredFont) {
  // Draw without replacement: different glyphs in one word never reuse a font.
  const available = [...pool];
  const picked = [];
  for (let i = 0; i < count; i++) {
    if (!available.length) throw Error('Insufficient unique font families');
    const idx = Math.floor(Math.random() * available.length);
    picked.push(available.splice(idx, 1)[0]);
  }
  // Each word contains a pixel glyph, as in the earlier title/print identity.
  if (!picked.includes(requiredFont)) {
    picked[Math.floor(Math.random() * picked.length)] = requiredFont;
  }
  return picked;
}

function mixedCaseLetters(word) {
  const letters = [...word].map(ch => Math.random() < .5 ? ch.toUpperCase() : ch.toLowerCase());
  if (letters.every(ch => ch === ch.toUpperCase())) {
    const idx = Math.floor(Math.random() * letters.length);
    letters[idx] = letters[idx].toLowerCase();
  }
  if (letters.every(ch => ch === ch.toLowerCase())) {
    const idx = Math.floor(Math.random() * letters.length);
    letters[idx] = letters[idx].toUpperCase();
  }
  return letters;
}

function buildWord(word, inNav = false) {
  const english = /^koldsleep$/i.test(word);
  const letters = english ? mixedCaseLetters(word) : [...word];
  const pool = english ? dreamPrintEnglishFonts : dreamPrintKoreanFonts;
  const fonts = uniqueFonts(pool, letters.length, english ? 'Press Start 2P' : 'Galmuri11');
  const wrapper = document.createElement('span');
  wrapper.className = 'kw-word';
  wrapper.setAttribute('aria-label', word);
  // Accessibility: one semantic word, rather than nine separately announced letters.
  for (let i = 0; i < letters.length; i++) {
    const glyph = document.createElement('span');
    glyph.className = 'kw-letter';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = letters[i];
    glyph.style.fontFamily = `"${fonts[i]}", ${english ? 'serif' : 'sans-serif'}`;
    // Like dream-print: vary size, horizontal scale, tracking, baseline.
    // Restrict amplitudes inside the narrow navigation bar.
    glyph.style.setProperty('--kw-size', `${rand(inNav ? .92 : .78, inNav ? 1.06 : 1.28).toFixed(3)}em`);
    glyph.style.setProperty('--kw-stretch', rand(inNav ? .92 : .80, inNav ? 1.08 : 1.23).toFixed(3));
    glyph.style.setProperty('--kw-baseline', `${rand(inNav ? -.04 : -.14, inNav ? .04 : .13).toFixed(3)}em`);
    glyph.style.setProperty('--kw-tracking', `${rand(inNav ? -.09 : -.13, inNav ? 0 : .055).toFixed(3)}em`);
    wrapper.append(glyph);
  }
  return wrapper;
}

function decorate(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement.closest('script,style,textarea,input,.kw-word,.kw-letter')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    if (!/koldsleep|콜드슬립/i.test(text)) continue;
    const fragment = document.createDocumentFragment();
    let previous = 0;
    for (const match of text.matchAll(/koldsleep|콜드슬립/gi)) {
      fragment.append(text.slice(previous, match.index));
      fragment.append(buildWord(match[0], Boolean(node.parentElement.closest('nav'))));
      previous = match.index + match[0].length;
    }
    fragment.append(text.slice(previous));
    node.replaceWith(fragment);
  }
}
let loadSequence=0;
async function loadLie(){const seq=++loadSequence;const box=document.querySelector('#lie'),status=document.querySelector('#lie-status');box.textContent='';status.hidden=false;status.textContent='거짓말을 지어내고 있습니다.';try{const r=await fetch('/api/random',{cache:'no-store'});const d=await r.json();if(seq!==loadSequence)return;if(!r.ok||!d.ok)throw Error();if(d.lie_text){box.textContent=d.lie_text;decorate(box);status.hidden=true;}else status.textContent='아직 유포된 거짓말이 없습니다.';}catch{if(seq===loadSequence)status.textContent='아직 거짓말을 지어내지 못했습니다. 잠시 후 lies를 다시 눌러 주세요.';}}
function openTab(id){tabs.forEach(t=>{const selected=t.dataset.tab===id;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;document.getElementById(t.dataset.tab).hidden=!selected;});if(id==='lies')loadLie();window.scrollTo(0,0);}
tabs.forEach((t,i)=>{t.addEventListener('click',()=>openTab(t.dataset.tab));t.addEventListener('keydown',e=>{let n;if(e.key==='ArrowRight')n=(i+1)%3;if(e.key==='ArrowLeft')n=(i+2)%3;if(e.key==='Home')n=0;if(e.key==='End')n=2;if(n!==undefined){e.preventDefault();tabs[n].focus();openTab(tabs[n].dataset.tab);}});});
document.querySelectorAll('[data-open]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();openTab(a.dataset.open);document.querySelector('#lie-text').focus();}));
const form=document.querySelector('#lie-form'),error=document.querySelector('#form-error'),button=form.querySelector('[type=submit]');
let submissionId=null,submittedSnapshot=null;
form.addEventListener('input',()=>{submissionId=null;submittedSnapshot=null;});
form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const fd=new FormData(form);const data={lie_text:fd.get('lie_text').trim(),liar_name:fd.get('liar_name').trim(),contact:fd.get('contact').trim(),consent:fd.get('consent')==='on'};if(!data.lie_text||!data.liar_name){error.textContent='거짓말과 이름을 입력해 주세요.';return;}const snapshot=JSON.stringify(data);if(snapshot!==submittedSnapshot){submissionId=crypto.randomUUID();submittedSnapshot=snapshot;}data.id=submissionId;button.disabled=true;button.textContent='거짓말 유포 중……';error.textContent='';try{const r=await fetch('/api/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'거짓말의 제출을 확인하지 못했습니다. 같은 내용으로 다시 누르면 중복 저장 없이 확인합니다.');form.hidden=true;const completion=document.querySelector('#completion');completion.hidden=false;completion.focus();}catch(e){error.textContent=(e instanceof TypeError)?'거짓말의 제출을 확인하지 못했습니다. 입력은 유지됩니다. 잠시 후 다시 시도해 주세요.':(e.message||'제출을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');}finally{button.disabled=false;button.textContent='최종 제출 ↗';}});
document.querySelector('#again').addEventListener('click',()=>{form.reset();submissionId=null;submittedSnapshot=null;error.textContent='';form.hidden=false;document.querySelector('#completion').hidden=true;document.querySelector('#lie-text').focus();window.scrollTo(0,0);});
decorate(document.querySelector('nav'));decorate(document.querySelector('#info'));decorate(document.querySelector('.consent'));openTab('info');

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
