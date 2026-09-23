// Direct official downloads for the Creator Software Hub.
// EditPrompt does NOT host or re-pack any installer. For each app listed below we look up the
// newest file on the developer's own release page and send the visitor straight to it, so the
// download starts from the app's page on our site. Anything not listed (or if the lookup fails)
// falls back to the official site page, so nothing breaks.
//
// To add an app:
//   GitHub Releases : slug: { repo: "owner/name", asset: /regex of the Windows installer file name/ }
//   Directory index : slug: { index: "https://host/path/", asset: /regex/ }   (index must be https)
//   Fixed link      : slug: { url: "https://official-host/path/file.exe", version: "3.0.4" }
//                     (you must update it yourself when a new version comes out)
// Optional: type: "Offline installer" | "Portable archive" | ...   (shown on the page)

const SOURCES = {
  // GitHub Releases (file names checked against the real release pages)
  shotcut:         { repo: "mltframework/shotcut",      asset: /^shotcut-win64-[\d.]+\.exe$/i },
  "obs-studio":    { repo: "obsproject/obs-studio",     asset: /^OBS-Studio-[\d.]+-Windows-x64-Installer\.exe$/i },
  sharex:          { repo: "ShareX/ShareX",             asset: /^ShareX-[\d.]+-setup-x64\.exe$/i },
  "subtitle-edit": { repo: "SubtitleEdit/subtitleedit", asset: /^SubtitleEdit-Windows-x64-Setup\.exe$/i },
  audacity:        { repo: "audacity/audacity",         asset: /^audacity-win-[\d.]+-x86_64\.msi$/i },
  upscayl:         { repo: "upscayl/upscayl",           asset: /^upscayl-[\d.]+-win\.exe$/i },
  darktable:       { repo: "darktable-org/darktable",   asset: /^darktable-[\d.]+-win64\.exe$/i },
  handbrake:       { repo: "HandBrake/HandBrake",       asset: /^HandBrake-[\d.]+-x86_64-Win_GUI\.exe$/i },
  openshot:        { repo: "OpenShot/openshot-qt",      asset: /^OpenShot-v[\d.]+-x86_64\.exe$/i },
  rawtherapee:     { repo: "Rawtherapee/RawTherapee",   asset: /^RawTherapee_[\d.]+_win64_x86_64_release\.exe$/i },
  "lossless-cut":  { repo: "mifi/lossless-cut",         asset: /^LosslessCut-win-x64\.7z$/i, type: "Portable archive (.7z, no install)" },

  // Directory index (VLC publishes its newest Windows build here)
  // Example of a fixed link (uncomment and fill in after copying the link from the official page):
  // gimp:         { url: "https://download.gimp.org/gimp/v3.0/windows/gimp-3.0.4-setup.exe", version: "3.0.4", sizeMB: 300 },

  vlc:             { index: "https://get.videolan.org/vlc/last/win64/", asset: /^vlc-[\d.]+-win64\.exe$/i },

  // Fixed official link (no lookup). Only use links the vendor itself gives for its public download.
  // If the vendor renames the file, replace the link here.
  filmora: { url: "https://download.wondershare.com/filmora_full846.exe", type: "Free trial installer (exports carry a watermark until you buy a licence)" },

  // Links supplied by the site owner from each vendor's own download page (tracking parameters removed).
  inkscape:  { url: "https://inkscape.org/release/inkscape-1.4.4/windows/64-bit/msi/dl/", file: "Inkscape-1.4.4 (64-bit).msi", type: "Offline installer (.msi), Windows 64-bit" },
  scribus:   { url: "https://sourceforge.net/projects/scribus/files/scribus/1.6.6/scribus-1.6.6-windows-x64.exe/download", file: "scribus-1.6.6-windows-x64.exe", type: "Offline installer, Windows 64-bit (official SourceForge release)" },
  lightworks:{ url: "https://cdn.lwks.com/releases/2025.2/Lightworks-2025.2-56356.exe", type: "Free version installer (sign in with a free LWKS account inside the app)" },
  // GIMP: newest 3.2.x installer from GIMP's own server (change v3.2 to the next series when it becomes stable)
  gimp:      { index: "https://download.gimp.org/gimp/v3.2/windows/", asset: /^gimp-[\d.]+-setup(?:-\d+)?\.exe$/i },

  // Version-folder indexes: open the newest version folder, then pick the Windows installer inside it.
  // (These hosts were not reachable while building, so the file-name patterns are best guesses.
  //  If a pattern is wrong the page simply falls back to the official site. Test /dl/<slug> once.)
  krita:    { index: "https://download.kde.org/stable/krita/",    dirs: /^(\d+(?:\.\d+)+)\/$/,          asset: /^krita-x64-[\d.]+-setup\.exe$/i },
  kdenlive: { index: "https://download.kde.org/stable/kdenlive/", dirs: /^(\d+(?:\.\d+)+)\/$/, sub: "windows/", asset: /^kdenlive-[\d.]+\.exe$/i },
  blender:  { index: "https://download.blender.org/release/",     dirs: /^Blender(\d+(?:\.\d+)+)\/$/,  asset: /^blender-[\d.]+-windows-x64\.msi$/i },
};

