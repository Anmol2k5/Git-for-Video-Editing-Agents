# Security and Privacy

- The loopback server binds only to 127.0.0.1.
- CEP's opaque file origin (`null`) is allowed; CORS does not replace session authentication. Unrelated web origins are rejected.
- A local bearer token is required for all API endpoints except `/health` and `/pair`.
- Cloud backup is unavailable in the Phase-1 release API; snapshots stay local. Raw footage is not included in local project snapshots.
- Local storage handles path privacy (removing private drive and user folder details from path hints).
