"""Automatic check for apps published to the M3TV Store.

Runs on the TV (in the launcher) before an app is uploaded, so there is no server function to deploy.
Blocked: link shorteners, IP/local/http addresses, random-looking names, addresses or descriptions,
a name that doesn't relate to the website, imitation of well-known brands, scam wording, unreachable sites.
Pending (a person approves it): page can't be read, redirects to another domain, piracy wording.

These are heuristics, not proof. The database repeats the cheap rules (see 0002_client_publish.sql).
"""
import html as htmllib
import http.client
import re
import socket
import unicodedata
import urllib.error
import urllib.request
from urllib.parse import urljoin, urlparse

BRANDS = {'amazon': ['amazon.com', 'primevideo.com', 'amazon.co.uk', 'amazon.de', 'amazon.co.jp', 'amazon.ca', 'amazon.in',
            'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.com.au'],
 'apple': ['apple.com', 'icloud.com'],
 'bankofamerica': ['bankofamerica.com'],
 'binance': ['binance.com'],
 'chase': ['chase.com'],
 'coinbase': ['coinbase.com'],
 'crunchyroll': ['crunchyroll.com'],
 'discord': ['discord.com', 'discord.gg'],
 'disney': ['disney.com', 'disneyplus.com', 'hotstar.com', 'disneynow.com'],
 'ebay': ['ebay.com'],
 'facebook': ['facebook.com', 'fb.com', 'meta.com', 'messenger.com'],
 'fubo': ['fubo.tv', 'fubo.com'],
 'google': ['google.com', 'withgoogle.com', 'googleusercontent.com'],
 'hbo': ['hbo.com', 'hbomax.com', 'max.com'],
 'hidive': ['hidive.com'],
 'hulu': ['hulu.com'],
 'instagram': ['instagram.com'],
 'metamask': ['metamask.io'],
 'microsoft': ['microsoft.com', 'live.com', 'office.com', 'outlook.com', 'microsoftonline.com', 'xbox.com', 'bing.com'],
 'netflix': ['netflix.com', 'netflix.net'],
 'paramount': ['paramount.com', 'paramountplus.com'],
 'paypal': ['paypal.com', 'paypal.me'],
 'peacock': ['peacocktv.com', 'nbc.com'],
 'philo': ['philo.com'],
 'plex': ['plex.tv', 'plex.com'],
 'pluto': ['pluto.tv'],
 'primevideo': ['primevideo.com', 'amazon.com'],
 'roblox': ['roblox.com'],
 'roku': ['roku.com'],
 'sling': ['sling.com'],
 'spotify': ['spotify.com'],
 'steam': ['steampowered.com', 'steamcommunity.com', 'valvesoftware.com'],
 'telegram': ['telegram.org', 't.me'],
 'tiktok': ['tiktok.com'],
 'tubi': ['tubitv.com', 'tubi.tv'],
 'twitch': ['twitch.tv'],
 'twitter': ['twitter.com', 'x.com'],
 'vimeo': ['vimeo.com'],
 'wellsfargo': ['wellsfargo.com'],
 'whatsapp': ['whatsapp.com', 'whatsapp.net'],
 'youtube': ['youtube.com', 'youtu.be', 'youtubekids.com']}