const TTL = 60 * 60 * 1000; // 1 hour
const cache = new Map();
const UA = { "User-Agent": "EditPrompt-SoftwareHub" };

function verOf(name) { const m = name.match(/(\d+(?:\.\d+)+)/); return m ? m[1] : ""; }

async function fromGitHub(src) {
  const headers = { Accept: "application/vnd.github+json", ...UA };
  if (process.env.GITHUB_TOKEN) headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  const r = await fetch(`https://api.github.com/repos/${src.repo}/releases/latest`, { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const rel = await r.json();
  const a = (rel.assets || []).find((x) => src.asset.test(x.name));
  // Only ever redirect to a GitHub download URL of the whitelisted repo.
  if (!a || !a.browser_download_url.startsWith(`https://github.com/${src.repo}/releases/download/`)) return null;
  return {
    file: a.name,
    version: rel.tag_name,
    sizeMB: Math.round(a.size / 1048576),
    released: (rel.published_at || "").slice(0, 10),
    url: a.browser_download_url,
  };
}

async function listing(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const html = await r.text();
  return [...html.matchAll(/href="([^"?#\/][^"?#]*)"/g)].map((m) => { try { return decodeURIComponent(m[1]); } catch { return m[1]; } });
}
const byVersion = (x, y) => verOf(x).localeCompare(verOf(y), undefined, { numeric: true });

async function fromIndex(src) {
  let base = src.index;
  if (src.dirs) {
    // newest few version folders first; use the first one that holds a matching installer
    const dirs = (await listing(base)).filter((n) => src.dirs.test(n)).sort(byVersion).reverse().slice(0, 3);
    for (const d of dirs) {
      const b2 = base + d + (src.sub || "");
      const hit = (await listing(b2)).filter((n) => src.asset.test(n)).sort(byVersion).pop();
      if (hit) return { file: hit, version: verOf(hit), sizeMB: null, released: "", url: b2 + encodeURIComponent(hit) };
    }
    return null;
  }
  const names = (await listing(base)).filter((n) => src.asset.test(n)).sort(byVersion);
  if (!names.length) return null;
  const file = names[names.length - 1];
  return { file, version: verOf(file), sizeMB: null, released: "", url: base + encodeURIComponent(file) };
}

async function resolve(slug) {
  const src = SOURCES[slug];
  if (!src) return null;
  if (src.url) {
    const file = src.file || decodeURIComponent(new URL(src.url).pathname.split("/").pop());
    return { file, version: "", sizeMB: null, released: "", url: src.url, type: src.type || "Official installer" };
  }
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value = null;
  try {
    value = src.repo ? await fromGitHub(src) : src.index ? await fromIndex(src) : src.url ? fromFixed(src) : null;
    if (value) value.type = src.type || "Offline installer, Windows 64-bit";
  } catch {}
  // cache failures briefly so an outage does not slow every page view
  cache.set(slug, { at: value ? Date.now() : Date.now() - TTL + 5 * 60 * 1000, value });
  return value;
}

export function mountSoftwareDownloads(app) {
  app.get("/api/software/:slug/direct", async (req, res) => {
    const v = await resolve(String(req.params.slug));
    res.set("Cache-Control", "public, max-age=300");
    if (!v) return res.json({ available: false });
    res.json({ available: true, file: v.file, version: v.version, sizeMB: v.sizeMB, released: v.released, type: v.type });
  });

  app.get("/dl/:slug", async (req, res) => {
    const v = await resolve(String(req.params.slug));
    res.set("X-Robots-Tag", "noindex");
    if (v) return res.redirect(302, v.url);
    res.redirect(302, "/software-app.html?app=" + encodeURIComponent(String(req.params.slug)));
  });
}
