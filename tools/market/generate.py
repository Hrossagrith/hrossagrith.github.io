#!/usr/bin/env python3
"""Generate the Imperial Market data files in assets/data/market/.

catalog.json  reference lists, sellers, tack, plans and ad copy
horses.json   every horse listing as a compact row (column names in "fields")

Listings are assembled from the reference lists below with a fixed seed, so the
same market comes out on every run. Every horse, seller, brand and price is
fictional: this is a roleplay market. Tack specifications quote the limits of
the Imperial Tack Measurement Schedule published on the portal.

Photographs: put the files in assets/img/market/<listing id>/ and list them in
"images" in catalog.json by listing id and viewer mode, in viewing order, e.g.
"images": {"h10023": {"exterior": ["01.jpg", ..., "08.jpg"], "detail": ["head.jpg"]}}.
Exterior frames go round the horse or item clockwise from the left side.
A mode without photographs shows a labelled placeholder.

Usage: python3 tools/market/generate.py
"""

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "data" / "market"
RNG = random.Random(1889)
HORSE_COUNT = 12000

CURRENCY = {"code": "CRN", "provisional": True, "short": "cr", "name": "crowns"}

REGIONS = [
    {"id": "lakeshire", "name": "Lakeshire", "towns": ["Ardlow", "Lough Ree", "Kilmare", "Shannonbridge"]},
    {"id": "riverlands", "name": "Riverlands", "towns": ["Ballyford", "Eske", "Liffeyside", "Merrow"]},
    {"id": "midmarch", "name": "Midmarch", "towns": ["Midmarch", "Thanesford", "Corran", "Athgrove"]},
    {"id": "northfold", "name": "Northfold", "towns": ["Hrafnsey", "Stórvegur", "Kaldá", "Fellholt"]},
    {"id": "bogmoor", "name": "Bogmoor", "towns": ["Sennory", "Ashlake", "Turloch", "Mossbank"]},
    {"id": "eastholm", "name": "Eastholm", "towns": ["Eastholm", "Wrenfield", "Holmcross", "Larchmont"]},
]

