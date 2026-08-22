import { isValidBvid } from "../background.js";

const bvid = process.argv[2] || "BV1xx411c7mD";
console.log(`[Verify Bili] Checking Bilibili video accessibility for: ${bvid}`);

if (!isValidBvid(bvid)) {
  console.error(`Invalid BV ID: ${bvid}`);
  process.exit(1);
}

try {
  const sessdata = process.env.BILI_SESSDATA || "";
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Referer: "https://www.bilibili.com/",
  };
  if (sessdata) headers.Cookie = `SESSDATA=${sessdata}`;

  const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers });
  const data = await res.json();
  if (data.code === 0) {
    console.log(`✓ Video accessible: ${data.data.title} (UP: ${data.data.owner?.name})`);
    console.log(`  cid: ${data.data.cid}, aid: ${data.data.aid}, pages: ${data.data.pages?.length || 1}`);
  } else {
    console.warn(`Bilibili API returned code ${data.code}: ${data.message}`);
  }
} catch (err) {
  console.error(`Fetch failed: ${err.message}`);
}
