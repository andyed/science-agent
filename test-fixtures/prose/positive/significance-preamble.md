# Discussion

It is worth noting that the two estimators agree to within one bin. The part
worth saying out loud: the fold assignment never changed between runs. Here's
the thing, the LOSO split was fixed before any model was fitted.

The important thing to note is that no threshold was tuned on the held-out
subjects. The key takeaway is that the effect survives the stricter split, and
the part that really matters is the phase alignment, not the raw count.
