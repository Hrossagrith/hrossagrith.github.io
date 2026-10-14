#!/usr/bin/env python3
"""Generate the Imperial Market catalogue: assets/data/market/catalog.json.

Listings are assembled from the reference lists below with a fixed seed, so the
same catalogue comes out on every run. Every horse, seller, brand and price is
fictional. Tack specifications quote the limits of the Imperial Tack
Measurement Schedule published on the portal.

Photographs: put the files in assets/img/market/<listing id>/ and list them in
the listing's "images" object by viewer mode, in viewing order, e.g.
"images": {"exterior": ["01.jpg", ..., "08.jpg"], "detail": ["head.jpg"]}.
Exterior frames go round the horse or item clockwise from the left side.
A mode without photographs shows a labelled placeholder.

Usage: python3 tools/market/generate.py
"""

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "data" / "market" / "catalog.json"
RNG = random.Random(1889)


def T(en, ru):
    return {"en": en, "ru": ru}


CURRENCY = {"code": "CRN", "provisional": True, "short": T("cr", "кр"), "name": T("crowns", "крон")}

REGIONS = [
    {"id": "lakeshire", "name": T("Lakeshire", "Озёрный край")},
    {"id": "riverlands", "name": T("Riverlands", "Приречье")},
    {"id": "midmarch", "name": T("Midmarch", "Срединная марка")},
    {"id": "northfold", "name": T("Northfold", "Северный удел")},
    {"id": "bogmoor", "name": T("Bogmoor", "Болотный край")},
    {"id": "eastholm", "name": T("Eastholm", "Восточный холм")},
]

# Horse departments (what kind of animal) and disciplines (what you do together).
HORSE_CATEGORIES = [
    {"id": "riding", "name": T("Riding horses", "Верховые лошади")},
    {"id": "driving", "name": T("Driving horses", "Упряжные лошади")},
    {"id": "ponies", "name": T("Ponies", "Пони")},
    {"id": "donkeys", "name": T("Donkeys and mules", "Ослы и мулы")},
    {"id": "companions", "name": T("Companions and retirees", "Компаньоны и пенсионеры")},
    {"id": "youngstock", "name": T("Young horses", "Молодые лошади")},
]
DISCIPLINES = [
    {"id": "leisure", "name": T("Leisure riding", "Прогулочная езда")},
    {"id": "dressage", "name": T("Bitless dressage", "Выездка без удил")},
    {"id": "endurance", "name": T("Endurance and trail", "Пробеги и тропы")},
    {"id": "driving", "name": T("Carriage driving", "Езда в упряжи")},
    {"id": "service", "name": T("Service and therapy", "Служба и терапия")},
    {"id": "companionship", "name": T("Companionship", "Компания")},
]
BREEDS = [
    {"id": "cob", "name": T("Shannon Cob", "Шаннонский коб"), "cm": (145, 160), "cats": ["riding", "driving"], "disc": ["leisure", "driving", "service"]},
    {"id": "draught", "name": T("Midland Draught", "Мидлендский тяжеловоз"), "cm": (162, 176), "cats": ["driving"], "disc": ["driving", "service"]},
    {"id": "warmblood", "name": T("Hrossagrith Warmblood", "Хроссагридская тёплокровная"), "cm": (160, 172), "cats": ["riding", "youngstock"], "disc": ["dressage", "leisure"]},
    {"id": "arabx", "name": T("Sennory Arab cross", "Сеннорийская помесь араба"), "cm": (146, 156), "cats": ["riding", "youngstock"], "disc": ["endurance", "leisure"]},
    {"id": "pony", "name": T("Lough Ree Pony", "Пони Лох-Ри"), "cm": (122, 142), "cats": ["ponies"], "disc": ["leisure", "service", "driving"]},
    {"id": "highland", "name": T("Northfold Hill Pony", "Северный горный пони"), "cm": (130, 146), "cats": ["ponies"], "disc": ["endurance", "leisure"]},
    {"id": "donkey", "name": T("Midland Donkey", "Мидлендский осёл"), "cm": (100, 125), "cats": ["donkeys", "companions"], "disc": ["companionship", "service"]},
    {"id": "mule", "name": T("Riverlands Mule", "Приречный мул"), "cm": (138, 155), "cats": ["donkeys"], "disc": ["endurance", "driving"]},
]
COATS = [
    T("bay", "гнедая"), T("dark bay", "тёмно-гнедая"), T("chestnut", "рыжая"), T("grey", "серая"),
    T("dapple grey", "серая в яблоках"), T("black", "вороная"), T("dun", "буланая"), T("piebald", "пегая"),
    T("skewbald", "пегая рыжая"), T("bay roan", "гнедо-чалая"), T("palomino", "соловая"), T("cream", "кремовая"),
]
COAT_TONES = ["#7A4A2E", "#4A2C1E", "#A0582C", "#A8A8A6", "#9EA0A3", "#232325", "#B39062", "#5A5A5A", "#9C6B48", "#7E6157", "#C9A160", "#D8C9A8"]
MARKINGS = [T("white blaze", "проточина"), T("star", "звёздочка"), T("snip", "пятно на храпе"), T("white socks", "белые носки"), T("no markings", "без отметин")]
BREED_WEIGHTS = [5, 3, 4, 4, 4, 3, 2, 1]
SEX = {"mare": T("mare", "кобыла"), "gelding": T("gelding", "мерин"), "jenny": T("jenny", "ослица"), "jack": T("jack (gelded)", "осёл (кастрирован)")}
FEMALE_NAMES = ("Ailbhe Aoife Aisling Bláth Brannagh Bríd Caoimhe Ciara Clodagh Dearbhla Eabha Éadaoin Fiadh Gráinne Isolde Líadan Maeve Méabh "
         "Muireann Niamh Nuala Órla Rónnat Sadhbh Saoirse Síle Siún Úna Ásta Bryndís Embla Freyja Hekla Hrefna Ilmur Katla Ragna Sólveig "
         "Svala Valka Ylfa Bramble Clover Hazel Juniper Heather Briar Fern Willow Wren").split()