HORSE_CATEGORIES = [
    {"id": "riding", "name": "Riding horses", "words": ["riding horse", "riding horses", "ridden"]},
    {"id": "driving", "name": "Driving horses", "words": ["driving horse", "driving horses"]},
    {"id": "ponies", "name": "Ponies", "words": ["pony", "ponies"]},
    {"id": "donkeys", "name": "Donkeys and mules", "words": ["donkeys and mules"]},
    {"id": "companions", "name": "Companions and retirees", "words": ["retiree", "retirees", "retired", "veteran", "veterans"]},
    {"id": "youngstock", "name": "Young horses", "words": ["young", "youngster", "youngsters", "unbacked", "youngstock"]},
]
DISCIPLINES = [
    {"id": "leisure", "name": "Leisure riding", "words": ["leisure", "hacking", "hack", "hacker", "pleasure"]},
    {"id": "dressage", "name": "Bitless dressage", "words": ["dressage", "flatwork", "schooling"]},
    {"id": "endurance", "name": "Endurance and trail", "words": ["endurance", "trail", "distance"]},
    {"id": "driving", "name": "Carriage driving", "words": ["driving", "carriage", "cart", "harness"]},
    {"id": "service", "name": "Service and therapy", "words": ["service", "therapy", "rda"]},
    {"id": "companionship", "name": "Companionship", "words": ["companion", "company"]},
]
BREEDS = [
    {"id": "cob", "plural": "Shannon Cobs", "name": "Shannon Cob", "words": ["cob", "cobs", "shannon"], "cm": (145, 160), "cats": ["riding", "driving"], "disc": ["leisure", "driving", "service"], "base": 4300, "w": 6},
    {"id": "draught", "plural": "Midland Draughts", "name": "Midland Draught", "words": ["draught", "draft", "heavy"], "cm": (162, 176), "cats": ["driving", "riding"], "disc": ["driving", "service", "leisure"], "base": 4700, "w": 3},
    {"id": "warmblood", "plural": "Hrossagrith Warmbloods", "name": "Hrossagrith Warmblood", "words": ["warmblood", "warmbloods", "wb"], "cm": (160, 172), "cats": ["riding", "youngstock"], "disc": ["dressage", "leisure"], "base": 7200, "w": 5},
    {"id": "arabx", "plural": "Sennory Arab crosses", "name": "Sennory Arab cross", "words": ["arab", "arabs", "sennory"], "cm": (146, 156), "cats": ["riding", "youngstock"], "disc": ["endurance", "leisure"], "base": 4600, "w": 4},
    {"id": "pony", "plural": "Lough Ree Ponies", "name": "Lough Ree Pony", "words": ["lough ree", "ree"], "cm": (122, 142), "cats": ["ponies"], "disc": ["leisure", "service", "driving"], "base": 2700, "w": 5},
    {"id": "hill", "plural": "Northfold Hill Ponies", "name": "Northfold Hill Pony", "words": ["hill", "northfold", "native"], "cm": (130, 146), "cats": ["ponies"], "disc": ["endurance", "leisure"], "base": 2900, "w": 3},
    {"id": "donkey", "plural": "Midland Donkeys", "name": "Midland Donkey", "words": ["donkey", "donkeys"], "cm": (100, 125), "cats": ["donkeys", "companions"], "disc": ["companionship", "service"], "base": 1200, "w": 2},
    {"id": "mule", "plural": "Riverlands Mules", "name": "Riverlands Mule", "words": ["mule", "mules"], "cm": (138, 155), "cats": ["donkeys"], "disc": ["endurance", "driving"], "base": 2600, "w": 1},
    {"id": "sport", "plural": "Eastholm Sport Horses", "name": "Eastholm Sport Horse", "words": ["sport", "eastholm"], "cm": (158, 170), "cats": ["riding", "youngstock"], "disc": ["dressage", "endurance", "leisure"], "base": 5600, "w": 3},
]
SEXES = [
    {"id": "mare", "name": "mare", "plural": "mares", "words": ["mare", "mares"]},
    {"id": "gelding", "name": "gelding", "plural": "geldings", "words": ["gelding", "geldings"]},
    {"id": "jenny", "name": "jenny", "plural": "jennies", "words": ["jenny", "jennies"]},
    {"id": "jack", "name": "gelded jack", "plural": "gelded jacks", "words": ["jack", "jacks"]},
]
COATS = [
    ("bay", "#7A4A2E"), ("dark bay", "#4A2C1E"), ("chestnut", "#A0582C"), ("grey", "#A8A8A6"), ("dapple grey", "#9EA0A3"),
    ("black", "#232325"), ("dun", "#B39062"), ("piebald", "#5A5A5A"), ("skewbald", "#9C6B48"), ("bay roan", "#7E6157"),
    ("palomino", "#C9A160"), ("cream", "#D8C9A8"),
]
MARKINGS = ["a white blaze", "a star", "a snip", "white socks", "no markings"]
FEMALE_NAMES = ("Ailbhe Aoife Aisling Bláth Brannagh Bríd Caoimhe Ciara Clodagh Dearbhla Eabha Éadaoin Fiadh Gráinne Isolde Líadan Maeve "
                "Muireann Niamh Nuala Órla Rónnat Sadhbh Saoirse Síle Siún Úna Ásta Bryndís Embla Freyja Hekla Hrefna Ilmur Katla Ragna "
                "Sólveig Svala Valka Ylfa Bramble Clover Hazel Juniper Heather Briar Fern Willow Wren Poppy Daisy Bonnie Tilly Rosie Meg "
                "Holly Ivy Maisie Pearl Nell Ruby Bella Lily Mabel Dolly Esme Flora Hettie Iris Kitty Luna Marigold Nettle Olive Primrose "
                "Sorcha Tansy Violet Winnie Yarrow Saffy Dulse Lark Robin Teal Elva Kenna Lír Aria Bess Cora Dora Edie Fay Greer").split()
MALE_NAMES = ("Cian Colm Conall Cormac Dáithí Diarmuid Éamon Fiachra Finnian Fionn Lorcan Naoise Odhrán Oisín Rónán Ruadhán Seán Tadhg "
              "Tiernan Ultan Ari Bjarki Egill Geir Hrafn Kári Leifur Orri Sindri Skúli Snorri Starri Ýmir Moss Rowan Sorrel Thistle "
              "Bracken Linden Ash Birch Alder Barney Bertie Charlie Dougal Fergus Gus Hamish Jasper Monty Murphy Ned Ollie Paddy Rocco "
              "Rufus Sam Teddy Toby Woody Archie Basil Cobbler Duke Ernest Frank George Harvey Inky Jack Kit Laddie Major Nutmeg Oscar "
              "Pip Quill Ranger Smudge Tolly Ulf Vinny Wilf Yew Zephyr Brogan Cathal Declan Eoin Fintan Garret").split()
STUD_WORDS = ["Vellmark", "Hollin", "Sennory", "Ardfold", "Carrow", "Glenmoy", "Rath", "Kilbride", "Fellholt", "Mossbank", "Larchmont",
              "Turloch", "Thanesford", "Corran", "Athgrove", "Kalda", "Eskmuir", "Brackenridge", "Holmcross", "Dunrae", "Lisheen",
              "Ballymor", "Rowanlea", "Ashby", "Greystone", "Oakhurst", "Whitecairn", "Blackwater", "Hazelmere", "Brookfield"]
