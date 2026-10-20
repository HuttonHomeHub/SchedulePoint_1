---
'@repo/api': minor
'@repo/web': minor
---

The link in the verification email now opens a page with a **Confirm my email address** button, and
your address is only confirmed when you press it. Before, anything that merely opened the link, such as
an email security scanner, could confirm the address for you. Links from emails sent earlier still work:
they take you to the same page. If a link has expired, the page offers to send a new one.
