# Revive-A-Maker for Android

Runs the web app's Node server (`../../web`) inside the app with [nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile)
(`app/libnode/`) and shows it in a WebView. `app/build.gradle` installs the server's npm modules and copies `web/`,
the stock `assets/` and `res/`, and `splash.png` into the APK at build time, so there is one copy of each in the repo.

Build with Android Studio, or `./gradlew assembleRelease` (needs Node.js and npm). CI signs release builds with the
5x1 key from the repository secrets; local builds use the debug key.