PEOPLE_FIRST = ["Órla", "Kári", "Nuala", "Ragna", "Colm", "Aoife", "Bjarki", "Siobhán", "Eoin", "Hekla", "Liam", "Sorcha", "Ari", "Clodagh",
                "Finn", "Ingrid", "Ruairí", "Saoirse", "Tómas", "Una", "Brendan", "Dagný", "Ciarán", "Freya", "Gunnar", "Maeve", "Niall",
                "Ólöf", "Pádraig", "Rósa", "Seán", "Thora", "Aisling", "Halla", "Darragh", "Eimear", "Fergal", "Gerður", "Kieran", "Lára"]
PEOPLE_LAST = list("ABCDEFGHJKLMNOPRSTW")

# Ad copy. A listing's title and description are assembled in the browser from these lists.
SCENES = {
    "leisure": ["Saturday mornings along the lake, on a buckle-end rein.", "The one who waits at the gate.",
                "Long lanes, quiet company, home before the rain.", "A hack that ends with both of you calmer than you started.",
                "Bramble hedges, a loose rein and nowhere to be.", "The horse that makes a Sunday."],
    "dressage": ["Light as a thought.", "A conversation in the seat, not the hands.", "Every stride a little rounder than the last.",
                 "Soft through the back, honest in the contact.", "Quiet aids, big answers."],
    "endurance": ["Forty kilometres and still curious.", "Ears forward on every new trail.", "The hills get shorter with this one.",
                  "Steady heart, steady feet, long horizons.", "First to the top, last to tire."],
    "driving": ["Steady at the shaft, kind in the stable.", "Market day, every week, without a fuss.", "Through town at a walk, home at a trot.",
                "A carriage horse who reads the road.", "Bells, buses and crossings: nothing worries this one."],
    "service": ["Calm in a crowd.", "Patient with every pair of hands.", "Made for the people who need a steady friend.",
                "The quietest horse in the yard, on purpose.", "Children first, always."],
    "companionship": ["Every horse should have one friend.", "A good field is a shared field.", "Small, wise and always there.",
                      "The friend who never leaves the gate.", "Company, for a horse that should not be alone."],
}
TITLE_WORDS = {
    "calm": ["Calm", "Quiet", "Sensible"], "curious": ["Bold", "Curious", "Brave"], "sensitive": ["Sensitive", "Responsive", "Light"],
    "energy": ["Forward", "Willing", "Keen"], "default": ["Honest", "Kind", "Genuine", "Lovely"],
}
DESC_OPEN = [
    "{name} is a {age}-year-old {coat} {breed} {sex}, {hh} hh ({cm} cm), with {mark}.",
    "Meet {name}: {breed}, {sex}, {age} years old, {hh} hh, {coat} with {mark}.",
    "{name} is a {coat} {sex} of {age}, standing {hh} hh ({cm} cm), and a true {breed}.",
]
DESC_TRAIT = {
    "calm": ["Unflappable in traffic and on the yard.", "Nothing much rattles {name}.", "Stands quietly to be tacked up, trimmed and clipped."],
    "curious": ["Takes on new places with ears forward.", "Loves to see what is round the next corner.", "Leads out on rides with confidence."],
    "sensitive": ["Answers the lightest aid.", "Rewards a quiet rider with real feel.", "Best with soft hands and a patient seat."],
    "energy": ["Plenty of go without being sharp.", "Forward but listening.", "Enjoys a job and a long day out."],
}
DESC_CLOSE = [
    "Sold with Passport, full records and a disclosed health history.",
    "Viewing welcome; {name} can be seen at work on the day.",
    "Moving only to a home that passes the suitability visit.",
    "A genuine reason for sale is given to every viewer.",
]
TRAINING = {
    "leisure": ["Ridden in a sidepull: walk, trot, canter", "Steady on lanes and in traffic", "Hacks alone and in company"],
    "dressage": ["Bitless dressage, elementary level", "Lateral work begun", "Self-carriage in walk and trot"],
    "endurance": ["Completed 40 km rides", "Good recovery heart rate", "Crosses water and bridges"],
    "driving": ["Single driving, public roads", "Calm at crossings and in town", "Backs and stands in harness"],
    "service": ["Passed service equid selection", "Used to crowds, wheelchairs and noise", "Stands for mounting from a ramp"],
    "companionship": ["Leads and ties quietly", "Good with other equids", "Easy to catch in the field"],
}
FITS = {
    "leisure": "Quiet hacks and long weekends", "dressage": "A rider who enjoys fine, light aids", "endurance": "Long distance and trail riding",
    "driving": "Single driving on public roads", "service": "Therapy, school or public service", "companionship": "A companion for a horse living alone",
}
NOT_FOR = ["Living without equine company", "Heavy hands or rushed training", "Fast competitive work", "Long hours of daily work", "A complete novice without help"]
HEALTH = ["Teeth checked this year", "Barefoot and sound", "Vaccinations up to date", "Clean pre-sale vet check",
          "Mild sweet itch, managed with a fly rug", "Restricted grazing: laminitis-prone", "Old splint, sound", "Needs steamed hay for dust"]

