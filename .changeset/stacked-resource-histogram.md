---
'@repo/web': minor
---

The resource histogram stacks, and it stacks by trade as well as by resource.

The histogram showed **one resource at a time**, so answering "who is driving this peak?" meant
stepping through a picker one resource at a time and holding the shapes in your head. It now stacks
every resource in one chart, with a legend, and the data table beneath it gains a **Total** column
so the stacked height has a text equivalent rather than only a picture.

**Stack by trade group is where this goes past what P6 offers.** P6 builds a stacked histogram by
adding one filter dialog per segment, which its own advocates call tedious for the case every real
programme has — dozens of trades. Because resources here already carry a parent group, that is a
dropdown: a forty-resource programme that stacks as a handful of bands and "Other (36 resources)"
becomes the picture you actually wanted, grouped by trade.

The canvas strip under the diagram stacks too, showing fewer bands than the dialog. That is
deliberate and measured: at 72 px tall, six bands on a realistically skewed programme put the
smallest at half a pixel. Three named trades plus an aggregate is the glance; the dialog carries the
detail.
