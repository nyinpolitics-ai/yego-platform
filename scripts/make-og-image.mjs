// Generates public/img/og-yego.png: the 1200x630 social share card that
// WhatsApp / X / Facebook show when a yego.ng link is shared.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const OUT = new URL('../public/img/og-yego.png', import.meta.url).pathname

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: 'Archivo', 'Arial Black', sans-serif;
    background:
      radial-gradient(900px 600px at 82% -10%, rgba(15,138,75,.55), transparent 60%),
      radial-gradient(700px 500px at -5% 110%, rgba(245,197,66,.16), transparent 55%),
      linear-gradient(135deg, #062514 0%, #0b3f22 55%, #0b6b3a 130%);
    color: #fff;
    position: relative;
  }
  .frame {
    position: absolute; inset: 22px;
    border: 2px solid rgba(255,255,255,.18);
    border-radius: 18px;
  }
  .flag {
    position: absolute; top: 22px; left: 60px; right: 60px; height: 6px;
    background: linear-gradient(90deg, #0b6b3a 0 33%, #f5f5f0 33% 66%, #0b6b3a 66% 100%);
    border-radius: 3px;
  }
  .wrap {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center; gap: 64px;
    padding: 0 80px;
  }
  .shield { flex: 0 0 auto; filter: drop-shadow(0 18px 34px rgba(0,0,0,.45)); }
  .text { display: flex; flex-direction: column; align-items: flex-start; }
  .brand { font-size: 148px; font-weight: 900; letter-spacing: 2px; line-height: .95; }
  .full {
    margin-top: 10px; font-size: 33px; font-weight: 800; letter-spacing: 3.5px;
    text-transform: uppercase; color: #eaf4ee;
  }
  .tag {
    margin-top: 26px; display: inline-flex; align-items: center; gap: 12px;
    background: rgba(245,197,66,.14); border: 1.5px solid rgba(245,197,66,.55);
    color: #f5c542; border-radius: 999px; padding: 12px 26px;
    font-size: 25px; font-weight: 800; letter-spacing: .5px;
  }
  .domain {
    position: absolute; bottom: 44px; left: 0; right: 0; text-align: center;
    font-size: 24px; font-weight: 700; letter-spacing: 4px; color: rgba(255,255,255,.72);
  }
</style>
</head>
<body>
  <div class="frame"></div>
  <div class="flag"></div>
  <div class="wrap">
    <svg class="shield" width="230" height="230" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 3 7 11v19c0 15.5 10.6 26.7 25 31 14.4-4.3 25-15.5 25-31V11L32 3Z" fill="#0f8a4b"/>
      <path d="M32 8.3 12 14.7V30c0 12.6 8.4 21.8 20 25.6V8.3Z" fill="#0b6b3a"/>
      <path d="M14 31s7-10 18-10 18 10 18 10-7 10-18 10-18-10-18-10Z" fill="#fff"/>
      <circle cx="32" cy="31" r="6.5" fill="#0b6b3a"/>
      <path d="m28.6 31 2.4 2.4 4.6-4.8" stroke="#f5c542" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div class="text">
      <div class="brand">YEGO</div>
      <div class="full">Youth Electoral Guards Observers</div>
      <div class="tag">Watchdog of the Electoral Process</div>
    </div>
  </div>
  <div class="domain">YEGO.NG</div>
</body>
</html>`

mkdirSync(new URL('../public/img/', import.meta.url).pathname, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.evaluate(() => globalThis.document.fonts.ready)
await page.waitForTimeout(400)
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } })
await browser.close()
console.log('OG image written to', OUT)
