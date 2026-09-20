
#THIS IS JUST THE STUDIO PROJECT>> EVERYTHING IS COMPLETE<< IGNORE THIS

# Be a Maker — Android wrapper

This project embeds your `web/` Node.js server directly inside an Android app
using [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) (a real
Node.js runtime built as a native Android library), and shows a WebView
pointed at the server once it's up. Your `server.js`, `lib/`, and `public/`
files are already copied into `app/src/main/assets/nodejs-project/`.

You'll need three things before this builds: Node modules installed,
the nodejs-mobile native library, and Android Studio itself.

## 1. Install Android Studio

Download from https://developer.android.com/studio and install with default
options (it bundles the Android SDK, an emulator, and Gradle).

## 2. Install your npm dependencies into the assets folder

I couldn't run `npm install` myself (no network access in my sandbox), so do
this on your machine, from this project's root:

```bash
cd app/src/main/assets/nodejs-project
npm install --omit=dev
```

This installs `express`, `ws`, `lottie-web`, and `rom-control` (all pure
JavaScript — no native compilation needed) directly into that folder, so
they get bundled into the APK and copied to the device at first launch.

## 3. Download the nodejs-mobile native library

1. Go to https://github.com/nodejs-mobile/nodejs-mobile/releases and download
   the latest **`nodejs-mobile-android-*.zip`** (Node 18 LTS build at time of
   writing; any recent Android build works).
2. From the zip:
   - Copy the `include/` folder to `app/libnode/include/` so you end up with
     `app/libnode/include/node/node.h`.
   - Copy the `bin/` folder's contents to `app/libnode/bin/`, matching:
     - `app/libnode/bin/arm64-v8a/libnode.so`
     - `app/libnode/bin/armeabi-v7a/libnode.so`
     - `app/libnode/bin/x86_64/libnode.so`
   - Delete the placeholder `copy-libnode.so-here` / `copy-node-headers-here`
     files I left in those folders — they're just markers.
3. If the release only includes some of those ABIs, edit the `abiFilters`
   list in `app/build.gradle` to match what you actually copied in.

## 4. Open and build in Android Studio

1. Open Android Studio → **Open** → select this project's root folder.
2. Let it sync Gradle (first sync downloads dependencies — needs internet).
   It will prompt to install **CMake** and the **NDK** if missing — accept.
3. Plug in an Android phone (with USB debugging on) or start an emulator.
4. Click the green **Run ▶** button, or use
   **Build → Build Bundle(s) / APK(s) → Build APK(s)** to get an installable
   `.apk` file (found under `app/build/outputs/apk/`).

## How it works

- `MainActivity.java` copies `assets/nodejs-project` into the app's private
  storage on first run (Node can't execute code straight out of the APK),
  then starts the Node runtime via a small JNI bridge (`native-lib.cpp`)
  that calls `node::Start()` directly — this is the standard nodejs-mobile
  pattern, not a hack.
- Your `server.js` starts its HTTP + WebSocket server on `127.0.0.1:5173`
  exactly like it does on a desktop.
- `MainActivity` polls `http://127.0.0.1:5173/` in the background until it
  responds, then shows a `WebView` pointed at that URL.
- `android:usesCleartextTraffic="true"` is set because your server talks
  plain HTTP both to itself (loopback) and to robots on the LAN — this is
  appropriate for a local-network tool like this, not for hitting arbitrary
  internet sites.

## Known gaps

- `server.js` still expects a root-level `splash.png` (for the `/splash.png`
  route) one level above `nodejs-project`. Neither `assets.zip` nor
  `res.zip` contained a bare `splash.png` at that level (only nested copies
  inside `res/mipmap-*/splash.png`), so that one route will 404 until you
  add `app/src/main/assets/splash.png` yourself — everything else, including
  `/apk/assets/*`, `/apk/mipmap/*`, `/apk/drawable/*`, and `/apk/raw/*`,
  is now wired up.
- `assets/` and `res/` are copied to the device as siblings of
  `nodejs-project` (matching how `server.js` resolves `REPO`), so all three
  get copied to internal storage together on first run / after an APK
  update. This roughly doubles first-launch copy time and adds ~31MB to
  the APK — fine for local use, just don't expect an instant first boot.
- Logs from Node (`console.log`/`console.error`) show up in Android Studio's
  **Logcat** panel under the tag `BEAMAKER-NODE`; WebView JS console messages
  show up under `BeAMaker`.

## Troubleshooting

- **"Could not start the local server"** on screen → check Logcat for
  `BEAMAKER-NODE` errors (often a missing `node_modules` because step 2 was
  skipped, or a JS error in `server.js`).
- **CMake/NDK errors on first sync** → Android Studio usually offers an
  "Install missing SDK components" link right in the error message.
- **App crashes immediately with `UnsatisfiedLinkError`** → the ABI of your
  device/emulator doesn't have a matching `libnode.so` in `app/libnode/bin/`
  — re-check step 3.
