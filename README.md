# hrossagrith.github.io

State portal of the Empire of Hrossagrið — a worldbuilding project.

Hrossagrith is a fictional country. This site has no connection to any real
state, government, or official body.

## Structure

```
index.html          portal home
symbols/            name, etymology, flag, national animal
history/            early history, c. 1200-100 BC
gov/                the state: eudaimonocracy and the two Crowns
gov/law/            register of the imperial legal corpus
about/              what this project is
404.html            not-found page
assets/style.css    shared stylesheet, light and dark themes
assets/theme.js     theme toggle (logic only, no markup)
assets/flag.jpg     flag of the Empire
assets/flag-mark.jpg  small flag used in the masthead
.nojekyll           serve files as-is, no Jekyll processing
```

## Editing

Plain static HTML. No build step, no dependencies. Edit a file, commit, and
GitHub Pages republishes within a minute.

Each page carries its own copy of the masthead, navigation and footer. When a
nav item changes, update it in every page.