MALE_NAMES = ("Cian Colm Conall Cormac Dáithí Diarmuid Éamon Fiachra Finnian Fionn Lorcan Naoise Odhrán Oisín Rónán Ruadhán "
         "Seán Tadhg Tiernan Ultan Ari Bjarki Egill Geir Hrafn Kári Leifur Orri Sindri Skúli Snorri Starri Ýmir Moss Rowan Sorrel "
         "Thistle Bracken Linden Ash Birch Alder").split()
TRAINING = {
    "leisure": [T("Ridden in a sidepull: walk, trot, canter", "Под седлом в сайдпулле: шаг, рысь, галоп"), T("Steady on lanes and in traffic", "Спокойное поведение на дорогах и в потоке")],
    "dressage": [T("Bitless dressage, elementary level", "Выездка без удил, начальный уровень"), T("Lateral work begun", "Начаты боковые движения")],
    "endurance": [T("Completed 40 km rides", "Пройдены пробеги по 40 км"), T("Good recovery heart rate", "Хорошее восстановление пульса")],
    "driving": [T("Single driving, public roads", "Одиночная упряжь, дороги общего пользования"), T("Calm at crossings and in town", "Спокойствие на переездах и в городе")],
    "service": [T("Passed service equid selection", "Отбор служебных непарнокопытных пройден"), T("Used to crowds, wheelchairs and noise", "Привычка к толпе, креслам-коляскам и шуму")],
    "companionship": [T("Leads and ties quietly", "Спокойная водка в поводу и стояние на привязи"), T("Good with other equids", "Хорошие отношения с другими непарнокопытными")],
}
FITS = {
    "leisure": T("Quiet hacks and long weekends", "Спокойные прогулки и долгие выходные"),
    "dressage": T("A rider who enjoys fine, light aids", "Всадника, которому нравятся лёгкие средства управления"),
    "endurance": T("Long distance and trail riding", "Дистанционные пробеги и тропы"),
    "driving": T("Single driving on public roads", "Одиночную упряжь на дорогах"),
    "service": T("Therapy, school or public service", "Терапию, школу или общественную службу"),
    "companionship": T("A companion for a horse living alone", "Компаньона для одинокой лошади"),
}
NOT_FOR = [
    T("Living without equine company", "Жизнь без других непарнокопытных"),
    T("Heavy hands or rushed training", "Тяжёлые руки и спешку в работе"),
    T("Fast competitive work", "Быструю соревновательную работу"),
    T("Long hours of daily work", "Долгие часы ежедневной работы"),
]
HEALTH = [
    T("Teeth checked this year", "Зубы проверены в этом году"), T("Barefoot and sound", "Без подков, копыта здоровы"),
    T("Vaccinations up to date", "Прививки в порядке"), T("Clean pre-sale vet check", "Чистая предпродажная ветпроверка"),
    T("Mild sweet itch, managed with a fly rug", "Лёгкий летний дерматит, решается сеткой"),
    T("Restricted grazing: laminitis-prone", "Ограниченный выпас: склонность к ламиниту"),
]
LINES = {
    "leisure": T("The one who waits at the gate.", "Всегда ждёт у калитки."),
    "dressage": T("Light as a thought.", "Легко, как мысль."),
    "endurance": T("Forty kilometres and still curious.", "Сорок километров и всё ещё любопытно."),
    "driving": T("Steady at the shaft, kind in the stable.", "Ровно в оглоблях, по-доброму в конюшне."),
    "service": T("Calm in a crowd.", "Спокойствие в толпе."),
    "companionship": T("Every horse should have one friend.", "У каждой лошади должен быть друг."),
}

