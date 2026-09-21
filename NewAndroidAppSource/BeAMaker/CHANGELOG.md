# Changelog

All notable changes to the **Be a Maker** project will be documented in this file.

## [1.4.0] - 2025-05-22

### Removed
- **Wi-Fi Connectivity Banner**: Removed the red notification banner that displayed when the device was not connected to Wi-Fi, to streamline the UI.

## [1.3.0] - 2025-05-22

### Added
- **Exactly 20 New Features** (Android System Layer):
    1.  **Modern Splash Screen API**: Implemented `androidx.core:splashscreen` for a seamless launch experience.
    2.  **Adaptive App Theming**: Added a custom DayNight theme with specialized dark mode support.
    3.  **Keep Screen On (Wakelock)**: Prevented the device from sleeping during robot operation.
    4.  **Hardware Acceleration**: Explicitly enabled GPU acceleration for complex Scratch animations.
    5.  **Orientation Enforcement**: Optimized manifest for landscape-first operation.
    6.  **Static App Shortcuts**: Added a "Playground" launcher shortcut for quick access.
    7.  **Portrait Lock UX**: Enhanced the overlay that handles orientation mismatch.
    8.  **Double-Tap Back to Exit**: Prevents accidental closure of the app via the back button.
    9.  **Real-time Connectivity Monitoring**: Added a UI banner that detects and warns about Wi-Fi loss.
    10. **Low Battery Awareness**: Detects low battery states (<15%) and warns the user.
    11. **Custom User-Agent Branding**: Appended "BeAMaker-Android" to the web request headers.
    12. **WebView Zoom Controls**: Enabled built-in pinch-to-zoom for the playground interface.
    13. **About & Versioning Dialog**: Added a hidden dialog (long-press loading text) showing version info.
    14. **Build Environment Indicators**: Visually distinguishes between Debug and Release builds.
    15. **Auto-Recovery**: WebView now automatically attempts to reload the server UI if a load error occurs.
    16. **Debug Cache Auto-Clear**: Automatically wipes WebView cache on startup in Debug mode to ensure fresh assets.
    17. **Deep Link Integration**: Added support for the `beamaker://playground` URI scheme.
    18. **Improved Stability**: Fixed all compiler errors, lint warnings, and resource linking issues.
        - Resolved `BuildConfig` resolution issues using reflection for robust library builds.
        - Externalized all hardcoded UI strings to `strings.xml`.
        - Fixed shortcut resource linking and API compatibility warnings.
        - Cleaned up unused imports and improved code efficiency.
    19. **Sticky Immersive Mode**: Improved the fullscreen experience with transient system bars.
    20. **Haptic Confirmation**: Added a tactile "thump" when the Node.js server starts successfully.
    20. **Dynamic Loading Progress**: Replaced static status with a Material horizontal progress bar.
    21. **OTA Auto-Updater**: Automatically checks for new versions on GitHub.
        - Fetches the latest release from the `Jibo-Revival-Group` repository.
        - Compares local `versionName` with the GitHub `tag_name` to avoid unnecessary downloads.
        - Handles APK downloading in the background.
        - Securely triggers the Android Package Installer using `FileProvider`.
        - Requires `REQUEST_INSTALL_PACKAGES` permission.

## [1.2.0] - 2025-05-22

### Added
- **16KB Page Size Support**: Implemented compatibility for Android 15+ devices with 16KB memory pages.
    - Switched to compressed native libraries (`extractNativeLibs="true"`) to support prebuilt 4KB-aligned `libnode.so`.
    - Added linker flags `-Wl,-z,common-page-size=16384` and `-Wl,-z,max-page-size=16384` for future-proofing native builds.
    - Updated internal file copy buffers from 4KB to 16KB for optimal performance on modern hardware.
- **Landscape Enforcement UX**: Added a dynamic overlay that prompts users to rotate their device to landscape mode if held in portrait.
    - Includes a smooth, infinite rotation animation mimicking the physical device flip.

### Changed
- **Target SDK Upgrade**: Bumped `compileSdk` and `targetSdkVersion` to **35** (Android 15).
- **Backward Compatibility**: Verified support for **Android 10 (API 29)** and down to **Android 7.0 (API 24)**.
- **Modernized Build Stack**:
    - Upgraded Project to **Java 17**.
    - Updated Gradle Wrapper to **9.7.1**.
    - Updated `androidx.appcompat` to **1.8.0**.
    - Updated `com.google.android.material` to **1.14.0**.
- **Signing & Packaging**: Enabled V2 signing and adjusted bundle packaging settings for improved compatibility and security.

### Fixed
- **Prebuilt Library Loading**: Resolved `APK not compatible with 16 KB devices` errors by adjusting packaging strategy for legacy ELF binaries.
- **Build Error**: Removed deprecated `android.bundle.enableUncompressedNativeLibs` from `gradle.properties` which was causing evaluation failures in modern AGP versions.
