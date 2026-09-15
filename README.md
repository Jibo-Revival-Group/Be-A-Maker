# Be a Maker Revived
<img src="splash.png">

A patched build of Jibo's official Be a Maker companion app (`com.everis.jibo.app.beamaker`), modified to skip the cloud-based sign-in flow that Jibo's original servers required. Jibo Inc.'s cloud backend was shut down in 2019, which permanently broke sign-in for the stock app — this patch lets the app boot straight into local pairing instead of hanging at a dead login screen.

This is a Jibo Revival Group preservation project. It is not affiliated with Jibo Inc. or NTT Disruption.

## Status
Web App is complete

Android app is complete, not based off of the direct decompilation as planned, but on the "web/" Node server.
[Known issues](#known-issues) 

iOS app is being developed by immmvic

## What was changed

The following does not apply to the new app or the new web app.

The patch targets `GettingJibosRepositoryImpl.getJibos()`, which originally always called Jibo's (now-dead) cloud sign-in SDK (`JiboRemoteControl.signIn()`). The patched version skips that call and instead immediately fires the app's own built-in "no Jibo account" success path (`onGettingJibosTransactionSuccessWithoutJibo()`), which the original app already used for users with no linked robot. This routes straight to `PairingActivity` instead of the dead login WebView.

The modified bytecode is in `smali/`. For the full boot/auth/pairing walkthrough, see [docs/patch-notes.md](docs/patch-notes.md).

## Repo layout

This repo **is** an [apktool](https://apktool.org) project, kept at the root so `apktool b .` works:

| Path | What it is |
| --- | --- |
| `smali/` | Decompiled Dalvik bytecode (the patch lives here) |
| `res/`, `assets/`, `unknown/` | Decoded resources and extra APK entries |
| `AndroidManifest.xml`, `apktool.yml` | apktool project metadata |
| `original/` | Stock APK binary manifest + Play signing metadata (not a second full decompile) |
| `docs/` | Technical patch notes |
| `web/` | Browser Be a Maker (pair by IP + Scratch) |
| `license` | BSD 3-Clause |

Rebuild output (`build/`, `dist/`, `*.apk`) is gitignored.

## Known issues

The following does not apply to the new app or the new web app.


- Since `getJibos()` now returns an empty robot list, `PairingActivity` currently shows "We couldn't find a Jibo to connect to" — the list needs to be populated with a real `Robot(id, name, robotName)` object for pairing to proceed.
- Whether the underlying `JiboRemoteControl.connect()` call (a closed, obfuscated class in the bundled apptoolkit SDK) can complete locally against a robot — especially one running the community JiboOS — is still unconfirmed. This may require further reverse-engineering.

## Web app (pair by IP)

The following does not apply to the new Android app.


The Android SDK cannot run in a browser. `web/` is a local companion: pairing with a typed robot IP, then the original Scratch playground talking to ROM.

The computer running Node must be on the same LAN as the robot. ROM must be listening (developer / int-developer). The app tries port **7160** first (stock Be a Maker), then **8160** (community `rom-control`).

```bash
cd web
npm install
npm start
```

Open `http://127.0.0.1:5173`, enter the robot IP, then CONNECT. Scratch projects are stored in the browser (`localStorage`), not in the APK.

## Building the Android APK

The following does not apply to the new app or the new web app.

```bash
apktool b . -o dist/beamaker_patched.apk
apksigner sign --ks debug.jks dist/beamaker_patched.apk
```

You need your own keystore (`debug.jks` is not in this repo). Create one with `keytool` if you do not already have one.

A sideloadable APK is stored in git, however it may be very out of date. Rebuild locally, or attach a build to a GitHub Release.

## Credit / Disclaimer

The smali patching and analysis in this repo were done in collaboration with Claude (Anthropic), Gemni (Google), and ChatGPT (OpenAI)— the person maintaining this repo did the actual decompiling, device testing, and patch application locally; the AIs helped identify the relevant code paths and write the patches based on smali the maintainer provided.

This project exists to preserve hardware that owners already have, made necessary by the shutdown of Jibo Inc.'s servers.

See [`license`](license) for the BSD 3-Clause terms.
