/* Shared extras for pack pages: sticky buy bar, locked sample teaser, related packs, extra FAQ, SEO tags */
(function(){
  var CAT=[
    {id:'cinematic',href:'/cinematic-pack.html',name:'Cinematic AI Prompt Pack',price:399,count:120,tag:'CINEMATIC',desc:'Cinematic scenes, ads, reels and image-to-video workflows.'},
    {id:'wedding',name:'Wedding Video Prompt Pack',price:299,count:30,tag:'WEDDING',desc:'Pre-wedding, haldi, sangeet and emotional cinematic sequences.'},
    {id:'ads',name:'Product Ad Prompt Pack',price:499,count:50,tag:'COMMERCIAL',desc:'Luxury product reveals, clean studio shots and social ad sequences.'},
    {id:'fashion',name:'Fashion & Editorial Prompt Pack',price:349,count:30,tag:'EDITORIAL',desc:'Runway, luxury editorial, street style and beauty campaigns.'},
    {id:'travel',name:'Travel & Destination Prompt Pack',price:299,count:30,tag:'TRAVEL',desc:'Landscapes, city reveals, hotels and adventure sequences.'},
    {id:'automotive',name:'Automotive Cinematic Prompt Pack',price:449,count:30,tag:'AUTOMOTIVE',desc:'Hero car shots, tracking shots and showroom reveals.'},
    {id:'realestate',name:'Real Estate & Architecture Prompt Pack',price:349,count:30,tag:'PROPERTY',desc:'Interiors, exteriors, walkthroughs and lifestyle scenes.'},
    {id:'social',name:'Social Media Reels Prompt Pack',price:249,count:30,tag:'CREATOR',desc:'Hooks, vertical transitions and scroll-stopping short-form scenes.'},
    {id:'food',name:'Food & Beverage Commercial Prompt Pack',price:299,count:30,tag:'FOOD ADS',desc:'Macro food shots, beverage pours and menu visuals.'}
  ];
  function hrefOf(p){return p.href||'/pack.html?id='+p.id}
  var qid=new URLSearchParams(location.search).get('id');
  var id=/cinematic-pack/.test(location.pathname)?'cinematic':(qid||'cinematic');
  var me=CAT.filter(function(p){return p.id===id})[0];
  function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}

  function sticky(){
    var name=(me&&me.name)||(document.getElementById('title')||{}).textContent||'Prompt Pack';
    var price=me?me.price:parseInt(((document.getElementById('price')||{}).textContent||'').replace(/\D/g,''),10)||'';
    var bar=el('div','pe-bar');var d=el('div');d.appendChild(el('b','',name));d.appendChild(el('small','','One-time • Instant access'));
    var btn=el('button','', price?'Buy ₹'+price:'Buy Now');btn.type='button';
    btn.addEventListener('click',function(){var b=document.getElementById('heroBuy')||document.querySelector('.hero [data-buy]');if(b)b.click()});
    bar.appendChild(d);bar.appendChild(btn);document.body.appendChild(bar);
    var hero=document.querySelector('.hero .actions')||document.querySelector('.hero');
    function upd(){var r=hero?hero.getBoundingClientRect():{bottom:0};bar.classList.toggle('show',r.bottom<0)}
    addEventListener('scroll',upd,{passive:true});upd();
  }

  function lockedTeaser(){
    var grid=document.getElementById('sampleGrid')||document.querySelector('.sample-grid');if(!grid||!me)return;
    var shown=grid.children.length,more=me.count-shown;if(more<=0)return;
    var a=el('article','pe-locked');a.appendChild(el('div','tag','🔒 LOCKED'));
    a.appendChild(el('p','','+'+more+' more production-ready prompts unlock after purchase.'));
    var l=el('a','','Unlock full pack →');l.href='#buy';a.appendChild(l);grid.appendChild(a);
  }

  function related(){
    var sec=document.getElementById('faq');if(!sec)return;
    var list=CAT.filter(function(p){return p.id!==id}).slice(0,3);
    var w=el('section','pe-related');var t=el('div','section-title');t.appendChild(el('div','eyebrow','YOU MAY ALSO LIKE'));t.appendChild(el('h2','','More prompt packs'));w.appendChild(t);
    var g=el('div','pe-rel-grid');
    list.forEach(function(p){var a=el('a','pe-rel');a.href=hrefOf(p);a.appendChild(el('small','',p.tag));a.appendChild(el('h3','',p.name));a.appendChild(el('p','',p.desc));var b=el('b','','₹'+p.price+' →');a.appendChild(b);g.appendChild(a)});
    w.appendChild(g);sec.parentNode.insertBefore(w,sec);
  }

  function faq(){
    var sec=document.getElementById('faq');if(!sec||sec.querySelector('[data-extra]'))return;
    [['Which AI video tools can I use these prompts with?','The prompts are plain text, so you can use them in text-to-video and image-to-video tools such as Google Flow / Veo, Runway, Kling and Pika. Results depend on the tool and its settings.'],
     ['What format will I receive?','A PDF and a ZIP, available from My Library after payment is verified.'],
     ['Where can I read the refund policy?',null]].forEach(function(q){
      var d=document.createElement('details');d.setAttribute('data-extra','1');d.appendChild(el('summary','',q[0]));
      var p=el('p');if(q[1])p.textContent=q[1];else{var a=el('a','','Refund policy');a.href='/refund.html';a.style.textDecoration='underline';p.appendChild(document.createTextNode('Please read our '));p.appendChild(a);p.appendChild(document.createTextNode(' before purchasing.'))}
      d.appendChild(p);sec.appendChild(d)});
  }

  function seo(){
    var head=document.head,url=location.origin+(/cinematic-pack/.test(location.pathname)?'/cinematic-pack.html':'/pack.html?id='+encodeURIComponent(id));
    function meta(k,v,val){var m=head.querySelector('meta['+k+'="'+v+'"]');if(!m){m=document.createElement('meta');m.setAttribute(k,v);head.appendChild(m)}m.setAttribute('content',val)}
    var title=document.title,desc=((head.querySelector('meta[name=description]')||{}).content)||'';
    var img=location.origin+'/store-previews/'+id+'.jpg';
    var can=head.querySelector('link[rel=canonical]');if(!can){can=document.createElement('link');can.rel='canonical';head.appendChild(can)}can.href=url;
    meta('property','og:type','product');meta('property','og:title',title);meta('property','og:description',desc);meta('property','og:url',url);meta('property','og:image',img);meta('name','twitter:card','summary_large_image');
    var price=me?me.price:parseInt(((document.getElementById('price')||{}).textContent||'').replace(/\D/g,''),10);
    if(price){var s=document.createElement('script');s.type='application/ld+json';
      s.textContent=JSON.stringify({'@context':'https://schema.org','@type':'Product',name:title.replace(/ — EditPrompt\.in$/,''),description:desc,image:img,brand:{'@type':'Brand',name:'EditPrompt'},offers:{'@type':'Offer',priceCurrency:'INR',price:String(price),availability:'https://schema.org/InStock',url:url}});head.appendChild(s)}
  }

  function run(){sticky();lockedTeaser();related();faq();seo()}
  // pack.html renders content from pack-page.js synchronously before this script; admin-created packs arrive later
  if(document.getElementById('sampleGrid')&&!me){var t=setInterval(function(){if(document.getElementById('title').textContent&&document.getElementById('price').textContent!=='₹299'||document.getElementById('sampleGrid').children.length){clearInterval(t);run()}},400);setTimeout(function(){clearInterval(t)},6000)}
  else run();
})();
