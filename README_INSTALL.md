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

## 1. Download

Download **AfaqAttendanceBridge-win-x64.zip** from:

https://github.com/asimsana121-del/afaq-attendance-bridge/releases

Use the latest release (v0.1.1 or newer).

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

You should see:

```
Bridge activated successfully
[bridge] sync loop started
```

If errors appear, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## 5. Verify in Afaq Finance

1. Log in to Afaq Finance as admin.
2. Go to **HRM → Attendance devices** or **Superadmin → Tenant → Attendance devices**.
3. Confirm the bridge shows **online** and last sync updates.

## 6. Install Windows Service

1. Right-click **`install-service.bat`** → **Run as administrator**.
2. Open **Services** (`services.msc`).
3. Find **Afaq Attendance Bridge** — status should be **Running**.

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

- Service logs: `logs/` folder
- Local queue: `data/bridge-store.json`

## Security

- Do **not** expose the Hikvision device to the internet.
- No router port forwarding is required.
- The bridge uses **outbound HTTPS** only.
- Fingerprint templates remain on the device.

See [docs/SECURITY.md](docs/SECURITY.md).