SELLER_KINDS = [
    {"id": "state", "name": "State office"}, {"id": "stud", "name": "Licensed stud"}, {"id": "dealer", "name": "Licensed dealer"},
    {"id": "private", "name": "Private seller"}, {"id": "maker", "name": "Maker"}, {"id": "shop", "name": "Tack shop"},
]
# Something the seller does for the viewer at the viewing, before anything is asked in return.
VIEWING_OFFERS = [
    "Rides the horse for you first, then you try", "A second viewing at no charge", "A tour of the yard and the full records over tea",
    "Collects you from the nearest station", "A lesson on the horse with the seller's instructor", "Shows the horse in the field, the stable and at work",
]
# Weekdays (0 = Monday) on which a seller takes viewings.
SLOT_DAYS = [[1, 3, 5], [2, 4, 6], [0, 5, 6], [1, 2, 3, 4, 5], [5, 6]]

BRANDS = [
    {"id": "hrafnsey", "kind": "maker", "name": "Hrafnsey Saddlery", "since": 1891, "region": "northfold", "tier": "house",
     "mark": "A raven, blind-stamped under the skirt.", "line": "Saddles shaped to the back, not the catalogue."},
    {"id": "loughree", "kind": "maker", "name": "Lough Ree Bridleworks", "since": 1903, "region": "lakeshire", "tier": "house",
     "mark": "A single wave, stitched inside the crownpiece.", "line": "Broad, soft, and released the instant you let go."},
    {"id": "storvegur", "kind": "maker", "name": "Stórvegur Harness Works", "since": 1889, "region": "midmarch", "tier": "house",
     "mark": "The road number of the first harness, pressed into every trace.", "line": "Harness for the long road."},
    {"id": "merrow", "kind": "maker", "name": "Merrow & Thane", "since": 1932, "region": "riverlands", "tier": "house",
     "mark": "One green thread in the binding.", "line": "Rugs and care for a wet, windy country."},
    {"id": "ashlake", "kind": "maker", "name": "Ashlake Hoofcraft", "since": 1978, "region": "bogmoor", "tier": "everyday", "line": "For feet that carry everything."},
    {"id": "wrenfield", "kind": "maker", "name": "Wrenfield", "since": 2011, "region": "eastholm", "tier": "everyday", "line": "Everyday tack, made well and priced fairly."},
]
TACK_CATEGORIES = [
    {"id": "bridles", "name": "Bitless bridles"}, {"id": "halters", "name": "Halters and leads"}, {"id": "saddles", "name": "Saddles"},
    {"id": "pads", "name": "Saddle pads"}, {"id": "harness", "name": "Driving harness"}, {"id": "rugs", "name": "Rugs and fly wear"},
    {"id": "hoof", "name": "Hoof care"}, {"id": "grooming", "name": "Grooming"}, {"id": "road", "name": "Road equipment"},
]

SIZES = {"id": "size", "name": "Size", "values": [{"id": "pony", "name": "Pony", "delta": 0}, {"id": "cob", "name": "Cob", "delta": 0}, {"id": "full", "name": "Full", "delta": 10}]}
FINISH = {"id": "finish", "name": "Finish", "values": [{"id": "havana", "name": "Havana", "delta": 0, "tone": "#5B3A24"},
                                                      {"id": "black", "name": "Black", "delta": 0, "tone": "#1F1F21"},
                                                      {"id": "oak", "name": "Oakbark", "delta": 15, "tone": "#8A5A35"}]}
COLOURS = {"id": "colour", "name": "Colour", "values": [{"id": "navy", "name": "Navy", "delta": 0, "tone": "#22304F"}, {"id": "moss", "name": "Moss", "delta": 0, "tone": "#4E5B3A"},
                                                       {"id": "claret", "name": "Claret", "delta": 0, "tone": "#6B2232"}, {"id": "slate", "name": "Slate", "delta": 0, "tone": "#5C6066"}]}


def sets(middle, full, d_middle, d_full):
    """Three ways to buy: the item alone, a middle set priced just under the full set, and the full set."""
    return {"id": "set", "name": "Set", "values": [
        {"id": "single", "name": "On its own", "delta": 0},
        {"id": "middle", "name": middle, "delta": d_middle},
        {"id": "full", "name": full, "delta": d_full, "best": True}]}


def seat(sizes):
    return {"id": "seat", "name": "Seat", "values": [{"id": s, "name": s.replace("h", "½") + " in", "delta": d} for s, d in sizes]}


