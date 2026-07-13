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

Use the latest release (v0.1.2 or newer).

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
| `centralApiBaseUrl` | Your Afaq Finance API URL, e.g. `https://demo.tofan.dev/v1` |
| `tenantSlug` | Your tenant code (from Afaq admin) |
| `activationCode` | One-time code from **Superadmin → Attendance Devices** or **HRM → Attendance devices** |
| `devices[].localIp` | Hikvision device IP on your office LAN |
| `devices[].username` / `password` | Device admin credentials |
| `devices[].centralDeviceId` | Device ID from Afaq Finance after registering the device |
| `devices[].branchCode` | Branch code (e.g. `MAIN`) |

**Never share** `config.json` — it contains device passwords.

## 4. First test (console)

Double-click **`run-once.bat`**.

Optional: validate config without starting sync:

```
AfaqAttendanceBridge.exe validate-config
```

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

1. Confirm `run-once.bat` worked.
2. Right-click **`install-service.bat`** → **Run as administrator**.
3. The script validates `config.json`, installs the service, and only prints **SUCCESS** if status is **RUNNING**.
4. Open **Services** (`services.msc`) or run **`status.bat`** to confirm.

## 7. Map employees

In Afaq Finance: **HRM → Device mapping** — link each device user ID to an employee.

## 8. Verify punches

Check **HRM → Device punches** and **Attendance sync** for incoming events.

---

## Scripts

| File | Purpose |
|------|---------|
| `run-once.bat` | Test run in console (before service install) |
| `activate.bat` | Activate only (exchange activation code) |
| `status.bat` | Service status + recent log lines |
| `install-service.bat` | Install & start Windows Service (admin) |
| `uninstall-service.bat` | Remove service (keeps config & data) |

## Logs

- Service logs: `logs\AfaqAttendanceBridgeSvc.out.log` and `logs\AfaqAttendanceBridgeSvc.err.log`
- Local queue: `data/bridge-store.json`

## Troubleshooting WIN32_EXIT_CODE 1064

If the service is **STOPPED** with exit code **1064**, the bridge process crashed during startup:

1. Run **`run-once.bat`** to see the error in the console window.
2. Check **`logs\AfaqAttendanceBridgeSvc.err.log`** (last lines).
3. Run **`AfaqAttendanceBridge.exe validate-config`** to check `config.json`.
4. Fix config, run **`uninstall-service.bat`**, then **`install-service.bat`** again.

## Security

- Do **not** expose the Hikvision device to the internet.
- No router port forwarding is required.
- The bridge uses **outbound HTTPS** only.
- Fingerprint templates remain on the device.

See [docs/SECURITY.md](docs/SECURITY.md).
