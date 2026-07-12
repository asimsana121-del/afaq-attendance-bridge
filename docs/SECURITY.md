# Security

## Architecture

- **Outbound-only**: Bridge initiates HTTPS to Afaq Finance. No inbound ports on customer network.
- **LAN-only device**: Hikvision terminal stays on local network; never expose to internet.

## Data stored locally

| Data | Location | Notes |
|------|----------|-------|
| Bridge token | `data/bridge-store.json` | Bcrypt-validated server-side; revoke in Afaq admin |
| Device password | `config.json` | Never sent to central API |
| Punch queue | `data/bridge-store.json` | Metadata only |

## Data sent to cloud

- `deviceUserId`, punch time, verify mode, direction
- **No** fingerprint templates
- **No** device passwords

## Logging

Passwords and tokens are redacted in bridge error logs.

## Revocation

Revoke bridge in Afaq Superadmin → generate new activation code → reinstall token via `activate.bat` or `run-once.bat`.

## Compliance

Tenants control retention via Afaq Finance policies. Biometric data remains on the Hikvision device by default.
