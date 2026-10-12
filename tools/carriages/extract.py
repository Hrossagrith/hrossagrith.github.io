"""Cut the skull+cervical column (Blainville plate) and the head silhouette
(Ellenberger plate) out of their backgrounds; write masks and ink layers."""
import numpy as np
from PIL import Image
import lib

REF = '../refs/'

# --- Blainville skeleton: skull + neck ---------------------------------------
SK_CROP = (1230, 0, 2024, 560)
sk = Image.open(REF + 'iconographie-skeleton-lateral.jpg')
sk = sk.crop(SK_CROP)
L = lib.luminance(sk)
bg = lib.background_mask(L, light=226)
fg = ~bg
# drop the thoracic region (left of the chain's base) and anything tiny
h, w = fg.shape
ox, oy = SK_CROP[0], SK_CROP[1]
thorax = lib.polygon_mask(fg.shape, [(0, 0), (1230 - ox, 0), (1290 - ox, 440 - oy), (1300 - ox, 560 - oy), (0, 560 - oy)])
fg &= ~thorax
fg = lib.largest_component(fg)
np.save('skel-mask.npy', fg)
ink = lib.ink_rgba(L, fg, white=228, gamma=0.9)
ink.save('skel-ink.png')
prev = Image.new('RGBA', ink.size, (255, 255, 255, 255))
prev.alpha_composite(ink)
prev.convert('RGB').save('skel-preview.png')
print('skeleton', ink.size, 'fg px', int(fg.sum()))

# --- Ellenberger Fig. 30: head silhouette ------------------------------------
HD_CROP = (100, 95, 850, 790)
hd = Image.open(REF + 'ellenberger-horse-head.jpg')
hd = hd.crop(HD_CROP)
L2 = lib.luminance(hd)
hx, hy = HD_CROP[0], HD_CROP[1]
# erase labels and arrows that lie outside the head (plate coordinates)
erase = [
    (255, 100, 385, 150),   # "Fig. 30." caption
    (408, 170, 436, 198),   # "2" between the ears
    (486, 198, 514, 226),   # "3" at the upright ear
    (464, 243, 492, 271),   # "8" above the forehead
    (792, 576, 822, 604),   # "a'" at the nose
    (495, 642, 523, 670),   # "39"
    (523, 657, 551, 685),   # "40"
    (552, 670, 582, 698),   # "28'"
    (580, 680, 604, 706),   # "i"
    (655, 748, 685, 776),   # "45"
    (370, 578, 393, 600),   # "37" leader stub at the jaw angle
    (396, 606, 416, 626),   # "e" leader stub under the jaw
]
for (x0, y0, x1, y1) in erase:
    L2[max(0, y0 - hy):max(0, y1 - hy), max(0, x0 - hx):max(0, x1 - hx)] = 245
bg2 = lib.background_mask(L2, light=224)
fg2 = ~bg2
# remove the "33" axis vertebra at the right and the Fig. 36 ear at the bottom
fg2 &= ~lib.polygon_mask(fg2.shape, [(830 - hx, 0), (850 - hx, 0), (850 - hx, 420 - hy), (830 - hx, 420 - hy)])
fg2 &= ~lib.polygon_mask(fg2.shape, [(300 - hx, 690 - hy), (420 - hx, 690 - hy), (420 - hx, 790 - hy), (300 - hx, 790 - hy)])
fg2 = lib.largest_component(fg2)
fg2 = lib.dilate(lib.erode(fg2, 2), 2)
np.save('head-mask.npy', fg2)
ink2 = lib.ink_rgba(L2, fg2, white=232, gamma=1.0)
ink2.save('head-ink.png')
prev2 = Image.new('RGBA', ink2.size, (255, 255, 255, 255))
prev2.alpha_composite(ink2)
# draw the silhouette boundary in red for checking
edge = fg2 & ~lib.erode(fg2, 2)
arr = np.asarray(prev2.convert('RGB')).copy()
arr[edge] = (220, 0, 0)
Image.fromarray(arr).save('head-preview.png')
print('head', ink2.size, 'fg px', int(fg2.sum()))
