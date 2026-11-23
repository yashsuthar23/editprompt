(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const say = (id, msg) => { const el = $(id); if (el) el.textContent = msg; };
  const downloadBlob = (blob, name) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); };
  const loadScript = (src) => new Promise((resolve, reject) => { const old = [...document.scripts].find(s => s.src === src); if (old) { if (old.dataset.loaded === '1') return resolve(); old.addEventListener('load', resolve, {once:true}); old.addEventListener('error', reject, {once:true}); return; } const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => { s.dataset.loaded = '1'; resolve(); }; s.onerror = reject; document.head.appendChild(s); });

  // ---- Robustness helpers: several CDN sources, safe JSON, WAV fallback ----
  const loadAny = async (urls) => { let last; for (const u of urls) { try { await loadScript(u); return u; } catch (e) { last = e; document.querySelectorAll('script[src="' + u + '"]').forEach(n => n.remove()); } } throw last || new Error('Could not load script.'); };
  const safeJson = async (r) => { try { return await r.json(); } catch { return { error: r.ok ? 'Unexpected server response.' : `Server returned ${r.status}. Please try again.` }; } };
  const pcmToWav = (pcm, sampleRate) => { const buf = new ArrayBuffer(44 + pcm.length * 2); const v = new DataView(buf); const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }; w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true); new Int16Array(buf, 44).set(pcm); return new Blob([buf], { type: 'audio/wav' }); };
  const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

  // ---- Progress bar helpers (0 -> 100%) ----
  const prog = (id, pct, label) => { const el = $(id); if (!el) return; if (pct == null) { el.hidden = true; return; } el.hidden = false; const v = Math.max(0, Math.min(100, Math.round(pct))); el.setAttribute('aria-valuenow', v); const b = el.querySelector('.sp-progress-bar'); if (b) b.style.width = v + '%'; const l = el.querySelector('.sp-progress-label'); if (l) l.textContent = v + '%'; };
  const creep = (id, from, to) => { let v = from; prog(id, v); const t = setInterval(() => { v += (to - v) * 0.06; prog(id, v); }, 250); return () => clearInterval(t); };

  // Background removal: IMG.LY AI model (browser-side) with automatic fallback to a built-in colour-based remover.
  let bgBlob = null; let bgStop = () => {};
  const BG_SOURCES = ['https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm', 'https://esm.sh/@imgly/background-removal@1.5.5'];
  async function loadBgModel() {
    let last;
    for (const url of BG_SOURCES) {
      try { const mod = await withTimeout(import(url), 25000, 'Model download timed out.'); const fn = mod.removeBackground || mod.default; if (typeof fn === 'function') return fn; } catch (e) { last = e; }
    }
    throw last || new Error('Background-removal module did not load correctly.');
  }
  function colorKeyRemove(file, tol) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open this image.')); };
      img.onload = () => {
        URL.revokeObjectURL(url);
        const sc = Math.min(1, 2000 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
        const id = x.getImageData(0, 0, w, h), d = id.data;
        const edge = []; const take = (px, py) => { const i = (py * w + px) * 4; edge.push([d[i], d[i + 1], d[i + 2]]); };
        for (let i = 0; i < w; i++) { take(i, 0); take(i, h - 1); } for (let j = 0; j < h; j++) { take(0, j); take(w - 1, j); }
        const med = (k) => { const a = edge.map(p => p[k]).sort((p, q) => p - q); return a[a.length >> 1]; };
        const bg = [med(0), med(1), med(2)];
        const dist = (i) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
        const seen = new Uint8Array(w * h); const stack = [];
        const push = (px, py) => { const p = py * w + px; if (!seen[p] && dist(p * 4) < tol) { seen[p] = 1; stack.push(p); } };
        for (let i = 0; i < w; i++) { push(i, 0); push(i, h - 1); } for (let j = 0; j < h; j++) { push(0, j); push(w - 1, j); }
        while (stack.length) { const p = stack.pop(); const px = p % w, py = (p / w) | 0; if (px > 0) push(px - 1, py); if (px < w - 1) push(px + 1, py); if (py > 0) push(px, py - 1); if (py < h - 1) push(px, py + 1); }
        const soft = tol * 1.7;
        for (let p = 0; p < w * h; p++) {
          const i = p * 4;
          if (seen[p]) { d[i + 3] = 0; continue; }
          const px = p % w, py = (p / w) | 0;
          const near = (px > 0 && seen[p - 1]) || (px < w - 1 && seen[p + 1]) || (py > 0 && seen[p - w]) || (py < h - 1 && seen[p + w]);
          if (near) { const dd = dist(i); if (dd < soft) d[i + 3] = Math.round(255 * Math.max(0, (dd - tol) / (soft - tol))); }
        }
        x.putImageData(id, 0, 0);
        c.toBlob(b => b ? resolve(b) : reject(new Error('Could not create PNG.')), 'image/png');
      };
      img.src = url;
    });
  }
  $('bgRemove').addEventListener('click', async () => {
    const file = $('bgFile').files[0]; if (!file) return say('bgStatus', 'Choose an image first.');
    const btn = $('bgRemove'); btn.disabled = true; prog('bgProgress', 0); say('bgStatus', 'Starting... loading the AI model (first use downloads model files).');
    try {
      let usedFallback = false;
      try {
        let last = 0; const fetchP = {}, compP = {};
        const ratio = o => { let c = 0, t = 0; for (const k in o) { c += o[k][0]; t += o[k][1]; } return t ? c / t : 0; };
        bgStop = creep('bgProgress', 0, 8);
        const removeBackground = await loadBgModel(); bgStop(); last = 8; prog('bgProgress', last);
        bgBlob = await removeBackground(file, { model: 'isnet_quint8', progress: (key, current, total) => {
          if (!total) return;
          const isFetch = String(key).startsWith('fetch'); (isFetch ? fetchP : compP)[key] = [current, total];
          const fr = Object.keys(fetchP).length ? ratio(fetchP) : (Object.keys(compP).length ? 1 : 0);
          const pct = Math.min(99, Math.max(last, Math.round(8 + 57 * fr + 35 * ratio(compP)))); last = pct;
          prog('bgProgress', pct);
          say('bgStatus', fr < 1 ? `Downloading AI model... ${pct}%` : `Removing background... ${pct}%`);
        } });
        prog('bgProgress', 100);
      } catch (aiError) {
        bgStop(); usedFallback = true;
        say('bgStatus', 'AI model unavailable here, using built-in colour-based remover...');
        const stop2 = creep('bgProgress', 10, 90);
        const tol = Number($('bgTolerance')?.value) || 42;
        try { bgBlob = await colorKeyRemove(file, tol); } finally { stop2(); }
        prog('bgProgress', 100);
      }
      $('bgPreview').src = URL.createObjectURL(bgBlob); $('bgDownload').disabled = false;
      say('bgStatus', usedFallback ? 'Done with the built-in remover (best on plain, even backgrounds). Adjust the tolerance and retry if needed, or check your internet connection to use the AI model.' : 'Background removed with the AI model. Download the transparent PNG.');
    } catch (e) { prog('bgProgress', null); say('bgStatus', `Could not remove background: ${e.message || e}`); }
    finally { btn.disabled = false; }
  });
  $('bgDownload').addEventListener('click', () => { if (bgBlob) downloadBlob(bgBlob, 'editprompt-background-removed.png'); });

  // Object eraser: select with a brush or rectangle, then erase with the built-in patch-based engine (Web Worker, real progress).
  const canvas = $('objCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  const tintCanvas = document.createElement('canvas');
  let originalImage = null, pristine = null, drawing = false, lastPt = null, rectStart = null, rectNow = null;
  let objHistory = [], objWorker = null, objJob = 0, objWatch = null;
  const objMode = () => ($('objMode') && $('objMode').value) || 'brush';

  function renderObj() {
    if (!originalImage) return;
    ctx.putImageData(originalImage, 0, 0);
    tintCanvas.width = maskCanvas.width; tintCanvas.height = maskCanvas.height;
    const t = tintCanvas.getContext('2d');
    t.drawImage(maskCanvas, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = '#ff3155'; t.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
    ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(tintCanvas, 0, 0);
    if (rectStart && rectNow) {
      const x = Math.min(rectStart.x, rectNow.x), y = Math.min(rectStart.y, rectNow.y), w = Math.abs(rectNow.x - rectStart.x), h = Math.abs(rectNow.y - rectStart.y);
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#ff3155'; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, canvas.width / 450); ctx.setLineDash([8, 5]); ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
  }
  const ptOf = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; };
  const brushPx = () => Math.max(2, Number($('objBrush').value) * canvas.width / Math.max(1, canvas.getBoundingClientRect().width));
  const pushHistory = () => { objHistory.push({ img: originalImage, mask: maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height) }); if (objHistory.length > 12) objHistory.shift(); };
  const maskHasPixels = () => { const d = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) return true; return false; };

  $('objFile').addEventListener('change', () => {
    const file = $('objFile').files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return say('objStatus', 'Choose a PNG, JPG or WebP image.');
    const image = new Image(); const imageUrl = URL.createObjectURL(file);
    image.onload = () => {
      // Keep browser memory and processing time reasonable on large phone photos.
      const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      maskCanvas.width = canvas.width; maskCanvas.height = canvas.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      originalImage = ctx.getImageData(0, 0, canvas.width, canvas.height); pristine = originalImage; objHistory = [];
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height); prog('objProgress', null);
      $('objDownload').disabled = false;
      say('objStatus', `Image ready (${canvas.width} × ${canvas.height}). Select the object with the brush or a rectangle, then click Erase.`);
      URL.revokeObjectURL(imageUrl);
    };
    image.onerror = () => { URL.revokeObjectURL(imageUrl); say('objStatus', 'Could not open this image. Try a PNG, JPG or WebP file.'); };
    image.src = imageUrl;
  });

  canvas.addEventListener('pointerdown', event => {
    if (!originalImage) return;
    event.preventDefault(); canvas.setPointerCapture(event.pointerId); pushHistory();
    const p = ptOf(event);
    if (objMode() === 'rect') { rectStart = p; rectNow = p; }
    else { drawing = true; lastPt = p; maskCtx.fillStyle = '#fff'; maskCtx.beginPath(); maskCtx.arc(p.x, p.y, brushPx() / 2, 0, Math.PI * 2); maskCtx.fill(); }
    renderObj();
  });
  canvas.addEventListener('pointermove', event => {
    if (!originalImage) return;
    const p = ptOf(event);
    if (rectStart) { rectNow = p; renderObj(); }
    else if (drawing) { maskCtx.strokeStyle = '#fff'; maskCtx.lineCap = 'round'; maskCtx.lineJoin = 'round'; maskCtx.lineWidth = brushPx(); maskCtx.beginPath(); maskCtx.moveTo(lastPt.x, lastPt.y); maskCtx.lineTo(p.x, p.y); maskCtx.stroke(); lastPt = p; renderObj(); }
  });
  const endSelect = () => {
    if (rectStart && rectNow) { maskCtx.fillStyle = '#fff'; maskCtx.fillRect(Math.min(rectStart.x, rectNow.x), Math.min(rectStart.y, rectNow.y), Math.abs(rectNow.x - rectStart.x), Math.abs(rectNow.y - rectStart.y)); }
    rectStart = rectNow = null; drawing = false; lastPt = null; renderObj();
  };
  ['pointerup', 'pointercancel'].forEach(n => canvas.addEventListener(n, endSelect));

  $('objUndoStep').addEventListener('click', () => {
    const h = objHistory.pop(); if (!h) return say('objStatus', 'Nothing to undo.');
    originalImage = h.img; maskCtx.putImageData(h.mask, 0, 0); renderObj(); say('objStatus', 'Undone.');
  });
  $('objClear').addEventListener('click', () => {
    if (!originalImage) return; pushHistory(); maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height); renderObj(); say('objStatus', 'Selection cleared.');
  });
  $('objUndo').addEventListener('click', () => {
    if (!pristine) return; originalImage = pristine; objHistory = []; maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height); renderObj(); prog('objProgress', null); say('objStatus', 'Original image restored.');
  });
  $('objDownload').addEventListener('click', () => {
    if (!originalImage) return;
    const c = document.createElement('canvas'); c.width = originalImage.width; c.height = originalImage.height; c.getContext('2d').putImageData(originalImage, 0, 0);
    c.toBlob(b => { if (b) downloadBlob(b, 'editprompt-object-removed.png'); }, 'image/png');
  });

  $('objApply').addEventListener('click', () => {
    if (!originalImage) return say('objStatus', 'Choose an image first.');
    if (typeof Worker === 'undefined') return say('objStatus', 'This browser does not support background processing. Please use the latest Chrome or Edge.');
    if (!maskHasPixels()) return say('objStatus', 'Select the object first: paint over it with the brush or draw a rectangle around it.');
    const button = $('objApply'); button.disabled = true;
    pushHistory();
    const jobId = ++objJob;
    prog('objProgress', 0); say('objStatus', 'Starting...');
    if (!objWorker) objWorker = new Worker('/object-remover.worker.js');
    const worker = objWorker;
    const imageData = originalImage;
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const finish = () => { clearTimeout(objWatch); button.disabled = false; worker.removeEventListener('message', onMessage); };
    const fail = msg => { prog('objProgress', null); say('objStatus', msg); objHistory.pop(); finish(); };
    // Watchdog: if the worker goes silent for 60s, stop it instead of hanging forever.
    const arm = () => { clearTimeout(objWatch); objWatch = setTimeout(() => { try { worker.terminate(); } catch (e) {} objWorker = null; fail('Erasing took too long and was stopped. Try selecting a smaller area.'); }, 60000); };
    const onMessage = event => {
      if (event.data.id !== jobId) return;
      if (event.data.type === 'progress') { arm(); prog('objProgress', event.data.pct); say('objStatus', `Erasing... ${Math.round(event.data.pct)}%`); }
      else if (event.data.type === 'done') {
        originalImage = new ImageData(new Uint8ClampedArray(event.data.output), canvas.width, canvas.height);
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height); renderObj(); prog('objProgress', 100);
        say('objStatus', 'Done. Not happy? Click Undo, select a slightly larger area (include shadows) and try again.');
        finish();
      } else if (event.data.type === 'error') fail(`Could not erase: ${event.data.message}`);
    };
    worker.addEventListener('message', onMessage);
    worker.onerror = error => { try { worker.terminate(); } catch (e) {} objWorker = null; fail(`Background processing failed: ${error.message || 'Worker error'}.`); };
    arm();
    worker.postMessage({ id: jobId, width: canvas.width, height: canvas.height, imageBuffer: imageData.data.buffer.slice(0), maskBuffer: maskData.data.buffer });
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
  $('mp3Export').addEventListener('click',async()=>{if(!recordedBlob)return;const b=$('mp3Export');b.disabled=true;say('recStatus','Preparing MP3 encoder...');try{let lameOk=true;try{await loadAny(['https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js','https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js']);if(!window.lamejs?.Mp3Encoder)throw new Error('x');}catch{lameOk=false;}const array=await recordedBlob.arrayBuffer();const AudioCtx=window.AudioContext||window.webkitAudioContext;const ac=new AudioCtx();const decoded=await ac.decodeAudioData(array.slice(0));const mono=new Float32Array(decoded.length);for(let c=0;c<decoded.numberOfChannels;c++){const d=decoded.getChannelData(c);for(let i=0;i<d.length;i++)mono[i]+=d[i]/decoded.numberOfChannels;}const sampleRate=decoded.sampleRate;const pcm=new Int16Array(mono.length);for(let i=0;i<mono.length;i++){const s=Math.max(-1,Math.min(1,mono[i]));pcm[i]=s<0?s*32768:s*32767;}if(!lameOk){downloadBlob(pcmToWav(pcm,sampleRate),'editprompt-voice.wav');await ac.close();say('recStatus','MP3 encoder could not load (offline or blocked), so your recording was saved as a WAV file instead.');return;}const encoder=new window.lamejs.Mp3Encoder(1,sampleRate,128);const chunks=[];for(let i=0;i<pcm.length;i+=1152){const part=encoder.encodeBuffer(pcm.subarray(i,i+1152));if(part.length)chunks.push(new Uint8Array(part));}const end=encoder.flush();if(end.length)chunks.push(new Uint8Array(end));downloadBlob(new Blob(chunks,{type:'audio/mpeg'}),'editprompt-voice.mp3');await ac.close();say('recStatus','MP3 export complete.');}catch(e){say('recStatus',`MP3 export failed: ${e.message||e}`);}finally{b.disabled=false;}});
  $('ttsPlay').addEventListener('click',()=>{if(!('speechSynthesis'in window))return say('ttsStatus','Text-to-speech is not supported in this browser.');const text=$('labTtsText').value.trim();if(!text)return say('ttsStatus','Enter text first.');speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(text));say('ttsStatus','Playing system voice preview.');});$('labTtsStop').addEventListener('click',()=>{speechSynthesis.cancel();say('ttsStatus','Voice preview stopped.');});

  // Public prompt marketplace API.
  async function loadMarket(){say('marketStatus','Loading marketplace...');try{const q=new URLSearchParams({q:$('marketSearch').value.trim(),category:$('marketCategory').value});const r=await fetch(`/api/marketplace/prompts?${q}`);const data=await safeJson(r);if(!r.ok)throw new Error(data.error||'Could not load marketplace.');const list=$('marketList');list.replaceChildren();if(!data.items?.length){list.textContent='No public prompts found yet.';}else data.items.forEach(item=>{const card=document.createElement('article');card.className='market-item';const h=document.createElement('b');h.textContent=item.title;const meta=document.createElement('div');meta.className='tag';meta.textContent=`${item.category} · by ${item.author} · ${item.created_at}`;const desc=document.createElement('p');desc.className='muted';desc.textContent=item.description||'';const pre=document.createElement('pre');pre.textContent=item.prompt;const actions=document.createElement('div');actions.className='actions';const copyBtn=document.createElement('button');copyBtn.className='btn ghost';copyBtn.textContent='Copy prompt';copyBtn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(item.prompt);say('marketStatus','Prompt copied.');}catch{say('marketStatus','Select the prompt text and copy it.');}});actions.append(copyBtn);card.append(h,meta,desc,pre,actions);list.append(card);});say('marketStatus',`${data.items?.length||0} prompt(s) found.`);}catch(e){say('marketStatus',e.message||'Marketplace is unavailable.');}}
  $('marketLoad').addEventListener('click',loadMarket);loadMarket();
  $('marketPublish').addEventListener('click',async()=>{const payload={title:$('marketTitle').value.trim(),category:$('marketPublishCategory').value,description:$('marketDescription').value.trim(),tags:$('marketTags').value.trim(),prompt:$('marketPrompt').value.trim()};if(!payload.title||!payload.prompt)return say('publishStatus','Title and prompt are required.');const b=$('marketPublish');b.disabled=true;say('publishStatus','Publishing...');try{const r=await fetch('/api/marketplace/prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await safeJson(r);if(!r.ok)throw new Error(data.error||'Could not publish. Please log in.');say('publishStatus','Prompt published to the public marketplace.');$('marketTitle').value='';$('marketDescription').value='';$('marketTags').value='';$('marketPrompt').value='';loadMarket();}catch(e){say('publishStatus',`${e.message||e} If you are not logged in, sign in to EditPrompt first.`);}finally{b.disabled=false;}});

  // Timeline: local-only media, basic sequential preview, trim and position controls.
  let clips=[];let activeUrl=null;
  const fmt=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
  function renderTimeline(){const view=$('timelineView');view.replaceChildren();if(!clips.length){view.textContent='Add media to build your timeline.';$('timelineClips').replaceChildren();return;}const types=['video','audio','image'];types.forEach(type=>{const items=clips.filter(c=>c.type===type);if(!items.length)return;const row=document.createElement('div');row.className='track';const label=document.createElement('div');label.className='track-label';label.textContent=type.toUpperCase();row.append(label);items.forEach(c=>{const block=document.createElement('div');block.className='clip-block';block.style.minWidth=`${Math.max(90,Math.min(250,(c.end-c.start)*12))}px`;block.textContent=`${c.name} · ${fmt(c.start)}–${fmt(c.end)}`;row.append(block);});view.append(row);});const controls=$('timelineClips');controls.replaceChildren();clips.forEach((c,i)=>{const box=document.createElement('div');box.className='clip';const title=document.createElement('b');title.textContent=`${i+1}. ${c.name} (${c.type})`;box.append(title);const grid=document.createElement('div');grid.className='clip-controls';[['Start (s)','start'],['Trim in (s)','in'],['Trim out (s)','out'],['Duration (s)','duration']].forEach(([label,key])=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.min='0';input.step='.1';input.value=key==='start'?c.start:key==='in'?c.trimIn:key==='out'?c.trimOut:c.duration;input.addEventListener('change',()=>{const n=Math.max(0,Number(input.value)||0);if(key==='start')c.start=n;else if(key==='in')c.trimIn=Math.min(n,c.duration);else if(key==='out')c.trimOut=Math.min(n,c.duration);renderTimeline();});wrap.append(input);grid.append(wrap);});box.append(grid);const actions=document.createElement('div');actions.className='actions';const preview=document.createElement('button');preview.className='btn ghost';preview.textContent='Preview clip';preview.addEventListener('click',()=>previewClip(c));const remove=document.createElement('button');remove.className='btn ghost';remove.textContent='Remove';remove.addEventListener('click',()=>{URL.revokeObjectURL(c.url);clips=clips.filter(x=>x!==c);renderTimeline();});actions.append(preview,remove);box.append(actions);controls.append(box);});}
  function previewClip(c){const host=$('timelinePreview');host.replaceChildren();if(activeUrl)URL.revokeObjectURL(activeUrl);activeUrl=c.url;let el;if(c.type==='video'){el=document.createElement('video');el.controls=true;el.playsInline=true;}else if(c.type==='audio'){el=document.createElement('audio');el.controls=true;}else{el=document.createElement('img');el.className='preview';el.alt=c.name;}el.src=c.url;el.classList.add('preview');host.append(el);if(c.type!=='image'){el.addEventListener('loadedmetadata',()=>{el.currentTime=Math.min(c.duration,c.trimIn);});el.addEventListener('timeupdate',()=>{if(c.trimOut>c.trimIn&&el.currentTime>=c.trimOut){el.pause();el.currentTime=c.trimOut;}});}say('timelineStatus',`Previewing ${c.name}.`);}
  $('timelineAdd').addEventListener('click',()=>{const files=[...$('timelineFiles').files];if(!files.length)return say('timelineStatus','Choose one or more media files first.');files.forEach(file=>{const type=file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':file.type.startsWith('image/')?'image':null;if(!type)return;const url=URL.createObjectURL(file);const clip={name:file.name,type,url,file,start:clips.reduce((m,c)=>Math.max(m,c.start+c.duration),0),duration:type==='image'?5:0,trimIn:0,trimOut:0};clips.push(clip);if(type!=='image'){const probe=document.createElement(type);probe.preload='metadata';probe.src=url;probe.onloadedmetadata=()=>{clip.duration=Number.isFinite(probe.duration)?probe.duration:0;clip.trimOut=clip.duration;renderTimeline();};}else clip.trimOut=5;});renderTimeline();say('timelineStatus',`${files.length} media item(s) added locally.`);$('timelineFiles').value='';});
  $('timelinePlay').addEventListener('click',()=>{if(!clips.length)return say('timelineStatus','Add media first.');const first=clips.slice().sort((a,b)=>a.start-b.start)[0];previewClip(first);const el=$('timelinePreview').querySelector('video,audio');if(el)el.play().catch(()=>say('timelineStatus','Press play in the preview player to start playback.'));});$('timelineStop').addEventListener('click',()=>{$('timelinePreview').querySelectorAll('video,audio').forEach(x=>x.pause());say('timelineStatus','Preview stopped.');});
  $('timelineExport').addEventListener('click',()=>{const project={app:'EditPrompt',version:'9.1',createdAt:new Date().toISOString(),clips:clips.map(({name,type,start,duration,trimIn,trimOut})=>({name,type,start,duration,trimIn,trimOut}))};downloadBlob(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'editprompt-timeline-project.json');say('timelineStatus','Timeline project JSON exported. Media files are not embedded; keep the originals.');});$('timelineClear').addEventListener('click',()=>{clips.forEach(c=>URL.revokeObjectURL(c.url));clips=[];$('timelinePreview').replaceChildren();renderTimeline();say('timelineStatus','Timeline cleared.');});
  window.addEventListener('pagehide',()=>{recognition?.stop();speechSynthesis?.cancel?.();stream?.getTracks().forEach(t=>t.stop());clips.forEach(c=>URL.revokeObjectURL(c.url));if(activeUrl)URL.revokeObjectURL(activeUrl);});

  // Image optimizer: resize, convert and compress in the browser.
  let optBlob = null, optUrl = null, optName = 'editprompt-optimized';
  const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  if ($('optQuality')) $('optQuality').addEventListener('input', () => say('optQualityValue', $('optQuality').value + '%'));
  if ($('optFile')) $('optFile').addEventListener('change', () => {
    const f = $('optFile').files[0]; optBlob = null; $('optDownload').disabled = true;
    if (f) { optName = f.name.replace(/\.[^.]+$/, '') + '-optimized'; say('optStatus', `${f.name} selected (${fmtSize(f.size)}). Click Optimize image.`); }
  });
  if ($('optProcess')) $('optProcess').addEventListener('click', async () => {
    const file = $('optFile').files[0]; if (!file) return say('optStatus', 'Choose an image first.');
    if (!file.type.startsWith('image/')) return say('optStatus', 'Choose a PNG, JPG or WebP image.');
    const btn = $('optProcess'); btn.disabled = true; say('optStatus', 'Optimizing...');
    try {
      const bmp = await createImageBitmap(file);
      const reqW = Number($('optWidth').value);
      const w = Math.max(1, Math.min(12000, Math.round(reqW > 0 ? reqW : bmp.width)));
      const h = Math.max(1, Math.round(bmp.height * w / bmp.width));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      const type = $('optFormat').value;
      if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
      x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h); bmp.close?.();
      const q = (Number($('optQuality').value) || 85) / 100;
      const blob = await new Promise(res => c.toBlob(res, type, q));
      if (!blob) throw new Error('This browser cannot export that format.');
      optBlob = blob;
      if (optUrl) URL.revokeObjectURL(optUrl);
      optUrl = URL.createObjectURL(blob);
      $('optPreview').src = optUrl; $('optPreview').hidden = false; $('optDownload').disabled = false;
      const saved = Math.round((1 - blob.size / file.size) * 100);
      say('optStatus', `${w} × ${h}px · ${fmtSize(file.size)} → ${fmtSize(blob.size)}` + (saved > 0 ? ` (${saved}% smaller).` : ' (larger; try lower quality, smaller width or WebP).'));
    } catch (e) { say('optStatus', `Could not optimize: ${e.message || e}`); }
    finally { btn.disabled = false; }
  });
  if ($('optDownload')) $('optDownload').addEventListener('click', () => {
    if (!optBlob) return;
    const ext = optBlob.type === 'image/png' ? 'png' : optBlob.type === 'image/jpeg' ? 'jpg' : 'webp';
    downloadBlob(optBlob, `${optName}.${ext}`);
  });
})();