NOSE_RULE = "min. 32 mm for horses, 25 mm for ponies (Tack Measurement Schedule, Art. 5)"
TACK = [
    ("calla", "Calla Sidepull", "loughree", "bridles", 240, [SIZES, FINISH, sets("With reins", "With reins, halter and lead", 55, 70)],
     "Thirty-eight millimetres of padded leather. Nothing in the mouth.",
     [("Noseband width", "38 mm", NOSE_RULE), ("Release", "immediate, no leverage", "Tack Code, Art. 28")], "ITS-B-2207"),
    ("calla-lite", "Calla Sidepull Lite", "loughree", "bridles", 165, [SIZES], "The Calla, in webbing, for every day.",
     [("Noseband width", "34 mm", NOSE_RULE)], "ITS-B-2208"),
    ("eske", "Eske Soft Bosal", "loughree", "bridles", 280, [SIZES, sets("With mecate", "With mecate and halter", 60, 75)],
     "The bosal, rebuilt without rawhide.", [("Nosepiece", "padded, 40 mm", "rawhide prohibited (Schedule)")], "ITS-B-2311"),
    ("tern", "Tern Cavesson Bridle", "wrenfield", "bridles", 130, [SIZES, FINISH], "A padded cavesson with side rings. Simple, broad, honest.",
     [("Noseband width", "35 mm", NOSE_RULE)], "ITS-B-1810"),
    ("cordeo", "Ashlake Cordeo", "ashlake", "bridles", 60, [], "A ring around the neck. Trust around the rest.",
     [("Contact", "22 mm rope, padded", "Tack Code, Art. 32")], "ITS-C-1904"),
    ("halter-broad", "Broad Leather Halter", "loughree", "halters", 85, [SIZES, FINISH], "Twenty-eight millimetres across the nose for leading.",
     [("Noseband width", "28 mm", "min. 25 mm for leading (Schedule)")], "ITS-H-0412"),
    ("halter-web", "Everyday Webbing Halter", "wrenfield", "halters", 32, [SIZES, COLOURS], "The halter you reach for every morning.",
     [("Noseband width", "26 mm", "min. 25 mm for leading (Schedule)")], "ITS-H-0415"),
    ("lead", "Soft Lead Rope 3 m", "wrenfield", "halters", 18, [COLOURS], "Soft in the hand. No chain, ever.",
     [("Length", "3 m", "chain leads prohibited")], "ITS-H-0501"),
    ("liffey", "Liffey Treeless Endurance", "hrafnsey", "saddles", 1450, [seat([("16", 0), ("17", 0), ("18", 40)]), FINISH,
                                                                           sets("With girth", "With girth, wool pad and leathers", 120, 160)],
     "Shaped to the back you actually have.", [("Fitting", "included, on site", "Tack Code, Art. 5")], "ITS-S-0815"),
    ("hrafnsey-gp", "Hrafnsey General Purpose", "hrafnsey", "saddles", 1680, [seat([("17", 0), ("17h", 0), ("18", 40)]), FINISH,
                                                                              sets("With girth", "With girth, wool pad and leathers", 120, 160)],
     "One saddle for lanes, fields and the arena.", [("Fitting", "re-flock at 6 months", "Tack Code, Art. 6")], "ITS-S-0901"),
    ("wren-dressage", "Wrenfield Dressage", "wrenfield", "saddles", 980, [seat([("17", 0), ("18", 30)])],
     "Deep enough to sit. Light enough to listen.", [("Gullet", "adjustable", "Tack Code, Art. 5")], "ITS-S-1004"),
    ("wool-pad", "Hollin Wool Pad", "hrafnsey", "pads", 120, [SIZES], "Wool against the back. As it should be.", [("Material", "100 % wool", "")], "ITS-S-1102"),
    ("cotton-pad", "Everyday Cotton Pad", "wrenfield", "pads", 38, [SIZES, COLOURS], "Washable, breathable, there when you need it.", [("Material", "quilted cotton", "")], "ITS-S-1110"),
    ("road-harness", "Stórvegur Road Harness", "storvegur", "harness", 1900, [SIZES, FINISH], "Built for the long road, measured for one horse.",
     [("Breastcollar", "75 mm, padded", "broad, smooth, stable (Tack Code, Art. 38)"), ("Curb straps", "none", "never chain (Schedule, Art. 5)")], "ITS-H-3301"),
    ("pair-harness", "Stórvegur Pair Harness", "storvegur", "harness", 3600, [FINISH], "Two horses, one rhythm.",
     [("Breastcollars", "2 × 75 mm", "Tack Code, Art. 38")], "ITS-H-3310"),
    ("cart-harness", "Market Cart Harness", "wrenfield", "harness", 890, [SIZES], "For the cob and the cart.",
     [("Collar", "padded, fitted", "Tack Code, Art. 38")], "ITS-H-3202"),
    ("turnout", "Merrow Turnout Rug", "merrow", "rugs", 210,
     [{"id": "length", "name": "Length", "values": [{"id": "175", "name": "5 ft 9", "delta": 0}, {"id": "190", "name": "6 ft 3", "delta": 0}, {"id": "205", "name": "6 ft 9", "delta": 20}]}, COLOURS],
     "For a wet, windy country.", [("Fill", "100 g", "")], "ITS-R-0210"),
    ("fly-rug", "Merrow Fly Rug", "merrow", "rugs", 95, [COLOURS], "Summer, without the itch.", [("Mesh", "fine, UV-blocking", "")], "ITS-R-0305"),
    ("fly-mask", "Merrow Fly Mask", "merrow", "rugs", 28, [SIZES], "Sees everything. Feels nothing bite.", [("Vision", "unobstructed mesh", "Tack Code, Art. 34")], "ITS-R-0320"),
    ("trail-boots", "Ashlake Trail Boots", "ashlake", "hoof", 190,
     [{"id": "size", "name": "Hoof size", "values": [{"id": str(n), "name": str(n), "delta": 0} for n in range(4)]}],
     "Barefoot where you can. Booted where you must.", [("Sizing", "by hoof measurement", "")], "ITS-C-0716"),
    ("hoof-kit", "Ashlake Hoof Care Kit", "ashlake", "hoof", 45, [], "Pick, brush, balm. Every day.", [("Contents", "4 pieces", "")], ""),
    ("groom-box", "Ree Grooming Box", "merrow", "grooming", 70, [], "Twenty minutes a day, done properly.", [("Contents", "7 pieces", "")], ""),
    ("curry", "Rubber Curry Mitt", "wrenfield", "grooming", 12, [], "The brush horses lean into.", [("Material", "natural rubber", "")], ""),
    ("marker", "Road-status Marker Set", "storvegur", "road", 95, [], "Tell the road who you are.", [("Plates", "ordinary + caution", "Marking Standard")], "ITS-M-0101"),
    ("lamp", "Carriage Lamp Pair", "storvegur", "road", 260, [], "Seen before you are heard.", [("Output", "white front, red rear", "Lighting and Signalling Standard")], "ITS-L-0204"),
    ("hivis", "Hi-vis Exercise Sheet", "wrenfield", "road", 48, [SIZES], "For lanes at dusk.", [("Visibility", "fluorescent, reflective", "")], ""),
]
SHOP_NAMES = ["Lakeside Tack Room", "Midmarch Saddlers", "Northfold Harness & Hide", "Bogmoor Feed and Tack",
              "Eastholm Equestrian Supplies", "Riverlands Saddlery", "Ardlow Country Store", "Kilmare Tack Exchange"]