SELLERS = [
    {"id": "vellmark", "kind": "stud", "name": "Vellmark Stud", "since": 1921, "region": "riverlands", "line": T("Driving horses bred for patience.", "Упряжные лошади, выведенные ради терпения.")},
    {"id": "hollin", "kind": "stud", "name": "Hollin Stud", "since": 1958, "region": "lakeshire", "line": T("Light riding horses from the lake country.", "Лёгкие верховые лошади из озёрного края.")},
    {"id": "sennory", "kind": "stud", "name": "Sennory Stud", "since": 1986, "region": "bogmoor", "line": T("Endurance lines, measured in miles and in years.", "Линии для пробегов, измеренные вёрстами и годами.")},
    {"id": "ardfold", "kind": "stud", "name": "Ardfold Ponies", "since": 1974, "region": "northfold", "line": T("Hill ponies, sure-footed and sensible.", "Горные пони, уверенные и рассудительные.")},
    {"id": "rehoming", "kind": "state", "name": T("Imperial Equid Rehoming Office", "Имперская служба пристройства непарнокопытных"), "since": 1889, "region": "midmarch", "line": T("A home for every horse entrusted to the state.", "Дом для каждой лошади, доверенной государству.")},
    {"id": "carriageworks", "kind": "dealer", "name": "Midmarch Carriage Horses", "since": 1999, "region": "midmarch", "line": T("Licensed dealer in road-certified driving horses.", "Лицензированный торговец упряжными лошадьми с дорожными свидетельствами.")},
    {"id": "eastholm", "kind": "dealer", "name": "Eastholm Riding Centre", "since": 2004, "region": "eastholm", "line": T("School horses retiring to private homes.", "Школьные лошади, уходящие в частные руки.")},
    {"id": "p-orla", "kind": "private", "name": "Órla M.", "since": 2016, "region": "lakeshire", "line": T("Private seller, verified identity.", "Частный продавец, личность подтверждена.")},
    {"id": "p-kari", "kind": "private", "name": "Kári S.", "since": 2019, "region": "northfold", "line": T("Private seller, verified identity.", "Частный продавец, личность подтверждена.")},
    {"id": "p-nuala", "kind": "private", "name": "Nuala B.", "since": 2012, "region": "riverlands", "line": T("Private seller, verified identity.", "Частный продавец, личность подтверждена.")},
    {"id": "p-ragna", "kind": "private", "name": "Ragna T.", "since": 2021, "region": "bogmoor", "line": T("Private seller, verified identity.", "Частный продавец, личность подтверждена.")},
    {"id": "p-colm", "kind": "private", "name": "Colm D.", "since": 2015, "region": "eastholm", "line": T("Private seller, verified identity.", "Частный продавец, личность подтверждена.")},
]
SELLER_KINDS = {"stud": T("Licensed stud", "Лицензированный конный завод"), "state": T("State office", "Государственная служба"),
                "dealer": T("Licensed dealer", "Лицензированный торговец"), "private": T("Private seller", "Частный продавец"),
                "maker": T("Maker", "Производитель"), "shop": T("Tack shop", "Магазин амуниции")}

