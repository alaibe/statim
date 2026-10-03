# Marketing

The promo film: 37 seconds on a loop, cut in 16:9 and 9:16.

`film.html` is the film itself. Open it in a browser to watch or scrub it, and
switch between the two cuts with the format buttons. In the console,
`film.seek(12)` shows the frame at 12 seconds.

```bash
npm run promo:build
```

This renders both cuts frame by frame in headless Chrome and writes them to
`docs/public/promo/`, where the website picks them up:

| File | For |
| --- | --- |
| `film-16x9.mp4` | the website, and the README link |
| `film-9x16.mp4` | the website on phones, and posting to Reels, Shorts or TikTok |
| `film-poster-16x9.jpg`, `film-poster-9x16.jpg` | the website, until the video loads |
| `film.webp` | the README, since GitHub does not autoplay video |
| `og.jpg` | the picture in link previews of the website, a 1200×630 frame of the chat list scene |

It needs ffmpeg and img2webp (`brew install ffmpeg webp`), a network connection
for the Google Fonts, and Chrome. It uses `CHROME` if set, then Playwright's
headless shell, then Google Chrome.
