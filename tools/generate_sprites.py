#!/usr/bin/env python3
"""Generate 12 characters x 10 level sprites = 120 PNGs.

No external deps: PNG is encoded with stdlib zlib + struct.
Style: chunky pixel art on a 22x34 logical grid, scaled 10x to 220x340.
"""

import os
import struct
import zlib
import json

# ---------------------------------------------------------------------------
# Tiny PNG writer
# ---------------------------------------------------------------------------

def write_png(path, pixels):
    h = len(pixels)
    w = len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for r, g, b, a in row:
            raw.append(r)
            raw.append(g)
            raw.append(b)
            raw.append(a)

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    iend = chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(sig)
        f.write(ihdr)
        f.write(idat)
        f.write(iend)


# ---------------------------------------------------------------------------
# Canvas / composer
# ---------------------------------------------------------------------------

TRANS = (0, 0, 0, 0)


def blend(bg, fg):
    if fg[3] == 0:
        return bg
    if fg[3] == 255 or bg[3] == 0:
        return fg
    fa = fg[3] / 255.0
    ba = bg[3] / 255.0
    oa = fa + ba * (1 - fa)
    r = (fg[0] * fa + bg[0] * ba * (1 - fa)) / oa
    g = (fg[1] * fa + bg[1] * ba * (1 - fa)) / oa
    b = (fg[2] * fa + bg[2] * ba * (1 - fa)) / oa
    return (int(r), int(g), int(b), int(oa * 255))


class Canvas:
    def __init__(self, w, h):
        self.w = w
        self.h = h
        self.px = [[TRANS] * w for _ in range(h)]

    def stamp(self, ox, oy, rows, palette):
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch == '.' or ch == ' ':
                    continue
                col = palette.get(ch)
                if col is None:
                    continue
                x, y = ox + dx, oy + dy
                if 0 <= x < self.w and 0 <= y < self.h:
                    self.px[y][x] = blend(self.px[y][x], col)

    def scaled(self, k):
        out = Canvas(self.w * k, self.h * k)
        for y in range(self.h):
            row = self.px[y]
            for x in range(self.w):
                p = row[x]
                for dy in range(k):
                    outrow = out.px[y * k + dy]
                    for dx in range(k):
                        outrow[x * k + dx] = p
        return out


# ---------------------------------------------------------------------------
# Layout constants on the 22x34 logical grid
# ---------------------------------------------------------------------------

CANVAS_W, CANVAS_H = 22, 34

HEAD_X, HEAD_Y = 7, 1     # head 8x8
TORSO_X, TORSO_Y = 7, 9   # body 8x12
ARMR_X, ARMR_Y = 3, 9     # right arm (viewer's left) 4x12
ARML_X, ARML_Y = 15, 9    # left arm 4x12
LEGR_X, LEGR_Y = 7, 21    # leg right 4x12
LEGL_X, LEGL_Y = 11, 21   # leg left 4x12


# ---------------------------------------------------------------------------
# Head templates  -- each is 8 cols x 8 rows
# Palette keys are common: k=hair, K=hair shadow, s=skin, S=skin shadow,
# e=eye, m=mouth, n=nose, h=helmet, o=hollow
# ---------------------------------------------------------------------------

HEAD_HUMAN = [
    "kkkkkkkk",
    "kKKKKKKk",
    "kssssssk",
    "sseesees",
    "ssssssns",
    "ssnnnnSs",
    "ssmmmmss",
    "Ssssssss",
]

HEAD_HUMAN_F = [  # female-ish: longer hair sides
    "kkkkkkkk",
    "kKKKKKKk",
    "ksssssss",  # bangs on left
    "sseesees",
    "ssssssns",
    "ssnnnnSs",
    "ssmmmmss",
    "Ksssssss",  # hair tip
]

HEAD_ZOMBIE = [
    "kkkkkkkk",
    "kKsssssK",
    "ksssSsss",
    "sseesees",
    "ssssssss",
    "ssSssSss",
    "smmmmmms",  # snarl
    "ssSsSsSs",
]

