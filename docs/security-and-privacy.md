# Security and Privacy

- The loopback server binds only to 127.0.0.1.
- A local bearer token is required for all API endpoints except `/health` and `/pair`.
- Cloud backup is optional and excludes raw footage by default.
- Local storage handles path privacy (removing private drive and user folder details from path hints).
