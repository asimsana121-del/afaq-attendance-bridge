# Afaq Attendance Bridge

Outbound-only Windows sync agent that pulls attendance punches from Hikvision devices on the customer LAN and pushes them to central **Afaq Finance** via HTTPS.

## Customer install (no Node.js required)

Download **`AfaqAttendanceBridge-win-x64.zip`** from [GitHub Releases](https://github.com/asimsana121-del/afaq-attendance-bridge/releases) and follow **[README_INSTALL.md](README_INSTALL.md)**.

## Developers

```bash
npm install
npm run build
npm test
npm run package:windows   # Windows only — produces dist-packages/AfaqAttendanceBridge-win-x64.zip
```

## Storage

Queue and state use **JSON** (`data/bridge-store.json`) — no SQLite native dependencies.

## Security

- Device passwords and bridge tokens stay on the customer PC only
- Biometric templates are never uploaded
- Outbound HTTPS only — no inbound firewall rules

See [docs/SECURITY.md](docs/SECURITY.md).