HEAD_SKELETON = [
    "Ssssssss",
    "sssSSsss",
    "ssSSSSss",
    "soosooss",  # hollow sockets
    "ssSSSSss",
    "ssSnnSss",
    "smmmmmms",
    "sSsSsSsS",
]

HEAD_CREEPER = [
    "kkkkkkkk",
    "kKkKkKkK",
    "kkkkkkkk",
    "kKoookKk",  # diamond-ish eyes
    "kKkoookK",
    "kKKmmKKk",
    "kKmKKmKk",
    "kkmkkmkk",
]

HEAD_ENDERMAN = [
    "kkkkkkkk",
    "kkkkkkkk",
    "kkkkkkkk",
    "keekkeek",  # magenta eyes
    "keekkeek",
    "kkkkkkkk",
    "kkkkkkkk",
    "kkkkkkkk",
]

HEAD_WITCH = [
    "ksssssss",
    "ksssSsss",
    "sseesees",
    "ssssnsss",  # warty nose
    "snnnnnns",
    "ssNNNNss",
    "ssmmmmss",
    "sssSsSss",
]

HEAD_PIGMAN = [
    "ssSsSsss",
    "sssssSss",
    "ssSsssss",
    "sseesees",
    "ssssnsss",  # snout
    "snnnnnns",
    "ssmmmmss",
    "Ssssssss",
]

HEAD_WITHER = [
    "kkkkkkkk",
    "kKkkkkKk",
    "kkKkkKkk",
    "kooKKook",
    "kkKKKKkk",
    "kKkKKkKk",
    "kmmmmmmk",
    "kKkKkKkK",
]

HEAD_VILLAGER = [
    "Ksssssss",  # bald with brown skin
    "ssssssss",
    "ksssssss",  # unibrow tip
    "sseesees",
    "sssnnsss",
    "ssnnnnss",  # big nose
    "ssnnnnss",
    "ssmmmmss",
]

HEAD_PILLAGER = [
    "kkkkkkkk",
    "kKKsssKk",
    "ksssssss",
    "ssoEsees",  # eye patch over right eye (o=hollow patch, E=patch strap)
    "ssEsssss",
    "ssssnsss",
    "smmmmmms",
    "sSsssSss",
]

HEAD_KNIGHT = [  # bare-faced inside helmet base
    "hhhhhhhh",
    "hhhhhhhh",
    "hSSSSSSh",
    "heesseeh",
    "hssssssh",
    "hssmmssh",
    "hssssssh",
    "hhhhhhhh",
]

HEAD_TEMPLATES = {
    "human": HEAD_HUMAN,
    "human_f": HEAD_HUMAN_F,
    "zombie": HEAD_ZOMBIE,
    "skeleton": HEAD_SKELETON,
    "creeper": HEAD_CREEPER,
    "enderman": HEAD_ENDERMAN,
    "witch": HEAD_WITCH,
    "pigman": HEAD_PIGMAN,
    "wither": HEAD_WITHER,
    "villager": HEAD_VILLAGER,
    "pillager": HEAD_PILLAGER,
    "knight": HEAD_KNIGHT,
}


# ---------------------------------------------------------------------------
# Body, arms, legs templates (shared by all characters)
# c = shirt main, C = shirt shadow, a = arm cloth, A = arm cloth shadow
# s = skin (exposed at hands), p = pants, P = pants shadow, b = boots
# ---------------------------------------------------------------------------

# 8x12 body
TORSO = [
    "cccccccc",
    "cCcccccC",
    "cccccccc",
    "cCcccccC",
    "cccccccc",
    "cCcccccC",
    "cCcccccC",
    "cccccccc",
    "cCcccccC",
    "cccccccc",
    "cCcccccC",
    "CCCCCCCC",
]

