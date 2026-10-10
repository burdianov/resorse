# BACKUP AND RESTORE

What holds this deployment's state, how to back each part up, how to restore it, and how to prove a
backup is real. Read the last section before relying on any of it: **the procedure below has not been
executed end to end**, and BP-11.4 is categorical that a backup must not be described as reliable
until it has been.

Deployment topology and service names are in [`DEPLOYMENT.md`](DEPLOYMENT.md). All commands assume
you run them from the repository root with a real `.env.production`.

## 1. What must be backed up

| State | Where it lives | Lost if missing |
|---|---|---|
| The database | volume `resors-prod_postgres_data` | Every account, role, permission, session, session preference, notification, audit row and file record |
| Uploaded and generated files | volume `resors-prod_uploads` (mounted at `/var/lib/resors/uploads`) | The bytes. The database keeps the metadata row (`file_assets`) including its `sha256`, so a missing object is detectable — and a download of one fails with a 500 by design |
| TLS certificates and ACME account | volumes `resors-prod_caddy_data`, `resors-prod_caddy_config` | Nothing unrecoverable, but re-issuing can hit the certificate authority's rate limits |
| Configuration | `.env.production` (and, if kept on the server, `LOCAL_CREDENTIALS.md`) | The ability to start the stack and to sign in at all |
| The deployed source | the repository at the deployed commit | The exact code — it is in git; record the commit hash with each backup |

Volume names are Compose's `<project>_<volume>` form. Confirm them rather than assuming:

```bash
docker volume ls | grep resors-prod
```

Backing up the database **without** the uploads volume gives you a library of metadata rows whose
bytes are gone; backing up the uploads volume **without** the database gives you objects nothing
references. The two belong together.

## 2. Backing up the database

`pg_dump` in custom format takes a consistent snapshot of the database in one shot, so the dump is a
single point in time even while the API is serving.

```bash
STAMP=$(date +%Y-%m-%d)
DUMP="resors-db-$STAMP.dump"

docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DUMP"

# The dump lists its own contents — a cheap check that the file is a real archive.
pg_restore --list "$DUMP" > /dev/null && echo "archive OK"
```

The container already carries `POSTGRES_USER` and `POSTGRES_DB`, which is why the command reads them
inside the container rather than expanding them in your shell.

## 3. Encrypting it

**A database dump is every credential hash, session and personal record this deployment holds. It
must not sit unencrypted on disk or in transit.**

