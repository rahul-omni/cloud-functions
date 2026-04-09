# PHHC scraper: why it fails and how to fix “blocked IP” (beginner-friendly)

This document explains **in plain language** why the Punjab & Haryana High Court (`new.phhc.gov.in`) sometimes returns **403 Forbidden** when your code runs on **Google Cloud**, and what you can do about it. It assumes you know how to **write code** but are **new to networking, proxies, and cloud infrastructure**.

---

## 1. What your code actually does (big picture)

When your scraper runs, it does **not** run on your laptop. It runs on a **server in Google’s data center** (Firebase / Cloud Functions in `asia-south1`).

Rough flow:

1. Your function starts.
2. It opens a **browser** (Puppeteer + Chromium) on that server.
3. That browser asks the internet for: `https://new.phhc.gov.in/...`
4. The **court’s website** receives that request and decides: **allow** or **deny**.

If the court’s systems **deny** your request, you see **403 Forbidden** in the logs. Your selectors and JavaScript can be perfect; the page never loads, so scraping cannot proceed.

---

## 2. Terms you need (explained like you’re new)

### IP address

An **IP address** is like a **phone number for a computer on the internet**. When your scraper connects to `new.phhc.gov.in`, the court’s server sees **which IP** the connection came from.

- Your **home Wi‑Fi** has one public IP (roughly “one number” for the whole house).
- **Google’s server** running your function has **different** IPs — shared with many other customers, and usually known as **data center** or **cloud** IPs.

### Why would a website “block” an IP?

Websites and **WAFs** (Web Application Firewalls — automated guards in front of sites) often:

- Allow normal visitors (home, office, mobile).
- **Block or limit** traffic from **known cloud providers** (Google, AWS, Azure, etc.) because scrapers, bots, and attacks often come from there.

So: **same code, same URL** can work on your laptop and **fail in the cloud**, only because the **exit IP** is different.

### HTTP status 403

- **200** = “OK, here is the page.”
- **404** = “That path does not exist.”
- **403** = “I know who you are / I refuse to give you this resource.”

For your logs, **403 on the main document** usually means: **the server or firewall decided not to serve your request**, often due to **IP reputation** or **policy**, not a bug in your form-filling code.

### Egress IP (“egress” = outgoing)

**Egress** means **traffic leaving** your environment toward the internet.

- **Egress IP** = the IP that **the remote site sees** when your function talks to them.

In Cloud Functions, that is **Google’s IP**, not yours and not your office’s.

---

## 3. Why “fix the User-Agent” is not enough

Browsers send a **User-Agent** string (“I am Chrome on Windows…”). Your code already sets a realistic one.

Many tutorials say “look like a real browser.” That helps against **simple** bot checks. When the **entire HTML document** returns **403**, the block is often at the **network / IP / WAF** layer **before** your page logic runs. Changing headers rarely fixes that.

---

## 4. Two main ways to fix it (conceptual)

You need the court site to see a **different egress IP** — one that is **allowed**, or at least **not blocked**.

### Option A — HTTP/HTTPS proxy (usually the fastest to try)

**Idea:** Your function does **not** talk to PHHC directly. It talks to a **proxy server**; the **proxy** talks to PHHC. The court sees the **proxy’s IP**, not Google’s.

**Analogy:** Instead of mailing a letter yourself from an address the recipient rejects, you give the letter to a **friend at another address** who forwards it. The recipient only sees the friend’s address.

**In code:** This project supports an environment variable:

- **`PHHC_PROXY`** — preferred (only affects this scraper’s browser), or  
- **`HTTPS_PROXY` / `HTTP_PROXY`** — common standard names.

The value is usually a URL like:

```text
http://username:password@proxy-host.example.com:8080
```

(Exact format depends on your provider.)

**Trade-offs:**

- You depend on a **proxy provider** (often paid for reliable, non-blocked IPs).
- You must **keep credentials secret** (Firebase Secret Manager, not committed in git).

### Option B — Your own fixed IP on Google Cloud (VPC + Cloud NAT)

**Idea:** In Google Cloud you can send **all outbound internet traffic** from your function through a **known static IP** that **you** control. Then you can:

- Ask PHHC IT to **allowlist** that IP (if they offer that), or  
- Hope that IP is not in the same blocked category (often it is still **data center**, so **403 may persist** without allowlisting).

**Terms:**

