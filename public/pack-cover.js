/* Renders the animated stacked "pack cover" into #packCover */
(function(){
  var ACCENT={cinematic:'#e52329',wedding:'#e0577a',ads:'#e3a23b',fashion:'#9b6bff',travel:'#22b8b0',automotive:'#ff5a2c',realestate:'#35b37e',social:'#ff4fa3',food:'#f08a24'};
  var TAGS={cinematic:'FILM • ADS • REELS • AI VIDEO',wedding:'HALDI • SANGEET • COUPLES • FAMILY',ads:'LUXURY • TECH • BEAUTY • SOCIAL',fashion:'RUNWAY • EDITORIAL • STREET • BEAUTY',travel:'CITIES • HOTELS • BEACHES • ADVENTURE',automotive:'REVEALS • TRACKING • SHOWROOM • ROAD',realestate:'INTERIORS • EXTERIORS • WALKTHROUGH',social:'HOOKS • TRANSITIONS • REELS • CREATOR',food:'MACRO • BEVERAGE • DESSERT • RESTAURANT'};
  function num(s){var m=String(s||'').match(/\d+/);return m?m[0]:''}
  function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}

  window.renderPackCover=function(host,o){
    if(!host)return;
    var n=num(o.count),c=num(o.cats),title=(o.name||'Prompt Pack').toUpperCase();
    var accent=o.accent||ACCENT[o.id]||'#e52329';
    var tags=o.tags||TAGS[o.id]||(o.categories||[]).slice(0,4).map(function(x){return String(x).split(/[ &]/)[0].toUpperCase()}).join(' • ')||'PREMIUM • DIGITAL DOWNLOAD';
    var sub=n?n+' Production-Ready Video Prompts':(o.desc||'Premium AI video prompts');
    host.innerHTML='';host.style.setProperty('--pc-accent',accent);
    host.appendChild(el('div','pc-glow'));
    var stage=el('div','pc-stage'),tilt=el('div','pc-tilt');
    stage.style.setProperty('--tfs',(title.length>30?7.6:title.length>22?10:12.4)+'cqw');
    tilt.appendChild(el('div','pc-card pc-back'));
    var f=el('div','pc-card pc-front');
    f.appendChild(el('div','pc-frame'));
    f.appendChild(el('div','pc-brand','EDITPROMPT.IN'));
    var mid=el('div','pc-mid');mid.appendChild(el('span','pc-series','PRO SERIES'));mid.appendChild(el('h2','pc-title',title));mid.appendChild(el('p','pc-sub',sub));
    f.appendChild(mid);f.appendChild(el('div','pc-foot',tags));f.appendChild(el('div','pc-sheen'));
    tilt.appendChild(f);
    if(n){var b=el('div','pc-badge pc-b1');b.appendChild(el('b','',n+'+'));b.appendChild(el('span','','Ready Prompts'));tilt.appendChild(b)}
    if(c){var b2=el('div','pc-badge pc-b2');b2.appendChild(el('b','',c));b2.appendChild(el('span','','Categories'));tilt.appendChild(b2)}
    stage.appendChild(tilt);host.appendChild(stage);

    // pointer tilt (mouse only, skipped for reduced motion)
    if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    host.addEventListener('pointermove',function(e){
      if(e.pointerType!=='mouse')return;
      var r=stage.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
      stage.classList.add('is-active');
      stage.style.setProperty('--ry',(x*14-8)+'deg');stage.style.setProperty('--rx',(-y*10+2)+'deg');
    });
    host.addEventListener('pointerleave',function(){stage.classList.remove('is-active');stage.style.setProperty('--ry','-8deg');stage.style.setProperty('--rx','2deg')});
    stage.style.setProperty('--ry','-8deg');stage.style.setProperty('--rx','2deg');
  };
})();
