# Security policy

Courtnotes stores sensitive information about people in the criminal legal system. We take security
and privacy reports seriously.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a vulnerability

Please **do not** open a public issue. Report privately through GitHub:
**Security → Report a vulnerability** on
[the repository](https://github.com/lobojoel2003/Courtnotes/security/advisories/new).

Include what you found, how to reproduce it, and its impact. You'll get an acknowledgement within a
few days. We'll work on a fix, publish a patched release and credit you if you'd like.

## Running Courtnotes safely

- Serve it only over **HTTPS**, and set `ORIGIN` to the public URL.
- Use Postgres with backups for real programs, and restrict who can reach the database.
- Use a long `WATCHER_ACCESS_CODE` and rotate it when a volunteer leaves or a phone is lost.
- Give coordinator accounts strong, unique passwords, and remove accounts that are no longer needed.
- Publish only the **public** exports, which drop case numbers, notes and volunteer names.
- Keep the deployment updated: watch this repository's releases or use the `latest` image tag.
