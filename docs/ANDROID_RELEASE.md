# Android Signed Release Process

This project builds signed Android release artifacts (**Release APK** and **Release AAB**) via `.github/workflows/android-release.yml` using GitHub Actions Secrets.

**Security rules:**
- Never commit `.jks`, `.keystore`, `.p12`, `.pfx`, or `keystore.properties` files to Git (all are excluded in `.gitignore` and `android/.gitignore`).
- Never hard-code keystore paths, aliases, or passwords in `build.gradle` or workflow YAML files.

---

## 1. Generate a Release Keystore (One-Time Setup)

Run `keytool` (included with JDK 17/21) in a private directory **outside** the repository:

```bash
keytool -genkeypair -v \
  -keystore world-of-adventure-release.jks \
  -alias world-of-adventure \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Back up `world-of-adventure-release.jks` and both passwords in a password manager or secure offline vault. Losing the upload/release keystore prevents publishing updates under `com.worldofadventure.game`.

---

## 2. Base64-Encode the Keystore

Encode the `.jks` file into a single-line Base64 string:

- **Linux:**
  ```bash
  base64 -w 0 world-of-adventure-release.jks
  ```
- **macOS:**
  ```bash
  base64 -i world-of-adventure-release.jks | tr -d '\n'
  ```
- **Windows (PowerShell):**
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("world-of-adventure-release.jks"))
  ```

---

## 3. Configure GitHub Actions Secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret Name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Single-line Base64 output from Step 2 |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore store password |
| `ANDROID_KEY_ALIAS` | Key alias (e.g. `world-of-adventure`) |
| `ANDROID_KEY_PASSWORD` | Key password |

---

## 4. Triggering a Signed Release Build

The release workflow runs **only** on version tags (`v*`) or manual dispatch.

### Option A: Push a Version Tag
```bash
git tag v1.0.0
git push origin v1.0.0
```
- `versionName` is automatically set from the tag (e.g. `1.0.0`).
- `versionCode` defaults to `github.run_number` (monotonically increasing integer).
- Pushing a `v*.*.*` tag also triggers `.github/workflows/release.yml`, which builds Web, Android APK/AAB, and Windows Setup/Portable EXEs and publishes a GitHub Release with all four assets attached.

### Option B: Manual Dispatch
1. Open **Actions → Build Signed Android Release** in GitHub.
2. Click **Run workflow**.
3. Optionally enter `version_name` (e.g. `1.0.0`) and `version_code` (positive integer).

---

## 5. Downloading Artifacts

When the workflow succeeds, download both signed artifacts from the workflow run summary:
- `world-of-adventure-release-apk-v<version>` → `app-release.apk` (for direct Android installation/testing)
- `world-of-adventure-release-aab-v<version>` → `app-release.aab` (for Google Play Console uploads)

---

## 6. Optional Local Signed Release Build

To test a signed release locally without writing secrets into repository files, export environment variables in your shell session only:

```bash
export REQUIRE_RELEASE_SIGNING=true
export ANDROID_KEYSTORE_PATH="/secure/path/world-of-adventure-release.jks"
export ANDROID_KEYSTORE_PASSWORD="..."
export ANDROID_KEY_ALIAS="world-of-adventure"
export ANDROID_KEY_PASSWORD="..."
export ANDROID_VERSION_NAME="1.0.0"
export ANDROID_VERSION_CODE="1"

npm run android
cd android && ./gradlew assembleRelease bundleRelease
```
