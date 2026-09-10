# Method

The key insight of the Rosenholtz model is that pooling-region size scales with
eccentricity, so a single summary statistic stands in for a whole periphery.
We reimplemented it directly rather than porting the MATLAB toolbox, which was
not worth the additional compute for a one-off comparison.

A second pass over the corpus is worth reporting in full: the tempo histogram
resolved seven of eight tracks, and the point at which it fails is a held tone
with no onset. That failure is worth 3 dB of headroom in the gate.