# 4x12 arm
ARM = [
    "aaaa",
    "aAAa",
    "aaaa",
    "aaaa",
    "aAaA",
    "aaaa",
    "aaaa",
    "aAaA",
    "aaaa",
    "ssss",
    "ssSs",
    "sSss",
]

# 4x12 leg
LEG = [
    "pppp",
    "pPpP",
    "pppp",
    "pppp",
    "pPpP",
    "pppp",
    "pppp",
    "pPpP",
    "pppp",
    "bbbb",
    "bBbB",
    "BBBB",
]


# ---------------------------------------------------------------------------
# Upgrade layers
# ---------------------------------------------------------------------------

# Helmet overlay (8x8 over the head)  -- 'H' main, 'X' shadow, 'P' plume hint
HELMET_LEATHER = [
    "HHHHHHHH",
    "HXXXXXXH",
    "HHHHHHHH",
    "........",  # leave eyes visible
    "........",
    "........",
    "........",
    "........",
]

HELMET_IRON = [
    "HHHHHHHH",
    "HXXXXXXH",
    "HHHHHHHH",
    "HX....XH",  # cheek guards
    "H......H",
    "H......H",
    "X......X",
    "........",
]

HELMET_DIAMOND = [
    "HHHHHHHH",
    "HXXXXXXH",
    "HXHHHHXH",
    "HX....XH",
    "H......H",
    "H......H",
    "X......X",
    "........",
]

HELMET_CROWN = [
    "H.H.H.HH",
    "HHHHHHHH",
    "HXXXXXXH",
    "........",
    "........",
    "........",
    "........",
    "........",
]

# Chestplate overlay (8x12 over torso) -- 'P' main, 'Q' shadow
CHEST_LEATHER = [
    "PPPPPPPP",
    "PQPPPPQP",
    "PPPPPPPP",
    "PPPPPPPP",
    "PPPPPPPP",
    "PQPPPPQP",
    "PPPPPPPP",
    "PPPPPPPP",
    "........",
    "........",
    "........",
    "........",
]

CHEST_IRON = [
    "PPPPPPPP",
    "PQPPPPQP",
    "PPQQQQPP",
    "PQQQQQQP",
    "PQQQQQQP",
    "PQQQQQQP",
    "PPQQQQPP",
    "PPPPPPPP",
    "PPPPPPPP",
    "........",
    "........",
    "........",
]

CHEST_DIAMOND = [
    "PPPPPPPP",
    "PQPQPQPQ",
    "PPQQQQPP",
    "PQQPPQQP",
    "PQPPPPQP",
    "PQQPPQQP",
    "PPQQQQPP",
    "PPPPPPPP",
    "PPPPPPPP",
    "P......P",
    "........",
    "........",
]

# Shoulder pads (4x4 at top of arm)
PAULDRON_IRON = [
    "PPPP",
    "PQQP",
    "PQQP",
    "....",
]

PAULDRON_DIAMOND = [
    "PPPP",
    "PQQP",
    "PQQP",
    "PQQP",
]

# Sword (placed to right of left arm) - 4 wide, 14 tall, anchored at top-right
SWORD_WOOD = [
    "....",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    "WWWW",
    "GGGG",
    ".GG.",
    "....",
    "....",
]

SWORD_IRON = [
    "..L.",
    ".LL.",
    "WLW.",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    "WWWW",
    "GGGG",
    ".GG.",
    "....",
    "....",
]

SWORD_DIAMOND = [
    "..L.",
    ".LL.",
    "WLW.",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    ".WW.",
    "WWWW",
    "GGGG",
    "GGGG",
    ".GG.",
    "....",
]

# Cape (8 wide x 18 tall, behind torso/legs)
CAPE = [
    "AAAAAAAA",
    "ABBBBBBA",
    "AAAAAAAA",
    "AAAAAAAA",
    "ABBBBBBA",
    "AAAAAAAA",
    "AAAAAAAA",
    "ABBBBBBA",
    "AAAAAAAA",
    "AAAAAAAA",
    "ABBBBBBA",
    "AAAAAAAA",
    "AAAAAAAA",
    "ABBBBBBA",
    "AAAAAAAA",
    ".ABBBBA.",
    "..AAAA..",
    "...AA...",
]

