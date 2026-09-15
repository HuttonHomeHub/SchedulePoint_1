---
'@repo/web': minor
---

The staff console answers before it reports.

It shipped as five correct panels stacked in one column and had never been photographed. Measured at
1646 on an unhealthy installation: 5.6 screens of page, a content column that was 848 px wide at
1280, 1440 and 1646 alike — so 48 % of the window sat unused down its whole length — and **three of
the five things that were wrong were above the fold only because they happened to share a panel**.
The other two were a screen and a half down, past two panels that do nothing until a button is
pressed.

Now a **Status** summary answers first: one row per check, always all of them, worst first, each
stating its verdict in words and linking to the section that explains it. Below it the panels sit in
two columns whose widths follow what each one's content needs — a table-bodied section gets the whole
width, a row of facts takes half — rather than two equal columns, which would have made every table
on the page narrower while the page got wider.

Measured in one sitting, before and after: everything that is wrong is now named in the first
screen (3 → 5 of 5), the page is 16 % shorter, and every table is 80 % wider.

Three defects were found by looking at a picture, and no test here could have seen any of them: a
layout rule that could never fire, so two figures spread across a wide card; an empty state drawn
inside two boxes; and four tables spreading a third of a screen's worth of content across a full
one, putting an address and its date a thousand pixels apart on the same row. A fourth was found by
reading — the console had no live region at all, so anything it announced would have reached nobody.

Also: staff activity stops drowning in the console's own reads (a page load writes one row per panel,
so fifty entries were seven page loads and almost nothing else — consecutive reads now collapse into
one row that names every panel and its own size, hiding nothing), each performance sitting gets a
heading a sighted reader can see, and copying anything to the clipboard now says whether it worked.