def build_sellers():
    sellers = [{"id": "rehoming", "kind": "state", "name": "Imperial Equid Rehoming Office", "since": 1889, "region": "midmarch",
                "line": "A home for every horse entrusted to the state."}]
    for word in STUD_WORDS:
        kind = "stud" if RNG.random() < 0.7 else "dealer"
        name = word + (" Stud" if kind == "stud" else RNG.choice([" Equestrian", " Horses", " Sport Horses", " Riding Centre"]))
        sellers.append({"id": name.lower().replace(" ", "-"), "kind": kind, "name": name, "since": RNG.randint(1890, 2020),
                        "region": RNG.choice(REGIONS)["id"], "line": "Licensed stud." if kind == "stud" else "Licensed dealer."})
    for n in range(520):
        sellers.append({"id": "p" + str(1000 + n), "kind": "private", "name": RNG.choice(PEOPLE_FIRST) + " " + RNG.choice(PEOPLE_LAST) + ".",
                        "since": RNG.randint(2008, 2026), "region": RNG.choice(REGIONS)["id"], "line": "Private seller, identity verified."})
    for s in sellers:
        s["offer"] = RNG.randrange(len(VIEWING_OFFERS))
        s["slots"] = RNG.randrange(len(SLOT_DAYS))
        s["reply_h"] = RNG.choice([1, 2, 3, 4, 6, 12, 24])
    return sellers


def build_shops():
    return [{"id": "shop-" + str(i + 1), "kind": "shop", "name": name, "since": RNG.randint(1950, 2015),
             "region": REGIONS[i % len(REGIONS)]["id"], "line": "Fitting service in the yard."} for i, name in enumerate(SHOP_NAMES)]


