# Local music sample

The remix prototype expects:

`data/music/she-so-bad.mp3`

The audio file is intentionally **not committed** to this public repository. Generate it locally from a video/audio file you are allowed to use:

```bash
npm run sample:bad -- "/path/to/BAD Official MV.mp4"
```

The current prototype extracts ~5.7 seconds around the first “She's so bad…” hook, then the renderer slices that buffer in memory into ~280 ms chunks. Different keyboard keys deterministically trigger different chunks, so typing recomposes the phrase without generating hundreds of files.
