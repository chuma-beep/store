#!/usr/bin/env python3
"""Submit all sitemap URLs to IndexNow (Bing/Yandex). Run daily via cron."""
import subprocess, json, re, time

SITEMAP = "https://omarchystore.com/sitemap.xml"
KEY = "3cfc7f9468b2130cc8c6aed932390e78"
HOST = "omarchystore.com"
BATCH_SIZE = 100

def main():
    r = subprocess.run(["curl", "-s", SITEMAP], capture_output=True, text=True)
    urls = re.findall(r'<loc>([^<]+)</loc>', r.stdout)
    print(f"Found {len(urls)} URLs")
    
    total = 0
    for i in range(0, len(urls), BATCH_SIZE):
        batch = urls[i:i+BATCH_SIZE]
        payload = {
            "host": HOST,
            "key": KEY,
            "keyLocation": f"https://{HOST}/{KEY}.txt",
            "urlList": batch
        }
        subprocess.run([
            "curl", "-s", "-X", "POST",
            "https://api.indexnow.org/indexnow",
            "-H", "Content-Type: application/json",
            "-d", json.dumps(payload)
        ], capture_output=True)
        total += len(batch)
        if i + BATCH_SIZE < len(urls):
            time.sleep(0.3)
    
    print(f"✅ Submitted {total} URLs to IndexNow")

if __name__ == "__main__":
    main()