The examples use [`age`](https://age-encryption.org) — a single static binary, and public-key based
so the server holds only a recipient and never the key that opens the archive:

```bash
age -r "$AGE_RECIPIENT" -o "$DUMP.age" "$DUMP"   # $AGE_RECIPIENT is the public key
shred -u "$DUMP"                                 # remove the plaintext
```

`gpg --encrypt --recipient <key-id>` is equivalent wherever GnuPG is already installed. Whichever
you use:

- The **private key (or passphrase) is held by the operator, off this server**. An encrypted backup
  whose key sits beside it is not a backup.
- The same applies to the uploads and Caddy archives below.
- Losing the key loses every backup. Store it somewhere you would survive losing the server.

## 4. Backing up the uploads volume

The volume is mounted read-only into a throwaway container, which writes the archive to the working
directory:

```bash
STAMP=$(date +%Y-%m-%d)

docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps \
  -v resors-prod_uploads:/data:ro -v "$PWD:/backup" alpine \
  tar -C /data -czf "/backup/uploads-$STAMP.tgz" .

age -r "$AGE_RECIPIENT" -o "uploads-$STAMP.tgz.age" "uploads-$STAMP.tgz"
shred -u "uploads-$STAMP.tgz"
```

Objects are content-addressed only by a random UUID key and are written once, so this archive is
additive: a restore over an existing volume replaces files of the same name and leaves newer ones
alone. It is small enough in most deployments to keep in full each time, which is simpler and safer
than an incremental scheme.

## 5. Backing up certificates and configuration

```bash
STAMP=$(date +%Y-%m-%d)

for VOLUME in resors-prod_caddy_data resors-prod_caddy_config; do
  docker run --rm -v "$VOLUME":/data:ro -v "$PWD:/backup" alpine \
    tar -C /data -czf "/backup/${VOLUME}-$STAMP.tgz" .
done

cp .env.production "env.production-$STAMP"     # then encrypt or move it off-host
# If LOCAL_CREDENTIALS.md lives on this server, back it up too.
```

## 6. Retention

A plan you can state and keep. Adjust the numbers to your own obligations, but keep the shape:

| Backups | Kept | On site | Off site |
|---|---|---|---|
| Daily database + uploads | 14 days | yes | yes |
| Weekly (the last daily of the week) | 8 weeks | yes | yes |
| Monthly (the last weekly of the month) | 12 months | last 3 only | yes |
| Configuration and certificates | with every backup, and on any change | yes | yes |

Two rules that matter more than the table:

- **Off-host, always.** A backup on the same volume as the database is not protection against the
  failure it exists for.
- **A backup nobody has restored is unverified.** The restore rehearsal in section 8 is the only
  thing that turns a directory of archives into a backup, and it belongs on a schedule — not in the
  incident you actually need it.

## 7. Restoring

Restoring replaces live data. Do it with the application **stopped** so nothing writes into the
database mid-restore:

```bash
# 1. Stop the services that touch the data. PostgreSQL itself stays up.
docker compose -f docker-compose.prod.yml --env-file .env.production stop backend web

# 2. Decrypt the archive you intend to restore.
age -d -i /path/to/private-key -o resors-db-restore.dump resors-db-YYYY-MM-DD.dump.age
pg_restore --list resors-db-restore.dump > /dev/null && echo "archive OK"

# 3. Restore the database into the existing one, replacing what is there.
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < resors-db-restore.dump

# 4. Restore the uploads volume.
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps \
  -v resors-prod_uploads:/data -v "$PWD:/backup" alpine \
  tar -C /data -xzf /backup/uploads-YYYY-MM-DD.tgz

# 5. Start again.
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --wait
```

Notes on the restore itself:

- `--clean --if-exists` drops the objects the archive replaces, so the restore lands on the state the
  dump recorded rather than merging into whatever is there. Any row written after the dump is gone —
  which is what "restore to the backup" means, and worth confirming with whoever asked for it.
- Sessions live in the database, so a restore also restores the sessions of the moment it captured.
  Users signed in after the dump are signed out; that is the correct outcome.
- The uploads restore is additive (section 4). Restoring an old archive over a newer volume does not
  delete the newer objects, so the volume ends up a superset — harmless, because the database is
  authoritative about which objects exist.
- **Not atomic with the database.** The dump and the uploads archive are taken at different moments.
  A file uploaded in the window between them can therefore be missing its object (the download fails
  with a 500, the row is intact) or present with no row (an unreferenced object). The same shape of
  residue already exists in normal operation (`file_assets` writes the object before the row and
  unlinks after commit, so a process death between the two is the one way they drift). To close the
  window, `stop backend web` before a backup — but a backup is normally taken while the service is
  live, so know that the window exists rather than pretending it does not.

## 8. The restore smoke test (rehearse it, don't discover it)

Rehearse against a **scratch database** so the rehearsal cannot damage production. This is the
procedure that proves a backup is worth keeping:

```bash
STAMP=$(date +%Y-%m-%d)

# 1. A scratch database to restore into.
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE resors_restore_check;"'

# 2. Restore the newest dump into it, decrypted first (section 7, steps 2 and 3 with -d resors_restore_check).
age -d -i /path/to/private-key -o /tmp/check.dump "resors-db-$STAMP.dump.age"
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d resors_restore_check' \
  < /tmp/check.dump

# 3. Prove the restore is complete and coherent, in the restored database.
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d resors_restore_check -c "
    SELECT (SELECT count(*) FROM users)  AS users,
           (SELECT count(*) FROM audit_logs) AS audit_rows,
           (SELECT count(*) FROM file_assets) AS file_rows;"'

# 4. Prove a stored file is whole: compare the row's sha256 with the object in the uploads archive.
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d resors_restore_check -tAc \
    "SELECT key, sha256 FROM file_assets ORDER BY created_at DESC LIMIT 1;"'

# 5. Drop the scratch database.
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE resors_restore_check;"'
```

The smoke test **passes** when: the archive lists, `pg_restore` exits 0 with no failing objects, the
counts are those of a working deployment rather than zeros, and the `sha256` of the newest
`file_assets` row matches the bytes of that object in the uploads archive (extract the archive
somewhere temporary and run `sha256sum`). A dump that restores an empty database "successfully" is
the result this test exists to rule out.

Only after the rehearsal is your backup a backup. The in-place production restore in section 7 is the
same procedure applied to the live database.

## 9. Status — not yet tested

**The procedure in this document has not been executed.** No backup has been taken against a running
deployment, no archive has been encrypted and restored, and the restore smoke test in section 8 has
not been run. What exists today is a written procedure consistent with the built topology
(`DEPLOYMENT.md` §1, `docker-compose.prod.yml`) — nothing more.

Do not describe backups as working, or this deployment as protected, until section 8 has been run
against a real backup and its observed result recorded here with the date and the archive it used.