BRANDS = [
    {"id": "hrafnsey", "kind": "maker", "name": "Hrafnsey Saddlery", "since": 1891, "region": "northfold", "line": T("Saddles shaped to the back, not the catalogue.", "Сёдла по спине, а не по каталогу.")},
    {"id": "loughree", "kind": "maker", "name": "Lough Ree Bridleworks", "since": 1903, "region": "lakeshire", "line": T("Broad, soft, and released the instant you let go.", "Широко, мягко и отпускает, как только отпускаете вы.")},
    {"id": "storvegur", "kind": "maker", "name": "Stórvegur Harness Works", "since": 1889, "region": "midmarch", "line": T("Harness for the long road.", "Упряжь для долгой дороги.")},
    {"id": "merrow", "kind": "maker", "name": "Merrow & Thane", "since": 1932, "region": "riverlands", "line": T("Rugs and care for a wet, windy country.", "Попоны и уход для мокрой и ветреной страны.")},
    {"id": "ashlake", "kind": "maker", "name": "Ashlake Hoofcraft", "since": 1978, "region": "bogmoor", "line": T("For feet that carry everything.", "Для копыт, которые несут всё.")},
    {"id": "wrenfield", "kind": "maker", "name": "Wrenfield", "since": 2011, "region": "eastholm", "line": T("Everyday tack, made well and priced fairly.", "Повседневная амуниция: хорошо сделано, честная цена.")},
]

TACK_CATEGORIES = [
    {"id": "bridles", "name": T("Bitless bridles", "Безудильные оголовья")},
    {"id": "halters", "name": T("Halters and leads", "Недоуздки и чомбуры")},
    {"id": "saddles", "name": T("Saddles", "Сёдла")},
    {"id": "pads", "name": T("Saddle pads", "Вальтрапы")},
    {"id": "harness", "name": T("Driving harness", "Упряжь")},
    {"id": "rugs", "name": T("Rugs and fly wear", "Попоны и защита от мошки")},
    {"id": "hoof", "name": T("Hoof care", "Уход за копытами")},
    {"id": "grooming", "name": T("Grooming", "Чистка")},
    {"id": "road", "name": T("Road equipment", "Дорожное снаряжение")},
]

SIZES = {"id": "size", "name": T("Size", "Размер"), "values": [
    {"id": "pony", "name": T("Pony", "Пони"), "delta": 0}, {"id": "cob", "name": T("Cob", "Коб"), "delta": 0}, {"id": "full", "name": T("Full", "Полный"), "delta": 10}]}
FINISH = {"id": "finish", "name": T("Finish", "Отделка"), "values": [
    {"id": "havana", "name": T("Havana", "Гавана"), "delta": 0, "tone": "#5B3A24"}, {"id": "black", "name": T("Black", "Чёрная"), "delta": 0, "tone": "#1F1F21"},
    {"id": "oak", "name": T("Oakbark", "Дубовая кора"), "delta": 15, "tone": "#8A5A35"}]}
COLOURS = {"id": "colour", "name": T("Colour", "Цвет"), "values": [
    {"id": "navy", "name": T("Navy", "Тёмно-синий"), "delta": 0, "tone": "#22304F"}, {"id": "moss", "name": T("Moss", "Мох"), "delta": 0, "tone": "#4E5B3A"},
    {"id": "claret", "name": T("Claret", "Бордо"), "delta": 0, "tone": "#6B2232"}, {"id": "grey", "name": T("Slate", "Сланец"), "delta": 0, "tone": "#5C6066"}]}
NOSE_RULE = T("min. 32 mm for horses, 25 mm for ponies (Tack Measurement Schedule, Art. 5)", "мин. 32 мм для лошадей, 25 мм для пони (Регламент обмеров, ст. 5)")

