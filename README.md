## VN Ultra v5: fresh installation URL

If Nuvio still shows v4.0.0 and 65 duplicated providers, delete the old VN repository and install this **different manifest URL** under Plugins:

`https://raw.githubusercontent.com/vinaytiwari-rk/VN-REPO/main/v5/manifest.json`

This v5 manifest uses absolute URLs for all provider scripts and has 45 deduplicated providers (35 upstream-enabled at release). The root manifest also reports v5, but reusing its old URL may retain an old cached repository. A successful install does not establish that every provider returns playable streams.

# VN-REPO — Nuvio setup

## Want a larger movie and TV provider selection?

The VN manifest contains **three VN-maintained experimental public/open-video providers** plus, after the bundling workflow succeeds, locally bundled upstream provider scripts. It is NOT a broad Hollywood/Bollywood/TV catalog, and GitHub CI success does not prove in-app playback.

For a substantially larger, independently maintained provider collection, the upstream community source is also available separately (but the automated VN bundle means a second installation is not required once the generated manifest has been committed):

```text
https://raw.githubusercontent.com/yoruix/nuvio-providers/refs/heads/main/manifest.json
```

Source, installation guide, code and licensing: https://github.com/yoruix/nuvio-providers

The community repository is maintained by its own authors. Its individual providers may break, require authentication, be unavailable in your region, or expose content without appropriate distribution rights. Choose providers and content for which you have authorized access. VN-REPO bundles the upstream GPL-3.0 source files with their original LICENSE files and attribution under upstream/. Their live playback is not guaranteed.

## Additional upstream Nuvio repositories for Android Mobile

These independently maintained Nuvio JavaScript plugin repositories are **bundled automatically into the main VN manifest** by the GitHub Actions workflow. They may also be installed separately if the bundle is unavailable. The app supports multiple repository manifests; VN-REPO includes GPL-3.0 upstream provider scripts and their original licenses, without claiming upstream-enabled providers are playback-tested.

- Yoru's Repo: `https://raw.githubusercontent.com/yoruix/nuvio-providers/refs/heads/main/manifest.json`
- Tapframe's Repo: `https://raw.githubusercontent.com/iberiaimm/nuvio-providers/refs/heads/main/manifest.json`

After the bundling workflow completes, install only the VN manifest via **Settings > Plugins > Add Repository**, refresh, then enable the providers you trust. These are **Plugins**, not Stremio **Addons** or native CloudStream Kotlin repositories. Provider availability, licensing, and actual playback must be verified on your own Android build. The weekly `Discover upstream Nuvio provider repositories` workflow generates an inventory artifact showing the providers upstream currently lists and enables; it does not install them on your device.

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

## Important: native CloudStream extension support on Nuvio Android TV full builds

The NuvioTV **dev** source now includes an `ExternalRepoParser`, `ExternalExtensionLoader`, and `ExternalExtensionRunner` for CloudStream-format `repo.json` and compiled extension packages. On a compatible **Android TV full** build, use its **external/CloudStream repository** feature to add original upstream repository manifests directly, without rewriting every Kotlin provider as JavaScript. Availability in a public release, mobile Android build, and individual extension playback must be checked on the actual installed build. Do **not** paste CloudStream `repo.json` into the Nuvio JavaScript Plugins field.

Verified upstream repo manifests:

- Indflix: https://raw.githubusercontent.com/dipender98/Indflix/main/repo.json
- Recloudstream extensions: https://raw.githubusercontent.com/recloudstream/extensions/master/repo.json

These are upstream external-extension repositories, **not** VN Nuvio JavaScript plugins. They are not automatically enabled, endorsed, licensed for redistribution, or playback-verified. Some providers require authentication, use unsupported WebView/Android APIs, or serve content without authorization. Only access content you have rights to watch.

NuvioTV implementation: https://github.com/NuvioMedia/NuvioTV/tree/dev/app/src/full/java/com/nuvio/tv/core/plugin/cloudstream