# Glow particles (over entire 22x34, sparse)
GLOW_DOTS = [
    (1, 3), (20, 5), (2, 12), (19, 14), (3, 22), (20, 25), (4, 30), (18, 31),
    (0, 8), (21, 9), (1, 17), (20, 19),
]


# ---------------------------------------------------------------------------
# Color palettes per character
# ---------------------------------------------------------------------------

# Common helmet/chest/sword palettes
PAL_HELM = {
    'leather': {'H': (130, 78, 38, 255), 'X': (90, 50, 20, 255)},
    'iron':    {'H': (210, 210, 215, 255), 'X': (140, 140, 150, 255)},
    'diamond': {'H': (110, 230, 220, 255), 'X': (60, 170, 175, 255)},
    'crown':   {'H': (240, 200, 60, 255),  'X': (180, 140, 30, 255)},
}

PAL_CHEST = {
    'leather': {'P': (130, 78, 38, 255), 'Q': (90, 50, 20, 255)},
    'iron':    {'P': (210, 210, 215, 255), 'Q': (140, 140, 150, 255)},
    'diamond': {'P': (110, 230, 220, 255), 'Q': (60, 170, 175, 255)},
}

PAL_PAULDRON = {
    'iron':    {'P': (210, 210, 215, 255), 'Q': (140, 140, 150, 255)},
    'diamond': {'P': (110, 230, 220, 255), 'Q': (60, 170, 175, 255)},
}

PAL_SWORD = {
    'wood':    {'W': (155, 105, 55, 255), 'G': (90, 60, 30, 255), 'L': (220, 200, 100, 255)},
    'iron':    {'W': (220, 220, 225, 255), 'G': (110, 80, 50, 255), 'L': (250, 250, 255, 255)},
    'diamond': {'W': (130, 240, 230, 255), 'G': (220, 180, 60, 255),  'L': (255, 255, 255, 255)},
}

PAL_CAPE = {
    'A': (180, 30, 30, 255),
    'B': (130, 15, 15, 255),
}


def rgba(r, g, b, a=255):
    return (r, g, b, a)


