# Troubleshooting

## Bridge will not activate

- Check `centralApiBaseUrl` ends with `/v1`.
- Activation codes expire in 24 hours — generate a new one.
- Ensure outbound HTTPS to your Afaq server is allowed (no proxy blocking).

## Device not reachable

- Ping `devices[].localIp` from the bridge PC.
- Verify username/password in `config.json`.
- Check Windows firewall allows outbound HTTP to the device LAN.

## Service will not start

1. Run `run-once.bat` first — fix errors in console.
2. Check `logs/` for WinSW output.
3. Run `status.bat` as administrator.

## Punches not appearing in Afaq

- Verify `centralDeviceId` matches the device registered in Afaq.
- Map employees in **HRM → Device mapping**.
- Check **HRM → Unmatched punches** for unmapped device user IDs.

## Internet outage

Events queue locally in `data/bridge-store.json`. They sync automatically when connectivity returns.

## Wrong queue / reset queue

Stop the service, backup then delete `data/bridge-store.json` (you may re-sync duplicates — central API dedupes by hash).

## Logs

- `logs/` — service wrapper logs
- `run-once.bat` — console output
- `status.bat` — last log lines