| Term | Simple meaning |
|------|----------------|
| **VPC** (Virtual Private Cloud) | A private network inside Google Cloud where you can control routing. |
| **Subnet** | A chunk of that network in a **region** (e.g. Mumbai / `asia-south1`). |
| **Cloud NAT** | Network Address Translation: many internal machines share **one public IP** when talking to the internet. |
| **Static IP** | A public IP that **does not change** every deploy. |
| **Serverless VPC Access connector** | A bridge so **Cloud Functions** can use your VPC (and thus NAT) instead of only Google’s default egress. |

**Trade-offs:**

- More **DevOps / GCP console** work than setting `PHHC_PROXY`.
- The IP is still **Google’s cloud** unless you combine with something else; **allowlisting** by PHHC is the realistic path if they block cloud ranges broadly.

---

## 4a. The three approaches explained in detail

These solve the same underlying problem — **make `new.phhc.gov.in` see an IP it will accept** — but they work differently.

### Approach 1: HTTP/HTTPS proxy

**What it is:** A **proxy** is another machine on the internet. Your scraper connects to the proxy; the proxy opens the connection to PHHC. The court site only sees the **proxy’s public IP**, not Google Cloud’s.

**When it helps:** You need to try a **non–datacenter** or **different country/ASN** exit quickly, without changing VPC. Many teams use a **commercial proxy** (often paid) that offers **residential** or **ISP-like** IPs.

**What you configure:** A single URL such as `http://user:pass@host:port` in **`PHHC_PROXY`** (or `HTTPS_PROXY`). Chromium uses `--proxy-server=...`.

**Strengths:** Fast to wire up; no GCP networking project. **Limits:** Recurring cost; if the **proxy’s IP is also blocked**, you still get 403 — try another pool or provider.

---

### Approach 2: VPC + Cloud NAT + static IP (on Google Cloud)

**What it is:** By default, Cloud Functions exit to the internet through **Google’s shared IPs** (many customers, addresses can change). You can instead route **outbound** traffic through a **VPC**, then **Cloud NAT**, using one **regional static external IP** that **belongs to your project** and stays the same.

**When it helps:** You want **one fixed IP** for **compliance**, **firewall rules**, or to give **one number** to PHHC for allowlisting.

**What you configure (high level):** VPC network → subnet in your function’s region → Cloud Router → Cloud NAT (using a **reserved static IP**) → **Serverless VPC Access connector** → attach the connector to the function with **`vpcConnectorEgressSettings: 'ALL_TRAFFIC'`** so HTTPS to public websites goes through NAT, not only private APIs.

**Strengths:** Predictable IP you control inside GCP. **Limits:** More DevOps work; the IP is still typically **classified as cloud/datacenter**, so **403 may continue** until PHHC (or their WAF) **allowlists** that IP.

---

### Approach 3: Allowlist (on PHHC / their CDN–WAF side)

**What it is:** Someone with access to the **court’s hosting or WAF** adds your IP to an **allow list** (sometimes called a **whitelist**): “always permit HTTPS from this address.”

**When it helps:** You already have a **stable IP** (from NAT above, or a corporate fixed line) and **PHHC IT** agrees to configure their edge (F5, Akamai, etc.).

**What you configure:** Not in your repo — you **request** allowlisting with your **static egress IP** and use case. After they deploy the rule, your scraper can keep using that same IP without a third-party proxy.

**Strengths:** Most reliable **if** the organization supports it. **Limits:** Depends on their policy and turnaround; not every public site offers this.

---

### How the three fit together

| Situation | Typical path |
|-----------|----------------|
| Need a different IP **today**, no GCP network changes | **Proxy** (`PHHC_PROXY`). |
| Need a **fixed IP** you own in GCP for policy or PHHC | **VPC + NAT + static IP**. |
| WAF still blocks even your static cloud IP | **Allowlist** (PHHC adds your IP) **or** use a **proxy** whose IP they don’t block. |

**Proxy** and **NAT** change **where** traffic exits; **allowlist** changes **whether** the edge accepts that exit. You can combine **NAT + allowlist** (fixed GCP IP on their list) or **proxy + allowlist** (if they list the proxy’s egress).

---

## Debug tips (403 on PHHC)

1. **Two navigation attempts** — `navigateToSearchPage` retries **once** after a 403 so the browser can apply **`Set-Cookie`** headers (e.g. `TS01*`) from the first response and try again. **Read the logs:** if **both** attempts log `Document HTTP status: 403`, treat it as **IP / network blocking** — cookies alone are not enough; configure **proxy, NAT + static IP, or allowlist**.

