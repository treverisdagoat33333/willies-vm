# Your games

Put HTML games in this folder. Each one shows up in the **Games** panel (under
"My games") and in **Apps**, and plays in its own window on the desktop.

## Two ways to add a game

**A game with several files**: give it its own folder, with `index.html` inside:

```
public/games/
  flappy-bird/
    index.html
    game.js
    sprites.png
    cover.png        (optional: the picture on its card)
    game.json        (optional: {"title": "Flappy Bird", "description": "Tap to fly"})
```

**A game that's one file**: drop the `.html` file straight in:

```
public/games/
  2048.html
```

## Titles and pictures

- **Title:** `game.json`'s `"title"`, otherwise the game page's `<title>`, otherwise
  the folder or file name (`flappy-bird` becomes "Flappy Bird").
- **Picture:** a file in the game's folder named `cover`, `thumbnail`, `thumb`,
  `icon`, `logo` or `preview` (`.png`, `.jpg`, `.webp`, `.gif` or `.svg`). Without
  one, the card shows the game's first letter.

## Notes

- Names starting with `.` or `_` are skipped, so `_old-games/` stays hidden.
- Games that load files from other sites (a CDN) work; those requests go without cookies.
- On GitHub: open `public/games`, then **Add file → Upload files**, and drag a game's
  folder in. Render puts it live on the next deploy.
