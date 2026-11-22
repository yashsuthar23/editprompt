(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const say = (id, msg) => { const el = $(id); if (el) el.textContent = msg; };
  const downloadBlob = (blob, name) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); };
  const loadScript = (src) => new Promise((resolve, reject) => { const old = [...document.scripts].find(s => s.src === src); if (old) { if (old.dataset.loaded === '1') return resolve(); old.addEventListener('load', resolve, {once:true}); old.addEventListener('error', reject, {once:true}); return; } const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => { s.dataset.loaded = '1'; resolve(); }; s.onerror = reject; document.head.appendChild(s); });

  // Background removal: open-source client-side model; no server upload.
  let bgBlob = null;
  $('bgRemove').addEventListener('click', async () => {
    const file = $('bgFile').files[0]; if (!file) return say('bgStatus', 'Choose an image first.');
    const btn = $('bgRemove'); btn.disabled = true; say('bgStatus', 'Loading the browser model. First use may download model files...');
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm');
      const removeBackground = mod.removeBackground || mod.default;
      if (typeof removeBackground !== 'function') throw new Error('Background-removal module did not load correctly.');
      bgBlob = await removeBackground(file, { progress: (key, current, total) => { if (total) say('bgStatus', `Processing ${key}: ${Math.round(current / total * 100)}%`); } });
      $('bgPreview').src = URL.createObjectURL(bgBlob); $('bgDownload').disabled = false; say('bgStatus', 'Background removed. Download the transparent PNG.');
    } catch (e) { say('bgStatus', `Could not remove background: ${e.message || e}. Check your internet connection and try again.`); }
    finally { btn.disabled = false; }
  });
  $('bgDownload').addEventListener('click', () => { if (bgBlob) downloadBlob(bgBlob, 'editprompt-background-removed.png'); });

  // Object eraser: OpenCV runs in a Web Worker so loading/processing cannot freeze the page.
  const canvas = $('objCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let originalImage = null;
  let painting = false;
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  let objWorker = null;
  let objJob = 0;

  function ensureObjectWorker() {
    if (!objWorker) objWorker = new Worker('/object-remover.worker.js');
    return objWorker;
  }

  function paintMask(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sy;
    const size = Number($('objBrush').value) * sx;
    maskCtx.fillStyle = '#fff';
    maskCtx.beginPath();
    maskCtx.arc(x, y, size / 2, 0, Math.PI * 2);
    maskCtx.fill();
    ctx.save();
    ctx.globalAlpha = .5;
    ctx.fillStyle = '#ff3155';
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  $('objFile').addEventListener('change', () => {
    const file = $('objFile').files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return say('objStatus', 'Choose a PNG, JPG or WebP image.');
    const image = new Image();
    const imageUrl = URL.createObjectURL(file);
    image.onload = () => {
      // Keep browser memory and worker processing reasonable on large phone photos.
      const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      $('objDownload').disabled = false;
      say('objStatus', `Image ready (${canvas.width} × ${canvas.height}). Paint over a small object, then erase.`);
      URL.revokeObjectURL(imageUrl);
    };
    image.onerror = () => { URL.revokeObjectURL(imageUrl); say('objStatus', 'Could not open this image. Try a PNG, JPG or WebP file.'); };
    image.src = imageUrl;
  });

  canvas.addEventListener('pointerdown', event => {
    if (!originalImage) return;
    painting = true;
    canvas.setPointerCapture(event.pointerId);
    paintMask(event);
  });
  canvas.addEventListener('pointermove', event => { if (painting) paintMask(event); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => canvas.addEventListener(name, () => { painting = false; }));

  $('objUndo').addEventListener('click', () => {
    if (!originalImage) return;
    ctx.putImageData(originalImage, 0, 0);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    say('objStatus', 'Original image restored.');
  });

  $('objApply').addEventListener('click', () => {
    if (!originalImage) return say('objStatus', 'Choose an image first.');
    if (typeof Worker === 'undefined') return say('objStatus', 'This browser does not support background processing. Please use the latest Chrome or Edge.');
    const button = $('objApply');
    button.disabled = true;
    const jobId = ++objJob;
    const imageData = originalImage;
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const worker = ensureObjectWorker();
    const onMessage = event => {
      if (event.data.id !== jobId) return;
      if (event.data.type === 'status') say('objStatus', event.data.message);
      if (event.data.type === 'done') {
        const output = new ImageData(new Uint8ClampedArray(event.data.output), canvas.width, canvas.height);
        ctx.putImageData(output, 0, 0);
        originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        say('objStatus', 'Done. Review the result; small objects on simple backgrounds work best.');
        button.disabled = false;
        worker.removeEventListener('message', onMessage);
      }
      if (event.data.type === 'error') {
        say('objStatus', `Could not run inpainting: ${event.data.message}`);
        button.disabled = false;
        worker.removeEventListener('message', onMessage);
      }
    };
    worker.addEventListener('message', onMessage);
    worker.onerror = error => {
      say('objStatus', `Background processing failed: ${error.message || 'Worker error'}. Check your connection and retry.`);
      button.disabled = false;
    };
    say('objStatus', 'Starting background image processing...');
    worker.postMessage({
      id: jobId,
      width: canvas.width,
      height: canvas.height,
      imageBuffer: imageData.data.slice().buffer,
      maskBuffer: maskData.data.slice().buffer
    });
  });

  $('objDownload').addEventListener('click', () => canvas.toBlob(blob => blob && downloadBlob(blob, 'editprompt-object-erased.png'), 'image/png'));
  window.addEventListener('pagehide', () => {
    if (objWorker) objWorker.terminate();
  });

  // Browser speech recognition.
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; let recognition=null;
  if (SpeechRecognition) { recognition=new SpeechRecognition(); recognition.continuous=true; recognition.interimResults=true; recognition.onresult=e=>{let finalText='';let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const text=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=text+' ';else interim+=text;}const box=$('sttText');if(finalText)box.value=(box.value+' '+finalText).trim();say('sttStatus',interim?`Listening: ${interim}`:'Transcription received.');};recognition.onerror=e=>say('sttStatus',`Speech recognition error: ${e.error}.`);recognition.onend=()=>{$('sttStart').disabled=false;$('sttStop').disabled=true;if(!$('sttStatus').textContent.includes('error'))say('sttStatus','Listening stopped.');}; }
  $('sttStart').addEventListener('click',()=>{if(!recognition)return say('sttStatus','Speech recognition is not supported in this browser. Try Chrome or Edge.');recognition.lang=$('sttLang').value;recognition.start();$('sttStart').disabled=true;$('sttStop').disabled=false;say('sttStatus','Listening. Speak clearly into your microphone...');});
  $('sttStop').addEventListener('click',()=>recognition?.stop());
  $('sttCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('sttText').value);say('sttStatus','Transcript copied.');}catch{say('sttStatus','Select the transcript and copy it manually.');}});
  $('sttDownload').addEventListener('click',()=>downloadBlob(new Blob([$('sttText').value],{type:'text/plain;charset=utf-8'}),'editprompt-transcript.txt'));

  // Microphone recording -> MP3 encoding with lamejs (browser-side).
  let recorder=null, recordedBlob=null, stream=null;
  $('recStart').addEventListener('click',async()=>{try{stream=await navigator.mediaDevices.getUserMedia({audio:true});const chunks=[];recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{recordedBlob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});$('recPreview').src=URL.createObjectURL(recordedBlob);$('mp3Export').disabled=false;stream?.getTracks().forEach(t=>t.stop());say('recStatus','Recording ready. Preview it or export an MP3.');};recorder.start();$('recStart').disabled=true;$('recStop').disabled=false;say('recStatus','Recording...');}catch(e){say('recStatus',`Microphone unavailable: ${e.message||e}. Allow microphone access and use HTTPS.`);}});
  $('recStop').addEventListener('click',()=>{if(recorder?.state==='recording'){recorder.stop();$('recStart').disabled=false;$('recStop').disabled=true;}});
  $('mp3Export').addEventListener('click',async()=>{if(!recordedBlob)return;const b=$('mp3Export');b.disabled=true;say('recStatus','Preparing MP3 encoder...');try{await loadScript('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');if(!window.lamejs?.Mp3Encoder)throw new Error('MP3 encoder could not be loaded.');const array=await recordedBlob.arrayBuffer();const AudioCtx=window.AudioContext||window.webkitAudioContext;const ac=new AudioCtx();const decoded=await ac.decodeAudioData(array.slice(0));const mono=new Float32Array(decoded.length);for(let c=0;c<decoded.numberOfChannels;c++){const d=decoded.getChannelData(c);for(let i=0;i<d.length;i++)mono[i]+=d[i]/decoded.numberOfChannels;}const sampleRate=decoded.sampleRate;const pcm=new Int16Array(mono.length);for(let i=0;i<mono.length;i++){const s=Math.max(-1,Math.min(1,mono[i]));pcm[i]=s<0?s*32768:s*32767;}const encoder=new window.lamejs.Mp3Encoder(1,sampleRate,128);const chunks=[];for(let i=0;i<pcm.length;i+=1152){const part=encoder.encodeBuffer(pcm.subarray(i,i+1152));if(part.length)chunks.push(new Uint8Array(part));}const end=encoder.flush();if(end.length)chunks.push(new Uint8Array(end));downloadBlob(new Blob(chunks,{type:'audio/mpeg'}),'editprompt-voice.mp3');await ac.close();say('recStatus','MP3 export complete.');}catch(e){say('recStatus',`MP3 export failed: ${e.message||e}`);}finally{b.disabled=false;}});
  $('ttsPlay').addEventListener('click',()=>{if(!('speechSynthesis'in window))return say('ttsStatus','Text-to-speech is not supported in this browser.');const text=$('labTtsText').value.trim();if(!text)return say('ttsStatus','Enter text first.');speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(text));say('ttsStatus','Playing system voice preview.');});$('labTtsStop').addEventListener('click',()=>{speechSynthesis.cancel();say('ttsStatus','Voice preview stopped.');});

  // Public prompt marketplace API.
  async function loadMarket(){say('marketStatus','Loading marketplace...');try{const q=new URLSearchParams({q:$('marketSearch').value.trim(),category:$('marketCategory').value});const r=await fetch(`/api/marketplace/prompts?${q}`);const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not load marketplace.');const list=$('marketList');list.replaceChildren();if(!data.items?.length){list.textContent='No public prompts found yet.';}else data.items.forEach(item=>{const card=document.createElement('article');card.className='market-item';const h=document.createElement('b');h.textContent=item.title;const meta=document.createElement('div');meta.className='tag';meta.textContent=`${item.category} · by ${item.author} · ${item.created_at}`;const desc=document.createElement('p');desc.className='muted';desc.textContent=item.description||'';const pre=document.createElement('pre');pre.textContent=item.prompt;const actions=document.createElement('div');actions.className='actions';const copyBtn=document.createElement('button');copyBtn.className='btn ghost';copyBtn.textContent='Copy prompt';copyBtn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(item.prompt);say('marketStatus','Prompt copied.');}catch{say('marketStatus','Select the prompt text and copy it.');}});actions.append(copyBtn);card.append(h,meta,desc,pre,actions);list.append(card);});say('marketStatus',`${data.items?.length||0} prompt(s) found.`);}catch(e){say('marketStatus',e.message||'Marketplace is unavailable.');}}
  $('marketLoad').addEventListener('click',loadMarket);loadMarket();
  $('marketPublish').addEventListener('click',async()=>{const payload={title:$('marketTitle').value.trim(),category:$('marketPublishCategory').value,description:$('marketDescription').value.trim(),tags:$('marketTags').value.trim(),prompt:$('marketPrompt').value.trim()};if(!payload.title||!payload.prompt)return say('publishStatus','Title and prompt are required.');const b=$('marketPublish');b.disabled=true;say('publishStatus','Publishing...');try{const r=await fetch('/api/marketplace/prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not publish. Please log in.');say('publishStatus','Prompt published to the public marketplace.');$('marketTitle').value='';$('marketDescription').value='';$('marketTags').value='';$('marketPrompt').value='';loadMarket();}catch(e){say('publishStatus',`${e.message||e} If you are not logged in, sign in to EditPrompt first.`);}finally{b.disabled=false;}});

  // Timeline: local-only media, basic sequential preview, trim and position controls.
  let clips=[];let activeUrl=null;
  const fmt=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
  function renderTimeline(){const view=$('timelineView');view.replaceChildren();if(!clips.length){view.textContent='Add media to build your timeline.';$('timelineClips').replaceChildren();return;}const types=['video','audio','image'];types.forEach(type=>{const items=clips.filter(c=>c.type===type);if(!items.length)return;const row=document.createElement('div');row.className='track';const label=document.createElement('div');label.className='track-label';label.textContent=type.toUpperCase();row.append(label);items.forEach(c=>{const block=document.createElement('div');block.className='clip-block';block.style.minWidth=`${Math.max(90,Math.min(250,(c.end-c.start)*12))}px`;block.textContent=`${c.name} · ${fmt(c.start)}–${fmt(c.end)}`;row.append(block);});view.append(row);});const controls=$('timelineClips');controls.replaceChildren();clips.forEach((c,i)=>{const box=document.createElement('div');box.className='clip';const title=document.createElement('b');title.textContent=`${i+1}. ${c.name} (${c.type})`;box.append(title);const grid=document.createElement('div');grid.className='clip-controls';[['Start (s)','start'],['Trim in (s)','in'],['Trim out (s)','out'],['Duration (s)','duration']].forEach(([label,key])=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.min='0';input.step='.1';input.value=key==='start'?c.start:key==='in'?c.trimIn:key==='out'?c.trimOut:c.duration;input.addEventListener('change',()=>{const n=Math.max(0,Number(input.value)||0);if(key==='start')c.start=n;else if(key==='in')c.trimIn=Math.min(n,c.duration);else if(key==='out')c.trimOut=Math.min(n,c.duration);renderTimeline();});wrap.append(input);grid.append(wrap);});box.append(grid);const actions=document.createElement('div');actions.className='actions';const preview=document.createElement('button');preview.className='btn ghost';preview.textContent='Preview clip';preview.addEventListener('click',()=>previewClip(c));const remove=document.createElement('button');remove.className='btn ghost';remove.textContent='Remove';remove.addEventListener('click',()=>{URL.revokeObjectURL(c.url);clips=clips.filter(x=>x!==c);renderTimeline();});actions.append(preview,remove);box.append(actions);controls.append(box);});}
  function previewClip(c){const host=$('timelinePreview');host.replaceChildren();if(activeUrl)URL.revokeObjectURL(activeUrl);activeUrl=c.url;let el;if(c.type==='video'){el=document.createElement('video');el.controls=true;el.playsInline=true;}else if(c.type==='audio'){el=document.createElement('audio');el.controls=true;}else{el=document.createElement('img');el.className='preview';el.alt=c.name;}el.src=c.url;el.classList.add('preview');host.append(el);if(c.type!=='image'){el.addEventListener('loadedmetadata',()=>{el.currentTime=Math.min(c.duration,c.trimIn);});el.addEventListener('timeupdate',()=>{if(c.trimOut>c.trimIn&&el.currentTime>=c.trimOut){el.pause();el.currentTime=c.trimOut;}});}say('timelineStatus',`Previewing ${c.name}.`);}
  $('timelineAdd').addEventListener('click',()=>{const files=[...$('timelineFiles').files];if(!files.length)return say('timelineStatus','Choose one or more media files first.');files.forEach(file=>{const type=file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':file.type.startsWith('image/')?'image':null;if(!type)return;const url=URL.createObjectURL(file);const clip={name:file.name,type,url,file,start:clips.reduce((m,c)=>Math.max(m,c.start+c.duration),0),duration:type==='image'?5:0,trimIn:0,trimOut:0};clips.push(clip);if(type!=='image'){const probe=document.createElement(type);probe.preload='metadata';probe.src=url;probe.onloadedmetadata=()=>{clip.duration=Number.isFinite(probe.duration)?probe.duration:0;clip.trimOut=clip.duration;renderTimeline();};}else clip.trimOut=5;});renderTimeline();say('timelineStatus',`${files.length} media item(s) added locally.`);$('timelineFiles').value='';});
  $('timelinePlay').addEventListener('click',()=>{if(!clips.length)return say('timelineStatus','Add media first.');const first=clips.slice().sort((a,b)=>a.start-b.start)[0];previewClip(first);const el=$('timelinePreview').querySelector('video,audio');if(el)el.play().catch(()=>say('timelineStatus','Press play in the preview player to start playback.'));});$('timelineStop').addEventListener('click',()=>{$('timelinePreview').querySelectorAll('video,audio').forEach(x=>x.pause());say('timelineStatus','Preview stopped.');});
  $('timelineExport').addEventListener('click',()=>{const project={app:'EditPrompt',version:'9.1',createdAt:new Date().toISOString(),clips:clips.map(({name,type,start,duration,trimIn,trimOut})=>({name,type,start,duration,trimIn,trimOut}))};downloadBlob(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'editprompt-timeline-project.json');say('timelineStatus','Timeline project JSON exported. Media files are not embedded; keep the originals.');});$('timelineClear').addEventListener('click',()=>{clips.forEach(c=>URL.revokeObjectURL(c.url));clips=[];$('timelinePreview').replaceChildren();renderTimeline();say('timelineStatus','Timeline cleared.');});
  window.addEventListener('pagehide',()=>{recognition?.stop();speechSynthesis?.cancel?.();stream?.getTracks().forEach(t=>t.stop());clips.forEach(c=>URL.revokeObjectURL(c.url));if(activeUrl)URL.revokeObjectURL(activeUrl);});
})();