CHARS = [
    {
        'id': 'steve', 'name': 'Štěpán', 'head': 'human',
        'pal': {
            'k': rgba(58, 38, 22), 'K': rgba(38, 24, 14),
            's': rgba(245, 199, 156), 'S': rgba(206, 162, 122),
            'e': rgba(80, 165, 245), 'm': rgba(140, 90, 70),
            'n': rgba(206, 162, 122, 180),
            'c': rgba(70, 140, 230), 'C': rgba(45, 100, 180),
            'a': rgba(70, 140, 230), 'A': rgba(45, 100, 180),
            'p': rgba(80, 55, 35), 'P': rgba(55, 38, 23),
            'b': rgba(50, 35, 22), 'B': rgba(30, 22, 14),
        },
    },
    {
        'id': 'alex', 'name': 'Alex', 'head': 'human_f',
        'pal': {
            'k': rgba(220, 130, 60), 'K': rgba(170, 90, 35),
            's': rgba(248, 209, 175), 'S': rgba(215, 175, 140),
            'e': rgba(95, 195, 130), 'm': rgba(160, 105, 80),
            'n': rgba(215, 175, 140, 180),
            'c': rgba(80, 160, 90), 'C': rgba(55, 115, 60),
            'a': rgba(80, 160, 90), 'A': rgba(55, 115, 60),
            'p': rgba(120, 90, 50), 'P': rgba(85, 60, 35),
            'b': rgba(60, 45, 30), 'B': rgba(35, 25, 18),
        },
    },
    {
        'id': 'zombie', 'name': 'Zombík', 'head': 'zombie',
        'pal': {
            'k': rgba(80, 130, 70), 'K': rgba(55, 95, 50),
            's': rgba(90, 140, 80), 'S': rgba(65, 105, 60),
            'e': rgba(20, 20, 20),
            'm': rgba(40, 60, 35), 'n': rgba(65, 105, 60, 200),
            'c': rgba(70, 100, 160), 'C': rgba(45, 70, 115),
            'a': rgba(70, 100, 160), 'A': rgba(45, 70, 115),
            'p': rgba(85, 65, 45), 'P': rgba(55, 40, 25),
            'b': rgba(50, 38, 24), 'B': rgba(30, 22, 14),
        },
    },
    {
        'id': 'skeleton', 'name': 'Kostlivec', 'head': 'skeleton',
        'pal': {
            's': rgba(225, 225, 215), 'S': rgba(175, 175, 165),
            'o': rgba(0, 0, 0, 255), 'm': rgba(60, 60, 60),
            'n': rgba(170, 170, 160, 200),
            'c': rgba(180, 180, 175), 'C': rgba(130, 130, 125),
            'a': rgba(225, 225, 215), 'A': rgba(175, 175, 165),
            'p': rgba(170, 170, 165), 'P': rgba(120, 120, 115),
            'b': rgba(120, 120, 115), 'B': rgba(80, 80, 75),
        },
    },
    {
        'id': 'creeper', 'name': 'Creeper', 'head': 'creeper',
        'pal': {
            'k': rgba(90, 165, 75), 'K': rgba(60, 130, 50),
            'o': rgba(20, 30, 15), 'm': rgba(20, 30, 15),
            's': rgba(95, 170, 80), 'S': rgba(70, 140, 60),
            'c': rgba(90, 165, 75), 'C': rgba(60, 130, 50),
            'a': rgba(90, 165, 75), 'A': rgba(60, 130, 50),
            'p': rgba(85, 155, 70), 'P': rgba(55, 120, 45),
            'b': rgba(75, 140, 60), 'B': rgba(50, 110, 40),
        },
    },
    {
        'id': 'enderman', 'name': 'Enderman', 'head': 'enderman',
        'pal': {
            'k': rgba(18, 18, 22), 'K': rgba(8, 8, 12),
            'e': rgba(220, 80, 240),
            's': rgba(28, 28, 32), 'S': rgba(12, 12, 16),
            'c': rgba(28, 28, 32), 'C': rgba(12, 12, 16),
            'a': rgba(28, 28, 32), 'A': rgba(12, 12, 16),
            'p': rgba(22, 22, 26), 'P': rgba(10, 10, 14),
            'b': rgba(15, 15, 18), 'B': rgba(5, 5, 8),
        },
    },
    {
        'id': 'witch', 'name': 'Čarodějnice', 'head': 'witch',
        'pal': {
            'k': rgba(40, 30, 60), 'K': rgba(25, 18, 38),
            's': rgba(105, 145, 100), 'S': rgba(75, 110, 70),
            'e': rgba(220, 90, 180),
            'm': rgba(50, 30, 40), 'n': rgba(70, 105, 65, 220),
            'N': rgba(85, 60, 40),
            'c': rgba(110, 60, 150), 'C': rgba(75, 35, 105),
            'a': rgba(110, 60, 150), 'A': rgba(75, 35, 105),
            'p': rgba(60, 40, 80), 'P': rgba(40, 25, 55),
            'b': rgba(40, 25, 55), 'B': rgba(25, 15, 35),
        },
    },
    {
        'id': 'pigman', 'name': 'Prasečák', 'head': 'pigman',
        'pal': {
            's': rgba(240, 165, 165), 'S': rgba(195, 120, 120),
            'e': rgba(220, 60, 60), 'm': rgba(140, 60, 60),
            'n': rgba(195, 120, 120, 220),
            'c': rgba(190, 130, 90), 'C': rgba(140, 90, 55),
            'a': rgba(190, 130, 90), 'A': rgba(140, 90, 55),
            'p': rgba(110, 75, 50), 'P': rgba(75, 50, 30),
            'b': rgba(60, 45, 30), 'B': rgba(35, 25, 18),
        },
    },
    {
        'id': 'wither', 'name': 'Wither', 'head': 'wither',
        'pal': {
            'k': rgba(45, 45, 50), 'K': rgba(20, 20, 25),
            'o': rgba(20, 20, 25), 'm': rgba(15, 15, 18),
            's': rgba(60, 60, 65), 'S': rgba(35, 35, 40),
            'c': rgba(55, 55, 60), 'C': rgba(30, 30, 35),
            'a': rgba(55, 55, 60), 'A': rgba(30, 30, 35),
            'p': rgba(45, 45, 50), 'P': rgba(22, 22, 27),
            'b': rgba(35, 35, 40), 'B': rgba(15, 15, 18),
        },
    },
    {
        'id': 'villager', 'name': 'Vesničan', 'head': 'villager',
        'pal': {
            'k': rgba(95, 65, 40), 'K': rgba(65, 45, 25),
            's': rgba(200, 165, 130), 'S': rgba(155, 125, 95),
            'e': rgba(70, 50, 30), 'm': rgba(120, 80, 60),
            'n': rgba(155, 125, 95, 220),
            'c': rgba(140, 95, 55), 'C': rgba(100, 65, 35),
            'a': rgba(140, 95, 55), 'A': rgba(100, 65, 35),
            'p': rgba(85, 60, 35), 'P': rgba(55, 40, 22),
            'b': rgba(50, 35, 22), 'B': rgba(30, 22, 14),
        },
    },
    {
        'id': 'pillager', 'name': 'Drancíř', 'head': 'pillager',
        'pal': {
            'k': rgba(75, 80, 90), 'K': rgba(50, 55, 65),
            's': rgba(180, 185, 190), 'S': rgba(135, 140, 145),
            'e': rgba(80, 30, 30), 'm': rgba(60, 30, 30),
            'n': rgba(135, 140, 145, 220),
            'o': rgba(20, 20, 22), 'E': rgba(30, 30, 35),
            'c': rgba(95, 100, 110), 'C': rgba(60, 65, 75),
            'a': rgba(95, 100, 110), 'A': rgba(60, 65, 75),
            'p': rgba(70, 75, 80), 'P': rgba(45, 50, 55),
            'b': rgba(45, 30, 18), 'B': rgba(28, 18, 10),
        },
    },
    {
        'id': 'knight', 'name': 'Rytíř', 'head': 'knight',
        'pal': {
            'h': rgba(200, 205, 215), 'H': rgba(150, 155, 170),
            's': rgba(245, 199, 156), 'S': rgba(206, 162, 122),
            'e': rgba(45, 45, 45), 'm': rgba(120, 80, 60),
            'c': rgba(190, 195, 205), 'C': rgba(140, 145, 160),
            'a': rgba(190, 195, 205), 'A': rgba(140, 145, 160),
            'p': rgba(170, 175, 190), 'P': rgba(120, 125, 140),
            'b': rgba(80, 85, 95), 'B': rgba(50, 55, 65),
        },
    },
]