2. **403 and `Set-Cookie` together** — Common with WAFs (F5, etc.). It does **not** guarantee the next request will succeed; the small HTML body (~90 bytes) is often still a block page. Success means **`Document HTTP status: 200`** and the case search form eventually appears.

3. **Do not log full Puppeteer `HTTPResponse` objects** — `console.log(response)` prints huge internal graphs and hides useful lines. Prefer logging **status**, **URL**, and short **headers** only.

4. **Local vs cloud** — Same URL works on your laptop but **403** in Firebase → strong signal of **egress IP** blocking, not a selector bug.

5. **After changing proxy or NAT** — Redeploy, run once, and confirm **`Document HTTP status: 200`** on the first or second attempt before debugging form logic.

---

## 5. What this repo does in code (so you know what to configure)

- **`components/browser.js`**  
  - Launches Chromium.  
  - If **`PHHC_PROXY`** (or `HTTPS_PROXY` / `HTTP_PROXY`) is set, it adds Chrome’s `--proxy-server=...` so **all browser traffic** can go through the proxy.

- **`navigateToSearchPage`**  
  - Loads the case-status URL; may **retry once** after a 403 so WAF-issued cookies can apply. If status is still **403**, it throws (so you don’t treat a block as “no results”).

You do **not** need to change scraping logic for a **network** block; you need to change **where traffic exits** (proxy or NAT + optional allowlist).

---

## 6. Practical checklist: proxy on Firebase (high level)

These are **conceptual steps**; exact CLI names may change — use current Firebase docs.

1. **Choose a proxy provider** that supports **HTTPS** targets and gives you host, port, and auth if needed.
2. **Store the proxy URL as a secret** (never commit it):

   ```bash
   firebase functions:secrets:set PHHC_PROXY
   ```

3. **Attach the secret** to the function that runs PHHC (same idea as `DATABASE_URL` in `defineSecret` + `secrets: [...]` in `runWith`).
4. **Redeploy** the function.
5. **Test** and check logs: you should **not** see 403 on `new.phhc.gov.in` if the proxy IP is acceptable.

If you still get **403**, the **proxy’s IP** may also be blocked — try another region/product from the provider or another provider.

---

## 7. Practical checklist: static IP with VPC + NAT (very short)

Only if your team is comfortable with GCP networking:

1. Create **VPC + subnet** in the **same region** as the function (`asia-south1`).
2. Reserve a **regional static IP** for **Cloud NAT**.
3. Add **Cloud Router** + **Cloud NAT** so outbound internet uses that IP.
4. Create a **Serverless VPC Access** **connector** in that region/VPC.
5. Configure the function with **`vpcConnector`** and **`vpcConnectorEgressSettings: 'ALL_TRAFFIC'`** so **public** HTTPS (not only private APIs) uses NAT.

Then contact PHHC for **allowlisting** if needed.

Official overview: [Firebase Functions – networking](https://firebase.google.com/docs/functions/networking).

---

## 8. What will *not* magically fix 403

- Only changing **User-Agent** or a few **HTTP headers**.
- **Infinite or blind retries** from the **same** egress IP (the built-in **one** retry after cookies is different — see **Debug tips**).
- Assuming **“India region”** (`asia-south1`) alone makes the IP “Indian enough” — cloud IPs are still **datacenter** ranges.

---

## 9. Quick glossary

| Term | One-line meaning |
|------|------------------|
| **403** | Server refuses to serve the resource (here often IP/policy). |
| **Egress** | Outbound traffic from your app to the internet. |
| **WAF** | Firewall in front of a website that filters requests by IP, country, behavior, etc. |
| **Proxy** | Middle server that forwards your HTTP(S) traffic; the website sees the proxy’s IP. |
| **NAT** | Lets many machines share one public IP when going online. |
| **VPC** | Your private network inside a cloud provider. |
| **Allowlist** | “Only these IPs may access” — PHHC would add your static IP to that list. |

---

## 10. Summary

- Your **code** opens a browser in **Google’s cloud**. PHHC may **reject** that **cloud IP** with **403**.
- **Fix** = make PHHC see a **different egress IP**: usually an **HTTP proxy** in env (`PHHC_PROXY`), or **VPC + Cloud NAT + static IP** plus possibly **PHHC allowlisting**.
- This document is the **mental model**; your team’s **DevOps / GCP admin** can implement VPC/NAT, or you can start with a **proxy** and secrets as the fastest experiment.

If you only remember one sentence: **403 from the court site while your code is correct usually means “wrong IP on the internet,” not “wrong selector in Puppeteer.”**
