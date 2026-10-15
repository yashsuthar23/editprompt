(() => {
  const $ = (id) => document.getElementById(id);
  const state = { projects: [], active: null, library: [], versions: [] };
  const FORM_DRAFT='editprompt.workspace.createDraft.v1';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  function message(text) { const el = $('message'); el.textContent = text; el.style.display = text ? 'block' : 'none'; }
  function setButtons() { const selected = Boolean(state.active); $('exportBtn').disabled = !selected; $('deleteBtn').disabled = !selected; $('mediaPicker').disabled = !selected || !state.library.length; $('attachBtn').disabled = !selected || !$('mediaPicker').value; $('editProjectForm').hidden=!selected; }
  async function loadStatus() {
    try { const data = await api('/api/v8/status'); $('providerStatus').textContent = `V${data.version} • ${data.freeOnly ? 'Free-only mode enabled' : 'Free-only mode disabled'} • Free quotas vary; unlimited generation is not guaranteed.`; }
    catch { $('providerStatus').textContent = 'Provider status is unavailable.'; }
  }
  async function loadProjects() {
    const data = await api('/api/projects'); state.projects = data.items || [];
    if (state.active && !state.projects.some(p => p.id === state.active.id)) state.active = null;
    renderProjects(); if (state.active) await loadProject(state.active.id); else renderActive();
  }
  function renderProjects() {
    const host = $('projects');
    if (!state.projects.length) { host.innerHTML = '<p class="v8-empty">No projects yet. Create one above to organize your client work.</p>'; return; }
    host.innerHTML = state.projects.map(p => `<button class="v8-project ${state.active?.id === p.id ? 'active' : ''}" type="button" data-project="${p.id}"><span class="dot" style="background:${/^#[\da-f]{6}$/i.test(p.brand_color) ? p.brand_color : '#7c5cff'}"></span><span style="min-width:0"><span class="name">${esc(p.name)}</span><small>${Number(p.media_count) || 0} media item(s)</small></span></button>`).join('');
    host.querySelectorAll('[data-project]').forEach(btn => btn.addEventListener('click', () => loadProject(Number(btn.dataset.project))));
  }
  async function loadLibrary() {
    try { const data = await api('/api/media/history'); state.library = data.items || []; }
    catch (e) { state.library = []; if (e.message.includes('log in')) message('Please log in on the main EditPrompt page, then return here.'); else message(e.message); }
    const picker = $('mediaPicker'); const current = picker.value;
    picker.innerHTML = '<option value="">Select media from your library…</option>' + state.library.map(m => `<option value="${m.id}">${esc(m.kind)} · ${esc((m.prompt || 'Generated media').slice(0, 70))}</option>`).join('');
    if (current) picker.value = current; setButtons();
  }
  async function loadProject(id) { try { const data = await api(`/api/projects/${id}`); state.active = data.item; $('editProjectName').value=state.active.name||''; $('editProjectDescription').value=state.active.description||''; $('editProjectColor').value=state.active.brand_color||'#7c5cff'; renderProjects(); renderActive(); await loadVersions(); } catch (e) { message(e.message); } }
  async function loadVersions(){if(!state.active){$('versionList').innerHTML='<p class="v8-empty">Select a project to view saved versions.</p>';return;}try{const data=await api(`/api/projects/${state.active.id}/versions`);state.versions=data.items||[];renderVersions();}catch(e){$('versionList').innerHTML=`<p class="v8-empty">Version history unavailable: ${esc(e.message)}</p>`;}}
  function renderVersions(){const host=$('versionList');if(!state.versions.length){host.innerHTML='<p class="v8-empty">No versions yet. Edit project details or attach media to create a snapshot.</p>';return;}host.innerHTML=state.versions.map(v=>`<article class="v8-version"><div><b>${esc(v.note||'Saved version')}</b><small>${esc(v.created_at||'')} · ${Number(v.mediaCount)||0} media item(s) · Version #${v.id}</small></div><button class="btn ghost" type="button" data-restore-version="${v.id}">Restore</button></article>`).join('');host.querySelectorAll('[data-restore-version]').forEach(btn=>btn.addEventListener('click',async()=>{const versionId=Number(btn.dataset.restoreVersion);if(!confirm(`Restore version #${versionId}? Current project state will be saved as a new version first.`))return;try{await api(`/api/projects/${state.active.id}/versions/${versionId}/restore`,{method:'POST'});await loadProjects();await loadProject(state.active.id);message(`Version #${versionId} restored. A new snapshot was created.`);}catch(e){message(e.message);}}));}
  function renderActive() {
    const p = state.active; $('activeTitle').textContent = p ? p.name : 'Choose a project'; $('activeDescription').textContent = p ? (p.description || 'No project notes added.') : 'Select a project on the left to see its media.';
    const media = p?.media || []; const host = $('projectMedia');
    if (!p) host.innerHTML = '<p class="v8-empty">Create or select a project to begin.</p>';
    else if (!media.length) host.innerHTML = '<p class="v8-empty">This project has no media yet. Add existing images or videos using the selector above.</p>';
    else host.innerHTML = media.map(m => { const isVideo = String(m.kind).includes('video') || /\.mp4$/i.test(m.file || ''); const preview = isVideo ? `<video controls preload="metadata" src="${esc(m.url)}"></video>` : `<img loading="lazy" src="${esc(m.url)}" alt="Generated media">`; return `<article class="v8-card">${preview}<div class="body"><p>${esc(m.prompt || 'Generated media')}</p><div class="actions"><a class="btn ghost" href="${esc(m.downloadUrl)}" download>Download</a><button class="btn ghost" type="button" data-remove="${m.id}">Remove</button></div></div></article>`; }).join('');
    host.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', async () => { try { await api(`/api/projects/${p.id}/media/${btn.dataset.remove}`, { method: 'DELETE' }); await loadProject(p.id); await loadProjects(); message('Media removed from this project. Original file remains in your library.'); } catch (e) { message(e.message); } }));
    setButtons();
  }
  try{const draft=JSON.parse(localStorage.getItem(FORM_DRAFT)||'{}');if(draft.name)$('projectName').value=draft.name;if(draft.description)$('projectDescription').value=draft.description;if(draft.color)$('projectColor').value=draft.color;}catch{}
  ['projectName','projectDescription','projectColor'].forEach(id=>$(id).addEventListener('input',()=>{try{localStorage.setItem(FORM_DRAFT,JSON.stringify({name:$('projectName').value,description:$('projectDescription').value,color:$('projectColor').value}));}catch{}}));
  $('createForm').addEventListener('submit', async e => { e.preventDefault(); try { const data = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: $('projectName').value, description: $('projectDescription').value, brandColor: $('projectColor').value }) }); $('projectName').value = ''; $('projectDescription').value = ''; localStorage.removeItem(FORM_DRAFT); await loadProjects(); await loadProject(data.item.id); message('Project created.'); } catch (err) { message(err.message); } });
  $('editProjectForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.active)return;try{await api(`/api/projects/${state.active.id}`,{method:'PATCH',body:JSON.stringify({name:$('editProjectName').value,description:$('editProjectDescription').value,brandColor:$('editProjectColor').value})});await loadProjects();await loadProject(state.active.id);message('Project details saved and a version snapshot created.');}catch(err){message(err.message);}});
  $('mediaPicker').addEventListener('change', setButtons);
  $('attachBtn').addEventListener('click', async () => { if (!state.active || !$('mediaPicker').value) return; try { await api(`/api/projects/${state.active.id}/media`, { method: 'POST', body: JSON.stringify({ mediaId: Number($('mediaPicker').value) }) }); await loadProject(state.active.id); await loadProjects(); message('Media added to project.'); } catch (e) { message(e.message); } });
  $('deleteBtn').addEventListener('click', async () => { if (!state.active || !confirm(`Delete project “${state.active.name}”? Original media will remain in your library.`)) return; try { await api(`/api/projects/${state.active.id}`, { method: 'DELETE' }); state.active = null; await loadProjects(); message('Project deleted. Original media was kept.'); } catch (e) { message(e.message); } });
  $('exportBtn').addEventListener('click', () => { if (state.active) location.href = `/api/projects/${state.active.id}/export-manifest`; });
  $('refreshBtn').addEventListener('click', async () => { await loadLibrary(); await loadProjects(); message('Workspace refreshed.'); });
  (async () => { try { const me = await api('/api/me'); if (!me.user) { message('Please log in on the main EditPrompt page first. After logging in, open Projects again.'); $('projects').innerHTML = '<p class="v8-empty">Login required. <a href="/?login=1">Go to login</a>.</p>'; $('mediaPicker').disabled = true; return; } await Promise.all([loadStatus(), loadLibrary(), loadProjects()]); } catch (e) { message(e.message); } })();
})();