TACK = [
    ("calla", "Calla Sidepull", "loughree", "bridles", 240, [SIZES, FINISH], T("Thirty-eight millimetres of padded leather. Nothing in the mouth.", "Тридцать восемь миллиметров мягкой кожи. Ничего во рту."),
     [(T("Noseband width", "Ширина носового ремня"), "38 mm", NOSE_RULE), (T("Release", "Отпускание"), T("immediate, no leverage", "немедленное, без рычага"), T("Tack Code, Art. 28", "Кодекс амуниции, ст. 28"))], "ITS-B-2207"),
    ("calla-lite", "Calla Sidepull Lite", "loughree", "bridles", 165, [SIZES], T("The Calla, in webbing, for every day.", "Калла из стропы — на каждый день."),
     [(T("Noseband width", "Ширина носового ремня"), "34 mm", NOSE_RULE)], "ITS-B-2208"),
    ("eske", "Eske Soft Bosal", "loughree", "bridles", 280, [SIZES], T("The bosal, rebuilt without rawhide.", "Босал, пересобранный без сыромятной кожи."),
     [(T("Nosepiece", "Носовая часть"), T("flexible, padded, 40 mm", "гибкая, мягкая, 40 мм"), T("rawhide prohibited (Schedule)", "сыромятная кожа запрещена (Регламент)"))], "ITS-B-2311"),
    ("tern", "Tern Cavesson Bridle", "wrenfield", "bridles", 130, [SIZES, FINISH], T("A padded cavesson with side rings. Simple, broad, honest.", "Мягкий капсюль с боковыми кольцами. Просто, широко, честно."),
     [(T("Noseband width", "Ширина носового ремня"), "35 mm", NOSE_RULE)], "ITS-B-1810"),
    ("cordeo", "Ashlake Cordeo", "ashlake", "bridles", 60, [], T("A ring around the neck. Trust around the rest.", "Кольцо на шее. Доверие во всём остальном."),
     [(T("Contact", "Контакт"), T("22 mm rope in a padded sleeve", "шнур 22 мм в мягком чехле"), T("Tack Code, Art. 32", "Кодекс амуниции, ст. 32"))], "ITS-C-1904"),
    ("halter-broad", "Broad Leather Halter", "loughree", "halters", 85, [SIZES, FINISH], T("Twenty-eight millimetres across the nose for leading.", "Двадцать восемь миллиметров на носу для водки."),
     [(T("Noseband width", "Ширина носового ремня"), "28 mm", T("min. 25 mm for leading (Schedule)", "мин. 25 мм для водки (Регламент)"))], "ITS-H-0412"),
    ("halter-web", "Everyday Webbing Halter", "wrenfield", "halters", 32, [SIZES, COLOURS], T("The halter you reach for every morning.", "Недоуздок, за которым тянешься каждое утро."),
     [(T("Noseband width", "Ширина носового ремня"), "26 mm", T("min. 25 mm for leading (Schedule)", "мин. 25 мм для водки (Регламент)"))], "ITS-H-0415"),
    ("lead", "Soft Lead Rope 3 m", "wrenfield", "halters", 18, [COLOURS], T("Soft in the hand. No chain, ever.", "Мягкий в руке. Никаких цепей, никогда."),
     [(T("Length", "Длина"), "3 m", T("chain leads prohibited", "цепные чомбуры запрещены"))], "ITS-H-0501"),
    ("liffey", "Liffey Treeless Endurance", "hrafnsey", "saddles", 1450, [{"id": "seat", "name": T("Seat", "Посадка"), "values": [
        {"id": "16", "name": T("16 in", "16″"), "delta": 0}, {"id": "17", "name": T("17 in", "17″"), "delta": 0}, {"id": "18", "name": T("18 in", "18″"), "delta": 40}]}, FINISH],
     T("Shaped to the back you actually have.", "По форме спины, которая у вас на самом деле."),
     [(T("Fitting", "Подгонка"), T("included, on site", "включена, на месте"), T("Tack Code, Art. 5", "Кодекс амуниции, ст. 5"))], "ITS-S-0815"),
    ("hrafnsey-gp", "Hrafnsey General Purpose", "hrafnsey", "saddles", 1680, [{"id": "seat", "name": T("Seat", "Посадка"), "values": [
        {"id": "17", "name": T("17 in", "17″"), "delta": 0}, {"id": "17h", "name": T("17½ in", "17½″"), "delta": 0}, {"id": "18", "name": T("18 in", "18″"), "delta": 40}]}, FINISH],
     T("One saddle for lanes, fields and the arena.", "Одно седло для дорог, полей и манежа."),
     [(T("Fitting", "Подгонка"), T("included, re-flock at 6 months", "включена, перенабивка через 6 месяцев"), T("Tack Code, Art. 6", "Кодекс амуниции, ст. 6"))], "ITS-S-0901"),
    ("wren-dressage", "Wrenfield Dressage", "wrenfield", "saddles", 980, [{"id": "seat", "name": T("Seat", "Посадка"), "values": [
        {"id": "17", "name": T("17 in", "17″"), "delta": 0}, {"id": "18", "name": T("18 in", "18″"), "delta": 30}]}],
     T("Deep enough to sit. Light enough to listen.", "Достаточно глубокое, чтобы сидеть. Достаточно лёгкое, чтобы слушать."),
     [(T("Fitting", "Подгонка"), T("adjustable gullet", "регулируемая арка"), T("Tack Code, Art. 5", "Кодекс амуниции, ст. 5"))], "ITS-S-1004"),
    ("wool-pad", "Hollin Wool Pad", "hrafnsey", "pads", 120, [SIZES], T("Wool against the back. As it should be.", "Шерсть к спине. Как и должно быть."),
     [(T("Material", "Материал"), T("100 % wool", "100 % шерсть"), T("—", "—"))], "ITS-S-1102"),
    ("cotton-pad", "Everyday Cotton Pad", "wrenfield", "pads", 38, [SIZES, COLOURS], T("Washable, breathable, there when you need it.", "Стирается, дышит и всегда под рукой."),
     [(T("Material", "Материал"), T("quilted cotton", "стёганый хлопок"), T("—", "—"))], "ITS-S-1110"),
    ("road-harness", "Stórvegur Road Harness", "storvegur", "harness", 1900, [SIZES, FINISH], T("Built for the long road, measured for one horse.", "Сделана для долгой дороги, измерена под одну лошадь."),
     [(T("Breastcollar", "Нагрудная шлея"), T("75 mm, padded", "75 мм, мягкая"), T("broad, smooth, stable (Tack Code, Art. 38)", "широкая, гладкая, устойчивая (Кодекс амуниции, ст. 38)")),
      (T("Curb straps", "Подбородочные ремни"), T("none", "нет"), T("never chain (Schedule, Art. 5)", "никогда не цепь (Регламент, ст. 5)"))], "ITS-H-3301"),
    ("pair-harness", "Stórvegur Pair Harness", "storvegur", "harness", 3600, [FINISH], T("Two horses, one rhythm.", "Две лошади, один ритм."),
     [(T("Breastcollars", "Нагрудные шлеи"), T("2 × 75 mm, padded", "2 × 75 мм, мягкие"), T("Tack Code, Art. 38", "Кодекс амуниции, ст. 38"))], "ITS-H-3310"),
    ("cart-harness", "Market Cart Harness", "wrenfield", "harness", 890, [SIZES], T("For the cob and the cart.", "Для коба и повозки."),
     [(T("Collar", "Хомут"), T("padded, fitted", "мягкий, подогнанный"), T("Tack Code, Art. 38", "Кодекс амуниции, ст. 38"))], "ITS-H-3202"),
    ("turnout", "Merrow Turnout Rug", "merrow", "rugs", 210, [{"id": "length", "name": T("Length", "Длина"), "values": [
        {"id": "175", "name": T("5 ft 9", "175 см"), "delta": 0}, {"id": "190", "name": T("6 ft 3", "190 см"), "delta": 0}, {"id": "205", "name": T("6 ft 9", "205 см"), "delta": 20}]}, COLOURS],
     T("For a wet, windy country.", "Для мокрой и ветреной страны."),
     [(T("Fill", "Наполнитель"), "100 g", T("—", "—"))], "ITS-R-0210"),
    ("fly-rug", "Merrow Fly Rug", "merrow", "rugs", 95, [COLOURS], T("Summer, without the itch.", "Лето без зуда."),
     [(T("Mesh", "Сетка"), T("fine, UV-blocking", "мелкая, от ультрафиолета"), T("—", "—"))], "ITS-R-0305"),
    ("fly-mask", "Merrow Fly Mask", "merrow", "rugs", 28, [SIZES], T("Sees everything. Feels nothing bite.", "Видит всё. Не чувствует укусов."),
     [(T("Vision", "Обзор"), T("unobstructed mesh", "сетка без ограничения обзора"), T("Tack Code, Art. 34", "Кодекс амуниции, ст. 34"))], "ITS-R-0320"),
    ("trail-boots", "Ashlake Trail Boots", "ashlake", "hoof", 190, [{"id": "size", "name": T("Hoof size", "Размер копыта"), "values": [
        {"id": "0", "name": "0", "delta": 0}, {"id": "1", "name": "1", "delta": 0}, {"id": "2", "name": "2", "delta": 0}, {"id": "3", "name": "3", "delta": 0}]}],
     T("Barefoot where you can. Booted where you must.", "Без подков, где можно. В ботинках, где нужно."),
     [(T("Sizing", "Размер"), T("by hoof measurement", "по обмеру копыта"), T("—", "—"))], "ITS-C-0716"),
    ("hoof-kit", "Ashlake Hoof Care Kit", "ashlake", "hoof", 45, [], T("Pick, brush, balm. Every day.", "Крючок, щётка, бальзам. Каждый день."),
     [(T("Contents", "Состав"), T("4 pieces", "4 предмета"), T("—", "—"))], "—"),
    ("groom-box", "Ree Grooming Box", "merrow", "grooming", 70, [], T("Twenty minutes a day, done properly.", "Двадцать минут в день, как положено."),
     [(T("Contents", "Состав"), T("7 pieces", "7 предметов"), T("—", "—"))], "—"),
    ("curry", "Rubber Curry Mitt", "wrenfield", "grooming", 12, [], T("The brush horses lean into.", "Щётка, к которой лошадь прислоняется."),
     [(T("Material", "Материал"), T("natural rubber", "натуральный каучук"), T("—", "—"))], "—"),
    ("marker", "Road-status Marker Set", "storvegur", "road", 95, [], T("Tell the road who you are.", "Скажите дороге, кто вы."),
     [(T("Plates", "Таблички"), T("ordinary + caution", "обычная + осторожно"), T("Marking Standard", "Стандарт маркировки"))], "ITS-M-0101"),
    ("lamp", "Carriage Lamp Pair", "storvegur", "road", 260, [], T("Seen before you are heard.", "Вас видно раньше, чем слышно."),
     [(T("Output", "Свет"), T("white front, red rear", "белый спереди, красный сзади"), T("Lighting and Signalling Standard", "Стандарт освещения и сигнализации"))], "ITS-L-0204"),
    ("hivis", "Hi-vis Exercise Sheet", "wrenfield", "road", 48, [SIZES], T("For lanes at dusk.", "Для дорог в сумерках."),
     [(T("Visibility", "Видимость"), T("fluorescent, reflective", "флуоресцентная, светоотражающая"), T("—", "—"))], "—"),
]

