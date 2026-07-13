# Afaq Attendance Bridge — Installation Guide

For office IT staff (no programming knowledge required).

## Correct download (read this first)

**Download only:**

- `AfaqAttendanceBridge-win-x64.zip` from [GitHub Releases](https://github.com/asimsana121-del/afaq-attendance-bridge/releases)

**Do NOT download:**

- Source code (zip)
- Source code (tar.gz)

Those source archives contain no `AfaqAttendanceBridge.exe`, no `node\node.exe`, and no `WinSW-x64.exe`.

**After extraction**, confirm these files exist **in the same folder as the `.bat` files** (e.g. `C:\AfaqAttendanceBridge\`):

| File | Required |
|------|----------|
| `AfaqAttendanceBridge.exe` | Yes |
| `node\node.exe` | Yes |
| `service\winsw\WinSW-x64.exe` | Yes |

If any are missing, you downloaded the wrong file or extracted to the wrong folder.

## Mandatory install order

1. Extract the ZIP **directly** to `C:\AfaqAttendanceBridge` (flat root — `.bat` files beside the `.exe`).
2. Confirm runtime files exist (table above).
3. Copy `config.example.json` to `config.json` and edit it.
4. Run **`run-once.bat`** — the bridge must work in the console first.
5. Only then run **`install-service.bat`** as Administrator.
6. Confirm the service status is **RUNNING** (`sc query AfaqAttendanceBridge` or `status.bat`).

**Warning:** Do **not** run `install-service.bat` before `config.json` exists and `run-once.bat` succeeds.

## 1. Download

Download **AfaqAttendanceBridge-win-x64.zip** from:

https://github.com/asimsana121-del/afaq-attendance-bridge/releases

Use the latest release (v0.1.6 or newer).

## 2. Extract

Extract the ZIP **directly** to:

```
C:\AfaqAttendanceBridge
```

After extract, `run-once.bat` and `AfaqAttendanceBridge.exe` must be **directly** in `C:\AfaqAttendanceBridge\` — not in a nested subfolder.

## 3. Configure

1. Copy `config.example.json` to `config.json` (if not already present).
2. Open `config.json` in Notepad and edit:

| Field | What to enter |
|-------|----------------|
| `centralApiBaseUrl` | **Direct API base URL** — see [Central API URL](#central-api-url) below |
| `tenantSlug` | Your tenant code (from Afaq admin) |
| `activationCode` | One-time code from **Superadmin → Attendance Devices** or **HRM → Attendance devices** |
| `devices[].localIp` | Hikvision device IP on your office LAN (same segment as this PC) |
| `devices[].username` / `password` | Device admin credentials (default user is often `admin`) |
| `devices[].authMode` | `auto` (recommended), or `digest` / `basic` |
| `devices[].eventsMethod` | `POST` (default for AcsEvent) |
| `devices[].centralDeviceId` | Device ID from Afaq Finance after registering the device |
| `devices[].branchCode` | Branch code (e.g. `MAIN`) |

**Never share** `config.json` — it contains device passwords.

### Central API URL

Set `centralApiBaseUrl` to the **direct NestJS API** (machine-to-machine). Do **not** use the tenant web app or browser BFF.

| Use | Example |
|-----|---------|
| Correct (tofan.dev production) | `https://api.tofan.dev/v1` |
| Correct (tofan-tracker.com deployment) | `https://api.finance.tofan-tracker.com/v1` |
| Wrong | `https://tfn.tofan.dev/v1` (tenant web → BFF, not direct API) |
| Wrong | `https://tenant.example.com` (missing `/v1`) |
| Wrong | `https://tenant.example.com/api/bff` |

Optional environment override: `BRIDGE_CENTRAL_API_BASE_URL=https://api.tofan.dev/v1`

If you see **CSRF token missing or invalid**, the URL points at a browser-protected endpoint — switch to the API base URL above.

## 4. First test (console)

Double-click **`run-once.bat`**.

Optional: validate config and device without starting sync:

```
AfaqAttendanceBridge.exe validate-config --deep
AfaqAttendanceBridge.exe test-device
```

`test-device` confirms LAN reachability and ISAPI auth. A diagnosis of `DEVICE_AUTH_FAILED` or events **HTTP 401** means the **Hikvision password/ISAPI access** is wrong — not the Afaq API.

You should see:

```
Bridge activated successfully
[bridge] sync loop started
```

If errors appear, run `AfaqAttendanceBridge.exe validate-config` and check `logs\`.

## 5. Verify in Afaq Finance

1. Log in to Afaq Finance as admin.
2. Go to **HRM → Attendance devices** or **Superadmin → Tenant → Attendance devices**.
3. Confirm the bridge shows **online** and last sync updates.

## 6. Install Windows Service

1. Confirm `run-once.bat` worked (console sync loop starts).
2. Right-click **`install-service.bat`** → **Run as administrator**.
3. The script validates `config.json`, installs the service (WinSW → `service-run.bat` → `AfaqAttendanceBridge.exe run`), and only prints **SUCCESS** if status is **RUNNING**.
4. Open **Services** (`services.msc`) or run **`status.bat`** to confirm.

If the service shows **WIN32_EXIT_CODE 1064**, use **v0.1.6+** (older packs pointed WinSW at the wrong folder). Check `logs\service-boot.log` and `logs\service.stderr.log`.

## 7. Map employees

In Afaq Finance: **HRM → Device mapping** — link each device user ID to an employee.

## 8. Verify punches

Check **HRM → Device punches** and **Attendance sync** for incoming events.

---

## Scripts

| File | Purpose |
|------|---------|
| `run-once.bat` | Test run in console (before service install) |
| `service-run.bat` | Non-interactive service entry (used by WinSW) |
| `activate.bat` | Activate only (exchange activation code) |
| `status.bat` | Service status + recent log lines |
| `install-service.bat` | Install & start Windows Service (admin) |
| `uninstall-service.bat` | Remove service (keeps config & data) |
| `AfaqAttendanceBridge.exe test-device` | Probe Hikvision TCP + ISAPI auth + AcsEvent |

## Device HTTP 401

If logs show `[isapi] … HTTP 401`:

1. Check device username/password.
2. Confirm device is activated and web/ISAPI is enabled.
3. Try `"authMode": "digest"`.
4. Confirm PC and device are on the same LAN.
5. Do not expose the device to the internet.

This is **not** an Afaq central API failure. The Windows service keeps running and retries.

## Logs

- Service logs: `logs\AfaqAttendanceBridgeSvc.out.log` and `logs\AfaqAttendanceBridgeSvc.err.log`
- Local queue: `data/bridge-store.json`

## Troubleshooting WIN32_EXIT_CODE 1064

If the service is **STOPPED** with exit code **1064**, the bridge process exited during startup:

1. Confirm you extracted **v0.1.6+** with `service-run.bat` next to `AfaqAttendanceBridge.exe`.
2. Run **`run-once.bat`** — if console works, the service pack path was usually wrong in older releases.
3. Check **`logs\service-boot.log`**, **`logs\service.stderr.log`**, **`logs\AfaqAttendanceBridgeSvc.err.log`**.
4. Run **`AfaqAttendanceBridge.exe validate-config --deep`**.
5. Run **`uninstall-service.bat`**, then **`install-service.bat`** again as Administrator.

WinSW’s `%BASE%` is `service\winsw\`. The service must start via `service-run.bat` in the **app root** so `config.json` and the exe are found.

## Security

- Do **not** expose the Hikvision device to the internet.
- No router port forwarding is required.
- The bridge uses **outbound HTTPS** only.
- Fingerprint templates remain on the device.

See [docs/SECURITY.md](docs/SECURITY.md).