GENERIC_BRANDS = {"apple", "steam", "sling", "philo", "pluto", "discord", "plex", "chase", "tubi"}
SHORTENERS = {
    "bit.ly", "t.co", "tinyurl.com", "goo.gl", "is.gd", "ow.ly", "buff.ly", "cutt.ly", "rebrand.ly", "shorturl.at",
    "tiny.cc", "rb.gy", "lnkd.in", "s.id", "v.gd", "t.ly", "shorte.st", "adf.ly", "bl.ink", "soo.gd", "clck.ru", "qr.net",
}
SUSPICIOUS_TLDS = {"zip", "mov", "tk", "ml", "ga", "cf", "gq", "click", "country", "kim", "loan", "work", "men", "rest", "support"}
SCAM_TERMS = [re.compile(p, re.I) for p in (
    r"free\s+(netflix|disney|hulu|spotify|prime|premium|paypal|robux|vbucks|v-bucks)",
    r"account\s+(generator|giveaway)",
    r"\b(keygen|cracked?|hack(ed|er|s)?|mod\s?apk|cheat\s?engine)\b",
    r"\bgiveaway\b", r"claim\s+your\s", r"verify\s+your\s+(account|identity|card|wallet)",
    r"(enter|confirm|provide)\s+your\s+(password|card|seed|wallet|ssn)", r"\bairdrop\b", r"double\s+your\s+(money|crypto|bitcoin)",
)]
REVIEW_TERMS = [re.compile(p, re.I) for p in (
    r"\btorrents?\b", r"\bpirat(e|ed|es|ing)\b", r"free\s+(movies?|tv|series|shows)\s+(online|streaming|stream)",
    r"watch\s+(movies?|tv|series)\s+(online\s+)?for\s+free", r"no\s+(subscription|signup|sign-up)\s+needed", r"\bwarez\b",
)]
NAME_STOPWORDS = {
    "app", "apps", "tv", "the", "official", "watch", "stream", "streaming", "video", "videos", "movies", "movie",
    "player", "online", "hd", "store", "site", "web", "and", "for", "free", "plus", "new", "best", "my",
}
HOMOGLYPHS = {
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ѕ": "s", "ј": "j",
    "ԁ": "d", "ɡ": "g", "ǀ": "l", "ı": "i", "ο": "o", "ν": "v", "ɑ": "a", "ӏ": "l",
}
SECOND_LEVEL = {"co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go"}
WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)


def fold(s):
    t = unicodedata.normalize("NFKD", str(s))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return "".join(HOMOGLYPHS.get(c, c) for c in t)


def plain(s):
    return re.sub(r"[^a-z0-9]", "", fold(s))


def variants(s):
    base = fold(s)
    out = []
    for one in ("l", "i"):
        t = (base.replace("0", "o").replace("3", "e").replace("4", "a").replace("5", "s").replace("7", "t")
             .replace("@", "a").replace("$", "s").replace("!", "i").replace("1", one))
        out.append(re.sub(r"[^a-z0-9]", "", t))
    return out


def levenshtein(a, b):
    if a == b:
        return 0
    if not a or not b:
        return max(len(a), len(b))
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def near(a, brand):
    return a != brand and len(brand) >= 5 and levenshtein(a, brand) <= (2 if len(brand) >= 7 else 1)


def registrable_domain(host):
    parts = [p for p in host.lower().split(".") if p]
    if len(parts) <= 2:
        return ".".join(parts)
    if len(parts[-1]) == 2 and parts[-2] in SECOND_LEVEL:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def is_private_ip(ip):
    import ipaddress
    try:
        a = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return True
    if getattr(a, "ipv4_mapped", None):
        a = a.ipv4_mapped
    return not a.is_global


def looks_random(word):
    """Keyboard mashing or random characters: xkqzvtw, asdfgh, a8f3k2x."""
    w = re.sub(r"[^a-z0-9]", "", fold(word))
    if len(w) < 4:
        return False
    letters = re.sub(r"[0-9]", "", w)
    if re.search(r"(.)\1{3,}", w):
        return True
    if re.search(r"qwert|werty|asdf|sdfg|dfgh|fghj|ghjk|hjkl|zxcv|xcvb|cvbn|vbnm|poiu|lkjh|mnbv", w):
        return True
    if re.search(r"[0-9]", w) and len(letters) >= 3 and len(w) >= 6 and re.search(r"[a-z][0-9][a-z]|[0-9][a-z][0-9]", w):
        return True
    if len(letters) >= 5:
        if re.search(r"[^aeiouy]{6,}", letters):
            return True
        vowels = len(re.findall(r"[aeiouy]", letters))
        if vowels == 0:
            return True
        if len(letters) >= 7 and (vowels / len(letters) < 0.1 or vowels / len(letters) > 0.8):
            return True
    return False


def random_share(text):
    words = [w for w in WORD_RE.findall(text) if len(w) >= 4]
    return sum(looks_random(w) for w in words) / len(words) if words else 0.0