# Shops that stock the makers' products, so the same item can be bought from more than one seller.
SHOPS = [
    {"id": "lakeside-tack", "kind": "shop", "name": "Lakeside Tack Room", "since": 1997, "region": "lakeshire", "line": T("Fitting service in the yard.", "Подгонка прямо во дворе.")},
    {"id": "midmarch-saddlers", "kind": "shop", "name": "Midmarch Saddlers", "since": 1964, "region": "midmarch", "line": T("Saddle fitters, harness repairs.", "Подгонка сёдел, ремонт упряжи.")},
]


def horses(count):
    out = []
    used = set()
    for i in range(count):
        breed = RNG.choices(BREEDS, weights=BREED_WEIGHTS)[0]
        category = RNG.choice(breed["cats"])
        discipline = RNG.choice(breed["disc"])
        if category == "companions":
            discipline = "companionship"
        if category == "youngstock":
            age = RNG.randint(3, 5)
        elif category == "companions":
            age = RNG.randint(16, 26)
        else:
            age = RNG.randint(6, 16)
        donkey = breed["id"] in ("donkey",)
        sex_key = RNG.choice(["jenny", "jack"]) if donkey else RNG.choice(["mare", "gelding", "gelding"])
        names = FEMALE_NAMES if sex_key in ("mare", "jenny") else MALE_NAMES
        name = RNG.choice(names)
        while name in used and not set(names) <= used:
            name = RNG.choice(names)
        used.add(name)
        coat_i = RNG.randrange(len(COATS))
        seller = RNG.choice(SELLERS)
        if category in ("companions",) and RNG.random() < 0.6:
            seller = next(s for s in SELLERS if s["id"] == "rehoming")
        cm = RNG.randint(*breed["cm"])
        calm = RNG.randint(3, 5) if discipline in ("service", "companionship", "driving") else RNG.randint(2, 5)
        energy = max(1, min(5, (6 - calm) + RNG.randint(-1, 1)))
        temperament = {"calm": calm, "curiosity": RNG.randint(2, 5), "sensitivity": RNG.randint(1, 5), "energy": energy}
        base = {"riding": 4200, "driving": 4600, "ponies": 2600, "donkeys": 1300, "companions": 500, "youngstock": 3800}[category]
        if breed["id"] == "warmblood":
            base += 2600
        price = int(round((base * RNG.uniform(0.75, 1.35) - (age - 10) * 60 * (category != "youngstock")) / 50.0) * 50)
        price = max(150, price)
        health = [RNG.choice(HEALTH[:4]), RNG.choice(HEALTH[:4])]
        if RNG.random() < 0.25:
            health.append(RNG.choice(HEALTH[4:]))
        health = [h for k, h in enumerate(health) if h not in health[:k]]
        out.append({
            "id": "h" + str(1000 + i),
            "kind": "horse",
            "name": name,
            "category": category,
            "discipline": discipline,
            "breed": breed["id"],
            "sex": sex_key,
            "age": age,
            "height_cm": cm,
            "coat": COATS[coat_i],
            "marking": RNG.choice(MARKINGS),
            "tone": COAT_TONES[coat_i],
            "region": seller["region"],
            "seller": seller["id"],
            "price": price,
            "passport": "HG-" + seller["id"][:3].upper().replace("-", "") + "-" + str(20000 + i * 37),
            "certificate": RNG.choice(["A", "B", "B", "C"]) if category != "companions" else "C",
            "temperament": temperament,
            "training": TRAINING[discipline],
            "health": health,
            "fits": [FITS[discipline]],
            "not_for": [RNG.choice(NOT_FOR)],
            "line": LINES[discipline],
            "listed_days": RNG.randint(1, 40),
            "images": {},
        })
    return out


