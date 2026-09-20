# Changelog

All notable changes to the **Be a Maker** project will be documented in this file.

## [1.1.0] - 2025-05-22

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
