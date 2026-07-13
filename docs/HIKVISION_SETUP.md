# Hikvision DS-K1A802AEF-B Setup

Official model notes (fingerprint time attendance terminal):

- TCP/IP wired and Wi-Fi supported
- Standalone operation supported
- Max ~3000 users / fingerprints, ~100,000 event records
- USB attendance export supported (not used by MVP bridge)
- **ISAPI** and ISUP 5.0 supported — **MVP uses ISAPI pull on the local LAN only**
- Device runs Linux; default client username is often `admin`
- Bridge PC and device must be on the **same network segment**

## Network

1. Connect the device to the office LAN (Ethernet or Wi-Fi).
2. Note the device IP from the device screen or Hikvision SADP tool.
3. Ensure the Windows PC running Afaq Attendance Bridge can ping the device IP.
4. Do **not** expose the device to the internet. No port forwarding.

## Device credentials

- Default username is often `admin`.
- Set a strong password on the device; use the same in `config.json`.
- Enable device web / ISAPI access (activated device).
- Bridge auth modes: `"authMode": "auto"` (default), or force `"digest"` / `"basic"`.

## Register in Afaq Finance first

1. **HRM → Attendance devices** → Add device (name, branch, device code).
2. Note the **central device ID** — set `centralDeviceId` in `config.json`.
3. Generate a **bridge activation code** (tenant admin or superadmin).

## ISAPI (MVP)

The bridge pulls events over HTTP on the LAN:

- Auth: Digest (auto) with Basic fallback when challenged
- Events: `POST /ISAPI/AccessControl/AcsEvent?format=json` (default `eventsMethod`)
- Paths are configurable under `isapi` in `config.example.json`

Verify with:

```
AfaqAttendanceBridge.exe test-device
```

Manual / ISUP EHome upload mode exists on the device but is **not** used for MVP.

## Employee mapping

Enroll employees on the device first (fingerprint/card). Then map `deviceUserId` to Afaq HRM employees in **HRM → Device mapping**. Fingerprint templates stay on the device — never uploaded to Afaq cloud.

## Timezone

Set `timezone` in config to match your office (e.g. `Asia/Kabul`). Device and bridge should use consistent local time for punch display.

## Firmware upgrade (optional — risky)

Vendor packages may include `digicap.dav`.

- **Do not upgrade firmware by default.**
- Only consider an upgrade if ISAPI endpoints are missing or firmware is confirmed incompatible with AcsEvent.
- Backup device settings and attendance records first.
- Upgrade only from the device UI or USB per the Hikvision manual.
- Afaq Bridge never pushes firmware.