def tack():
    out = []
    for slug, name, brand, cat, price, options, line, specs, cert in TACK:
        offers = [{"seller": brand, "price": price, "days": RNG.randint(2, 5)}]
        for shop in SHOPS:
            if RNG.random() < 0.6:
                shop_price = int(round(price * RNG.uniform(0.94, 1.04)))
                offers.append({"seller": shop["id"], "price": shop_price, "days": RNG.randint(1, 3)})
        out.append({
            "id": "t-" + slug,
            "kind": "tack",
            "name": name,
            "brand": brand,
            "category": cat,
            "price": price,
            "options": options,
            "line": line,
            "specs": [{"k": k, "v": v, "rule": r} for k, v, r in specs],
            "certificate": cert,
            "offers": offers,
            "tone": next((v.get("tone") for o in options for v in o["values"] if v.get("tone")), "#3A3A3C"),
            "rating": round(RNG.uniform(4.3, 4.9), 1),
            "reviews": RNG.randint(12, 480),
            "images": {},
        })
    return out


def licensed(sellers):
    for n, seller in enumerate(sellers):
        prefix = {"private": "IPV", "maker": "ITM", "shop": "ITS", "state": "IST"}.get(seller["kind"], "IML")
        seller["licence"] = prefix + "-" + str(4100 + n * 29)
    return sellers


