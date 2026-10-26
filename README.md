# M3 TV UI

A Material You (Material Design 3) launcher made for TVs and mouse control. Big tiles for YouTube, Netflix, Disney+ and more. Click one and it opens full screen in Firefox.

It works on any Linux distro. Gentoo is the primary target and has the most detailed steps below.

## How it works

- `m3tv` runs a tiny local server (Python standard library only, nothing to `pip install`).
- The launcher itself is a web page shown in a Firefox kiosk window.
- Clicking a tile opens that service in its own Firefox kiosk window with its own profile, so logins are remembered and Widevine (DRM) works for Netflix, Disney+, Prime Video and others.
- The **YouTube** tile opens `youtube.com/tv`, the TV interface, using a smart-TV user agent. This is experimental. If it misbehaves with a mouse, use the **YouTube Classic** tile (the normal site). **YouTube TV** is the live TV subscription at `tv.youtube.com`.
- To get back to the launcher, run `m3tv home` or bind it to a key or mouse button (see below).

## Install on Gentoo

```sh
# 1. Dependencies. firefox-bin is recommended because it ships ready to play DRM video.
sudo emerge --ask --noreplace www-client/firefox-bin dev-lang/python

# 2. Install m3tv for your user
git clone https://github.com/wealluselinux/M3-TVui-GentooLinux
cd M3-TVui-GentooLinux
./install.sh --no-deps

# 3. Start it
m3tv
```

Or let the script install the dependencies for you: `./install.sh`.

Gentoo notes:

- If you build `www-client/firefox` from source instead, `m3tv` finds it too (it looks for `firefox`, `firefox-bin`, `firefox-esr` and `librewolf`). DRM needs a glibc system. Musl profiles cannot run Widevine.
- The first time you open Netflix or Disney+, Firefox downloads the Widevine module into the `web` profile. The TV needs internet for that, and you may need to reload the page once.

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
| `m3tv doctor` | Check Python, Firefox and Widevine |

In the launcher:

- Click a tile to open it. Arrow keys and Enter work too (handy with a remote or keyboard).
- The **+** button adds your own site, and the pencil lets you remove tiles.
- The sliders button changes the theme colour and the TV scale.

### Getting back with only a mouse

Kiosk windows have no buttons, so bind `m3tv home` to something you can reach.

**Hyprland** (`hyprland.conf`), using the mouse side button:

```
exec-once = m3tv
bind = , mouse:275, exec, m3tv home
bind = SUPER, Escape, exec, m3tv home
```

**sway** (`config`):

```
exec m3tv
bindsym --whole-window button9 exec m3tv home
bindsym $mod+Escape exec m3tv home
```

**KDE Plasma:** System Settings, Shortcuts, add a custom shortcut that runs `m3tv home`.

**GNOME:** Settings, Keyboard, Custom Shortcuts, command `m3tv home`.

## Configuration

Settings live in `~/.config/m3-tvui/config.json` (`m3tv config-path` prints the location). The UI edits it for you, but you can change it by hand:

```json
{
  "port": 8787,
  "hue": 285,
  "scale": 1.0,
  "browser": null,
  "services": []
}
```

- `browser`: set a custom command, for example `"/usr/bin/firefox-bin"`. You can also use the `M3TV_BROWSER` environment variable.
- `scale`: use 1.5 or 2.0 on a 4K TV if text is too small. Restart the launcher to apply it.
- Browser profiles are stored in `~/.local/share/m3-tvui/profiles` (`launcher`, `web`, `tv`). Delete a folder to sign out of everything in that profile.

## Security

The server only listens on `127.0.0.1`. Every action needs a custom header, a matching `Host` and `Origin`, so other web pages open in a browser on the same machine cannot control it.

## Project layout

```
install.sh        multi-distro installer
m3tv/m3tv.py      launcher, local server and CLI
m3tv/web/         the Material 3 interface (HTML, CSS, JS)
```