# ---------------------------------------------------------------------------
# Level progression -- what gets added at each level
# ---------------------------------------------------------------------------

def upgrades_for(level):
    """Return dict of upgrade flags for a given level (1..10).

    Progression:
       1 base / 2 leather helm / 3 leather chest / 4 wood sword
       5 iron helm / 6 iron chest+pauldrons / 7 iron sword
       8 diamond helm+chest+pauldrons / 9 diamond sword + cape
      10 crown + enchant glow
    """
    def pick(stages):
        # stages = [(min_level, value), ...] highest matching wins
        chosen = None
        for lvl, val in stages:
            if level >= lvl:
                chosen = val
        return chosen

    return {
        'helmet':   pick([(2, 'leather'), (5, 'iron'), (8, 'diamond')]),
        'chest':    pick([(3, 'leather'), (6, 'iron'), (8, 'diamond')]),
        'pauldron': pick([(6, 'iron'), (8, 'diamond')]),
        'sword':    pick([(4, 'wood'), (7, 'iron'), (9, 'diamond')]),
        'cape':     level >= 9,
        'crown':    level >= 10,
        'glow':     level >= 10,
    }


# ---------------------------------------------------------------------------
# Compose one sprite
# ---------------------------------------------------------------------------

def compose(char, level, scale=10):
    c = Canvas(CANVAS_W, CANVAS_H)
    pal = char['pal']
    up = upgrades_for(level)

    # cape goes behind torso, render first
    if up['cape']:
        c.stamp(TORSO_X, TORSO_Y - 1, CAPE, PAL_CAPE)

    # head template
    head_tpl = HEAD_TEMPLATES[char['head']]
    c.stamp(HEAD_X, HEAD_Y, head_tpl, pal)

    # body
    c.stamp(TORSO_X, TORSO_Y, TORSO, pal)
    c.stamp(ARMR_X, ARMR_Y, ARM, pal)
    c.stamp(ARML_X, ARML_Y, ARM, pal)
    c.stamp(LEGR_X, LEGR_Y, LEG, pal)
    c.stamp(LEGL_X, LEGL_Y, LEG, pal)

    # chestplate overlay
    if up['chest']:
        tpl = {'leather': CHEST_LEATHER, 'iron': CHEST_IRON, 'diamond': CHEST_DIAMOND}[up['chest']]
        c.stamp(TORSO_X, TORSO_Y, tpl, PAL_CHEST[up['chest']])

    # pauldrons over shoulders
    if up['pauldron']:
        tpl = {'iron': PAULDRON_IRON, 'diamond': PAULDRON_DIAMOND}[up['pauldron']]
        c.stamp(ARMR_X, ARMR_Y, tpl, PAL_PAULDRON[up['pauldron']])
        c.stamp(ARML_X, ARML_Y, tpl, PAL_PAULDRON[up['pauldron']])

    # helmet overlay
    if up['crown']:
        c.stamp(HEAD_X, HEAD_Y, HELMET_CROWN, PAL_HELM['crown'])
    elif up['helmet']:
        tpl = {'leather': HELMET_LEATHER, 'iron': HELMET_IRON, 'diamond': HELMET_DIAMOND}[up['helmet']]
        c.stamp(HEAD_X, HEAD_Y, tpl, PAL_HELM[up['helmet']])

    # sword in left hand area
    if up['sword']:
        tpl = {'wood': SWORD_WOOD, 'iron': SWORD_IRON, 'diamond': SWORD_DIAMOND}[up['sword']]
        c.stamp(ARML_X + 4, ARML_Y - 1, tpl, PAL_SWORD[up['sword']])

    # glow particles (level 10)
    if up['glow']:
        glow = (255, 230, 120, 255)
        for x, y in GLOW_DOTS:
            if 0 <= x < CANVAS_W and 0 <= y < CANVAS_H:
                c.px[y][x] = glow

    return c.scaled(scale)


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    out_dir = os.path.join(root, 'assets', 'characters')
    os.makedirs(out_dir, exist_ok=True)

    manifest = []
    for char in CHARS:
        char_dir = os.path.join(out_dir, char['id'])
        os.makedirs(char_dir, exist_ok=True)
        for level in range(1, 11):
            canvas = compose(char, level, scale=10)
            path = os.path.join(char_dir, f'lv{level}.png')
            write_png(path, canvas.px)
        manifest.append({'id': char['id'], 'name': char['name']})
        print(f"  generated {char['id']}: 10 levels")

    manifest_path = os.path.join(root, 'assets', 'characters.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"manifest -> {manifest_path}")


if __name__ == '__main__':
    main()
