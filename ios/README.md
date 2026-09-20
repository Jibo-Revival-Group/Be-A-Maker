# Be a Maker iOS app

This directory contains the native iOS shell for the existing Node/Express app in `../web`.

## Architecture

- `BeAMakerApp` starts an embedded Node.js runtime on `127.0.0.1:5173`.
- `NodeServerController` launches `web/server.js` from the bundled web root.
- `WebViewController` presents the web app in an edge-to-edge `WKWebView`.
- `build-web-bundle.sh` preserves the directory layout expected by `web/server.js` (`web/`, `assets/`, `res/`, and `splash.png`).

An IPA cannot be committed to source control or built by GitHub's file API: it must be built on macOS with Xcode, an Apple signing identity, and a provisioning profile. This project uses the [Node.js for Mobile](https://github.com/janeaustin/nodejs-mobile) iOS framework. Add its xcframework to the Xcode target as described below.

## Build

1. Install Xcode 15 or newer and CocoaPods.
2. Add the `NodeMobile.xcframework` supplied by Node.js for Mobile to the app target and link its iOS slice.
3. Create an iOS App target named `BeAMaker` with bundle identifier `org.jibo.revival.beamaker`.
4. Add all files in `ios/BeAMaker` to the target, plus the generated `ios/EmbeddedApp` directory as a folder reference.
5. Run the bundle preparation script from the repository root:

   ```sh
   ./ios/build-web-bundle.sh
   ```

6. Set the target's Info.plist to `ios/BeAMaker/Info.plist` and enable the `ios/BeAMaker/BeAMaker.entitlements` file.
7. Build and archive in Xcode, then export an ad-hoc or development IPA using your own signing credentials.

The Node runtime and npm dependencies are intentionally not checked in. The script runs `npm ci --omit=dev` inside the copied `web` directory, so the resulting app contains the exact server dependencies required by `web/server.js`.

## Local Network

The app requests Local Network access because the web server connects to Jibo on the same LAN. iOS may show the permission prompt on first connection.
