# Hrossagrith — Imperial State Portal

**Live site: <https://hrossagrith.github.io/>**

The state portal of **Hrossagrith** (native spelling *Hrossagrið*), the Empire
of Hrossagrith — a worldbuilding project published as a government website.
Available in thirteen languages.

> Unfortunately, Hrossagrith is a fictional country. This site is a
> worldbuilding project and has no connection to any real state, government, or
> official body.

## What is Hrossagrith?

Hrossagrith is an invented country whose name means *horses' sanctuary*: from
Old Norse `hross` ("horse", genitive plural `hrossa-`) and `grið` ("guaranteed
peace, quarter, safe conduct, sanctuary"). The name began as a Viking-Age
insult and was reclaimed. The portal documents the Empire's government, its
law, its history, and the equid-welfare rules the country is built around.

Read more: [the name and its origin](https://hrossagrith.github.io/symbols/) ·
[government and doctrine](https://hrossagrith.github.io/gov/) ·
[the imperial legal corpus](https://hrossagrith.github.io/gov/law/) ·
[horses](https://hrossagrith.github.io/horses/) ·
[early history](https://hrossagrith.github.io/history/)

## Languages

| | | |
|---|---|---|
| [Русский](https://hrossagrith.github.io/ru/) | [English (UK)](https://hrossagrith.github.io/) | [English (US)](https://hrossagrith.github.io/en-us/) |
| [Deutsch](https://hrossagrith.github.io/de/) | [Français](https://hrossagrith.github.io/fr/) | [Nederlands](https://hrossagrith.github.io/nl/) |
| [Norsk bokmål](https://hrossagrith.github.io/no/) | [Svenska](https://hrossagrith.github.io/sv/) | [Suomi](https://hrossagrith.github.io/fi/) |
| [Italiano](https://hrossagrith.github.io/it/) | [中文](https://hrossagrith.github.io/zh/) | [日本語](https://hrossagrith.github.io/ja/) |
| [한국어](https://hrossagrith.github.io/ko/) | | |

## Published instruments

The full text of the Empire's legal corpus is published, not merely summarised:

- [General Imperial Equid Welfare Code](https://hrossagrith.github.io/gov/law/welfare/)
- [Imperial Tack, Restraint, and Welfare Code](https://hrossagrith.github.io/gov/law/tack/)
- [Imperial Code for the Welfare of Working Carriage Equids](https://hrossagrith.github.io/gov/law/carriage/)
- [Imperial Road and Driver Code](https://hrossagrith.github.io/gov/law/road/)
- [Imperial Equine Climatic Burden Standard](https://hrossagrith.github.io/gov/law/climate/)
- [Imperial Public-Road Equid Status Marking Standard](https://hrossagrith.github.io/gov/law/marking/)
- [Imperial Emergency Medical Carriage Technical Standard](https://hrossagrith.github.io/gov/law/ambulance/)
- [Imperial Carriage Lighting and Signalling Standard](https://hrossagrith.github.io/gov/law/lighting/)
- [Imperial Tack Measurement Schedule](https://hrossagrith.github.io/gov/law/tack-measurement/)
- [Imperial Service Equid Selection and Breed Standard](https://hrossagrith.github.io/gov/law/service-equids/)
- [Imperial Carriage Equid Road and Work Certificate Template](https://hrossagrith.github.io/gov/law/work-certificate/)
- [Imperial Working Equid Passport Template](https://hrossagrith.github.io/gov/law/passport/)

## Structure

```
index.html              portal home
horses/                 the national treasure: welfare, bitless control, service equids
horses/road-status/     the public-road equid status marking standard
living/                 book II: what the Empire provides
  health/ education/ transport/ justice/ money/ citizenship/
gov/                    book I: the state and its doctrine
gov/law/                book III: the imperial legal corpus, and every full text
history/                book IV: early history, c. 1200-220 BC
symbols/                book V: name, etymology, flag, national animal
about/                  colophon and disclaimer
search/                 client-side search over the whole portal
<locale>/               the same tree, in each of the twelve other languages
assets/                 one stylesheet, two scripts, the flag, the emblem, the markers
sitemap.xml             every canonical page
```

The site is plain static HTML with no build step in the repository, no
framework and no third-party scripts. `payload/site.tar.gz` is unpacked by a
GitHub Actions workflow, which then commits the result.

## Reuse

The setting, names, texts, flag and artwork of Hrossagrith are the work of
their author. Please do not republish them as your own.
