# ADR-020: Profile Photo Upload via Cloudinary (Reversing ERD §7 Note 4)

**Status:** Accepted (Supersedes ERD §7 Note 4)

**Context:**
`erd.md` §7 Note 4 initially excluded `User.photoUrl` and `POST /users/me/photo` to avoid bringing in third-party storage dependencies for non-essential features. During product scoping, user profile photo upload was explicitly requested for self-service profiles. Storing image binaries directly in Postgres or local disk in a containerized environment is anti-pattern and violates Playbook guidelines.

**Decision:**
1. **Add `User.photoUrl`**: Nullable string field on `User` model, holding remote HTTPS URL from Cloudinary.
2. **Dedicated Cloudinary Upload Service**: Add `ProfilePhotoService` isolated in `apps/api/src/modules/auth/profile-photo.service.ts` to keep `AuthService` core clean.
3. **Deterministic Public ID & Server-side Transformation**: Use deterministic public ID `ohmypos/users/<userId>` with `overwrite: true` to prevent image sprawl. Cloudinary performs square thumbnail face crop (`256x256`, `crop: 'thumb'`, `gravity: 'face'`) server-side, removing need for client-side image cropping libraries.
4. **Endpoint**: Expose `POST /auth/me/photo` with multipart file upload interceptor, validating mimetype (`image/jpeg`, `image/png`, `image/webp`) and 2MB max file size.

**Consequences:**
- (+) Simple user experience with zero frontend cropping overhead.
- (+) Zero orphaned image accumulation in Cloudinary (deterministic overwrite by user ID).
- (+) Database stores only lightweight URL string.
- (−) Introduces external dependency on `cloudinary` SDK in `apps/api`.
- (−) Requires Cloudinary environment variables (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).

**Alternatives considered:**
- *Local filesystem / volume storage*: rejected — not resilient in containerized/stateless deployments, requires manual static file serving and backup strategy.
- *Store Base64/Binary in PostgreSQL (`bytea`)*: rejected — bloats database backups, hurts query cache, anti-pattern for transactional DBs.
- *Client-side direct upload via signed URLs*: rejected — adds unnecessary API complexity for low-volume avatar uploads in v1.
