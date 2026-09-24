# VN-REPO — Nuvio setup

## Want a larger movie and TV provider selection?

The VN manifest below currently has **three experimental public/open-video providers**. It is NOT a broad Hollywood/Bollywood/TV catalog, and GitHub CI success does not prove in-app playback.

For a substantially larger, independently maintained provider collection, install the **upstream community repository separately** in Nuvio's **Plugins** screen (do not paste it into Addons):

```text
https://raw.githubusercontent.com/yoruix/nuvio-providers/refs/heads/main/manifest.json
```

Source, installation guide, code and licensing: https://github.com/yoruix/nuvio-providers

The community repository is maintained by its own authors. Its individual providers may break, require authentication, be unavailable in your region, or expose content without appropriate distribution rights. Choose providers and content for which you have authorized access. VN-REPO does not copy or bundle upstream GPL-3.0 provider code and does not claim to test or maintain that repository.

## VN experimental public-video repository

```text
https://raw.githubusercontent.com/vinaytiwari-rk/VN-REPO/main/manifest.json
```

Enabled: PeerTube public videos, Internet Archive explicitly open-licensed MP4, Wikimedia Commons openly licensed MP4. Matching a commercial movie title is unlikely. Disabled legacy providers contain unverified embed-page URLs and should not be enabled.

## Install and troubleshoot

1. Use a Nuvio build with **Plugins** support. Some app-store builds do not include it.
2. In Nuvio, open **Settings > Plugins > Add Repository**, paste **one** manifest URL, refresh, and enable the desired providers.
3. For the separate Stremio-compatible **Addons** system, use only the configured manifest URL provided by an addon service in **Addons**, not a Nuvio plugin manifest.
4. Test one movie and one TV episode in the actual app. A source appearing in search is not proof it will play. Check native-player playback, audio, subtitles, and buffering. Disable broken providers.
5. Do not interpret GitHub Actions' mocked API fixtures as a live source or playback test.

See the upstream developer guide: https://github.com/yoruix/nuvio-providers
