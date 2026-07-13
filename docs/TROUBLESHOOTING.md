# Troubleshooting

## Bridge will not activate

- Check `centralApiBaseUrl` ends with `/v1` (e.g. `https://api.tofan.dev/v1`).
- Activation codes expire in 24 hours — generate a new one.
- Ensure outbound HTTPS to your Afaq server is allowed (no proxy blocking).
- CSRF errors mean the URL is a browser/BFF endpoint — use the direct API host, not `tfn.tofan.dev` or `/api/bff`.

## HTTP 401 from device (`[isapi] … events HTTP 401`)

This means **device authentication failed**, not Afaq API failure.

1. Verify device username/password in `config.json` (default user is often `admin`).
2. Confirm the device is **activated** and web/ISAPI access is enabled.
3. Confirm Bridge PC and device are on the **same LAN** (ping the device IP).
4. Try `"authMode": "digest"` (or leave `"auto"`).
5. Run `AfaqAttendanceBridge.exe test-device` for diagnosis codes:
   - `DEVICE_AUTH_FAILED` — fix credentials / ISAPI access
   - `DEVICE_ENDPOINT_UNSUPPORTED` — wrong path/firmware; do not upgrade firmware unless confirmed necessary
   - `DEVICE_REACHABLE_BUT_EVENTS_FAILED` — auth OK but AcsEvent query failed
6. Do **not** expose the device to the internet.

## Device not reachable

- Ping `devices[].localIp` from the bridge PC.
- Verify username/password in `config.json`.
- Check Windows firewall allows outbound HTTP to the device LAN.
- Run `AfaqAttendanceBridge.exe validate-config --deep`.

## Service will not start

1. Run `run-once.bat` first — fix errors in console.
2. Check `logs/` for WinSW output.
3. Run `status.bat` as administrator.

**Note:** Device HTTP 401 does **not** stop the Windows service. The bridge keeps retrying and reports the device as error/offline on the next heartbeat. If the service itself stops, the crash is something else (config/API).

## Punches not appearing in Afaq

- Verify `centralDeviceId` matches the device registered in Afaq.
- Map employees in **HRM → Device mapping**.
- Check **HRM → Unmatched punches** for unmapped device user IDs.
- Confirm `test-device` shows `DEVICE_AUTH_OK`.

## Internet outage

Events queue locally in `data/bridge-store.json`. They sync automatically when connectivity returns.

## Wrong queue / reset queue

Stop the service, backup then delete `data/bridge-store.json` (you may re-sync duplicates — central API dedupes by hash).

## Logs

- `logs/` — service wrapper logs
- `run-once.bat` — console output
- `status.bat` — last log lines
- Safe ISAPI logs include device IP, endpoint, HTTP status, and auth challenge type — never the password
