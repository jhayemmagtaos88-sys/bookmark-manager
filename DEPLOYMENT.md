# Build and install on Android from Windows

The PowerShell script builds the Capacitor Android app with the Android SDK, installs the debug APK on a USB-connected Android device, and configures the app to call the backend over your local Wi-Fi network. The PC running the backend must stay on and connected to the same network while you use the app.

## Requirements

- Node.js and npm installed; frontend dependencies installed in `frontend`.
- Android Studio installed with the Android SDK, Android SDK Platform-Tools, and a compatible Android platform.
- `ANDROID_SDK_ROOT` or `ANDROID_HOME` set to the SDK directory, or a valid SDK path in `frontend\android\local.properties`.
- USB debugging enabled on the phone, connected by USB, and authorized when prompted.

## Start the backend

In a separate PowerShell window, from the repository root:

```powershell
Push-Location .\frontend\backend
$jwtSecret = [Environment]::GetEnvironmentVariable('JWT_SECRET', 'User')
if (-not $jwtSecret) {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $jwtSecret = [Convert]::ToBase64String($bytes)
  $rng.Dispose()
  [Environment]::SetEnvironmentVariable('JWT_SECRET', $jwtSecret, 'User')
}
$env:JWT_SECRET = $jwtSecret
npm start
```

Keep that window open. The API listens on port 5000 and stores its data in `frontend\backend\data\store.json`. The backend automatically snapshots the data once per day under `frontend\backend\data\backups` and keeps 30 days of snapshots by default. Set `BACKUP_RETENTION_DAYS` before `npm start` to change retention. Back up the entire `data` directory separately too; on one PC, local snapshots do not protect against disk loss.

The app restores the saved login and cached bookmarks when it is reopened. Android stores login tokens using Android Keystore-backed secure storage; enable optional biometric/device-lock protection from the account menu. Logging out revokes all active sessions for that account when the backend is reachable; if offline, local sign-out still happens and the app warns that the server session remains active until you sign in and log out again. Login tokens do not expire automatically, so the app stays signed in until it is uninstalled, its app data is cleared, or the backend signing secret changes. Keep the same `JWT_SECRET` when restarting the API and protect it and the API from unauthorized access.

Bookmark changes are saved locally immediately and queued for sync when the API is offline. Sync retries when connectivity returns or when you tap Retry. If another device edits the same bookmark, queued local changes are rebased over the latest server version (local edit wins). Export creates a JSON backup; import also accepts Netscape-format browser bookmark HTML and skips duplicate URLs. Reminders appear in-app when due; they are not Android notifications.

On Android, use the system Share action on a link and choose Bookmark Manager to open it in the add-bookmark form. Sorting, notes, duplicate detection, and reminder dates are available in the bookmark list and editor.

The backend supports managed PostgreSQL when `DATABASE_URL` is configured; without it, the local backend continues to use JSON storage and daily snapshots. PostgreSQL tables are initialized automatically. To import the existing local JSON accounts and bookmarks, use the dry-run then explicit `--execute` steps in [the backend README](./frontend/backend/README.md). The migration refuses a non-empty target and leaves the JSON source untouched.

## Use the app on any network with Render

Deploy the backend as a Render web service with root directory `frontend/backend`, build command `npm ci`, and start command `npm start`. Create a managed PostgreSQL database in the same Render region and configure the service with:

- `DATABASE_URL`: the database's internal connection string (keep it secret).
- `DATABASE_SSL`: `false` for Render's internal connection URL, unless Render's current connection instructions require TLS.
- `JWT_SECRET`: a persistent, randomly generated secret. Do not change it after users sign in.
- `NODE_ENV`: `production`.

Before switching the Android app to the hosted service, copy `frontend/backend/data/store.json` to a secure location. Use the Render database's external connection URL temporarily from PowerShell to run the migration dry-run and then `npm run migrate:postgres -- --execute`; set `DATABASE_SSL=true` if the external URL requires TLS. Keep the source JSON backup until you have verified the imported user account and bookmarks through the deployed API.

After Render deploys, verify `https://<service-name>.onrender.com/api/health`, then build/install the Android app with that HTTPS API URL:

```powershell
$env:VITE_API_URL = 'https://<service-name>.onrender.com/api'
Push-Location .\frontend
npm run build
npx cap sync android
Pop-Location
Push-Location .\frontend\android
.\gradlew.bat assembleDebug
Pop-Location
```

Install `frontend\android\app\build\outputs\apk\debug\app-debug.apk` with ADB. Never publish database URLs or signing secrets in source control or chat.

Find the PC's Wi-Fi IPv4 address with `ipconfig` (for example, `192.168.1.25`). Do not use `localhost` or `127.0.0.1`: those addresses on the phone refer to the phone itself. Make sure the phone and PC are on the same Wi-Fi network. If Windows Firewall blocks access, allow inbound TCP port 5000 on your private network.

## Build and install

From a second PowerShell window at the repository root, replace the example address with the PC's Wi-Fi IPv4 address:

```powershell
.\deploy.ps1 -BackendHost 192.168.1.25
```

The script checks the backend health endpoint, builds the frontend with its LAN API URL, syncs Capacitor assets, temporarily allows that backend host in Android's cleartext network policy for the debug build, builds a debug APK with Gradle, restores the original network policy, and installs the APK using ADB. If more than one device is connected, specify one:

```powershell
.\deploy.ps1 -BackendHost 192.168.1.25 -DeviceSerial <adb-device-serial>
```

The generated APK is `frontend\android\app\build\outputs\apk\debug\app-debug.apk`. This debug APK is for development/testing, not a Play Store release.

The local API URL uses HTTP and is intended only for development on a trusted network. Use HTTPS for a production backend and production Android release.
