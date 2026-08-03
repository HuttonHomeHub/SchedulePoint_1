---
'@repo/api': patch
---

Treat an empty optional variable as absent at the config **read** seam, not only in the schema. The
env schema mapped a blank `MAIL_SMTP_URL` to `undefined` correctly — and `ConfigService.get` then
fell through to `process.env`, where the empty string a compose file always defines still sat. So
`mailSmtpUrl` returned `''`, which is not `undefined`, and `MailModule` bound the SMTP adapter with
no URL: the API booted into `createTransport('')` and died. The rule now holds on both sides of that
boundary, pinned by a test built through the real `ConfigModule` rather than a stubbed config
service — a stub returns what it was told and could never have shown this.
