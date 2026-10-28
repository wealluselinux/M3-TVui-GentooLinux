"""Run with:  python3 -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "m3tv"))
import store_check as sc  # noqa: E402


def page(title, extra=""):
    return "<html><head><title>%s</title>%s</head><body><h1>%s</h1></body></html>" % (title, extra, title)


def run(name, url, desc="A nice place to watch things.", html=None, final=None):
    def fetch(u):
        if html is None:
            raise ValueError("The website did not respond.")
        return (final or u), html
    return sc.verify(name, url, desc, fetch=fetch)


class Checks(unittest.TestCase):
    def test_normal_and_real_brand(self):
        self.assertEqual(run("Plex", "https://app.plex.tv", html=page("Plex"))["status"], "approved")
        self.assertEqual(run("Netflix", "https://www.netflix.com", html=page("Netflix - Watch"))["status"], "approved")

    def test_link_shorteners_and_bad_addresses(self):
        for bad in ("https://bit.ly/abc", "https://tinyurl.com/x", "http://example.com", "https://127.0.0.1", "https://localhost",
                    "https://user:pw@example.com", "https://xn--netflx-9ua.com", "not a url", "https://intranet"):
            v = run("Cool App", bad, html=page("Cool App"))
            self.assertEqual(v["status"], "blocked", bad)

    def test_random_strings(self):
        for w in ("xkqzvtw", "asdfgh", "a8f3k2x", "qwertyuiop", "aaaaaa", "bcdfghj"):
            self.assertTrue(sc.looks_random(w), w)
        for w in ("Netflix", "Crunchyroll", "Strengths", "Plex", "Streamflix", "Psychology", "Tubi", "Disney", "Hulu", "Twitch"):
            self.assertFalse(sc.looks_random(w), w)
        self.assertEqual(run("Xkqzvtw", "https://xkqzvtw.example", html=page("Xkqzvtw"))["status"], "blocked")
        self.assertEqual(run("Cool App", "https://cool-app.example", "asdfgh jklqwe zxcvbn qwerty", html=page("Cool App"))["status"], "blocked")
        self.assertEqual(run("Cool App", "https://cool-app.example", "Watch concerts and live music.", html=page("Cool App"))["status"], "approved")

    def test_name_must_relate_to_site(self):
        v = run("Cool Movies", "https://example.com", html=page("Buy Cheap Watches Today"))
        self.assertEqual(v["status"], "blocked")
        self.assertIn("doesn't match", " ".join(v["reasons"]))
        self.assertEqual(run("Streamflix", "https://streamflix.example", html=page("Home"))["status"], "approved")

    def test_brand_imitation(self):
        self.assertEqual(run("Netflix Free", "https://some-site.com", html=page("Netflix Free"))["status"], "blocked")
        for url in ("https://netflix-free.xyz", "https://netf1ix-watch.com", "https://netflix.com.evil.io", "https://netfliks.com", "https://paypa1.com"):
            self.assertEqual(run("My Movies", url, html=page("My Movies"))["status"], "blocked", url)
        self.assertEqual(run("Applesauce Recipes", "https://applesauce-recipes.com", html=page("Applesauce Recipes"))["status"], "approved")

    def test_unreadable_pending_unreachable_blocked(self):
        self.assertEqual(run("Cool App", "https://cool-app.example", html="<div id=root></div>")["status"], "pending")
        self.assertEqual(run("Cool App", "https://cool-app.example", html=None)["status"], "blocked")

    def test_redirect_and_wording(self):
        self.assertEqual(run("Cool App", "https://cool-app.example", html=page("Cool App"), final="https://other-site.example/")["status"], "pending")
        self.assertEqual(run("Cool App", "https://cool-app.example", "Free Netflix account generator", html=page("Cool App"))["status"], "blocked")
        self.assertEqual(run("Cool App", "https://cool-app.example", "Watch movies online for free, no signup needed", html=page("Cool App"))["status"], "pending")

    def test_private_ips(self):
        for ip in ("10.0.0.5", "192.168.1.9", "169.254.169.254", "::1", "::ffff:127.0.0.1"):
            self.assertTrue(sc.is_private_ip(ip), ip)
        self.assertFalse(sc.is_private_ip("93.184.216.34"))


if __name__ == "__main__":
    unittest.main()