def horses(sellers):
    fields = ["n", "loan", "name", "breed", "cat", "disc", "sex", "age", "cm", "coat", "mark", "region", "town", "seller", "price",
              "cert", "calm", "curious", "sensitive", "energy", "days", "health", "notfor", "scene", "title"]
    cat_ids = [c["id"] for c in HORSE_CATEGORIES]
    disc_ids = [d["id"] for d in DISCIPLINES]
    by_kind = {k: [i for i, s in enumerate(sellers) if s["kind"] == k] for k in ("stud", "dealer", "private", "state")}
    region_ids = [r["id"] for r in REGIONS]
    rows = []
    for i in range(HORSE_COUNT):
        bi = RNG.choices(range(len(BREEDS)), weights=[b["w"] for b in BREEDS])[0]
        b = BREEDS[bi]
        cat = RNG.choice(b["cats"])
        disc = RNG.choice(b["disc"])
        if cat != "youngstock" and RNG.random() < 0.05:
            cat = "companions"
        if cat == "companions":
            disc = "companionship"
        age = RNG.randint(3, 5) if cat == "youngstock" else RNG.randint(17, 27) if cat == "companions" else RNG.randint(6, 16)
        sex = RNG.choice([2, 3]) if b["id"] == "donkey" else RNG.choice([0, 1, 1])
        names = FEMALE_NAMES if sex in (0, 2) else MALE_NAMES
        name = RNG.randrange(len(names))
        kind = RNG.choices(["stud", "dealer", "private", "state"], weights=[3, 2, 6, 2 if cat == "companions" else 0.15])[0]
        si = RNG.choice(by_kind[kind])
        calm = RNG.randint(3, 5) if disc in ("service", "companionship", "driving") else RNG.randint(2, 5)
        energy = max(1, min(5, (6 - calm) + RNG.randint(-1, 1)))
        loan = cat != "youngstock" and RNG.random() < 0.14
        base = b["base"] * (0.4 if cat == "companions" else 1)
        if loan:
            price = int(round(base * RNG.uniform(0.018, 0.03) / 5.0) * 5)
        else:
            value = base * RNG.uniform(0.72, 1.32) - (age - 10) * 70 * (cat != "youngstock") + calm * 60
            price = max(150, int(round(value / 50.0) * 50))
        health = 0
        for k in range(4):
            if RNG.random() < 0.55:
                health |= 1 << k
        if RNG.random() < 0.22:
            health |= 1 << RNG.randint(4, len(HEALTH) - 1)
        rows.append([i, int(loan), name, bi, cat_ids.index(cat), disc_ids.index(disc), sex, age, RNG.randint(*b["cm"]),
                     RNG.randrange(len(COATS)), RNG.randrange(len(MARKINGS)), region_ids.index(sellers[si]["region"]), RNG.randrange(4),
                     si, price, 2 if cat == "companions" else RNG.choice([0, 1, 1, 2]), calm, RNG.randint(2, 5), RNG.randint(1, 5), energy,
                     RNG.randint(0, 60), health, RNG.randrange(len(NOT_FOR)), RNG.randrange(len(SCENES[disc])), RNG.randrange(3)])
    return {"fields": fields, "id_prefix": "h", "id_base": 10000, "rows": rows}


def tack(shops):
    out = []
    for slug, name, brand, cat, price, options, line, specs, cert in TACK:
        offers = [{"seller": brand, "price": price, "days": RNG.randint(2, 5)}]
        for shop in shops:
            if RNG.random() < 0.45:
                offers.append({"seller": shop["id"], "price": int(round(price * RNG.uniform(0.95, 1.05))), "days": RNG.randint(1, 4)})
        item = {"id": "t-" + slug, "kind": "tack", "name": name, "brand": brand, "category": cat, "options": options, "line": line,
                "specs": [{"k": k, "v": v, "rule": r} for k, v, r in specs], "certificate": cert, "offers": offers,
                "tone": next((v.get("tone") for o in options for v in o["values"] if v.get("tone")), "#3A3A3C")}
        if next(b["tier"] for b in BRANDS if b["id"] == brand) == "everyday":
            item["rating"] = {"quality": round(RNG.uniform(4.1, 4.8), 1), "value": round(RNG.uniform(4.3, 4.9), 1), "count": RNG.randint(40, 900)}
        out.append(item)
    return out