def check_url(text):
    """Returns (urlparse result, None) or (None, reason)."""
    text = str(text).strip()
    if len(text) > 300:
        return None, "The website address is too long."
    try:
        u = urlparse(text)
        host = (u.hostname or "").lower()
        port = u.port
    except ValueError:
        return None, "That isn't a valid website address."
    if u.scheme != "https" or not host:
        return None, "The website address must start with https://"
    if u.username or u.password:
        return None, "Addresses with a username or password aren't allowed."
    if port not in (None, 443):
        return None, "Custom ports aren't allowed."
    if re.fullmatch(r"[\d.]+", host) or ":" in host:
        return None, "Websites must use a domain name, not a numeric address."
    if "." not in host or host == "localhost" or re.search(r"\.(local|internal|lan|home|localhost)$", host):
        return None, "That address is not a public website."
    if any(label.startswith("xn--") for label in host.split(".")):
        return None, "Look-alike (internationalised) domain names aren't allowed."
    if registrable_domain(host) in SHORTENERS:
        return None, "Link shorteners aren't allowed. Use the real website address."
    return u, None


def brand_checks(name, host):
    out = []
    reg = registrable_domain(host)
    words = [w for w in WORD_RE.findall(name)]
    name_forms = variants(name)
    host_forms = variants(host)
    label_forms = variants(reg.split(".")[0])
    for brand, official in BRANDS.items():
        if reg in official:
            continue
        generic = brand in GENERIC_BRANDS
        word_hit = any(v == brand or near(v, brand) for w in words for v in variants(w))
        name_hit = word_hit if generic else (word_hit or any(brand in v for v in name_forms))
        if generic:
            host_hit = any(v == brand or near(v, brand) for v in label_forms)
        else:
            host_hit = any(brand in v for v in host_forms) or any(near(v, brand) for v in label_forms)
        if name_hit:
            out.append("The name looks like “%s”, but this website isn't one of its official sites." % brand)
        if host_hit:
            out.append("The website address imitates “%s”." % brand)
    return list(dict.fromkeys(out))


def _strip(s):
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]*>", " ", s))).strip()


def parse_page(page):
    info = {"title": "", "site": "", "og": "", "app": "", "h1": ""}
    m = re.search(r"<title[^>]*>([\s\S]*?)</title>", page, re.I)
    if m:
        info["title"] = _strip(m.group(1))[:200]
    for tag in re.findall(r"<meta\b[^>]*>", page, re.I):
        attrs = {k.lower(): (a or b) for k, a, b in re.findall(r"([a-zA-Z:-]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)')", tag)}
        key = (attrs.get("property") or attrs.get("name") or "").lower()
        val = _strip(attrs.get("content", ""))[:200]
        if key == "og:site_name":
            info["site"] = val
        elif key == "og:title":
            info["og"] = val
        elif key == "application-name":
            info["app"] = val
    m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", page, re.I)
    if m:
        info["h1"] = _strip(m.group(1))[:200]
    return info


