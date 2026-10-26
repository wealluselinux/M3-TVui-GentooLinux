# M3 TV UI

A Material You (Material Design 3) launcher made for TVs and mouse control, laid out like a modern TV home screen: a big banner for the app you are pointing at, rows of landscape cards (YouTube, Netflix, Disney+ and more), and a status bar with weather, network and the time. Click a card and the service opens full screen in Firefox.

It works on any Linux distro. Gentoo is the primary target and has the most detailed steps below.

## How it works

- `m3tv` runs a tiny local server (Python standard library only, nothing to `pip install`).
- The launcher itself is a web page shown in a Firefox kiosk window.
- Clicking a tile opens that service in a full-screen Firefox window.
- **Your logins come with you.** By default m3tv opens apps with your own Firefox profile, so you stay signed in to Netflix, Disney+, YouTube and the rest. Extensions and Widevine (DRM) come from that profile too. Because a profile can only be used by one Firefox at a time, **close your regular Firefox before opening an app**. m3tv tells you if it is still open. You can switch to a separate, empty profile in Settings.
- The **YouTube** tile opens `youtube.com/tv`, the TV interface, using a smart-TV user agent. This is experimental. It runs in a helper profile that gets a fresh copy of your cookies each time you open it, so you stay signed in. If the TV interface misbehaves with a mouse, remove it and use a **YouTube TV** (`tv.youtube.com`, the live TV service) tile or add the normal `youtube.com` with the **+** button.
- **Ctrl+X takes you home.** While an app is open, Ctrl+X closes it and shows the launcher again (details below).

## Install on Gentoo

```sh
# 1. Dependencies. firefox-bin is recommended because it ships ready to play DRM video.
sudo emerge --ask --noreplace www-client/firefox-bin dev-lang/python

# 2. Install m3tv for your user
git clone https://github.com/wealluselinux/M3-TVui-GentooLinux
cd M3-TVui-GentooLinux
./install.sh --no-deps

# 3. Start it from a terminal, or open "M3 TV" from your app menu
m3tv
```

Or let the script install the dependencies for you: `./install.sh`.

The installer also adds **M3 TV** to your application menu (with an icon and "Go back to the launcher" / "Close M3 TV" right-click actions). If it does not show up straight away, log out and back in, or run `update-desktop-database ~/.local/share/applications`.

Gentoo notes:

- If you build `www-client/firefox` from source instead, `m3tv` finds it too (it looks for `firefox`, `firefox-bin`, `firefox-esr` and `librewolf`). DRM needs a glibc system. Musl profiles cannot run Widevine.
- The first time you open Netflix or Disney+, Firefox downloads the Widevine module if your profile does not have it yet. The TV needs internet for that, and you may need to reload the page once.

## Other distros

`./install.sh` detects your distro and installs Python 3 and Firefox if they are missing.

| Distro | Firefox package | Notes |
| --- | --- | --- |
| Gentoo | `www-client/firefox-bin` | Recommended |
| Arch / Manjaro / EndeavourOS | `firefox` | |
| Debian | `firefox-esr` | |
| Ubuntu | Mozilla's apt repo | The Ubuntu snap build cannot use m3tv's profile folders |
| Fedora / RHEL | `firefox` | |
| openSUSE | `MozillaFirefox` | |
| Alpine | `firefox` | musl: YouTube and normal sites work, Widevine DRM does not |
| Void | `firefox` | |

Flags: `--no-deps` (skip package installs), `--uninstall`.

## Using it

| Command | What it does |
| --- | --- |
| `m3tv` | Start the launcher in a kiosk window |
| `m3tv home` | Close the open app and show the launcher |
| `m3tv launch netflix` | Open an app directly by id |
| `m3tv quit` | Close everything |
| `m3tv serve` | Serve the UI only, so you can open `http://127.0.0.1:8787` in any browser |
| `m3tv doctor` | Check Python, Firefox, your profile, the hotkey and Widevine |

In the launcher:

- **For you** is the home screen. The banner shows the app you are pointing at (or the one you opened last), the page colour glides to match it, and rows underneath hold **Recently opened** plus your apps in groups.
- **Apps** lists everything in a grid, with **Edit** (remove apps) and **Add app**.
- Click a card to open it. Arrow keys and Enter work too (handy with a remote or keyboard).
- The top bar shows the **weather**, **network** (Wi-Fi bars, a wired icon, or a slashed icon when you are offline) and the **time**. The buttons in the top-right corner open **Settings** and exit.
- Your own apps join the **Your apps** row. Set `"group"` on an app in the config to put it in a row of its own.
- **Settings** has the theme colour, weather location, temperature unit, TV scale and the sign-in mode. For weather, type a city such as `Detroit, Michigan` and press Set. Weather comes from [Open-Meteo](https://open-meteo.com), which needs no account.

### Updating, reinstalling, uninstalling

Three scripts live next to `install.sh`:

| Script | What it does |
| --- | --- |
| `./update.sh` | Pulls the newest version from GitHub and installs it. Shows what changed. Your settings and logins are kept. `--force` reinstalls even if you are current, `--restart` reopens the launcher afterwards. |
| `./reinstall.sh` | Removes M3 TV and installs it again from this folder. `--clean` also resets your settings, cached logos and helper profiles. |
| `./uninstall.sh` | Removes M3 TV and its menu entry. `--purge` also deletes settings, cached logos and helper profiles (it asks first, or pass `--yes`). |

You can run `update.sh` from your clone of the repo. If the clone was deleted, `update.sh` downloads a fresh copy into `~/.local/share/m3-tvui/src`. Your regular Firefox profile is never touched by any of them. If `update.sh` says your clone has local changes, run `git stash` inside the clone and try again.

### Ctrl+X: back to the launcher

Firefox in kiosk mode swallows key presses, so m3tv registers the hotkey with your window manager while an app is open and removes it again when you are home.

- **Hyprland** and **sway**: automatic. Nothing to configure.
- **KDE Plasma:** System Settings, Keyboard, Shortcuts, add a custom shortcut for the command `m3tv home` on Ctrl+X.
- **GNOME:** Settings, Keyboard, Custom Shortcuts, command `m3tv home`, shortcut Ctrl+X.
- Other desktops: bind `m3tv home` to any key in your window manager.

While an app is open, Ctrl+X no longer cuts text inside it. To use another key, set `"home_hotkey"` in the config (for example `"super+escape"`), or bind `m3tv home` yourself.

A mouse side button works too. For Hyprland, add `bind = , mouse:275, exec, m3tv home` to `hyprland.conf`.

### Logos

Each tile shows the site's own icon. m3tv downloads it from the site the first time it runs (the largest apple-touch-icon or favicon it can find) and caches it in `~/.local/share/m3-tvui/icons`. Nothing is bundled in this repo. Favicons can be small and look soft on a big TV, and a site that blocks the download shows a coloured letter instead.

For a sharper logo, drop your own image into `~/.config/m3-tvui/logos/` named after the app id, for example `netflix.png`, `disney.svg` or `youtube.webp` (`png`, `svg`, `webp`, `jpg` and `ico` work). Your file always wins over the downloaded one. App ids are the `"id"` values under `"services"` in the config file.

## Configuration

Settings live in `~/.config/m3-tvui/config.json` (`m3tv config-path` prints the location). The UI edits it for you, but you can change it by hand:

```json
{
  "port": 8787,
  "hue": 285,
  "scale": 1.0,
  "browser": null,
  "home_hotkey": "ctrl+x",
  "profile_mode": "firefox",
  "firefox_profile": null,
  "weather": {"name": "Detroit, Michigan", "lat": 42.33, "lon": -83.05},
  "units": "auto",
  "recent": [],
  "services": []
}
```

- `browser`: set a custom command, for example `"/usr/bin/firefox-bin"`. You can also use the `M3TV_BROWSER` environment variable.
- `profile_mode`: `"firefox"` uses your own profile, `"separate"` keeps m3tv's own profiles in `~/.local/share/m3-tvui/profiles`.
- `firefox_profile`: full path to a specific Firefox profile folder if the automatic choice is wrong. By default m3tv reads `profiles.ini` (regular, Flatpak and snap locations).
- `scale`: use 1.5 or 2.0 on a 4K TV if text is too small. Restart the launcher to apply it.
- `units`: `"auto"`, `"f"` or `"c"`.

## Security

The server only listens on `127.0.0.1`. Every action needs a custom header, a matching `Host` and `Origin`, so other web pages open in a browser on the same machine cannot control it. m3tv never writes to your Firefox profile; for the YouTube TV helper profile it copies cookies and saved logins out of it, nothing goes back in.

## Project layout

```
install.sh          multi-distro installer, adds the app menu entry
update.sh           update from GitHub
reinstall.sh        remove and install again (--clean to reset settings)
uninstall.sh        remove everything (--purge to include settings)
m3tv/m3tv.py        launcher, local server, hotkey and CLI
m3tv/icon.svg       app menu icon
m3tv/web/           the Material 3 interface (HTML, CSS, JS)
m3tv/web/fonts/     Google Sans Flex (SIL Open Font License), bundled so it works offline
```
