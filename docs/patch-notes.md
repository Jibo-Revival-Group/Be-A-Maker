# Patch notes: Be a Maker login bypass

Technical walkthrough of the app's boot/auth/pairing flow, what we patched, and where we got stuck. Written for anyone at JRG who wants to pick this up without re-tracing the smali from scratch.

## App identity

- Package: `com.everis.jibo.app.beamaker`
- Built by Everis for Jibo Inc. ("Be a Maker" — companion app, ROM/skill development + pairing)
- Bundles a closed-source SDK under `com.jibo.apptoolkit.*` (auth, robot model, low-level protocol/`CommandLibrary`)

## The boot flow (stock app)

```
SplashActivity
  -> SplashPresenterImpl.onResume()
       -> GettingJibosUseCase.isAuthenticated()   // just picks a UI delay branch, doesn't gate anything
       -> GettingJibosUseCase.run()
            -> GettingJibosRepositoryImpl.getJibos()
                 -> JiboRemoteControl.signIn(activity, listener)   // <-- opens WebView to Jibo's dead login server
```

`isAuthenticated()` is a red herring — both the "authenticated" and "not authenticated" branches in `SplashPresenterImpl.onResume()` end up calling the same `run()` ? `getJibos()` path a few hundred ms apart. The real wall is `signIn()`, which unconditionally launches a WebView pointed at Jibo's cloud OAuth-ish login server. That server is gone, so this is where stock installs die.

## What we patched

`GettingJibosRepositoryImpl.getJibos()` originally always called:

```smali
invoke-virtual {v1, p2, p0}, Lcom/jibo/apptoolkit/android/JiboRemoteControl;->signIn(...)V
```

We replaced the entire method body to skip straight to the app's own **already-existing "no linked Jibo" success path**:

```smali
invoke-interface {p1}, ...GetJibosCallback;->onGettingJibosTransactionSuccessWithoutJibo()V
```

This callback already existed in the original app (`onGettingJibosTransactionSuccessWithoutJibo()` ? constructs an empty `ArrayList<Robot>` ? `presenterGettingJibosTransactionSuccess(emptyList)` ? `startJiboConnect(emptyList)` ? launches `PairingActivity`). We didn't invent new behavior — we just short-circuited straight to a path the app already had for "you have no robots on your account."

**Result:** the app boots straight past login into `PairingActivity`. No crash, no cloud calls (confirmed via mitmproxy + PCAPdroid, both saw zero traffic on connect attempts).

## Where it currently stalls

`PairingActivity.onInit()` reads its robot list directly from the launching Intent's extras — it does **no live network/mDNS discovery of its own**:

```smali
invoke-virtual {v2, v3}, Landroid/content/Intent;->getParcelableArrayListExtra(...)  # key = Robot::class.java.name
```

Since we hand it an empty list, the fragment shows nothing and eventually surfaces "We couldn't find a Jibo to connect to" (`showConnectError()`).

### The actual connect path (once a Robot exists)

```
PairingPresenterImpl.connectJibo(robot)
  -> ConnectingJiboUseCase.run()
       -> ConnectingJiboRepositoryImpl.getConnect(robot, callback)
            -> RomCommanderData.jiboConnect(robot, callback)
                 -> JiboRemoteControl.connect(robot, listener)
                      -> spawns a Thread running com.jibo.apptoolkit.android.c  (obfuscated, proguarded — no symbols)
```

`com.jibo.apptoolkit.android.c` is the actual "RomSdkConnectionManager" (name inferred from the `JiboRemoteControl` companion getters — `getMRomSdkConnectionManager`). This is where the real local-vs-cloud connection logic lives, and it's fully proguard-stripped. We have **not** reverse-engineered this class yet.

`Robot` itself is a simple 3-field model (`id`, `name`, `robotName` — all `String`, see `com.jibo.apptoolkit.android.model.api.Robot`). No IP/host field on the model itself, so if there's a local-network target, it's resolved inside class `c` by some other means (maybe `id` maps to an mDNS service name, maybe something else).

## Open questions / next steps for whoever picks this up

1. **Does JiboOS (community OS) even speak the same wire protocol `class c` expects?** This app predates JiboOS. If JiboOS's local API differs from the original Jibo firmware's remote-control protocol, this whole app-patching approach may be moot — a JiboOS-native integration might be the better investment.
2. If the protocol is the same: what does a `Robot.id` need to look like for `class c` to find/target the device locally? (Serial number? Some other identifier?) This needs disassembly of `com.jibo.apptoolkit.android.c` — genuinely tedious given zero proguard symbols, but doable with careful cross-referencing against `JiboRemoteControl`'s companion object accessors.
3. Alternative to (2): a live packet capture *during* an actual `connectJibo()` attempt (not just the pairing-list stage we captured) — populate a dummy `Robot` first (even with a bogus ID) so the "Connect" button is reachable, then capture what `class c` tries to send. Even a failed/rejected connection attempt would show us the target format.

## Files in this repo

- `smali/` — apktool decompile, including the patched `GettingJibosRepositoryImpl.smali` described above
- `res/`, `assets/`, `unknown/`, `AndroidManifest.xml`, `apktool.yml` — the rest of the apktool project (needed to rebuild)
- `original/` — apktool's copy of the stock APK's binary manifest and Play signing metadata, **not** a second full decompile
- `docs/patch-notes.md` — this walkthrough

Rebuild with `apktool b .`. A signed APK is not stored in git.

## Credit

Patch identification and smali authored in collaboration with Claude (Anthropic); all decompiling, on-device testing, and patch application done locally by the repo maintainer.

## Building the patched APK (legacy)

Revive-A-Maker's apps are built from `web/` instead (see the README). The patched stock APK is kept as an apktool
project at the repo root:

```bash
apktool b . -o dist/beamaker_patched.apk
apksigner sign --ks your.jks dist/beamaker_patched.apk
```

Known issues: `getJibos()` returns an empty robot list, so `PairingActivity` shows "We couldn't find a Jibo to
connect to" until it is given a real `Robot(id, name, robotName)`; and whether the closed `JiboRemoteControl.connect()`
can reach a robot locally is unconfirmed.
