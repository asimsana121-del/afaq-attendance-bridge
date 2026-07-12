# Hikvision DS-K1A802AEF-B Setup

## Network

1. Connect the device to the office LAN (Ethernet or Wi-Fi).
2. Note the device IP from the device screen or Hikvision SADP tool.
3. Ensure the Windows PC running Afaq Attendance Bridge can ping the device IP.

## Device credentials

- Default username is often `admin`.
- Set a strong password on the device; use the same in `config.json`.

## Register in Afaq Finance first

1. **HRM → Attendance devices** → Add device (name, branch, device code).
2. Note the **central device ID** — set `centralDeviceId` in `config.json`.
3. Generate a **bridge activation code** (tenant admin or superadmin).

## ISAPI

The bridge uses Hikvision ISAPI over HTTP (digest auth). Default paths are in `config.example.json`. If your firmware uses different paths, ask support.

## Employee mapping

Enroll employees on the device first (fingerprint/card). Then map `deviceUserId` to Afaq HRM employees in **HRM → Device mapping**.

## Timezone

Set `timezone` in config to match your office (e.g. `Asia/Kabul`). Device and bridge should use consistent local time for punch display.