def name_matches_site(name, host, info):
    signals = [info["title"], info["site"], info["og"], info["app"], info["h1"], host.replace(".", " ")]
    joined = plain(" ".join(signals))
    words = {plain(w) for w in WORD_RE.findall(" ".join(signals))}
    whole = plain(name)
    if whole and whole in joined:
        return True
    tokens = [t for t in (plain(w) for w in WORD_RE.findall(name)) if len(t) >= 3 and t not in NAME_STOPWORDS]
    if not tokens:
        return True
    if any((t in joined) if len(t) >= 4 else (t in words) for t in tokens):
        return True
    label = plain(registrable_domain(host).split(".")[0])
    return bool(label and whole and levenshtein(whole, label) / max(len(whole), len(label)) <= 0.3)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch_page(start, timeout=8):
    """Follow up to 5 redirects by hand, re-checking each hop. Returns (final_url, html) or raises ValueError(reason)."""
    opener = urllib.request.build_opener(_NoRedirect)
    url = start
    for _ in range(5):
        u, why = check_url(url)
        if not u:
            raise ValueError(why)
        try:
            infos = socket.getaddrinfo(u.hostname, 443, proto=socket.IPPROTO_TCP)
        except OSError:
            raise ValueError("The website's address could not be found.")
        if not infos or any(is_private_ip(i[4][0]) for i in infos):
            raise ValueError("The website points to a private network address.")
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (M3TV Store check)", "Accept": "text/html,*/*;q=0.5"})
        try:
            with opener.open(req, timeout=timeout) as resp:
                ctype = resp.headers.get("content-type", "")
                data = resp.read(250_000) if (not ctype or re.search(r"html|xml|text", ctype, re.I)) else b""
                return url, data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308) and e.headers.get("Location"):
                url = urljoin(url, e.headers["Location"])
                continue
            if e.code in (401, 403, 429, 503):
                return url, ""
            raise ValueError("The website doesn't load (error %d)." % e.code)
        except (urllib.error.URLError, OSError, TimeoutError, http.client.HTTPException, UnicodeError):
            raise ValueError("The website did not respond.")
    raise ValueError("The website redirects too many times.")


def verify(name, url, description, fetch=fetch_page):
    """Returns {"status": approved|pending|blocked, "reasons": [...], "flags": [...], "domain": "..."}."""
    reasons, flags = [], []
    name, description = str(name).strip(), str(description).strip()

    def add(lst, text):
        if text not in lst:
            lst.append(text)

    u, why = check_url(url)
    if not u:
        return {"status": "blocked", "reasons": [why], "flags": [], "domain": ""}
    host = u.hostname.lower()
    domain = registrable_domain(host)
    if re.search(r"https?://|www\.|\.(com|net|org|tv|io|xyz|app)\b", name, re.I):
        add(reasons, "Don't put a web address in the app name.")
    for r in brand_checks(name, host):
        add(reasons, r)
    words = WORD_RE.findall(name)
    if any(looks_random(w) for w in words) or (len(words) == 1 and looks_random(name)):
        add(reasons, "The app name looks like random letters. Use the real name of the website.")
    if any(looks_random(p) for p in domain.split(".")[0].split("-")):
        add(reasons, "The website address looks like random characters.")
    if len(description) >= 10 and random_share(description) >= 0.4:
        add(reasons, "The description looks like random text. Describe what the app does.")
    text = name + "\n" + description
    if any(p.search(text) for p in SCAM_TERMS):
        add(reasons, "The name or description uses wording that scams use.")
    if any(p.search(text) for p in REVIEW_TERMS):
        add(flags, "The description mentions content that needs a manual look.")
    if len(re.findall(r"https?://", description, re.I)) > 1:
        add(flags, "The description contains several links.")
    if host.rsplit(".", 1)[-1] in SUSPICIOUS_TLDS:
        add(flags, "This website's domain ending is often used for spam.")

    if not reasons:
        try:
            final, page = fetch(url)
        except ValueError as e:
            add(reasons, str(e))
        else:
            fhost = (urlparse(final).hostname or host).lower()
            if registrable_domain(fhost) != domain:
                add(flags, "The website redirects to a different domain (%s)." % registrable_domain(fhost))
                for r in brand_checks(name, fhost):
                    add(reasons, r)
            info = parse_page(page)
            if not any(info.values()):
                add(flags, "The page could not be read automatically (it may need JavaScript or blocks checks).")
            elif not name_matches_site(name, fhost, info):
                add(reasons, "The app name doesn't match what the website says it is. Use the name the website uses.")
    status = "blocked" if reasons else "pending" if flags else "approved"
    return {"status": status, "reasons": reasons, "flags": flags, "domain": domain}


def verify_safe(name, url, description, limit=25):
    """verify() with a time limit and no crashes: anything odd becomes "pending" (a person looks at it)."""
    import concurrent.futures
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        return pool.submit(verify, name, url, description).result(timeout=limit)
    except concurrent.futures.TimeoutError:
        why = "The website took too long to answer."
    except Exception as exc:  # never let a bad site take the launcher down
        why = "The check could not finish (%s)." % type(exc).__name__
    finally:
        pool.shutdown(wait=False)
    u, bad = check_url(url)
    if not u:
        return {"status": "blocked", "reasons": [bad], "flags": [], "domain": ""}
    return {"status": "pending", "reasons": [], "flags": [why], "domain": registrable_domain(u.hostname)}
