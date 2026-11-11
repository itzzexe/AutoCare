# Mobile apps, OBD and offline — roadmap (phase 6, not started)

No Android or iOS app has been built or tested. The installable web manifest is a shortcut, not a native app. This plan describes what to build when the mobile phase is requested.

## What is reused

| Reused as-is | Notes |
|---|---|
| `/api/v1` (all features) | Same server-side validation, permissions and rate limits |
| `@autocare/contracts` | Zod schemas, DTC parser, VIN helpers, Arabic normalisation, geography/currency formatting |
| Accounts, roles, sessions | Native login: `POST /api/v1/auth/mobile/login` → bearer token bound to a `client=mobile` session (revocable, same idle/absolute expiry, MFA supported) |
| Knowledge base, diagnosis pipeline, local AI | Server-side; phone needs internet |

| Needs new work | Notes |
|---|---|
| UI | React Native + Expo (EAS Build for signed Android/iOS binaries). Web components are not shared; design tokens (colours, type scale) are |
| Token storage | `expo-secure-store` (Keychain / Android Keystore). Never AsyncStorage |
| Refresh/rotation | Add `POST /api/v1/auth/mobile/rotate` returning a new token and revoking the old session |
| Push notifications | Separate integration (APNs/FCM) behind a "not configured" state until approved |
| Uploads | Camera capture → same `/api/v1/uploads` pipeline |

Rules: no provider keys or server secrets in the app bundle; certificate pinning considered after the domain is stable; the API stays the only authority (the app never decides prices, urgency or permissions).

## OBD-II (later sub-phase)

1. **Compatibility matrix first**: adapter type (ELM327 Bluetooth Classic, BLE, Wi-Fi; known clones), Android versions, iOS (BLE/Wi-Fi only — Classic BT generally not available to apps), test vehicles by brand/year. Support is claimed only for combinations tested on real devices.
2. **Read-only scope**: supported PIDs (Mode 01), stored/pending codes (Modes 03/07), freeze-frame (Mode 02), VIN (Mode 09) where available. Generic OBD-II does not expose every module or manufacturer data; the app must say so.
3. **No writes**: no ECU programming, no coding, and no automatic code clearing. Mode 04 (clear codes) not offered in the first release; if ever added, only as an explicit, warned user action.
4. Data flows into a diagnostic session as observations (`source = obd`), never directly into learning without the normal consent + review path.

## Offline

- Web: no offline mode; private responses are never cached by a service worker.
- Mobile: an offline pack (subset of code definitions) only for sources whose licence allows offline use (`allowOffline`) — currently only the editorial KB. Needs explicit user download, versioning, size disclosure and deletion on logout.
- On-device models: separate licence and quality evaluation; not planned for the first mobile release.

## Advanced training (also later)

LoRA/PEFT fine-tuning runs on separate hardware from approved, consented datasets (`dataset_versions.status = approved`), produces a candidate in `model_versions`, must beat the current model on an expert-reviewed eval set (`evaluation_runs`), needs admin approval to activate, and can be rolled back to the previous version.