def main():
    sellers = build_sellers()
    shops = build_shops()
    for n, s in enumerate(sellers + BRANDS + shops):
        prefix = {"private": "IPV", "maker": "ITM", "shop": "ITS", "state": "IST"}.get(s["kind"], "IML")
        s["licence"] = prefix + "-" + str(4100 + n * 7)
    horse_data = horses(sellers)
    catalog = {
        "notes": "Imperial Market data, generated by tools/market/generate.py. Every horse, seller, brand and price is fictional: this is a roleplay market.",
        "currency": CURRENCY,
        "image_root": "assets/img/market/",
        "images": {},
        "views": {"horse": {"exterior": 8, "detail": 4}, "tack": {"exterior": 8, "interior": 4}},
        "regions": REGIONS,
        "horse_categories": HORSE_CATEGORIES,
        "disciplines": DISCIPLINES,
        "breeds": [{k: b[k] for k in ("id", "name", "plural", "words")} for b in BREEDS],
        "sexes": SEXES,
        "coats": [{"name": c, "tone": tone} for c, tone in COATS],
        "markings": MARKINGS,
        "names": {"female": FEMALE_NAMES, "male": MALE_NAMES},
        "copy": {"scenes": SCENES, "title_words": TITLE_WORDS, "open": DESC_OPEN, "trait_lines": DESC_TRAIT, "close": DESC_CLOSE,
                 "training": TRAINING, "fits": FITS, "not_for": NOT_FOR, "health": HEALTH,
                 # Disciplines whose popular searches ask for a calm horse.
                 "calm_disciplines": ["leisure", "service", "driving", "companionship"],
                 # Tack categories suggested in the bag, with and without a horse in it.
                 "recs_with_horse": ["bridles", "halters", "pads", "rugs"],
                 "recs_without_horse": ["halters", "grooming", "hoof", "rugs"]},
        "vocabulary": {
            "loan": ["loan", "loans", "lease", "share", "on loan"],
            "sale": ["sale", "for sale", "buy"],
            "stop": ["a", "an", "the", "for", "in", "near", "with", "and", "or", "to", "of", "my", "horse", "horses", "who", "is", "good",
                     "nice", "looking", "wanted", "want", "need", "cr", "crowns", "old", "aged", "around", "about", "high", "tall", "hands"],
            "under": ["under", "below", "up to", "max", "less than", "cheaper than", "<"],
            "over": ["over", "above", "from", "min", "more than", "at least", ">"],
        },
        "bands": {
            "cm": [{"id": "s", "name": "Under 148 cm", "min": None, "max": 147}, {"id": "m", "name": "148–159 cm", "min": 148, "max": 159},
                   {"id": "l", "name": "160–167 cm", "min": 160, "max": 167}, {"id": "xl", "name": "168 cm and over", "min": 168, "max": None}],
            "age": [{"id": "y", "name": "3–5 years", "min": 3, "max": 5}, {"id": "p", "name": "6–10 years", "min": 6, "max": 10},
                    {"id": "e", "name": "11–16 years", "min": 11, "max": 16}, {"id": "v", "name": "17 and over", "min": 17, "max": None}],
            "price": [{"id": "a", "name": "Under 2,500 cr", "min": None, "max": 2499}, {"id": "b", "name": "2,500–4,999 cr", "min": 2500, "max": 4999},
                      {"id": "c", "name": "5,000–7,499 cr", "min": 5000, "max": 7499}, {"id": "d", "name": "7,500 cr and over", "min": 7500, "max": None}],
            "loan_price": [{"id": "a", "name": "Under 60 cr a month", "min": None, "max": 59}, {"id": "b", "name": "60–119 cr a month", "min": 60, "max": 119},
                           {"id": "c", "name": "120 cr a month and over", "min": 120, "max": None}],
        },
        "viewing_times": ["10:00", "13:00", "16:00"],
        "viewing_horizon_days": 14,
        "page_size": 10,
        "seller_kinds": SELLER_KINDS,
        "viewing_offers": VIEWING_OFFERS,
        "slot_days": SLOT_DAYS,
        "sellers": sellers + BRANDS + shops,
        "tack_categories": TACK_CATEGORIES,
        "tack": tack(shops),
        "plans": [
            {"id": "settle", "name": "Settling-in", "price": 0, "line": "Fourteen days of seller support and the Passport transfer."},
            {"id": "settle-plus", "name": "Settling-in Plus", "price": 240, "line": "Adds a vet visit in week one."},
            {"id": "settle-care", "name": "Settling-in Care", "price": 290, "line": "Adds a vet visit, a saddle-fit visit and a farrier visit.", "best": True},
        ],
        "delivery": [
            {"id": "collect", "name": "Collect from the seller", "price": 0, "line": "Arrange a time with the seller."},
            {"id": "transport", "name": "Licensed transporter", "price": 180, "line": "An hour's quiet recovery on arrival.", "plus_free": True},
        ],
        "membership": {"id": "plus", "name": "Market Plus", "price": 90, "period": "year",
                       "benefits": ["Licensed transport included with every horse", "Two stamps for every viewing", "First pick of viewing slots"]},
        "card": {"size": 10, "welcome": 2, "reward": "A free saddle-fit or farrier visit"},
        "ad_packages": [
            {"id": "standard", "name": "Standard", "price": 12, "line": "30 days · 6 photographs"},
            {"id": "plus", "name": "Plus", "price": 34, "line": "60 days · 12 photographs"},
            {"id": "premium", "name": "Premium", "price": 39, "line": "60 days · 12 photographs · turntable and video", "best": True},
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    (OUT / "horses.json").write_text(json.dumps(horse_data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("horses:", len(horse_data["rows"]), "tack:", len(catalog["tack"]), "sellers:", len(catalog["sellers"]))


if __name__ == "__main__":
    main()
