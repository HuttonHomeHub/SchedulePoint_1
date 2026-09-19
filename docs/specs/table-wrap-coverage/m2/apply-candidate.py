"""Apply one #344 M2 candidate to the working tree. `git checkout` reverts it."""
import io, sys, re

ROOT = '/home/user/SchedulePoint_1/'
INV = ROOT + 'apps/web/src/features/members/components/InvitationsSection.tsx'
MEM = ROOT + 'apps/web/src/routes/members.tsx'
GRID = ROOT + 'apps/web/src/components/ui/page/page-grid.tsx'

def read(p): return io.open(p, encoding='utf-8').read()
def write(p, s): io.open(p, 'w', encoding='utf-8').write(s)

SENT_COL = """    {
      header: 'Sent',
      cell: (invitation) => (
        <span className="text-muted-foreground">{formatTimestamp(invitation.createdAt)}</span>
      ),
    },
"""

STATUS_COL_START = "    {\n      header: 'Status',"

def drop_status(s):
    i = s.index(STATUS_COL_START)
    j = s.index("    {\n      header: 'Actions',")
    return s[:i] + s[j:]

def drop_sent(s):
    assert SENT_COL in s, 'Sent column not found verbatim'
    return s.replace(SENT_COL, '')

def fold_email(s, parts):
    """Replace the plain Email cell with a stacked cell carrying `parts` beneath the address."""
    old = "    { header: 'Email', cell: (invitation) => invitation.email },"
    lines = []
    if 'sent' in parts:
        lines.append("            <span>Sent {formatTimestamp(invitation.createdAt)}</span>")
    if 'status' in parts:
        lines.append(
            "            {hasExpired(invitation, now) ? (\n"
            "              <Badge variant=\"warning\">Expired</Badge>\n"
            "            ) : (\n"
            "              <span>Expires {formatTimestamp(invitation.expiresAt)}</span>\n"
            "            )}"
        )
    new = (
        "    {\n"
        "      header: 'Email',\n"
        "      cell: (invitation) => (\n"
        "        <div className=\"flex flex-col gap-0.5\">\n"
        "          <span>{invitation.email}</span>\n"
        "          <span className=\"text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs\">\n"
        + "\n".join(lines) + "\n"
        "          </span>\n"
        "        </div>\n"
        "      ),\n"
        "    },"
    )
    assert old in s
    return s.replace(old, new)

name = sys.argv[1]

if name == 'C0':
    s = read(INV)
    s = s.replace("    { header: 'Email', cell: (invitation) => invitation.email },",
                  "    { header: 'Email', width: 'fit', cell: (invitation) => invitation.email },")
    s = s.replace("    { header: 'Role', cell: (invitation) => ROLE_LABELS[invitation.role] },",
                  "    { header: 'Role', width: 'fit', cell: (invitation) => ROLE_LABELS[invitation.role] },")
    s = s.replace("      header: 'Sent',\n", "      header: 'Sent',\n      width: 'fit',\n")
    s = s.replace("      header: 'Status',\n", "      header: 'Status',\n      width: 'fit',\n")
    write(INV, s)

elif name == 'C1':
    s = read(GRID)
    s = s.replace("md:grid-cols-2", "md:grid-cols-[3fr_2fr]")
    write(GRID, s)

elif name == 'C2a':
    s = read(INV)
    write(INV, fold_email(drop_sent(s), ['sent']))

elif name == 'C2b':
    s = read(INV)
    write(INV, fold_email(drop_status(s), ['status']))

elif name == 'C2c':
    s = read(INV)
    write(INV, fold_email(drop_status(drop_sent(s)), ['sent', 'status']))

elif name == 'C3':
    s = read(MEM)
    s = s.replace('<PageGridItem span="narrow">\n            <InvitationsSection',
                  '<PageGridItem span="wide">\n            <InvitationsSection')
    write(MEM, s)

elif name == 'C4':
    s = read(INV)
    s = s.replace("import { formatTimestamp } from '@/lib/format-date';",
                  "import { formatTimestamp } from '@/lib/format-date';\n"
                  "const shortDate = (iso: string): string =>\n"
                  "  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));")
    s = s.replace("{formatTimestamp(invitation.createdAt)}", "{shortDate(invitation.createdAt)}")
    s = s.replace("Expires {formatTimestamp(invitation.expiresAt)}", "Expires {shortDate(invitation.expiresAt)}")
    write(INV, s)

else:
    raise SystemExit('unknown candidate ' + name)

print('applied', name)