def main():
    data = {
        "notes": T("Imperial Market catalogue, generated by tools/market/generate.py. Every horse, seller, brand and price is fictional: this is a roleplay market.",
                   "Каталог Имперского рынка, сгенерирован tools/market/generate.py. Все лошади, продавцы, бренды и цены вымышлены: это ролевой рынок."),
        "currency": CURRENCY,
        "image_root": "assets/img/market/",
        "regions": REGIONS,
        "horse_categories": HORSE_CATEGORIES,
        "disciplines": DISCIPLINES,
        "breeds": [{k: b[k] for k in ("id", "name")} for b in BREEDS],
        "sexes": SEX,
        "tack_categories": TACK_CATEGORIES,
        "seller_kinds": SELLER_KINDS,
        "sellers": licensed(SELLERS + BRANDS + SHOPS),
        "views": {
            "horse": {"exterior": 8, "detail": 4},
            "tack": {"exterior": 8, "interior": 4},
        },
        "horses": horses(180),
        "tack": tack(),
        "plans": [
            {"id": "settle", "name": T("Settling-in", "Привыкание"), "price": 0,
             "line": T("Fourteen days of seller support and the Passport transfer.", "Четырнадцать дней поддержки продавца и переоформление Паспорта.")},
            {"id": "settle-plus", "name": T("Settling-in Plus", "Привыкание плюс"), "price": 240,
             "line": T("Adds a vet visit in week one.", "Добавляет визит ветеринара в первую неделю.")},
            {"id": "settle-care", "name": T("Settling-in Care", "Привыкание и уход"), "price": 290,
             "line": T("Adds a vet visit, a saddle-fit visit and a farrier visit.", "Добавляет визиты ветеринара, седельщика и кузнеца.")},
        ],
        "delivery": [
            {"id": "collect", "name": T("Collect from the seller", "Самовывоз у продавца"), "price": 0},
            {"id": "transport", "name": T("Licensed transporter", "Лицензированный перевозчик"), "price": 180},
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("horses:", len(data["horses"]), "tack:", len(data["tack"]), "sellers:", len(data["sellers"]))


if __name__ == "__main__":
    main()
